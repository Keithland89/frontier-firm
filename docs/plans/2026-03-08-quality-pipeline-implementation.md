# Quality Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A single command — `npm run report -- --pbix "Customer Name"` — extracts data from an open PBIX, generates the report, and runs 5 quality gates. No manual steps. No silent breakage.

**Architecture:** Auto-extract from PBIX via PBI MCP subprocess → schema validation → safe generator → HTML validation → headless visual check → deep number audit. Each stage is a standalone script, orchestrated by `run-pipeline.js`.

**Tech Stack:** Node.js (no external deps except optional Playwright for Gate 4), JSON Schema draft-07 (hand-rolled validator, no library).

---

### Task 1: Create the data schema

**Files:**
- Create: `schema/ff_data_schema.json`

**Step 1: Build the schema**

Create `schema/ff_data_schema.json` with every field the generator uses. Derive the field list from `generate-report.js` lines 517-620 (direct replacements) and lines 600-760 (chart data injection).

The schema must define:
- `required` array with all field names
- Each property as `oneOf: [{ type: "number", minimum: 0 }, { const: "not_available" }]` for numeric fields
- String fields as `{ type: "string", minLength: 1 }` or `oneOf` with `not_available`
- Array fields with `minItems`
- Nested `_supplementary_metrics` object with its own required/properties

Required fields (~55):

**Identity:** `customer_name`, `analysis_period`

**User counts:** `total_active_users`, `licensed_users`, `chat_users`, `agent_users`, `total_licensed_seats`, `inactive_licenses`

**Scored metrics:** `m365_enablement`, `m365_adoption`, `agent_adoption`, `agent_enablement`, `org_count`, `license_priority`, `m365_frequency`, `chat_habit`, `agent_frequency`, `m365_retention`, `chat_retention`, `agent_retention`, `m365_intensity`, `chat_intensity`, `agent_intensity`, `licensed_avg_prompts`, `unlicensed_avg_prompts`, `weekly_m365`, `weekly_chat`, `weekly_agents`, `m365_breadth`, `agent_breadth`, `complex_sessions`, `agent_health`, `agent_creators_pct`, `license_coverage`, `agent_habitual`

**Active day bands:** `band_1_5`, `band_6_10`, `band_11_15`, `band_16_plus`, `band_1_5_pct`, `band_6_10_pct`, `band_11_15_pct`, `band_16_plus_pct`, `chat_band_1_5_pct`, `chat_band_6_10_pct`, `chat_band_11_15_pct`, `chat_band_16_plus_pct`, `agent_band_1_5_pct`, `agent_band_6_10_pct`, `agent_band_11_15_pct`, `agent_band_16_plus_pct`

**Agent ecosystem:** `total_agents`, `multi_user_agents`, `agents_keep`, `agents_review`, `agents_retire`, `agent_table`, `top_agent_names`, `top_agent_sessions`

**Charts:** `radar_reach`, `radar_habit`, `radar_skill`, `org_scatter_data`

**Supplementary (nested):** `_supplementary_metrics.monthly_data`, `_supplementary_metrics.per_tier_monthly_users`, `_supplementary_metrics.per_tier_active_day_bands`, `_supplementary_metrics.app_interactions`, `_supplementary_metrics.distinct_departments`

**Step 2: Verify against both data files**

Run a manual check: load `data/sample_contoso.json` and `data/network_rail.json`, verify every required field exists (or is `"not_available"` where applicable).

**Step 3: Commit**

```bash
git add schema/ff_data_schema.json
git commit -m "feat: add data schema with required fields and type constraints"
```

---

### Task 2: Create validate-data.js (Gate 1)

**Files:**
- Create: `src/validate-data.js`

**Step 1: Write the validator**

