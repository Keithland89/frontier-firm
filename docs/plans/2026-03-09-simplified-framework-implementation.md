# Simplified Framework v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 17-metric, 4-signal framework with a 5-metric, 3-signal framework. Value becomes narrative only. Report goes from 10 sections to 6.

**Architecture:** New v2 schema, scoring, and template files sit alongside v1. The generator detects `--v2` flag (or a `"version": 2` field in the data JSON) and uses the v2 path. Existing pipeline gates (validation, visual check, deep audit) work unchanged — they just load the v2 schema/template.

**Tech Stack:** Node.js, Chart.js 4, HTML/CSS (dark mode, Inter/Outfit fonts), Claude API for insights.

---

## Task 1: Create v2 Scoring Schema

**Files:**
- Create: `schema/ff_schema_v2.json`

**Step 1: Write the v2 schema file**

```json
{
  "$schema": "Frontier Firm Report Schema v2 — Simplified",
  "description": "5 hero metrics across 3 signals. Value is narrative only, not scored.",

  "signals": {
    "reach": {
      "label": "Reach",
      "question": "How broadly is it adopted?",
      "color": "#0EA5E9",
      "metrics": ["license_activation", "agent_adoption"]
    },
    "habit": {
      "label": "Habit",
      "question": "Is it embedded in daily work?",
      "color": "#F59E0B",
      "metrics": ["embedded_user_rate"]
    },
    "skill": {
      "label": "Skill",
      "question": "Is it going deep?",
      "color": "#7B2FF2",
      "metrics": ["app_surface_breadth", "agent_breadth"]
    }
  },

  "metrics": {
    "license_activation": {
      "name": "License Activation",
      "unit": "% seats active",
      "bands": [50, 80, 100],
      "band_labels": ["Foundation", "Expansion", "Frontier"],
      "signal": "reach",
      "data_field": "m365_enablement",
      "description": "licensed_users / total_licensed_seats * 100"
    },
    "agent_adoption": {
      "name": "Agent Adoption",
      "unit": "% of active users",
      "bands": [5, 15, 100],
      "band_labels": ["Foundation", "Expansion", "Frontier"],
      "signal": "reach",
      "data_field": "agent_adoption",
      "description": "agent_users / total_active_users * 100"
    },
    "embedded_user_rate": {
      "name": "Embedded User Rate",
      "unit": "% embedded users",
      "bands": [5, 15, 100],
      "band_labels": ["Foundation", "Expansion", "Frontier"],
      "signal": "habit",
      "data_field": "embedded_user_rate",
      "description": "Users with avg 6+ active days/month over last 3 months AND present in 2/3 months"
    },
    "app_surface_breadth": {
      "name": "App Surface Breadth",
      "unit": "apps/user",
      "bands": [2, 4, 100],
      "band_labels": ["Foundation", "Expansion", "Frontier"],
      "signal": "skill",
      "data_field": "m365_breadth",
      "description": "Avg distinct M365 apps/surfaces per user"
    },
    "agent_breadth": {
      "name": "Agent Breadth",
      "unit": "agents/user",
      "bands": [1.5, 3, 100],
      "band_labels": ["Foundation", "Expansion", "Frontier"],
      "signal": "skill",
      "data_field": "agent_breadth",
      "description": "Avg distinct agents per user"
    }
  },

  "pattern_rules": {
    "description": "Pattern is determined by counting how many of the 5 hero metrics reach Expansion or Frontier threshold",
    "p1_foundation": "0-1 metrics at Expansion+",
    "p2_expansion": "2-3 metrics at Expansion+",
    "p3_frontier": "4-5 metrics at Expansion+, or 3+ at Frontier"
  },

  "insight_blocks": [
    "EXEC_SUMMARY_GOOD",
    "EXEC_SUMMARY_GAP",
    "EXEC_SUMMARY_OPP",
    "INSIGHT_REACH",
    "INSIGHT_HABIT",
    "INSIGHT_SKILL",
    "SPOTLIGHT_MATURITY",
    "PULLQUOTE_0",
    "PULLQUOTE_1",
    "PULLQUOTE_2",
    "PULLQUOTE_3",
    "REC_1_TITLE",
    "REC_1_DESC",
    "REC_2_TITLE",
    "REC_2_DESC",
    "REC_3_TITLE",
    "REC_3_DESC",
    "TITLE_REACH",
    "TITLE_HABIT",
    "TITLE_SKILL",
    "TITLE_VALUE",
    "TITLE_MATURITY",
    "SUBTITLE_REACH",
    "SUBTITLE_HABIT",
    "SUBTITLE_SKILL",
    "SUBTITLE_VALUE",
    "SUBTITLE_MATURITY"
  ],

  "derived_metrics": {
    "time_saved_realised": "licensed_users * licensed_avg_prompts * 6 / 60 * 12",
    "time_saved_unrealised": "inactive_licenses * licensed_avg_prompts * 6 / 60 * 12",
    "activation_rate": "licensed_users / total_licensed_seats * 100"
  }
}
```

