# Mode: scan — Portal Scanner (Offer Discovery)

Scans configured job portals, filters by title relevance, and adds new offers to the pipeline for later evaluation.

> **Note (v1.5+):** The default scanner (`scan.mjs` / `npm run scan`) is **zero-token** and only directly queries public APIs from Greenhouse, Ashby, and Lever. The Playwright/WebSearch levels described below are the **agent** flow (executed by Claude/Codex), not what `scan.mjs` does. If a company does not have a Greenhouse/Ashby/Lever API, `scan.mjs` will ignore it; in those cases, the agent must manually complete Level 1 (Playwright) or Level 3 (WebSearch).

## Time Filter (ask BEFORE running)

Before launching the scan, ask the user:

> "How far back should I scan for new postings?
> 1. Last 24 hours
> 2. Last 48 hours
> 3. Last 3 days
> 4. Last 7 days
> 5. All time (no filter)"

Map their answer to a `--days` flag:
| Answer | Flag |
|--------|------|
| 24 hours / 1 | `--days 1` |
| 48 hours / 2 | `--days 2` |
| 3 days / 3 | `--days 3` |
| 7 days / 4 | `--days 7` |
| All / 5 | `--days 0` |

Then run `node scan.mjs --days {N}`. Always pass `--days` — never let scan.mjs prompt interactively when you are driving.

## Recommended Execution

Run as a subagent to avoid consuming the main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml` which contains:
- `search_queries`: List of WebSearch queries with `site:` filters per portal (broad discovery).
- `tracked_companies`: Specific companies with `careers_url` for direct navigation.
- `title_filter`: Positive/negative/seniority_boost keywords for title filtering.

## Discovery Strategy (3 levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** Navigate to their `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract title + URL for each. This is the most reliable method because:
- It views the page in real-time (not cached Google results).
- It works with SPAs (Ashby, Lever, Workday).
- It detects new offers instantly.
- It does not depend on Google indexing.

**Every company MUST have a `careers_url` in portals.yml.** If it doesn't have one, find it once, save it, and use it in future scans.

### Level 2 — ATS APIs / Feeds (COMPLEMENTARY)

For companies with a public API or structured feed, use the JSON/XML response as a fast complement to Level 1. It is faster than Playwright and reduces visual scraping errors.

**Current support (variables in `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: list `https://{company}.bamboohr.com/careers/list`; offer detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Parsing convention by provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` with `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; construct public URL if not in payload).
- `bamboohr`: list `result[]` → `jobOpeningName`, `id`; construct detail URL `https://{company}.bamboohr.com/careers/{id}/detail`; to read the full JD, GET the detail and use `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`).
- `lever`: root array `[]` → `text`, `hostedUrl` (fallback: `applyUrl`).
- `teamtailor`: RSS items → `title`, `link`.
- `workday`: `jobPostings[]`/`jobPostings` (depending on tenant) → `title`, `externalPath` or URL constructed from host.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

`search_queries` with `site:` filters cover portals transversally (all Ashby, all Greenhouse, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but results may be outdated.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`.
2. Level 2: API → all `tracked_companies` with `api:`.
3. Level 3: WebSearch → all `search_queries` with `enabled: true`.

Levels are additive — all are executed, results are mixed and deduplicated.

## Workflow

1. **Read configuration**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` → already seen URLs.
3. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`.

4. **Level 1 — Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and defined `careers_url`:
   a. `browser_navigate` to the `careers_url`.
   b. `browser_snapshot` to read all job listings.
   c. If the page has filters/departments, navigate relevant sections.
   d. For each job listing extract: `{title, url, company}`.
   e. If the page paginates results, navigate additional pages.
   f. Accumulate in candidate list.
   g. If `careers_url` fails (404, redirect), try `scan_query` as fallback and note for URL update.

5. **Level 2 — ATS APIs / feeds** (parallel):
   For each company in `tracked_companies` with defined `api:` and `enabled: true`:
   a. WebFetch the API/feed URL.
   b. If `api_provider` is defined, use its parser; if not defined, infer by domain (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`).
   c. For **Ashby**, send POST with:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - GraphQL query for `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`.
   d. For **BambooHR**, the list only brings basic metadata. For each relevant item, read `id`, GET `https://{company}.bamboohr.com/careers/{id}/detail`, and extract the full JD from `result.jobOpening`. Use `jobOpeningShareUrl` as public URL if it exists; otherwise, use the detail URL.
   e. For **Workday**, send POST JSON with at least `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` and paginate by `offset` until results are exhausted.
   f. For each job extract and normalize: `{title, url, company}`.
   g. Accumulate in candidate list (dedup with Level 1).

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Execute WebSearch with the defined `query`.
   b. From each result extract: `{title, url, company}`.
      - **title**: from the result title (before " @ " or " | ").
      - **url**: result URL.
      - **company**: after " @ " in the title, or extract from domain/path.
   c. Accumulate in candidate list (dedup with Level 1+2).

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 `positive` keyword must appear in the title (case-insensitive).
   - 0 `negative` keywords must appear.
   - `seniority_boost` keywords give priority but are not mandatory.

