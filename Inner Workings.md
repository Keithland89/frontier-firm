# Inner Workings — Frontier Firm Report Pipeline

> How the report is structured, how data flows through it, and how narrative text is derived from that data.

---

## The three layers

There are three distinct layers that always run in the same order. The structure never changes between customers — only the content does.

---

## Layer 1: The HTML template is the fixed skeleton

`ff_template.html` is a static file that never changes between customers. It defines every section, every chart canvas, every heading position, every card layout. It is the same for every report.

What makes it flexible is that it is full of `{{PLACEHOLDER}}` tokens where customer-specific content will go:

```html
<section id="reach">
  <h2>{{TITLE_REACH}}</h2>               ← LLM writes this headline
  <p>{{SUBTITLE_REACH}}</p>             ← LLM writes this subtitle

  <div>{{M365_ENABLEMENT}}%</div>       ← direct number from JSON
  <div>of {{TOTAL_LICENSED_SEATS}} seats across {{ORG_COUNT}} orgs</div>

  <canvas id="chartTiers"></canvas>     ← chart slot, always here

  <div>{{INSIGHT_REACH}}</div>          ← LLM writes this "so what" paragraph
</section>
```

The section exists whether or not the customer has data. The chart canvas is always rendered. The heading position is always there. Nothing about the structure is conditional on what the data says.

---

## Layer 2: `generate-report.js` runs `safeSub()` to fill the numbers

The generator reads the customer's data JSON and does a string-replace pass across the entire template. Every `{{PLACEHOLDER}}` maps to a field name:

```
{{M365_ENABLEMENT}}       → data.m365_enablement         (75.4)
{{TOTAL_LICENSED_SEATS}}  → data.total_licensed_seats     (50,496)
{{ORG_COUNT}}             → data.org_count                (14)
{{AGENT_RETENTION}}       → data.agent_retention          (39.7)
```

This is purely mechanical — find the token, replace it with the value, done. `safeSub()` handles edge cases: if the value is `"not_available"` it either renders `—` in visible text or `0` inside a JavaScript data array.

**Charts** are a variant of this. Instead of a `{{TOKEN}}` in the HTML, the generator injects JavaScript variables into a `<script>` block at the bottom of the template:

```javascript
const _monthlyData     = [/* data._supplementary_metrics.monthly_data */];
const _orgScatterData  = [/* data.org_scatter_data */];
const _agentTable      = [/* data.agent_table */];
```

Chart.js reads those variables at page load and draws the charts. The canvas element is already in the template — the data arrives via the injected JS.

**Scoring also happens here.** Before any substitution, the generator runs each metric through the band thresholds in `schema/ff_schema.json`:

```
m365_frequency = 16.8%   →   band[1]=20%, band[2]=40%   →   Foundation
agent_adoption = 8.5%    →   band[0]=5%, band[1]=10%    →   Expansion
```

Signal tiers (Reach, Habit, Skill) are the aggregate of their metrics. Pattern (P1/P2/P3) is derived from signal tiers. These then fill tokens like `{{REACH_TIER}}`, `{{PATTERN_NUMBER}}`, `{{HABIT_TIER_CLASS}}` (which controls CSS colour).

---

## Layer 3: `_ai_insights` fills the narrative slots

After the numbers are in, a second pass fills the narrative text. Every `{{INSIGHT_*}}`, `{{TITLE_*}}`, `{{SUBTITLE_*}}`, `{{PULLQUOTE_*}}`, `{{REC_*}}`, and `{{CULTURE_*}}` token gets its text from a string in `data._ai_insights`.

This object lives inside the customer's data JSON alongside all the numeric fields:

```json
{
  "m365_enablement": 75.4,
  "agent_adoption": 8.5,
  "_ai_insights": {
    "TITLE_REACH": "75% activation across 14 orgs — deployed but not yet embedded",
    "INSIGHT_REACH": "8.5% agent adoption is the headline...",
    "CULTURE_HEADLINE": "8,072 users at 6–10 active days — ...",
    ...
  }
}
```