**Step 2: Commit**

```bash
git add schema/ff_schema_v2.json
git commit -m "feat: add v2 scoring schema — 5 metrics, 3 signals"
```

---

## Task 2: Create v2 Data Schema

**Files:**
- Create: `schema/ff_data_schema_v2.json`

**Step 1: Write the v2 data schema**

The v2 data schema requires ~30 fields instead of 72. It keeps all the fields needed for v2 charts plus backward-compatible fields used in derived calculations.

Required fields:
- Identity: `customer_name`, `analysis_period`
- Core counts: `total_active_users`, `licensed_users`, `chat_users`, `agent_users`, `total_licensed_seats`, `inactive_licenses`
- Hero metrics: `m365_enablement`, `agent_adoption`, `embedded_user_rate`, `m365_breadth`, `agent_breadth`
- Supporting metrics (for charts/value narrative): `license_priority`, `licensed_avg_prompts`, `unlicensed_avg_prompts`, `m365_retention`, `retained_users`, `churned_users`, `total_agents`, `multi_user_agents`
- Bands (for embedded rate trend): `band_1_5`, `band_6_10`, `band_11_15`, `band_16_plus`
- Visualisation data: `agent_table`, `top_agent_names`, `top_agent_sessions`, `org_scatter_data`
- Supplementary: `_supplementary_metrics` (monthly_data, per_tier_monthly_users, app_interactions, retention_cohorts)
- Overrides: `reach_tier`, `habit_tier`, `skill_tier`, `pattern`, `pattern_name` (all optional)

Write a proper JSON Schema draft-07 file with these ~30 required fields and the same `oneOf: [number, "not_available"]` pattern.

**Step 2: Commit**

```bash
git add schema/ff_data_schema_v2.json
git commit -m "feat: add v2 data schema — ~30 fields instead of 72"
```

---

## Task 3: Add Embedded User Rate to Measure Map

**Files:**
- Modify: `schema/measure_map.json`

**Step 1: Add the embedded_user_rate entry**

Add after the existing `m365_adoption` entry:

```json
"embedded_user_rate": {
  "type": "computed",
  "dax": "EVALUATE\nVAR Last3Months = TOPN(3,\n  FILTER(DISTINCT('ActiveDaysSummary'[MonthStart]),\n    'ActiveDaysSummary'[MonthStart] < MAXX('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart])),\n  [MonthStart], DESC)\nVAR UserStats = SUMMARIZE(\n  FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart] IN Last3Months),\n  'ActiveDaysSummary'[Audit_UserId],\n  \"AvgDays\", AVERAGE('ActiveDaysSummary'[ChatActiveDays]),\n  \"MonthsActive\", DISTINCTCOUNT('ActiveDaysSummary'[MonthStart])\n)\nVAR Embedded = COUNTROWS(FILTER(UserStats, [AvgDays] >= 6 && [MonthsActive] >= 2))\nVAR TotalUsers = DISTINCTCOUNT('ActiveDaysSummary'[Audit_UserId])\nRETURN ROW(\"EmbeddedRate\", DIVIDE(Embedded, TotalUsers, 0) * 100, \"EmbeddedCount\", Embedded, \"TotalUsers\", TotalUsers)",
  "transform": null,
  "description": "Embedded User Rate — users with avg 6+ active days/month over last 3 complete months AND present in at least 2/3 months. Returns percentage (0-100)."
}
```

