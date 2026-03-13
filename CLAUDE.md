# Frontier Firm Assessment — Claude Code Instructions

> This file is read automatically by Claude Code. It describes the full pipeline for generating a Frontier Firm report.

## What This Repo Does

Generates a **Frontier Firm Assessment** — a visual HTML report that measures an organisation's AI adoption maturity across four signals (Reach, Habit, Skill, Value) and classifies them into one of three patterns (Foundation, Expansion, Frontier).

## Prerequisites

- **Node.js** >= 18
- **Playwright** — `npm install && npx playwright install chromium`
- **Power BI Desktop** with the customer's AI-in-One Dashboard open (for extraction only)

## The Pipeline

**IMPORTANT: Always use the `--v4` flag and `--name` flag.**

### Step 1: Extract data from PBIX (if PBIX is open in Power BI Desktop)
```bash
node src/extract-from-pbix.js --pbix "Customer Name"
```

### Step 2: Generate the V4 report
```bash
node src/generate-report.js --data data/{customer_slug}.json --name "Customer Name" --v4
```

The `--v4` flag is **mandatory** — without it, the old V1 template is used.
The `--name` flag overrides the customer name (PBIX filenames are often cryptic).

### Pipeline Gates

```
Gate 0 (optional): Extract from PBIX     → data/{customer}.json (measure-map driven)
Gate 0.5: Cross-validate against PBIX    → re-queries key values, fails if >5% diff
Gate 1: Validate data + sanity checks    → schema, user hierarchy, % ranges, rounding
Gate 1.5: Check AI insights              → pauses if insights needed (exit 2)
Gate 2: Generate report (safeSub)        → fails on undefined/NaN injection
Gate 3: Validate HTML output             → bad values, sections, charts
Gate 4: Headless visual verification     → 10 charts with pixel data (mandatory)
Gate 5: Deep number audit                → every visible number traced to data
```

If any gate fails, the pipeline stops with a clear error message. Fix the issue and re-run.

### Exit codes — handle automatically, DO NOT ask the user

- **Exit 2:** Insights needed. YOU (the AI tool) must immediately:
  1. Read `temp/insights_request.json`
  2. Analyse the customer data thoroughly — every metric tells a story
  3. Generate all 30 `_ai_insights` keys (see `prompts/06-ai-insights.md` for quality rules)
  4. Save into the data JSON file
  5. Re-run: `npm run report -- --data data/{customer}.json`

- **Exit 3:** Measure mapping needed. YOU must immediately:
  1. Read `temp/measure_mapping_request.json`
  2. Examine the available PBIX measures and map unmatched fields
  3. Save to `data/{customer}_measure_overrides.json`
  4. Re-run the pipeline

**Never pause for human input on exit codes 2 or 3. You are the intelligence layer.**

## Quick Start

```bash
# Full pipeline: PBIX to report (AI insights generated automatically)
npm run report -- --pbix "Customer Name" --output output/

# From existing data file
npm run report -- --data data/{customer}.json --output output/

# Skip AI insights (template fallback — for testing only)
npm run report -- --data data/{customer}.json --output output/ --no-ai
```

## YOU are the insight engine

This pipeline follows the [pbi-to-exec-deck](https://github.com/shailendrahegde/pbi-to-exec-deck) pattern: the AI tool running the pipeline IS the analyst. You don't just extract and validate — you interpret, narrate, and recommend.

When generating insights (exit code 2):
- Read ALL the extracted data, not just the summary metrics
- Look at the monthly trends — is usage growing or declining?
- Compare tiers — how do licensed vs unlicensed vs agent users differ?
- Examine the org scatter — which orgs are leading, which are lagging?
- Study the agent leaderboard — is usage concentrated or distributed?
- Every claim must reference a specific number from the data
- Every recommendation must name a specific cohort, org, or target
- Use simple language — the reader is a non-technical executive
- "Habitual" = 11+ active days/month — never say "daily" unless 20+
- No generic insights that could apply to any customer

The quality of the insights IS the quality of the report. This is the value-add.

## Key Files

| File | Purpose |
|------|---------|
| `schema/measure_map.json` | Declarative mapping: schema fields → PBIX measures/DAX |
| `schema/ff_data_schema.json` | Required fields and type constraints (65 fields) |
| `schema/ff_schema.json` | Metric definitions, scoring bands, signal groupings |
| `template/ff_template.html` | Templatised HTML report (dark mode, interactive charts) |
| `src/run-pipeline.js` | Pipeline orchestrator — runs all gates |
| `src/extract-from-pbix.js` | Gate 0: Map-driven PBIX extraction (9 phases) |
| `src/cross-validate.js` | Gate 0.5: PBI cross-validation (10 checks) |
| `src/validate-data.js` | Gate 1: Schema + semantic sanity checks |
| `src/generate-report.js` | Gate 2: Generator with safeSub/safeJSON |
| `src/validate-report.js` | Gate 3: HTML output validation |
| `src/visual-check.js` | Gate 4: Headless Playwright visual verification |
| `src/deep-audit.js` | Gate 5: Deep number tracing audit |
| `src/generate-insights.js` | AI insight request builder (exit 2) |
| `src/export-pdf.js` | PDF export via Playwright |

### Measure Map

`schema/measure_map.json` maps every schema field to its PBIX source. The extractor reads this map — no hardcoded measure names in code. Supports:
- Multiple measure name fallbacks (newer vs older PBIX templates)
- Computed fields (full DAX queries)
- Derived fields (computed from other extracted values)
- Per-customer overrides: `data/{customer}_measure_overrides.json`

### Measure Mapping (exit code 3)

When a PBIX has custom/renamed measures that don't match the map:
1. Read `temp/measure_mapping_request.json`
2. Map unmatched fields to available PBIX measures
3. Save to `data/{customer}_measure_overrides.json`
4. Re-run the pipeline

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