```javascript
#!/usr/bin/env node
// Gate 1: Validate customer data against schema before generation
// Usage: node validate-data.js --data data/customer.json

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dataPath = args.find((a, i) => args[i - 1] === '--data');
if (!dataPath) { console.error('Usage: node validate-data.js --data <data.json>'); process.exit(1); }

const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schema', 'ff_data_schema.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));

const errors = [];
const notAvailable = [];
let validCount = 0;

// Check each required field
for (const field of schema.required) {
  const value = field.includes('.') ? getNestedValue(data, field) : data[field];

  if (value === undefined || value === null) {
    errors.push(`Missing required field: ${field} — set a value or "not_available"`);
  } else if (value === 'not_available') {
    notAvailable.push(field);
  } else {
    // Type check
    const propDef = schema.properties[field];
    if (propDef) {
      const typeError = checkType(value, propDef, field);
      if (typeError) errors.push(typeError);
      else validCount++;
    } else {
      validCount++;
    }
  }
}

// Helper: nested field access
function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o && o[k], obj);
}

// Helper: type validation
function checkType(value, def, field) {
  if (def.type === 'number' && typeof value !== 'number') return `${field}: expected number, got ${typeof value} (${value})`;
  if (def.type === 'string' && typeof value !== 'string') return `${field}: expected string, got ${typeof value}`;
  if (def.type === 'array' && !Array.isArray(value)) return `${field}: expected array, got ${typeof value}`;
  if (def.minimum !== undefined && value < def.minimum) return `${field}: value ${value} below minimum ${def.minimum}`;
  if (def.maximum !== undefined && value > def.maximum) return `${field}: value ${value} above maximum ${def.maximum}`;
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return `${field}: value is NaN/Infinity`;
  return null;
}

// Report
console.log(`\n=== Data Validation: ${path.basename(dataPath)} ===`);
console.log(`✓ ${validCount}/${schema.required.length} required fields valid`);
if (notAvailable.length > 0) console.log(`○ ${notAvailable.length} fields marked "not_available": ${notAvailable.join(', ')}`);
if (errors.length > 0) {
  console.log(`\n✗ ${errors.length} ERRORS:`);
  errors.forEach(e => console.log(`  ✗ ${e}`));
  process.exit(1);
}
console.log('\nDATA VALIDATION PASSED\n');
process.exit(0);
```

**Step 2: Test with sample_contoso.json — expect pass**

Run: `node src/validate-data.js --data data/sample_contoso.json`
Expected: PASS (all fields present)

**Step 3: Test with network_rail.json — expect pass with not_available notes**

Run: `node src/validate-data.js --data data/network_rail.json`
Expected: PASS with "not_available" fields listed. If any fields are truly missing (not marked), update the data file to add `"not_available"` for those fields.

**Step 4: Test failure case — remove a field temporarily**

Remove `customer_name` from a temp copy, verify the validator catches it.

**Step 5: Commit**

```bash
git add src/validate-data.js
git commit -m "feat: add Gate 1 — data schema validator"
```

---

### Task 3: Add safeSub to generate-report.js (Gate 2 hardening)

**Files:**
- Modify: `src/generate-report.js`

**Step 1: Add safeSub function and error accumulator**

At the top of `populateTemplate()` (line 512), add:

```javascript
const subErrors = [];
function safeSub(html, placeholder, value, fieldName) {
  if (value === 'not_available') {
    return html.replace(placeholder, '<span class="not-available">—</span>');
  }
  if (value === undefined || value === null) {
    subErrors.push(fieldName + ': value is ' + value);
    return html;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    subErrors.push(fieldName + ': value is ' + value + ' (NaN/Infinity)');
    return html;
  }
  return html.replace(placeholder, String(value));
}
```

**Step 2: Replace all direct .replace() calls with safeSub**

Lines 517-563: replace every `html = html.replace(/\{\{FIELD\}\}/g, String(data.field))` with:
```javascript
html = safeSub(html, /\{\{FIELD\}\}/g, data.field, 'field');
```

There are approximately 50 direct replacements to convert.

**Step 3: Add JSON dataset validation before injection**

For each `JSON.stringify(data.field)` used in chart data (lines 610-620, 754, 860-970):
```javascript
function safeJSON(value, fieldName) {
  if (value === undefined || value === null || value === 'not_available') {
    subErrors.push(fieldName + ': cannot inject undefined/null into chart JSON');
    return '[]';
  }
  if (Array.isArray(value)) {
    const hasNaN = value.some(v => typeof v === 'number' && isNaN(v));
    if (hasNaN) subErrors.push(fieldName + ': array contains NaN values');
  }
  return JSON.stringify(value);
}
```

