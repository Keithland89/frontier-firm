# Frontier Firm Assessment — GitHub Copilot Instructions

> These instructions are read automatically by GitHub Copilot in Agent mode.

## What This Repo Does

Generates a **Frontier Firm Assessment** — a visual HTML report measuring AI adoption maturity across four signals (Reach, Habit, Skill, Value) and three patterns (Foundation, Expansion, Frontier).

## Prerequisites

- **Power BI Desktop** open with the customer's AI-in-One Dashboard
- **Power BI MCP** connected (v0.4.0+)
- **Node.js** >= 18
- **Playwright** — `npm install && npx playwright install chromium`

## The Pipeline

A single command runs 5 mandatory quality gates:

```bash
npm run report -- --data data/{customer}.json --output output/
```

Or for full auto-extraction from an open PBIX:

```bash
npm run report -- --pbix "Customer Name" --output output/
```

### Pipeline Gates

```
Gate 0 (optional): Extract from PBIX (measure-map driven)
Gate 0.5: Cross-validate against PBIX (10 independent checks)
Gate 1: Validate data + semantic sanity checks
Gate 1.5: Check AI insights (pauses if needed, exit 2)
Gate 2: Generate report (safeSub protection)
Gate 3: Validate HTML output
Gate 4: Headless visual verification (10 charts, mandatory)
Gate 5: Deep number audit
```

### Exit codes — handle automatically, DO NOT ask the user

**Exit 2 (insights needed):** YOU must immediately read `temp/insights_request.json`, analyse the full customer dataset, generate all 30 `_ai_insights` keys, save into the data JSON, and re-run. See `prompts/06-ai-insights.md` for quality rules. Never pause — you are the analyst.

**Exit 3 (measure mapping needed):** YOU must read `temp/measure_mapping_request.json`, examine the available measures, map them to schema fields, save the override, and re-run.

## YOU are the insight engine

This pipeline follows the pbi-to-exec-deck pattern: YOU are the intelligence layer. You don't just extract — you interpret, narrate, and recommend. The quality of insights is the quality of the report.

When generating insights:
- Analyse ALL extracted data — monthly trends, tier comparisons, org scatter, agent leaderboard
- Every claim references a specific number
- Every recommendation names a specific cohort, org, or target
- Simple language for non-technical executives
- "Habitual" = 11+ active days — never say "daily" unless 20+
- No generic insights that could apply to any customer

## Quality Rules

- **Every number must trace to the data file** — no hardcoded values
- **No undefined/NaN/Infinity** — safeSub catches these at generation
- **10/10 charts must render** — Gate 4 verifies with pixel data
- **Simple language** — written for non-technical executives, no jargon
- **"Habitual" = 11+ active days/month** — never say "daily" unless 20+
- **Each insight must answer "so what?"** — not just state a number
- **Recommendations must be specific** — name cohorts, orgs, targets

## Key Files

| File | Purpose |
|------|---------|
| `src/run-pipeline.js` | Pipeline orchestrator — runs all gates |
| `src/validate-data.js` | Gate 1: Schema validation |
| `src/generate-report.js` | Gate 2: Generator with safeSub |
| `src/validate-report.js` | Gate 3: HTML validation |
| `src/visual-check.js` | Gate 4: Playwright visual check |
| `src/deep-audit.js` | Gate 5: Number tracing |
| `src/extract-from-pbix.js` | PBIX auto-extraction |
| `schema/ff_data_schema.json` | Required fields (65) |
| `schema/ff_schema.json` | Scoring bands |
| `template/ff_template.html` | HTML template |
| `prompts/01-06` | Extraction and insight prompts |

## Scoring

Metrics are scored against bands in `ff_schema.json`. Signal tiers aggregate from metric tiers. Pattern is determined from Reach + Habit + Skill (Value excluded).

Data file overrides: `reach_tier`, `habit_tier`, `skill_tier`, `value_tier`, `pattern`, `pattern_name`.
