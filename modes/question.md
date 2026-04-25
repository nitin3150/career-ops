# Mode: question — Application Q&A Generator

Generates a tailored answer to a job application question using the context from an existing evaluation report (Sections A-F), then appends the answer to Section H of that report for future reference.

## Invocation

```
/career-ops question #76 Why do you want to work here?
/career-ops question #68 Describe a time you built something from scratch.
/career-ops question          (interactive — prompts for report # and question)
```

## Step 1 — Parse Arguments

Extract from the invocation:
- **Report number**: integer after `#` (e.g., `76`)
- **Question text**: everything after the report number

If either is missing (e.g., bare `/career-ops question`), ask:

> "Which report? (e.g., `#76`) And what's the question?"

Wait for the user's reply before continuing.

## Step 2 — Find the Report

Glob `reports/` for `{NUM:03d}-*.md` (zero-padded 3 digits, e.g., `076-*.md`).

If not found, try without zero-padding. If still not found:
> "No report found for #{NUM}. Check `data/applications.md` for the right number."

Exit.

## Step 3 — Load Context

Read the following from the matched report:

- **Block A** (Role Summary): archetype, company, role title, TL;DR line — for tone and keyword mirroring
- **Block B** (CV Match): the requirement → CV evidence table — for concrete proof points
- **Block F** (Interview Plan): STAR+R stories — for narrative material
- **Block H** (Application Q&A) if it exists: load previous Q&A pairs to avoid repeating the same answer framing

Also read `cv.md` for exact metrics (numbers, dates, scope) that may not appear verbatim in the report.

## Step 4 — Generate the Answer

Write a tailored answer following these rules:

**Length:** ≤200 words. If the question is narrow ("Describe a challenge"), aim for 120-150 words. If broad ("Tell us about yourself"), use the full 200.

**Structure:**
1. Open with a specific claim tied to the JD (mirrors a keyword from Block A TL;DR).
2. Support with 1-2 concrete proof points from Block B evidence or a STAR story from Block F.
3. Close with a forward-facing sentence about why this company/role specifically.

**Tone rules:**
- Confident and direct. No hedging ("I think", "I hope to", "I believe I could").
- No AI filler: banned words are "passionate", "leverage", "synergy", "excited to", "deeply committed", "I am a", "dynamic", "thrilled".
- Mirror JD vocabulary naturally — if the JD says "agentic workflows", use "agentic workflows", not "autonomous agents".
- First person, active voice.
- Real numbers only — never invent metrics. Pull from cv.md or the report. If a number doesn't exist, use scope ("a 12-person team", "production system", "3 clients") not invented percentages.

**Question type handling:**

| Question type | Approach |
|--------------|----------|
| "Why this company?" | Use Block A archetype fit + one specific thing from the JD or company (research if needed) |
| "Why this role?" | Use Block C (level/strategy) to frame why this is the right next step |
| "Describe a challenge / time you X" | Pull the most relevant STAR+R story from Block F |
| "What's your biggest strength?" | Lead with the primary archetype proof point from Block B |
| "Where do you see yourself in 5 years?" | Frame around the archetype trajectory from Block A/C |
| "Tell us about yourself" | Compress the Block A TL;DR into a confident 3-sentence narrative |
| Other | Use Block B + Block F as raw material, tailor to the specific ask |

## Step 5 — Append to Section H

After generating the answer, append it to the report file.

**If Section H does not exist**, add it at the end of the report:

```markdown

## H) Application Q&A

### {question text}

{answer}
```

**If Section H already exists**, append a new Q&A pair under it:

```markdown

### {question text}

{answer}
```

Do not modify Sections A-G. Only append to Section H.

## Step 6 — Output to User

Show the answer formatted for copy-paste:

```
## Answer — {Company} #{NUM}

**Q:** {question text}

{answer}

---
Saved to: reports/{filename}.md (Section H)
```

If the answer used a specific STAR story from Block F, note which one: `(based on: {story title} from Block F)` — helpful for interview prep continuity.

## Quality Check Before Saving

Before writing to the report, verify:
- Answer contains at least one specific proof point (number, project name, scope, or named skill).
- Answer does not contain any banned words.
- Answer is ≤200 words.
- Answer references something specific to this company/role, not just generic career goals.

If any check fails, regenerate before saving.