**Step 4: Add fail-on-errors check at end of populateTemplate**

After all replacements, before writing the file:
```javascript
if (subErrors.length > 0) {
  console.error('\n=== GENERATION ERRORS (' + subErrors.length + ') ===');
  subErrors.forEach(e => console.error('  ✗ ' + e));
  console.error('\nReport NOT generated. Fix the data file and retry.');
  process.exit(1);
}
```

**Step 5: Fix the normalised field matching in extractTierBands**

Already done in the current code (case-insensitive tier matching, band field aliases). Verify it's working.

**Step 6: Test — generate sample_contoso report, verify zero errors**

Run: `node src/generate-report.js --data data/sample_contoso.json --output output/ --no-ai`
Expected: Report generates successfully with zero safeSub errors.

**Step 7: Test — generate with a deliberately missing field**

Set `weekly_chat` to `undefined` in a temp data copy, verify generator fails with clear message.

**Step 8: Commit**

```bash
git add src/generate-report.js
git commit -m "feat: add safeSub wrapper and fail-on-error to generator (Gate 2)"
```

---

### Task 4: Enhance validate-report.js (Gate 3)

**Files:**
- Modify: `src/validate-report.js`

**Step 1: Add bad value scan**

After existing checks, add:
```javascript
// CHECK: Bad values in visible text (outside script/style tags)
const visibleHTML = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const badValues = ['undefined', 'NaN', 'Infinity', '[object Object]'];
for (const bad of badValues) {
  const regex = new RegExp('>' + bad + '<|"' + bad + '"', 'gi');
  const matches = visibleHTML.match(regex);
  if (matches) {
    errors.push('Found "' + bad + '" in visible HTML (' + matches.length + ' occurrences)');
  }
}
```

**Step 2: Add section heading check**

```javascript
// CHECK: All sections present
const requiredSections = ['overview', 'framework', 'summary', 'reach', 'habit', 'skill', 'value', 'maturity', 'actions'];
for (const section of requiredSections) {
  if (!html.includes('id="' + section + '"')) {
    errors.push('Missing section: #' + section);
  }
}
```

**Step 3: Add canvas presence check**

```javascript
// CHECK: All expected charts present
const expectedCharts = ['chartTiers', 'chartMonthlyUsers', 'chartEngagement', 'chartWeekly', 'chartOrgScatter', 'chartRetention', 'chartCohortFlow', 'chartHabit', 'chartAgentHealth', 'chartLicense'];
for (const chartId of expectedCharts) {
  if (!html.includes('id="' + chartId + '"')) {
    errors.push('Missing chart canvas: #' + chartId);
  }
}
```

**Step 4: Add embedded JSON validation**

```javascript
// CHECK: Chart JSON datasets are non-empty
const jsonPatterns = [
  { pattern: /const _perTierAD=(\{[\s\S]*?\});/, name: 'per_tier_active_day' },
  { pattern: /const _perTierMU=(\{[\s\S]*?\});/, name: 'per_tier_monthly_users' },
];
for (const jp of jsonPatterns) {
  const match = html.match(jp.pattern);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.m365 && Array.isArray(parsed.m365) && parsed.m365.every(v => typeof v === 'object' ? Object.values(v).every(n => n === 0) : v === 0)) {
        errors.push(jp.name + ': m365 dataset is all zeroes');
      }
    } catch(e) { /* JSON parse issue — already caught by other checks */ }
  }
}
```

**Step 5: Expand key fields check**

Replace the current 5-field list with all critical values:
```javascript
const keyFields = [
  'total_active_users', 'licensed_users', 'chat_users', 'agent_users',
  'm365_enablement', 'license_priority', 'm365_frequency', 'agent_health',
  'total_agents', 'multi_user_agents'
];
```

**Step 6: Test — validate the Customer A report**

Run: `node src/validate-report.js --report output/network_rail_frontier_firm.html --data data/network_rail.json`
Expected: PASS

**Step 7: Commit**

```bash
git add src/validate-report.js
git commit -m "feat: enhance Gate 3 with bad-value scan, section/chart checks, JSON validation"
```

