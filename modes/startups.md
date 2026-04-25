# Mode: startups — Recently Funded Startup Scanner

Scans news sources for startups that recently raised funding and are likely hiring, then discovers their open roles and adds matching positions to the pipeline.

## Why This Mode Exists

Freshly funded startups are high-signal hiring targets: they have budget, urgency to build teams, and roles that haven't been saturated yet. Most don't appear in standard portals immediately after funding.

## Step 1 — Ask the User

Before running, ask:

> "How recent should the funding be?
> 1. Last 7 days
> 2. Last 14 days
> 3. Last 30 days
>
> Which funding stages?
> 1. Seed only
> 2. Series A only
> 3. Series A + B
> 4. All stages (Seed through Series C+)"

Map answers to filter parameters used in Step 2 queries.

## Step 2 — Discover Recently Funded Startups

Run WebSearch queries to find companies that recently raised funding. Execute these in parallel:

### TechCrunch / VentureBeat queries (best signal):
- `site:techcrunch.com "raises" OR "funding" AI OR "machine learning" OR "LLM" OR "agentic" {stage_filter}`
- `site:venturebeat.com "raises" OR "funding" AI startup {stage_filter}`
- `site:techcrunch.com "series A" OR "seed round" AI automation {year}`

### Crunchbase News:
- `site:news.crunchbase.com "raised" AI OR "generative AI" OR "agentic" {stage_filter}`

### LinkedIn / X signals:
- `"just raised" OR "thrilled to announce" "series A" OR "seed" AI engineer hiring`

**Stage filter examples:**
- Seed only → include "seed round", "pre-seed", "$1M", "$2M", "$5M" in query
- Series A → include "series A", "$10M", "$15M", "$20M"
- Series A+B → include "series A" OR "series B"
- All → no stage restriction

**Date filter:** Add year (e.g., `2026`) and recent month to queries to reduce stale results.

### Extraction per result

For each search result, extract:
- **Company name** (from headline: "Acme raises $12M series A")
- **Funding stage** (Seed / Series A / Series B / etc.)
- **Amount raised** (e.g., "$12M")
- **Funding date** (from article date)
- **Domain / URL** (for careers page discovery)

Collect results into a deduped list of funded companies. Discard duplicates (same company, different articles).

## Step 3 — Discover Careers Pages

For each funded company, find their open roles:

1. **Try known ATS patterns first** (fast, no Playwright):
   - Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs`
   - Ashby: POST to `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
   - Lever: `https://api.lever.co/v0/postings/{slug}?mode=json`

   Try each with the company name slug (lowercase, hyphens). If one returns jobs, use it.

2. **Fallback — WebSearch:**
   - `"{company name}" careers jobs`
   - Extract the careers URL from the top result.

3. **Fallback — Playwright:**
   - Navigate to the company website.
   - Look for "Careers", "Jobs", "Join us" links.
   - Click through and extract job listings.

For each job found: extract `{title, url, company}`.

## Step 4 — Filter by Title

Apply `title_filter` from `portals.yml`:
- At least 1 `positive` keyword must appear in the title (case-insensitive).
- 0 `negative` keywords may appear.
- `seniority_boost` keywords are logged but not required.

Discard non-matching titles.

## Step 5 — Deduplicate

Check against 3 sources:
- `data/scan-history.tsv` — exact URL already seen
- `data/applications.md` — company + role already evaluated
- `data/pipeline.md` — URL already pending

Mark duplicates as `skipped_dup`.

## Step 6 — Verify Liveness (Playwright)

For each new URL that passed title filter and dedup (sequential — never Playwright in parallel):

1. `browser_navigate` to the URL.
2. `browser_snapshot` to read content.
3. Classify:
   - **Active**: visible job title + role description + Apply/Submit control in main content.
   - **Expired**: "no longer available", "position filled", "page not found", only navbar/footer visible, or URL contains `?error=true`.
4. If expired: record in `scan-history.tsv` as `skipped_expired`. Skip.
5. If active: continue to Step 7.

If `browser_navigate` errors (timeout, 403), mark `skipped_expired` and continue.

## Step 7 — Add to Pipeline

For each verified active offer:
1. Append to `data/pipeline.md` Pendientes section:
   ```
   - [ ] {url} | {company} | {title}
   ```
2. Append to `data/scan-history.tsv`:
   ```
   {url}\t{date}\t{startup funding scan}\t{title}\t{company}\tadded
   ```

## Step 8 — Output Summary

```
Funded Startup Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Funding window: last {N} days | Stages: {stages}
Startups found: {N}
Roles discovered: {N} total
Filtered by title: {N} relevant
Duplicates: {N}
Expired/dead: {N}
New added to pipeline: {N}

  + {company} ({stage}, {amount}) | {title}
  + ...

→ Run /career-ops pipeline to evaluate new offers.
```

If no startups found, suggest expanding the date window or adding more stages.

## Recommended Execution

Run as a subagent to avoid consuming main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of modes/startups.md]\n\n[user date window and stage filters]",
    run_in_background=True
)
```

## Notes on Signal Quality

- TechCrunch / VentureBeat articles are the highest signal: they name the company, stage, and amount clearly.
- LinkedIn "just raised" posts are noisy — verify the stage before trusting the amount.
- Crunchbase News is reliable but may have a 24-48h delay after announcement.
- Companies that just raised often post jobs within 2-4 weeks — if no roles are found, note the company for a follow-up scan.