**Step 2: Commit**

```bash
git add schema/measure_map.json
git commit -m "feat: add embedded_user_rate DAX to measure map"
```

---

## Task 4: Create v2 HTML Template

**Files:**
- Create: `template/ff_template_v2.html`

**Step 1: Use the `frontend-design` skill to design and build the template**

Key requirements from the design doc:
- 6 sections: Hero Banner, Framework, Reach, Habit, Skill, Value (narrative), Maturity, Recommendations
- Dark mode, premium consultancy feel
- Each section: ONE chart + ONE insight callout
- Numbers are large, prominent, colour-coded by tier
- AI narrative is primary content, charts support it
- 5 hero metric cards in the banner with tier badges
- 3 signal gauges (not 4) in maturity section
- 3 recommendations (not 4)
- Chart.js for visualisations
- Scroll-reveal animations
- ~80 placeholder tokens (down from 226)

Placeholder tokens needed (complete list):
```
{{CUSTOMER_NAME}}
{{ANALYSIS_PERIOD}}
{{PATTERN_NUMBER}}
{{PATTERN_NAME}}
{{PATTERN_CLASS}}

// Hero metric cards (5)
{{M365_ENABLEMENT}}  {{M365_ENABLEMENT_TIER}}
{{AGENT_ADOPTION}}   {{AGENT_ADOPTION_TIER}}
{{EMBEDDED_USER_RATE}} {{EMBEDDED_USER_RATE_TIER}}
{{M365_BREADTH}}     {{M365_BREADTH_TIER}}
{{AGENT_BREADTH}}    {{AGENT_BREADTH_TIER}}

// Core counts
{{TOTAL_ACTIVE_USERS}} {{LICENSED_USERS}} {{CHAT_USERS}}
{{AGENT_USERS}} {{TOTAL_LICENSED_SEATS}} {{INACTIVE_LICENSES}}

// Reach section
{{ORG_COUNT}}
{{ORG_SCATTER_JSON}}
{{MONTHLY_USERS_LABELS}} {{MONTHLY_USERS_LICENSED}} {{MONTHLY_USERS_UNLICENSED}}

// Habit section
{{EMBEDDED_USER_RATE}}
{{BAND_1_5}} {{BAND_6_10}} {{BAND_11_15}} {{BAND_16_PLUS}}
{{BAND_1_5_PCT}} {{BAND_6_10_PCT}} {{BAND_11_15_PCT}} {{BAND_16_PLUS_PCT}}
{{MONTHLY_RETENTION_LABELS}} {{MONTHLY_RETENTION_DATA}}
{{RETAINED_USERS}} {{CHURNED_USERS}}

// Skill section
{{TOP_AGENT_NAMES_JSON}} {{TOP_AGENT_SESSIONS_JSON}}
{{AGENT_TABLE_HTML}}
{{TOTAL_AGENTS}} {{MULTI_USER_AGENTS}}
{{APP_SURFACE_LABELS}} {{APP_SURFACE_DATA}}

// Value section (narrative only)
{{LICENSE_PRIORITY}}
{{LICENSED_AVG_PROMPTS}} {{UNLICENSED_AVG_PROMPTS}}
{{TIME_SAVED_REALISED}} {{TIME_SAVED_UNREALISED}}

// Maturity section
{{REACH_TIER}} {{HABIT_TIER}} {{SKILL_TIER}}
{{REACH_GAUGE}} {{HABIT_GAUGE}} {{SKILL_GAUGE}}

// AI insight blocks (~27)
{{EXEC_SUMMARY_GOOD}} {{EXEC_SUMMARY_GAP}} {{EXEC_SUMMARY_OPP}}
{{INSIGHT_REACH}} {{INSIGHT_HABIT}} {{INSIGHT_SKILL}}
{{SPOTLIGHT_MATURITY}}
{{PULLQUOTE_0}} {{PULLQUOTE_1}} {{PULLQUOTE_2}} {{PULLQUOTE_3}}
{{REC_1_TITLE}} {{REC_1_DESC}}
{{REC_2_TITLE}} {{REC_2_DESC}}
{{REC_3_TITLE}} {{REC_3_DESC}}
{{TITLE_REACH}} {{TITLE_HABIT}} {{TITLE_SKILL}} {{TITLE_VALUE}} {{TITLE_MATURITY}}
{{SUBTITLE_REACH}} {{SUBTITLE_HABIT}} {{SUBTITLE_SKILL}} {{SUBTITLE_VALUE}} {{SUBTITLE_MATURITY}}
```