---

### Task 5: Create visual-check.js (Gate 4)

**Files:**
- Create: `src/visual-check.js`

**Step 1: Write the visual checker**

The script must:
1. Launch headless Chromium via Playwright
2. Navigate to the report HTML file
3. Wait for networkidle + 3s for chart rendering
4. Force-reveal all `.reveal` elements
5. For each of 10 expected canvases: check pixel data + Chart.js instance + dataset values
6. Scan visible text for bad values
7. Verify key numbers from data file appear in rendered text
8. Save screenshots to `output/screenshots/`
9. Exit 0 on pass, 1 on fail

Use the pattern from `C:\tmp\full_interactive_check.js` as a starting point — it already works. Key differences:
- Accept `--report` and `--data` CLI args
- Load data file for key number verification
- Check Chart.js dataset values are non-zero (not just "instance exists")
- Gracefully handle missing Playwright (warn but don't fail the pipeline if Playwright isn't installed — downgrade to a warning)

**Step 2: Test with Customer A report**

Run: `node src/visual-check.js --report output/network_rail_frontier_firm.html --data data/network_rail.json`
Expected: PASS with 10/10 charts verified

**Step 3: Commit**

```bash
git add src/visual-check.js
git commit -m "feat: add Gate 4 — headless visual verification"
```

---

### Task 6: Enhance deep-audit.js (Gate 5)

**Files:**
- Modify: `src/deep-audit.js`

**Step 1: Accept CLI args**

Replace hardcoded file paths (lines 9-10) with CLI arg parsing:
```javascript
const args = process.argv.slice(2);
const reportPath = args.find((a, i) => args[i - 1] === '--report') || 'output/report.html';
const dataPath = args.find((a, i) => args[i - 1] === '--data') || 'data/sample_contoso.json';
```

**Step 2: Remove number exemptions**

Remove the filters that skip small numbers (< 10) and round numbers (100, 50, etc.). Every number must trace.

Replace with a narrow whitelist of truly framework numbers that always appear:
```javascript
const frameworkNumbers = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '15', '16', '19', '20', '27']);
// These are structural (phase numbers, day ranges, app count) — not data values
```

**Step 3: Add exit code**

Currently the script just logs. Add proper exit:
```javascript
if (suspiciousNumbers.length > 0) {
  console.error('\nDEEP AUDIT FAILED — ' + suspiciousNumbers.length + ' untraced numbers');
  process.exit(1);
}
console.log('\nDEEP AUDIT PASSED');
process.exit(0);
```

**Step 4: Test with Customer A report**

Run: `node src/deep-audit.js --report output/network_rail_frontier_firm.html --data data/network_rail.json`
Expected: PASS (or identify numbers that need to be added to the legitimate set)

**Step 5: Commit**

```bash
git add src/deep-audit.js
git commit -m "feat: enhance Gate 5 — CLI args, remove exemptions, exit codes"
```

---

### Task 7: Create extract-from-pbix.js (auto-extraction)

**Files:**
- Create: `src/extract-from-pbix.js`

**Step 1: Write the generic PBIX extractor**

This script:
1. Spawns the PBI MCP exe as a subprocess (JSON-RPC over stdin/stdout)
2. Calls `ListLocalInstances` to find open PBIX files
3. Matches the `--pbix` arg to a window title (fuzzy match)
4. Connects to the matched instance
5. Runs all DAX queries needed for every required field in `ff_data_schema.json`
6. Builds a schema-compliant data JSON
7. Saves to `data/{customer_name}.json`

Key implementation details from this session's learnings:
- PBI MCP exe path: read from `~/.claude/mcp.json` or accept `--mcp-exe` arg
- Response format: first content block = JSON status, second = CSV resource block
- CSV headers include table prefix e.g. `Chat + Agent Org Data[Organization]` — strip prefix when parsing
- Must send `initialize` → `notifications/initialized` → `tools/call` sequence
- DAX queries: use `EVALUATE ROW("v", [MeasureName])` for scalars, `SUMMARIZECOLUMNS` for tabular data
- Org data: aggregate with `DISTINCTCOUNT` on UserEmail grouped by Organization
- Agent data: query `Chat + Agent Interactions (Audit Logs)` table with `AgentName <> BLANK()` filter
- Active day bands: compute from user-level day counts per month per tier (Licensed/Unlicensed/Agents)
- Retention: use `INTERSECT`/`EXCEPT` on monthly user sets for MoM retained/new/churned
- Per-tier monthly users: `SUMMARIZECOLUMNS` by MonthStart × License Status
- Org scatter: must output Chart.js bubble format `{label, data:[{x,y,r}]}` (NOT flat objects)
- Field names: use case-insensitive tier matching, support `band_11_15_pct` AND `band_11_19_pct` aliases

