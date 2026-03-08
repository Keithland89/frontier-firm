# Quality Pipeline Design — 5 Mandatory Gates

> Date: 2026-03-08
> Status: Approved
> Author: Keith McGrane + Claude Code

## Problem

The report generation pipeline silently accepts missing data, produces `undefined` values in HTML, renders blank charts without error, and declares success when visual sections are broken. Multiple rounds of "all checks passed" were followed by discovering broken visuals, wrong numbers, and missing chart data.

## Root Causes

1. **No schema contract** — the data file has no formal definition of required fields, types, or ranges
2. **Silent substitution** — `String(undefined)` → `"undefined"` in HTML with no error
3. **Chart.js accepts null** — blank charts render without error
4. **Shallow automated checks** — canvas dimensions > 0 ≠ chart has data
5. **Optional quality gates** — validation and audit run only when manually invoked
6. **Inconsistent field naming** — `Licensed` vs `licensed`, `band_11_15_pct` vs `band_11_19_pct`

## Design Principle

**Strict mode only.** Every field must be present in the data file or explicitly marked as `"not_available"`. Every chart must have pixel data. Every number must trace to the data file. Any failure stops the pipeline.

## The Pipeline

```
npm run report -- --data data/customer.json --output output/

Gate 1: validate-data.js     → Is the data file complete and correct?
Gate 2: generate-report.js   → Produce HTML with zero undefined values
Gate 3: validate-report.js   → Is the HTML structurally correct?
Gate 4: visual-check.js      → Do all charts render with real data?
Gate 5: deep-audit.js        → Does every number trace to the data file?
```

Any gate failure = pipeline stops. No partial reports.

## Gate 1: validate-data.js (new)

### Purpose
Validate the customer JSON against a formal schema before the generator runs.

### Schema: `schema/ff_data_schema.json`
A JSON Schema (draft-07) that defines:

**Required fields (~52):**
- Identity: `customer_name`, `analysis_period`
- User counts: `total_active_users`, `licensed_users`, `chat_users`, `agent_users`, `total_licensed_seats`
- Scored metrics: all 17 metrics from `ff_schema.json` (`m365_enablement`, `m365_adoption`, `agent_adoption`, etc.)
- Active day bands: `band_1_5` through `band_16_plus_pct`, per-tier variants
- Agent ecosystem: `total_agents`, `multi_user_agents`, `agent_table`
- Supplementary: `_supplementary_metrics.monthly_data`, `_supplementary_metrics.per_tier_monthly_users`, etc.
- Engagement: `licensed_avg_prompts`, `unlicensed_avg_prompts`, `weekly_m365`, `weekly_chat`, `weekly_agents`
- Retention: `m365_retention`, `chat_retention`, `agent_retention`
- Charts: `radar_reach`, `radar_habit`, `radar_skill`, `org_scatter_data`, `top_agent_names`, `top_agent_sessions`

**Type constraints:**
- Numbers: `{ "type": ["number", "string"], "pattern": "^not_available$" }` — allows number OR the literal string "not_available"
- Arrays: must be arrays with minimum length
- Strings: must be non-empty

**Range validation:**
- Percentages: 0–100 (or 0–1 for ratio-stored values)
- Counts: >= 0
- Ratios: > 0

**Not-available handling:**
- Any field can be `"not_available"` instead of a value
- This is the ONLY way to omit data — missing/undefined = hard fail
- Generator uses this to show "Data not available" in the report section

### Output
```
$ node src/validate-data.js --data data/network_rail.json

=== Data Validation: network_rail.json ===
✓ 48/52 required fields present with valid values
✓ 4 fields marked "not_available": agents_keep, agents_review, agents_retire, agent_creators_pct
✗ FAIL: weekly_chat is missing — set a value or "not_available"
```

Exit code 0 = pass, 1 = fail.

## Gate 2: generate-report.js (modified)

### Changes

**1. Safe replacement wrapper**
Replace all direct `.replace()` calls with `safeSub()`:

```javascript
function safeSub(html, placeholder, value, fieldName) {
  if (value === undefined || value === null) {
    errors.push(`${fieldName}: value is ${value}`);
    return html;  // Don't substitute — leave placeholder for Gate 3 to catch
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    errors.push(`${fieldName}: value is ${value} (NaN/Infinity)`);
    return html;
  }
  return html.replace(placeholder, String(value));
}
```

If any errors accumulate, generation fails at the end with a clear list.

**2. Not-available handling**
When a field is `"not_available"`, the generator:
- Inserts a styled `<span class="not-available">Data not available</span>` for text placeholders
- Inserts `[]` or `null` for chart datasets (with a "no data" overlay on the chart)
- Logs which sections are affected

**3. Chart dataset validation**
Before injecting JSON into chart code:
- Verify arrays have expected length (matching labels)
- Verify all values are numbers (not null/undefined/NaN)
- Verify org_scatter_data is in Chart.js bubble format

**4. Normalised field matching**
- Case-insensitive tier matching: `Licensed` = `licensed` = `LICENSED`
- Band field aliases: `band_11_15_pct` = `band_11_19_pct`, `band_16_plus_pct` = `band_20_plus_pct`

**5. Fail on errors**
If `safeSub()` accumulated any errors, the generator prints them all and exits with code 1. No HTML file is written.

## Gate 3: validate-report.js (enhanced)

### Current checks (kept)
- Unresolved `{{PLACEHOLDER}}` tokens
- Customer name present
- No Contoso leakage
- Key value presence
- Factual consistency ("outnumber" direction)