Charts (6, down from 10):
1. **Monthly user trend** — stacked bar (licensed + unlicensed) in Reach
2. **Org scatter** — bubble chart in Reach
3. **Active day band distribution** — horizontal bar in Habit
4. **Retention cohort** — line chart in Habit
5. **App surface distribution** — horizontal bar in Skill
6. **Agent leaderboard** — horizontal bar in Skill

**Step 2: Commit**

```bash
git add template/ff_template_v2.html
git commit -m "feat: add v2 template — 6 sections, 6 charts, premium dark mode"
```

---

## Task 5: Create v2 Report Generator

**Files:**
- Create: `src/generate-report-v2.js`

**Step 1: Write the v2 generator**

This is a slimmed-down version of `generate-report.js` that:

1. **Loads** `ff_template_v2.html` and `ff_schema_v2.json`
2. **Derives** fields: `license_coverage`, `inactive_licenses`, `time_saved_realised`, `time_saved_unrealised`
3. **Scores** 5 metrics against v2 bands (values are stored as percentages 0-100, bands are also 0-100 — no normalisation needed)
4. **Determines pattern** using simplified rules:
   - Count metrics at Expansion+ threshold
   - 0-1 = Foundation, 2-3 = Expansion, 4-5 or 3+ Frontier = Frontier
5. **Generates AI insights** (reuse the same Claude API call pattern, but with v2 prompt referencing 3 signals and 5 metrics)
6. **Populates template** using the same `safeSub()` pattern
7. **Builds Chart.js configs** for 6 charts
8. **Builds agent table HTML**
9. **Writes output** to `output/{customer}_frontier_firm_v2.html`

Key differences from v1 generator:
- Scoring uses 5 metrics with 0-100 bands (no 0-1 normalisation needed)
- Pattern determination counts metrics, not signals
- Only 3 signal gauges computed
- ~80 placeholder substitutions instead of 226
- 6 Chart.js configs instead of 10
- AI prompt references 3 signals, 5 hero metrics
- No radar chart data
- No metric detail cards (17 → 5 hero cards only)
- Fallback insights use v2 language

Structure:
```
1. CLI args + file loading (same pattern as v1)
2. Derived fields calculation
3. v2 scoring (scoreTierV2, scoreSignalV2, determinePatternV2)
4. AI insight generation (v2 prompt)
5. Template fallback insights (v2 language)
6. populateTemplateV2() — safeSub for ~80 tokens
7. Chart.js config generation
8. Agent table HTML
9. Write output + exit
```

**Step 2: Commit**

```bash
git add src/generate-report-v2.js
git commit -m "feat: add v2 report generator — 5 metrics, 3 signals, 6 charts"
```

---

## Task 6: Update Pipeline for v2 Support

**Files:**
- Modify: `src/run-pipeline.js`
- Modify: `package.json` (add `report-v2` script)

**Step 1: Add `--v2` flag support to pipeline**

When `--v2` is passed:
- Gate 1 uses `ff_data_schema_v2.json` for validation
- Gate 2 uses `generate-report-v2.js`
- Report filename uses `_frontier_firm_v2.html` suffix
- Gates 3-5 work unchanged (they validate the output HTML regardless of version)