The script should:
- Log each DAX query as it runs (progress indicator)
- Validate the output against `ff_data_schema.json` before saving
- Mark any field it couldn't extract as `"not_available"` with a warning
- Print a summary: X fields extracted, Y marked not_available, Z errors

Reference implementations from this session:
- `C:\tmp\full_validation.js` — scalar extraction pattern
- `C:\tmp\fill_gaps.js` — org scatter, retention, per-tier active day bands
- `C:\tmp\debug_agents.js` — agent leaderboard with correct column names
- `C:\Users\keithmcgrane\frontier-firm\src\extract-nr.js` — PBI MCP connection boilerplate

**Step 2: Test with Customer A PBIX**

Open a customer PBIX, run:
```bash
node src/extract-from-pbix.js --pbix "Customer A" --output data/
```
Expected: `data/customer_a.json` created with all fields populated or marked `"not_available"`.

Compare output against the existing data file for accuracy.

**Step 3: Test with a different PBIX (Customer B)**

Open a second customer PBIX, run:
```bash
node src/extract-from-pbix.js --pbix "Customer B" --output data/
```
Expected: `data/customer_b.json` created. Some customers have Agent365 data that others don't.

**Step 4: Commit**

```bash
git add src/extract-from-pbix.js
git commit -m "feat: add auto-extraction from open PBIX via PBI MCP subprocess"
```

---

### Task 8: AI insight generation (no API key needed)