These strings are what Claude writes when the pipeline hits exit code 2 (Gate 1.5). The generator passes the full data file — all 65+ numeric fields, the org scatter, the agent table, the monthly trend data — and Claude writes all 34 text blocks to match. The text must be grounded in those numbers; `RULES.md` is the constraint system that governs how.

---

## How a single section composes — the Reach section as an example

| Template slot | Source | Who produces it |
|---|---|---|
| `{{TITLE_REACH}}` | `_ai_insights` | Claude |
| `{{SUBTITLE_REACH}}` | `_ai_insights` | Claude |
| `{{M365_ENABLEMENT}}` | `data.m365_enablement` | PBIX extraction |
| `{{TOTAL_LICENSED_SEATS}}` | `data.total_licensed_seats` | PBIX extraction |
| `{{REACH_TIER}}` | Scored from schema bands | `generate-report.js` |
| `chartTiers` canvas | `data.band_*_pct` fields | Chart.js at page render |
| `{{INSIGHT_REACH_TIER}}` | Conditional string | `generate-report.js` inline |
| `{{INSIGHT_REACH}}` | `_ai_insights` | Claude |

`INSIGHT_REACH_TIER` is a small exception — it's a simple conditional computed inline in the generator (is licensed > chat users or not?) and does not go through the LLM. `INSIGHT_REACH` is the full "so what" paragraph that does.

---

## The 34 insight keys

All narrative text lives in `_ai_insights` under these keys:

| Key | Where it appears |
|---|---|
| `EXEC_SUMMARY_GOOD` | Executive summary — "What's working" card |
| `EXEC_SUMMARY_GAP` | Executive summary — "The gap" card |
| `EXEC_SUMMARY_OPP` | Executive summary — "The opportunity" card |
| `TITLE_REACH/HABIT/SKILL/VALUE` | Section headlines |
| `SUBTITLE_REACH/HABIT/SKILL/VALUE` | Section subtitles |
| `INSIGHT_REACH/HABIT/SKILL` | "So what" paragraph beneath each signal's charts |
| `SPOTLIGHT_HABIT` | Habit deep-dive — the conversion opportunity |
| `SPOTLIGHT_MATURITY` | Maturity section — what it takes to move up |
| `PULLQUOTE_0–5` | Full-width quote strips between sections |
| `REC_1–4_TITLE` + `REC_1–4_DESC` | Four recommendations (title + description each) |
| `CULTURE_HEADLINE` | Maturity section headline |
| `CULTURE_DESC` | Maturity section body paragraph |
| `CULTURE_RED_FLAG` | The specific risk visible in this customer's data |
| `CULTURE_ACTION` | The highest-leverage next move |

---

## The fallback path

If `_ai_insights` is absent or incomplete, `generateTemplateInsights()` in `generate-report.js` produces data-driven fallback strings for every slot. These use the same numeric fields but produce simpler, formula-based text rather than LLM-written prose.

The pipeline normally forces exit code 2 before generation if any of the 34 keys are missing — so the fallback is only reachable via `--no-ai`, used for template testing only.

---

## What is fixed vs. what changes per customer

| Fixed for every customer | Changes per customer |
|---|---|
| Section order and layout | All numbers inside sections |
| Chart canvas positions | Chart data (injected JS variables) |
| Which placeholders exist | Text in every `{{PLACEHOLDER}}` |
| Scoring thresholds (`ff_schema.json`) | Pattern and tier classification |
| Quality rules (`RULES.md`) | The 34 LLM-generated narrative strings |

The structure is the template. The data is the JSON. The intelligence connecting the two is Claude generating `_ai_insights`.

---

## Pipeline gate summary

```
Gate 0   (optional)  Extract data from PBIX → data/{customer}.json
Gate 0.5 (optional)  Cross-validate extracted values against PBIX
Gate 1               Validate JSON schema + semantic sanity checks
Gate 1.5             Check _ai_insights — exit 2 if any of 34 keys missing
Gate 2               Generate HTML — safeSub() + JS data injection
Gate 3               Validate HTML — no placeholders, no Contoso, sections present
Gate 4               Headless visual check — 10 charts must render
Gate 5               Deep number audit — every visible number traced to JSON
```

If any gate fails, the pipeline stops. Fix the issue and re-run.