**Step 2: Add npm script**

```json
"report-v2": "node src/run-pipeline.js --v2"
```

Usage: `npm run report-v2 -- --data data/network_rail.json`

**Step 3: Commit**

```bash
git add src/run-pipeline.js package.json
git commit -m "feat: pipeline supports --v2 flag for simplified framework"
```

---

## Task 7: Create v2 Test Data

**Files:**
- Create: `data/network_rail_v2.json`

**Step 1: Create test data from existing NR data**

Take the existing `data/network_rail.json` and:
1. Keep all fields that v2 needs
2. Add `embedded_user_rate` field (estimate from existing band data: users in 6+ day bands as proxy until real DAX extraction)
3. Add `"version": 2` marker
4. Strip fields not needed by v2 (keeping them won't hurt, but the v2 schema should validate without them)

For the embedded user rate estimate:
```
embedded_user_rate = (band_6_10 + band_11_15 + band_16_plus) / (band_1_5 + band_6_10 + band_11_15 + band_16_plus) * 100
= (2103 + 1108 + 43) / (7083 + 2103 + 1108 + 43) * 100
= 3254 / 10337 * 100
= 31.5%
```

This is a rough proxy — the real embedded rate requires the 3-month consistency check from ActiveDaysSummary.

**Step 2: Commit**

```bash
git add data/network_rail_v2.json
git commit -m "feat: add NR v2 test data with embedded_user_rate estimate"
```

---

## Task 8: Generate Test Report and Validate

**Step 1: Run the v2 pipeline**

```bash
npm run report-v2 -- --data data/network_rail_v2.json --no-ai
```

Expected: All gates pass, report at `output/network_rail_frontier_firm_v2.html`

**Step 2: Visual inspection**

Open the report in a browser. Check:
- [ ] Hero banner shows customer name, pattern, 5 metric cards
- [ ] Each metric card has correct value and tier badge
- [ ] Framework section renders 3 phases
- [ ] Reach section: user trend chart + org scatter
- [ ] Habit section: active day bands + retention trend
- [ ] Skill section: app surface bars + agent leaderboard
- [ ] Value section: narrative text, time savings, engagement premium
- [ ] Maturity section: pattern badge + 3 signal gauges
- [ ] Recommendations: 3 action cards
- [ ] All numbers match the source data
- [ ] No {{PLACEHOLDER}} tokens visible
- [ ] No NaN, undefined, or broken charts
- [ ] Dark mode renders correctly
- [ ] Scroll animations work

**Step 3: Commit any fixes**

---

## Task 9: Update Extractor for Embedded User Rate

**Files:**
- Modify: `src/extract-from-pbix.js`

**Step 1: Add embedded_user_rate extraction**

In the extraction phase, after scalar measures, add a computed measure phase that runs the Embedded User Rate DAX query from the measure map. Parse the result and store as `embedded_user_rate` (percentage 0-100).

The DAX returns a single row with columns: `EmbeddedRate`, `EmbeddedCount`, `TotalUsers`. Use `EmbeddedRate` directly (already multiplied by 100 in the DAX).

**Step 2: Commit**

```bash
git add src/extract-from-pbix.js
git commit -m "feat: extract embedded_user_rate from PBIX via DAX"
```

---

## Execution Order

Tasks 1-3 are schema/config (no dependencies between them — can run in parallel).
Task 4 (template) depends on knowing the placeholder list from Task 1.
Task 5 (generator) depends on Tasks 1-4.
Task 6 (pipeline) depends on Task 5.
Task 7 (test data) can run in parallel with Tasks 4-6.
Task 8 (validation) depends on Tasks 4-7.
Task 9 (extractor) is independent — can run anytime.

Suggested parallel batches:
1. **Batch 1:** Tasks 1, 2, 3 (schemas + measure map)
2. **Batch 2:** Tasks 4, 7 (template + test data)
3. **Batch 3:** Task 5 (generator)
4. **Batch 4:** Task 6 (pipeline update)
5. **Batch 5:** Tasks 8, 9 (validation + extractor)