**Pattern:** Following the approach from [pbi-to-exec-deck](https://github.com/shailendrahegde/pbi-to-exec-deck) — the AI tool (Claude Code or GitHub Copilot) IS the insight engine. No separate API call. The CLAUDE.md and copilot-instructions.md tell the AI tool to analyze the data and write insights as a pipeline step.

**Files:**
- Create: `src/generate-insights.js` — prepares the analysis request + validates output
- Create: `prompts/insights-request.md` — the prompt template the AI tool reads
- Modify: `CLAUDE.md` — add insight generation step to pipeline instructions

**Step 1: Write the insight request builder**

`src/generate-insights.js` does NOT call an API. Instead it:

1. Loads the customer data JSON
2. Runs scoring to determine signal tiers and pattern
3. Generates `temp/insights_request.json` — a structured analysis request containing:
   - All key metrics with labels and context
   - Signal tiers and pattern
   - The 30 required `_ai_insights` keys with descriptions and expected lengths
   - Quality rules (from `prompts/06-ai-insights.md`)
4. If `_ai_insights` already exists in the data file AND has all 30 keys → skips (already done)
5. If `_ai_insights` is missing or incomplete → writes the request file and exits with code 2 (special: "needs AI analysis")

The orchestrator (`run-pipeline.js`) handles exit code 2 by:
- Printing: "Insight generation needed. The AI tool should now read temp/insights_request.json and write _ai_insights to the data file."
- If running inside Claude Code: CC reads CLAUDE.md which says "when you see exit code 2, read the request file, generate insights, save to data file, then re-run the pipeline"
- If running inside GHCP: copilot-instructions.md has the same instruction
- If running standalone (no AI tool): falls back to `--no-ai` template text with a warning

**Step 2: Write the insights prompt template**

`prompts/insights-request.md`:
```
# Insight Generation Request

Read `temp/insights_request.json` for the customer data and metrics.

Generate the `_ai_insights` object with all 30 keys listed in the request.
Merge it into the data JSON file and save.

## Quality Rules
- Simple language — written for a non-technical executive
- Every claim backed by a specific number from the data
- Each insight answers "so what?"
- Recommendations are specific — name cohorts, orgs, targets
- "Habitual" = 11+ active days/month — never say "daily" unless 20+
- No contradictions between sections
- No generic insights that could apply to any customer

## After saving insights, re-run:
node src/run-pipeline.js --data data/{customer}.json --output output/
```

**Step 3: Update CLAUDE.md pipeline section**

Add to the pipeline instructions:
```
## Insight Generation

When the pipeline pauses for insight generation (exit code 2):
1. Read `temp/insights_request.json`
2. Generate all 30 `_ai_insights` keys following the quality rules
3. Save the `_ai_insights` block into the customer data JSON
4. Re-run the pipeline: `npm run report -- --data data/{customer}.json`
```

**Step 4: Update copilot-instructions.md with same instructions**

**Step 5: Test the flow**

Remove `_ai_insights` from `data/network_rail.json`, run:
```bash
npm run report -- --data data/network_rail.json
```
Expected: Pipeline pauses at Gate 1.5 with "Insight generation needed" message.
Then (as the AI tool): read the request, generate insights, save, re-run → full pipeline passes.

**Step 6: Commit**

```bash
git add src/generate-insights.js prompts/insights-request.md CLAUDE.md .github/copilot-instructions.md
git commit -m "feat: add insight generation — AI tool as the engine, no API key needed"
```

---

### Task 9: Create run-pipeline.js (orchestrator)

**Files:**
- Create: `src/run-pipeline.js`

**Step 1: Write the orchestrator**

Supports two modes:
- `npm run report -- --pbix "Customer Name"` — full pipeline: extract + generate + validate
- `npm run report -- --data data/customer.json` — skip extraction, use existing data file

```javascript
#!/usr/bin/env node
// Frontier Firm Report Pipeline
// Usage: node run-pipeline.js --pbix "Customer Name" [--output output/] [--no-ai]
//    or: node run-pipeline.js --data data/customer.json [--output output/] [--no-ai]

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const pbixName = args.find((a, i) => args[i - 1] === '--pbix');
let dataPath = args.find((a, i) => args[i - 1] === '--data');
const outputDir = args.find((a, i) => args[i - 1] === '--output') || 'output/';
const noAI = args.includes('--no-ai') ? '--no-ai' : '';

if (!dataPath && !pbixName) {
  console.error('Usage: node run-pipeline.js --pbix "Customer Name" [--output dir] [--no-ai]');
  console.error('   or: node run-pipeline.js --data data/customer.json [--output dir] [--no-ai]');
  process.exit(1);
}

const gates = [];

// Gate 0 (optional): Extract from PBIX
if (pbixName) {
  const customerSlug = pbixName.toLowerCase().replace(/\s+/g, '_');
  dataPath = path.join('data', customerSlug + '.json');
  gates.push({ name: 'Gate 0: Extract from PBIX', cmd: `node src/extract-from-pbix.js --pbix "${pbixName}" --output data/` });
}

// Derive report filename from data
const data = pbixName ? { customer_name: pbixName } : JSON.parse(require('fs').readFileSync(path.resolve(dataPath), 'utf8'));
const reportName = data.customer_name.toLowerCase().replace(/\s+/g, '_') + '_frontier_firm.html';
const reportPath = path.join(outputDir, reportName);

gates.push(
  { name: 'Gate 1: Validate Data', cmd: `node src/validate-data.js --data "${dataPath}"` },
  { name: 'Gate 1.5: Generate Insights', cmd: noAI ? null : `node src/generate-insights.js --data "${dataPath}"`, allowExit2: true },
  { name: 'Gate 2: Generate Report', cmd: `node src/generate-report.js --data "${dataPath}" --output "${outputDir}" ${noAI}` },
  { name: 'Gate 3: Validate HTML', cmd: `node src/validate-report.js --report "${reportPath}" --data "${dataPath}"` },
  { name: 'Gate 4: Visual Check', cmd: `node src/visual-check.js --report "${reportPath}" --data "${dataPath}"` },
  { name: 'Gate 5: Deep Audit', cmd: `node src/deep-audit.js --report "${reportPath}" --data "${dataPath}"` }
).filter(g => g.cmd !== null); // Skip insight generation if --no-ai

console.log('╔══════════════════════════════════════╗');
console.log('║   FRONTIER FIRM REPORT PIPELINE      ║');
console.log('╚══════════════════════════════════════╝\n');

for (const gate of gates) {
  console.log(`▶ ${gate.name}...`);
  try {
    execSync(gate.cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    console.log(`  ✓ PASSED\n`);
  } catch (e) {
    if (gate.allowExit2 && e.status === 2) {
      console.log('\n  ⏸ INSIGHT GENERATION NEEDED');
      console.log('  The AI tool should now:');
      console.log('  1. Read temp/insights_request.json');
      console.log('  2. Generate _ai_insights (30 keys) following the quality rules');
      console.log('  3. Save into the data JSON file');
      console.log('  4. Re-run: npm run report -- --data "' + dataPath + '"\n');
      process.exit(2);  // Signal to AI tool: "do your thing, then re-run me"
    }
    console.error(`\n  ✗ FAILED at ${gate.name}`);
    console.error(`  Pipeline stopped. Fix the issue and re-run.\n`);
    process.exit(1);
  }
}

console.log('════════════════════════════════════════');
console.log('  ALL 5 GATES PASSED — report is ready');
console.log('  ' + path.resolve(reportPath));
console.log('════════════════════════════════════════');
```

**Step 2: Update package.json scripts**

```json
{
  "scripts": {
    "report": "node src/run-pipeline.js",
    "report:sample": "node src/run-pipeline.js --data data/sample_contoso.json --output output/ --no-ai",
    "extract": "node src/extract-from-pbix.js",
    "validate-data": "node src/validate-data.js",
    "generate": "node src/generate-report.js",
    "validate": "node src/validate-report.js",
    "visual-check": "node src/visual-check.js",
    "audit": "node src/deep-audit.js",
    "export-pdf": "node src/export-pdf.js"
  }
}
```

**Step 3: Commit**

```bash
git add src/run-pipeline.js package.json
git commit -m "feat: add pipeline orchestrator — npm run report runs all 5 gates"
```

---

### Task 10: Update data files for schema compliance

**Files:**
- Modify: `data/sample_contoso.json`
- Modify: `data/network_rail.json`

**Step 1: Run validate-data on sample_contoso.json, fix any missing fields**

Run: `node src/validate-data.js --data data/sample_contoso.json`
Add any missing required fields with realistic Contoso values.

**Step 2: Run validate-data on network_rail.json, mark missing fields as "not_available"**

Run: `node src/validate-data.js --data data/network_rail.json`
For each missing field, add `"field": "not_available"` to the data file.

**Step 3: Commit**

```bash
git add data/sample_contoso.json data/network_rail.json
git commit -m "fix: update data files for schema compliance"
```

---

### Task 11: End-to-end pipeline test

**Step 1: Run full pipeline on sample_contoso.json**

Run: `npm run report:sample`
Expected: All 5 gates pass.

**Step 2: Run full pipeline on network_rail.json**

Run: `npm run report -- --data data/network_rail.json --output output/ --no-ai`
Expected: All 5 gates pass (with "not_available" notes from Gate 1).

**Step 3: Test failure modes**

a) Remove `customer_name` from a temp data copy → Gate 1 fails
b) Set `weekly_chat` to `null` → Gate 1 fails (not Gate 2)
c) Inject `undefined` into a chart dataset manually → Gate 4 catches it

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "test: verify all 5 pipeline gates pass for both data files"
```

---

### Task 12: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `README.md`

**Step 1: Update CLAUDE.md**

Add the pipeline command and explain the 5 gates. Replace the old manual validation steps with:
```
## Step 2: Generate and Validate

npm run report -- --data data/{customer}.json --output output/ --no-ai

This runs 5 mandatory quality gates. If any fail, the pipeline stops with a clear error message.
```

**Step 2: Update copilot-instructions.md similarly**

**Step 3: Update README.md quick start**

**Step 4: Commit**

```bash
git add CLAUDE.md .github/copilot-instructions.md README.md
git commit -m "docs: update instructions for new quality pipeline"
```
