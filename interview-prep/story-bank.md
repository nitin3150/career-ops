# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [Evaluation] Healthcare Claims: Building LLM Accuracy System
**Source:** Report #022 — Airtable — AI Analytics Engineer
**S:** Healthcare startup processing insurance claims with LLMs; error rates were too high for production use.
**T:** Build an end-to-end evaluation loop to measure and continuously improve claim accuracy.
**A:** Implemented RAGAS for semantic accuracy scoring; added domain-specific test cases (claim field validation); built HITL review workflow for edge cases with structured audit logs.
**R:** 85% accuracy improvement; manual review time dropped from 48h to 6h.
**Reflection:** Evaluation-first builds — instrument before you ship. The feedback loop matters more than the first model choice.
**Best for questions about:** LLM evaluation, production AI, quality systems, accuracy measurement, HITL design

### [Architecture] Animind AI: Multi-Agent Pipeline with Self-Correction Loop
**Source:** Report #022 — Airtable — AI Analytics Engineer
**S:** Building an AI pipeline converting natural language to Manim animation code; single-pass LLMs produced syntax errors 30% of the time.
**T:** Design a resilient multi-agent pipeline that handles its own failure cases without human intervention.
**A:** Built LangGraph pipeline with specialized agents: code generator, syntax validator, semantic critic, and renderer. Failed outputs loop back with structured error context injected into the next generation cycle.
**R:** Self-correction reduced syntax errors to near-zero; complex 3D scenes achievable from a single natural language prompt.
**Reflection:** Error handling in agent systems must be designed upfront, not retrofitted. Structured error context beats raw error messages — the critic agent needs to know what failed and why, not just that it failed.
**Best for questions about:** Agent architecture, LangGraph, multi-agent systems, resilience, iterative feedback

### [Monitoring] AMIOT: Production Model Drift Monitoring
**Source:** Report #022 — Airtable — AI Analytics Engineer
**S:** Production energy forecasting model degraded during seasonal transitions; no alerting in place; downstream teams were getting bad predictions without knowing it.
**T:** Build monitoring that catches model drift before it impacts downstream reports.
**A:** Built Grafana dashboards tracking prediction-vs-actual delta by segment; triggered Airflow retraining jobs when drift exceeded threshold; logged feature distribution shifts alongside model outputs.
**R:** Automated retraining cycles cut model deployment time by 30%; forecasting accuracy maintained through seasonal transitions.
**Reflection:** Monitoring is only useful if it's actionable. Every alert should have a runbook-equivalent response — otherwise you just create noise.
**Best for questions about:** Observability, model monitoring, production ML, automated retraining, alerting

### [Adoption] Cognitive Health: Clinical NLP Rollout
**Source:** Report #022 — Airtable — AI Analytics Engineer
**S:** Hospital ops team skeptical of AI-automated claim processing; they were the adoption blockers despite system being ready.
**T:** Get clinical staff using the AI pipeline without creating compliance or trust issues.
**A:** Built transparent audit logs for every LLM decision; presented accuracy data by claim type to ops leads; added "override" path for flagged cases so human judgment always has a clear channel.
**R:** 100% regulatory compliance maintained; clinical team adopted the pipeline; processing speed improved measurably.
**Reflection:** Adoption is an engineering problem, not just a communication problem. Build the safety rails first, then show the data. Giving users a visible escape hatch (the override path) actually increases adoption, not decreases it.
**Best for questions about:** Cross-functional adoption, change management, AI trust, stakeholder alignment, compliance

### [Production] SmartBag: High-Concurrency API Design
**Source:** Report #278 — Tavily — Forward Deployed Engineer, Partnerships
**S:** Building a grocery delivery app needing reliable real-time APIs under concurrent user load — single-layer caching and direct DB calls were bottlenecking at scale.
**T:** Design a production-grade backend that handles catalog, orders, payments, and real-time delivery tracking at scale with graceful degradation.
**A:** FastAPI backend with multi-layer caching (L1 in-memory + L2 Redis); WebSocket-based customer support chat with polling fallback; load tested against 100 concurrent users; deployed on VPS with graceful degradation paths.
**R:** 94% success rate under 100 concurrent users; 70% DB load reduction; zero data loss under failure conditions.
**Reflection:** Multi-layer caching must be designed from the start, not added as an optimization. The graceful degradation paths were more important than peak performance -- reliability under failure is what enterprise systems actually need.
**Best for questions about:** Production API design, caching strategy, load testing, backend reliability, enterprise integration patterns

### [Evaluation] AMIOT: Open-Source Model Selection Under Distribution Shift
**Source:** Report #002 — FriendliAI — Software Engineer, AI Agents
**S:** At OATI, needed anomaly detection on 1M+ smart meter records/day. Two candidates: isolation forest (fast, no training) vs. autoencoder ensemble (slower, learned representations). Offline benchmarks favored the autoencoder.
**T:** Select the right model — wrong choice at 1M+ records/day means expensive retraining cycles and bad downstream predictions.
**A:** Ran both models in shadow mode against live data for two weeks before committing. Isolation forest had 35% fewer false positives in production despite worse offline benchmark scores — the autoencoder was overfitting to test distribution patterns that didn't reflect seasonal variation in live sensor data.
**R:** Shipped isolation forest. 35% FP reduction vs. prior system. Avoided a costly retraining cycle on a model that looked better on paper.
**Reflection:** Offline eval metrics don't predict production behavior — distribution shift is everywhere. Now treat offline benchmarks as a filter, not a decision. Shadow traffic before committing is non-negotiable.
**Best for questions about:** Model selection, open-source model evaluation, production ML, distribution shift, LLM eval methodology