7. **Deduplicate** against 3 sources:
   - `scan-history.tsv` → exact URL already seen.
   - `applications.md` → company + normalized role already evaluated.
   - `pipeline.md` → exact URL already pending or processed.

7.5. **Verify liveness of WebSearch results (Level 3)** — BEFORE adding to pipeline:

   WebSearch results may be outdated (Google caches results for weeks or months). To avoid evaluating expired offers, verify each new URL from Level 3 with Playwright. Levels 1 and 2 are inherently real-time and do not require this verification.

   For each new Level 3 URL (sequential — NEVER Playwright in parallel):
   a. `browser_navigate` to the URL.
   b. `browser_snapshot` to read the content.
   c. Classify:
      - **Active**: visible job title + role description + visible Apply/Submit/Request control within main content. Do not count generic header/navbar/footer text.
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects this way when the offer is closed).
        - Page contains: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found".
        - Only navbar and footer visible, no JD content (content < ~300 chars).
   d. If expired: record in `scan-history.tsv` with status `skipped_expired` and discard.
   e. If active: continue to step 8.

   **Do not interrupt the entire scan if a URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark as `skipped_expired` and continue to the next one.

8. **For each new verified offer that passes filters**:
   a. Add to `pipeline.md` "Pendientes" section: `- [ ] {url} | {company} | {title}`.
   b. Record in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`.

9. **Offers filtered by title**: record in `scan-history.tsv` with status `skipped_title`.
10. **Duplicate offers**: record with status `skipped_dup`.
11. **Expired offers (Level 3)**: record with status `skipped_expired`.

## Extraction of title and company from WebSearch results

WebSearch results come in formats like: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns by portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`.
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`.
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`.

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a non-publicly accessible URL is found:
1. Save the JD in `jds/{company}-{role-slug}.md`.
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`.

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output Summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executed: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
Expired/Discarded: N (dead links, Level 3)
New added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate new offers.
```

## managing careers_url

Each company in `tracked_companies` must have a `careers_url` — the direct URL to their job page. This avoids searching for it every time.

**RULE: Always use the company's corporate URL; recur to the ATS endpoint only if a corporate page doesn't exist.**

The `careers_url` should point to the company's own job page whenever available. Many companies use Workday, Greenhouse, or Lever underneath but expose vacancy IDs only through their corporate domain. Using the direct ATS URL when a corporate page exists can cause false 410 errors because job IDs don't match.

| ✅ Correct (Corporate) | ❌ Incorrect as first choice (Direct ATS) |
|---|---|
| `https://careers.mastercard.com` | `https://mastercard.wd1.myworkdayjobs.com` |
| `https://openai.com/careers` | `https://job-boards.greenhouse.io/openai` |
| `https://stripe.com/jobs` | `https://jobs.lever.co/stripe` |

Fallback: If you only have the direct ATS URL, first navigate to the company's website and locate their corporate job page. Use the direct ATS URL only if the company does not have its own corporate page.

**Known patterns by platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** Company's own URL (e.g., `https://openai.com/careers`).

**API/feed patterns by platform:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`).
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**If `careers_url` does not exist** for a company:
1. Try the known platform pattern.
2. If it fails, do a quick WebSearch: `"{company}" careers jobs`.
3. Navigate with Playwright to confirm it works.
4. **Save the found URL in portals.yml** for future scans.

**If `careers_url` returns 404 or redirect:**
1. Note in the output summary.
2. Try `scan_query` as fallback.
3. Mark for manual update.

## Maintenance of portals.yml

- **ALWAYS save `careers_url`** when a new company is added.
- Add new queries as interesting portals or roles are discovered.
- Disable queries with `enabled: false` if they generate too much noise.
- Adjust filtering keywords as target roles evolve.
- Add companies to `tracked_companies` when you want to follow them closely.
- Verify `careers_url` periodically — companies change ATS platforms.
