# Frontier Firm Assessment — Claude Code Instructions

> This file is read automatically by Claude Code. It describes the full pipeline for generating a Frontier Firm report.

## What This Repo Does

Generates a **Frontier Firm Assessment** — a visual HTML report that measures an organisation's AI adoption maturity across four signals (Reach, Habit, Skill, Value) and classifies them into one of three patterns (Foundation, Expansion, Frontier).

## Prerequisites

- **Node.js** >= 18
- **Playwright** — `npm install && npx playwright install chromium`
- **Power BI Desktop** with the customer's AI-in-One Dashboard open (for extraction only)

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
Gate 0 (optional): Extract from PBIX    → data/{customer}.json
Gate 1: Validate data against schema     → catches missing/malformed fields
Gate 1.5: Check AI insights              → pauses if insights needed (exit 2)
Gate 2: Generate report (safeSub)        → fails on undefined/NaN injection
Gate 3: Validate HTML output             → bad values, sections, charts
Gate 4: Headless visual verification     → 10 charts with pixel data (mandatory)
Gate 5: Deep number audit                → every visible number traced to data
```

If any gate fails, the pipeline stops with a clear error message. Fix the issue and re-run.

## Quick Start

```bash
# Run the full pipeline on existing data
npm run report -- --data data/network_rail.json --output output/ --no-ai

# Run sample report (Contoso, no AI)
npm run report:sample

# Run individual gates
node src/validate-data.js --data data/customer.json
node src/generate-report.js --data data/customer.json --output output/ --no-ai
node src/validate-report.js --report output/report.html --data data/customer.json
node src/visual-check.js --report output/report.html --data data/customer.json
node src/deep-audit.js --report output/report.html --data data/customer.json
```

## Insight Generation

When the pipeline pauses for insight generation (exit code 2):
1. Read `temp/insights_request.json`
2. Generate all 30 `_ai_insights` keys following the quality rules in `prompts/06-ai-insights.md`
3. Save the `_ai_insights` block into the customer data JSON
4. Re-run: `npm run report -- --data data/{customer}.json`

## Key Files

| File | Purpose |
|------|---------|
| `schema/ff_data_schema.json` | Required fields and type constraints (65 fields) |
| `schema/ff_schema.json` | Metric definitions, scoring bands, signal groupings |
| `template/ff_template.html` | Templatised HTML report (dark mode, interactive charts) |
| `src/run-pipeline.js` | Pipeline orchestrator — runs all gates |
| `src/validate-data.js` | Gate 1: Schema validation |
| `src/generate-report.js` | Gate 2: Generator with safeSub protection |
| `src/validate-report.js` | Gate 3: HTML output validation |
| `src/visual-check.js` | Gate 4: Headless Playwright visual verification |
| `src/deep-audit.js` | Gate 5: Deep number tracing audit |
| `src/generate-insights.js` | AI insight request builder |
| `src/extract-from-pbix.js` | PBIX auto-extraction via PBI MCP subprocess |
| `src/export-pdf.js` | PDF export via Playwright |
| `prompts/01-06` | Extraction and insight prompts |
| `data/sample_contoso.json` | Sample data for testing |

## Scoring System

Each metric has bands in `ff_schema.json`:
- Below band[0] → Foundation
- band[0] to band[1] → Foundation
- band[1] to band[2] → Expansion
- Above band[2] → Frontier

Signals aggregate their metrics. Pattern is determined from signal tiers (Value excluded from pattern scoring).

Data file can override with `reach_tier`, `habit_tier`, `skill_tier`, `value_tier`, `pattern`, `pattern_name`.

## Quality Rules

- **No unresolved placeholders** — any `{{...}}` in output is an error
- **No Contoso leakage** — customer name must appear, "Contoso" must not
- **Every number must trace to data** — no hardcoded values
- **No undefined/NaN/Infinity** — safeSub catches these at generation time
- **10/10 charts must render** — Gate 4 verifies with pixel data
- **Simple language** — written for a non-technical executive, no jargon
- **"Habitual" = 11+ active days/month** — never say "daily" unless 20+

## Do NOT

- Hardcode any values in the template — everything comes from data or schema
- Use "daily" when you mean "habitual" (11+ days)
- Commit real customer data (only sample_contoso.json is tracked)
- Skip validation — every report goes to real customers
- Claim "all checks passed" without actually running the pipeline