### New checks
- **Bad value scan**: visible text searched for `undefined`, `NaN`, `null`, `Infinity`, `[object Object]`, `not_available` (should be styled, not raw text)
- **Section heading presence**: verify all 9 nav sections have corresponding `<section>` with content
- **Chart canvas presence**: verify all 10 expected `<canvas>` elements exist in the DOM
- **JSON dataset validation**: parse embedded JSON datasets and verify they contain non-empty arrays

### Severity
- Errors = exit code 1 (pipeline stops)
- Warnings = logged, exit code 0

## Gate 4: visual-check.js (new)

### Purpose
Render the report in headless Chromium and verify every visual element works.

### Checks

**1. Force-reveal all elements**
Bypass scroll animations by adding `.revealed` class and `opacity: 1` to all `.reveal` elements.

**2. Chart pixel verification**
For each of the 10 expected canvases:
- Verify canvas exists and has width/height > 0
- Read pixel data — verify at least some non-transparent pixels (chart actually rendered)
- Access `Chart.getChart(canvas)` — verify Chart.js instance exists
- Read `chart.data.datasets` — verify non-empty with numeric values

**3. Visible text scan**
Walk the DOM text nodes (excluding `<script>` and `<style>`) and check for `undefined`, `NaN`, `null`, `Infinity`.

**4. Key number verification**
Extract critical numbers from the data file and verify they appear in rendered text:
- `total_active_users`, `licensed_users`, `chat_users`, `agent_users`
- `license_priority`, `m365_frequency`, `agent_health`
- `customer_name`

**5. Screenshot capture**
Save section-by-section screenshots to `output/screenshots/` for human review. This is informational — doesn't affect pass/fail.

### Requirements
- `playwright` (optional dependency, already in package.json)
- Chromium browser (installed via `npx playwright install chromium`)

### Output
```
=== Visual Check ===
✓ 10/10 charts have pixel data
✓ 10/10 Chart.js instances valid with non-empty datasets
✓ No bad values in visible text
✓ 26/26 key numbers found
✓ Screenshots saved to output/screenshots/

VISUAL CHECK PASSED
```

## Gate 5: deep-audit.js (enhanced)

### Current capabilities (kept)
- Extract all visible numbers from HTML
- Trace each to data file values
- Flag suspicious untraced numbers
- Contoso pattern detection

### Enhancements
- **Chart dataset audit**: extract Chart.js dataset values from rendered page via Playwright, verify each value traces to data file
- **Remove exemptions**: no more "skip numbers < 10" or "skip round numbers". Every number must trace.
- **Band threshold validation**: verify metric values in the report match their schema tier (Foundation/Expansion/Frontier)
- **Mandatory execution**: exit code 1 if any untraced numbers found

## Orchestrator: run-pipeline.js (new)

```javascript
const gates = [
  { name: 'validate-data', script: 'src/validate-data.js', args: ['--data', dataPath] },
  { name: 'generate', script: 'src/generate-report.js', args: ['--data', dataPath, '--output', outputDir, '--no-ai'] },
  { name: 'validate-report', script: 'src/validate-report.js', args: ['--report', reportPath, '--data', dataPath] },
  { name: 'visual-check', script: 'src/visual-check.js', args: ['--report', reportPath, '--data', dataPath] },
  { name: 'deep-audit', script: 'src/deep-audit.js', args: ['--report', reportPath, '--data', dataPath] },
];

// Run sequentially, stop at first failure
for (const gate of gates) {
  const result = execSync(`node ${gate.script} ${gate.args.join(' ')}`);
  if (result.status !== 0) {
    console.error(`PIPELINE FAILED at gate: ${gate.name}`);
    process.exit(1);
  }
}
console.log('PIPELINE PASSED — report is ready');
```

### CLI
```bash
# Full pipeline
npm run report -- --data data/network_rail.json --output output/

# Individual gates (for development)
npm run validate -- --data data/network_rail.json
npm run generate -- --data data/network_rail.json --output output/
npm run check -- --report output/network_rail_frontier_firm.html --data data/network_rail.json
npm run audit -- --report output/network_rail_frontier_firm.html --data data/network_rail.json
```

## Schema: ff_data_schema.json

### Structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Frontier Firm Customer Data",
  "type": "object",
  "required": ["customer_name", "analysis_period", "total_active_users", ...],
  "properties": {
    "customer_name": { "type": "string", "minLength": 1 },
    "total_active_users": {
      "oneOf": [
        { "type": "number", "minimum": 0 },
        { "type": "string", "const": "not_available" }
      ]
    },
    ...
  }
}
```

The `oneOf` pattern allows every field to be either its expected type OR the literal `"not_available"`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schema/ff_data_schema.json` | New | JSON Schema for customer data |
| `src/validate-data.js` | New | Gate 1: schema validation |
| `src/visual-check.js` | New | Gate 4: headless render verification |
| `src/run-pipeline.js` | New | Pipeline orchestrator |
| `src/generate-report.js` | Modify | safeSub wrapper, chart validation, not-available handling |
| `src/validate-report.js` | Modify | Enhanced checks, section/chart presence |
| `src/deep-audit.js` | Modify | Chart audit, remove exemptions |
| `package.json` | Modify | Add `report` script, update existing scripts |
| `data/sample_contoso.json` | Modify | Add any missing required fields, ensure schema compliance |
| `data/network_rail.json` | Modify | Mark missing fields as "not_available" |

## Success Criteria

1. `npm run report -- --data data/sample_contoso.json` passes all 5 gates with zero warnings
2. `npm run report -- --data data/network_rail.json` passes all 5 gates (with "not_available" sections noted)
3. Removing a required field from a data file causes Gate 1 to fail with a clear message
4. Setting a field to `undefined` or omitting it causes Gate 1 to fail (not Gate 2 or later)
5. A chart with empty data causes Gate 4 to fail (not silently render blank)
6. Every visible number in the report traces to the data file (Gate 5)
