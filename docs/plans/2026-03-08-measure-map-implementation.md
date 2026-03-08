# Measure Map + Cross-Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded extractor with a declarative measure map, add PBI cross-validation, and support AI-assisted mapping for custom templates.

**Architecture:** `schema/measure_map.json` defines how each schema field maps to PBIX measures/DAX. The extractor reads the map, discovers available measures, extracts values, then cross-validates against the PBIX. Unmatched fields trigger exit code 3 for AI-assisted mapping.

**Tech Stack:** Node.js, PBI MCP subprocess (JSON-RPC), JSON Schema.

---

### Task 1: Create the measure map

**Files:**
- Create: `schema/measure_map.json`

**Step 1: Build the map from current extractor knowledge**

Create `schema/measure_map.json` with every schema field mapped. Use the existing extractor's measure names and fallback chains as the source. Each entry has:

```json
{
  "field_name": {
    "type": "scalar|computed|tabular|derived",
    "measures": ["Primary Measure Name", "Fallback Name"],
    "transform": "toPct|round1|none",
    "description": "What this field represents"
  }
}
```

For the 65 required fields, categorise:
- **Scalar with measures** (~30): `licensed_users`, `agent_users`, band counts, band rates, agent ecosystem counts, engagement averages, weekly cadence, breadth, etc.
- **Computed from DAX** (~10): `retained_users`, `churned_users`, `chat_retention`, `agent_creators_pct`, `complex_sessions`, `org_count`
- **Tabular** (3): `agent_table`, `org_scatter_data`, `_supplementary_metrics.per_tier_monthly_users`
- **Derived from other fields** (~10): `m365_enablement`, `m365_adoption`, `license_priority`, `license_coverage`, `inactive_licenses`, band percentages
- **Monthly backfill** (3): `licensed_users`, `chat_users`, `total_active_users` — overwritten from per-tier monthly data

Include the `toPct` transform flag for all measures that return 0-1 decimals (band rates, adoption rates, retention rates, frequency rates).

Include the DAX queries for computed fields (retention INTERSECT, agent creators DISTINCTCOUNT, complex sessions prompts-per-day).

**Step 2: Verify map covers all 65 required fields**

Run: `node -e "const map=JSON.parse(require('fs').readFileSync('schema/measure_map.json','utf8')); const schema=JSON.parse(require('fs').readFileSync('schema/ff_data_schema.json','utf8')); const missing=schema.required.filter(f=>!map[f]); console.log('Mapped:',Object.keys(map).length,'Missing:',missing.length,missing);"`

Expected: `Mapped: 65+ Missing: 0`

**Step 3: Commit**

```bash
git add schema/measure_map.json
git commit -m "feat: add declarative measure map for all 65 schema fields"
```

---

### Task 2: Rewrite the extractor to be map-driven

**Files:**
- Rewrite: `src/extract-from-pbix.js`

**Step 1: Refactor the extractor**

Keep the PBI MCP connection boilerplate (spawn, JSON-RPC, parseCSV, etc.) but replace all the hardcoded measure calls with a map-driven loop:

```javascript
const measureMap = JSON.parse(fs.readFileSync('schema/measure_map.json', 'utf8'));

// Load per-customer overrides if they exist
const overridePath = path.resolve(outputDir, slug + '_measure_overrides.json');
if (fs.existsSync(overridePath)) {
  const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
  Object.assign(measureMap, overrides);
  console.log('Loaded ' + Object.keys(overrides).length + ' measure overrides');
}

// Phase 1: Discover available measures
const allMeasures = await callTool('measure_operations', { operation: 'List' });
const measureNames = new Set(allMeasures.data.map(m => m.name));

// Phase 2: Extract scalars
for (const [field, config] of Object.entries(measureMap)) {
  if (config.type === 'scalar') {
    const matched = config.measures.find(m => measureNames.has(m));
    if (matched) {
      let value = await getScalarMeasure('[' + matched + ']', field);
      if (config.transform === 'toPct') value = toPct(value);
      set(field, value);
    } else {
      unmatched.push(field);
    }
  }
}

// Phase 3: Extract computed fields
for (const [field, config] of Object.entries(measureMap)) {
  if (config.type === 'computed' && data[field] === undefined) {
    try {
      const result = await runDax(config.dax);
      // parse result...
      set(field, value);
    } catch (e) {
      set(field, null);
    }
  }
}

// Phase 4: Extract tabular fields (agent_table, org_scatter, monthly)
// Phase 5: Derive fields (enablement, adoption, coverage, etc.)
// Phase 6: Monthly backfill (overwrite user counts from per-tier data)
// Phase 7: Round all floats
```

The key change: the extractor has NO hardcoded measure names. Everything comes from the map.

**Step 2: Test with 0803 PBIX**

Run: `rm -f data/0803.json && npm run report -- --pbix "0803" --output output/ --no-ai`
Expected: All 6 gates pass, 65/65 fields, 10/10 charts.

**Step 3: Test with 2302 PBIX (if available)**

Run: `rm -f data/2302.json && npm run report -- --pbix "2302" --output output/ --no-ai`
Expected: All 6 gates pass.

**Step 4: Test with curated NR data (no PBIX needed)**

Run: `npm run report -- --data data/network_rail.json --output output/ --no-ai`
Expected: All 5 gates pass.

**Step 5: Commit**

```bash
git add src/extract-from-pbix.js
git commit -m "feat: rewrite extractor to be measure-map driven"
```

---

### Task 3: Create the cross-validation gate

**Files:**
- Create: `src/cross-validate.js`

**Step 1: Write the cross-validator**

`src/cross-validate.js` accepts `--data` and `--port` args. It:

1. Connects to the PBIX (same port used during extraction — stored in the JSON `_metadata`)
2. Runs 10 independent verification queries
3. Compares each result against the extracted JSON value
4. Fails if any value differs by >5%, warns if >1%

Verification checks:

```javascript
const checks = [
  {
    name: 'licensed + unlicensed ≈ total',
    query: null, // derived check, no DAX needed
    verify: (data) => {
      const sum = data.licensed_users + data.chat_users;
      const diff = Math.abs(sum - data.total_active_users) / data.total_active_users;
      return { expected: data.total_active_users, actual: sum, diffPct: diff * 100 };
    }
  },
  {
    name: 'band counts sum check',
    query: null,
    verify: (data) => {
      const sum = data.band_1_5 + data.band_6_10 + data.band_11_15 + data.band_16_plus;
      return { expected: 'reasonable total', actual: sum, pass: sum > 0 && sum < data.total_active_users * 2 };
    }
  },
  {
    name: 'band pcts sum to ~100',
    query: null,
    verify: (data) => {
      const sum = data.band_1_5_pct + data.band_6_10_pct + data.band_11_15_pct + data.band_16_plus_pct;
      return { expected: 100, actual: sum, diffPct: Math.abs(sum - 100) };
    }
  },
  {
    name: 'licensed_users from PBIX',
    query: "EVALUATE SUMMARIZECOLUMNS('Calendar'[Year-Month], \"Lic\", [NoOfActiveChatUsers (Licensed)]) ORDER BY 'Calendar'[Year-Month] DESC",
    verify: (data, pbiResult) => {
      // Take second row (most recent complete month)
      const pbiVal = pbiResult.rows[1] ? Number(pbiResult.rows[1].Lic) : null;
      if (!pbiVal) return { skip: true };
      const diff = Math.abs(pbiVal - data.licensed_users) / pbiVal;
      return { expected: pbiVal, actual: data.licensed_users, diffPct: diff * 100 };
    }
  },
  {
    name: 'total_licensed_seats from PBIX',
    query: "EVALUATE ROW(\"v\", COUNTROWS('Copilot Licensed'))",
    verify: (data, pbiResult) => {
      const pbiVal = pbiResult.scalar;
      const diff = Math.abs(pbiVal - data.total_licensed_seats) / pbiVal;
      return { expected: pbiVal, actual: data.total_licensed_seats, diffPct: diff * 100 };
    }
  },
  {
    name: 'top agent name matches',
    query: "EVALUATE TOPN(1, SUMMARIZECOLUMNS('Chat + Agent Interactions (Audit Logs)'[AgentName], \"Sess\", COUNTROWS('Chat + Agent Interactions (Audit Logs)')), [Sess], DESC)",
    verify: (data, pbiResult) => {
      const pbiName = pbiResult.rows.find(r => r.AgentName && r.AgentName !== '')?.AgentName;
      return { expected: pbiName, actual: data.agent_table[0]?.name, pass: pbiName === data.agent_table[0]?.name };
    }
  },
  {
    name: 'enablement <= 100%',
    query: null,
    verify: (data) => ({ pass: data.m365_enablement <= 100, actual: data.m365_enablement })
  },
  {
    name: 'retention makes sense',
    query: null,
    verify: (data) => {
      if (typeof data.retained_users !== 'number') return { skip: true };
      const total = data.retained_users + data.churned_users;
      const retPct = data.retained_users / total * 100;
      const diff = Math.abs(retPct - data.m365_retention);
      return { expected: data.m365_retention + '%', actual: retPct.toFixed(1) + '%', diffPct: diff };
    }
  },
  {
    name: 'monthly trend last month ≈ total_active_users',
    query: null,
    verify: (data) => {
      if (!data._supplementary_metrics?.monthly_data) return { skip: true };
      const months = Object.values(data._supplementary_metrics.monthly_data);
      const lastFull = months.length >= 2 ? months[months.length - 2] : months[months.length - 1];
      if (!lastFull) return { skip: true };
      const diff = Math.abs(lastFull.users - data.total_active_users) / data.total_active_users;
      return { expected: data.total_active_users, actual: lastFull.users, diffPct: diff * 100 };
    }
  },
  {
    name: 'org count matches scatter data',
    query: null,
    verify: (data) => {
      if (!Array.isArray(data.org_scatter_data)) return { skip: true };
      return { expected: data.org_count, actual: data.org_scatter_data.length, pass: data.org_scatter_data.length <= data.org_count };
    }
  }
];
```

**Step 2: Test against 0803 PBIX**

Run: `node src/cross-validate.js --data data/0803.json --port 59194`
Expected: All 10 checks pass (or skip if not applicable).

**Step 3: Commit**

```bash
git add src/cross-validate.js
git commit -m "feat: add Gate 0.5 — PBI cross-validation"
```

---

### Task 4: Add exit code 3 for unmatched measures

**Files:**
- Modify: `src/extract-from-pbix.js`
- Modify: `src/run-pipeline.js`
- Modify: `CLAUDE.md`
- Modify: `.github/copilot-instructions.md`

**Step 1: Add unmatched field handling to extractor**

After the extraction loop, if any required fields are still unmatched:

```javascript
if (unmatched.length > 0) {
  const request = {
    customer: pbixName,
    unmatched_fields: unmatched.map(f => ({
      field: f,
      description: measureMap[f]?.description,
      tried_measures: measureMap[f]?.measures || []
    })),
    available_measures: [...measureNames].sort(),
    save_to: overridePath,
    instructions: 'Map the unmatched fields to available measures. Save as JSON to ' + overridePath + ' and re-run.'
  };
  fs.writeFileSync('temp/measure_mapping_request.json', JSON.stringify(request, null, 2));
  console.log('\nMEASURE MAPPING NEEDED — ' + unmatched.length + ' fields unmatched');
  process.exit(3);
}
```

**Step 2: Handle exit code 3 in run-pipeline.js**

Add handling in the gate loop:

```javascript
if (gate.allowExit3 && e.status === 3) {
  console.log('\n  ⏸ MEASURE MAPPING NEEDED');
  console.log('  The AI tool should now:');
  console.log('  1. Read temp/measure_mapping_request.json');
  console.log('  2. Map unmatched fields to available PBIX measures');
  console.log('  3. Save to data/{customer}_measure_overrides.json');
  console.log('  4. Re-run the pipeline');
  process.exit(3);
}
```

**Step 3: Update CLAUDE.md and copilot-instructions.md**

Add documentation for exit code 3 alongside existing exit code 2 (insights).

**Step 4: Commit**

```bash
git add src/extract-from-pbix.js src/run-pipeline.js CLAUDE.md .github/copilot-instructions.md
git commit -m "feat: exit code 3 — AI-assisted measure mapping for custom templates"
```

---

### Task 5: Wire cross-validation into the pipeline

**Files:**
- Modify: `src/run-pipeline.js`
- Modify: `package.json`

**Step 1: Add Gate 0.5 to pipeline**

In `run-pipeline.js`, add after Gate 0:

```javascript
// Gate 0.5: Cross-validate against PBIX (only when extracting from PBIX)
if (pbixName) {
  gates.splice(gateIndex, 0, {
    name: 'Gate 0.5: Cross-validate against PBIX',
    cmd: 'node src/cross-validate.js --data "' + dataPath + '" --port ' + port
  });
}
```

Note: the port needs to be passed from Gate 0. Store it in the JSON `_metadata.pbix_port` during extraction.

**Step 2: Add npm script**

```json
"cross-validate": "node src/cross-validate.js"
```

**Step 3: End-to-end test with 0803 PBIX**

Run: `rm -f data/0803.json && npm run report -- --pbix "0803" --output output/ --no-ai`
Expected: Gate 0.5 passes, all subsequent gates pass.

**Step 4: Commit**

```bash
git add src/run-pipeline.js package.json
git commit -m "feat: wire Gate 0.5 cross-validation into pipeline"
```

---

### Task 6: Fix complex_sessions to use prompts-per-active-day

**Files:**
- Modify: `schema/measure_map.json`

**Step 1: Update the computed DAX for complex_sessions**

Change from "% of user-months with >1 prompt" to "average prompts per active day":

```json
"complex_sessions": {
  "type": "computed",
  "dax": "EVALUATE ROW(\"v\", DIVIDE(SUMX('ActiveDaysSummary', 'ActiveDaysSummary'[PromptCount]), SUMX('ActiveDaysSummary', 'ActiveDaysSummary'[ChatActiveDays]), 0))",
  "transform": "round1",
  "description": "Average prompts per active day — higher = deeper multi-turn sessions"
}
```

**Step 2: Test**

Run: `rm -f data/0803.json && npm run report -- --pbix "0803" --output output/ --no-ai`
Expected: `complex_sessions` has a reasonable value (>1 indicates multi-turn).

**Step 3: Commit**

```bash
git add schema/measure_map.json
git commit -m "fix: complex_sessions uses prompts-per-active-day metric"
```

---

### Task 7: End-to-end testing on all PBIX versions

**Step 1: Test 0803 (standard template)**

Run: `rm -f data/0803.json && npm run report -- --pbix "0803" --output output/ --no-ai`
Expected: 65/65 fields, all gates pass including Gate 0.5.

**Step 2: Test 2302 (w Everything template, if open)**

Run: `rm -f data/2302.json && npm run report -- --pbix "2302" --output output/ --no-ai`
Expected: 63-65/65 fields, all gates pass.

**Step 3: Test curated NR data (no PBIX)**

Run: `npm run report -- --data data/network_rail.json --output output/ --no-ai`
Expected: All 5 gates pass (Gate 0.5 skipped — no PBIX).

**Step 4: Test sample Contoso**

Run: `npm run report:sample`
Expected: All 5 gates pass.

**Step 5: Commit any fixes**

```bash
git add -A && git commit -m "test: verify measure-map extractor across all PBIX versions"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `README.md`

**Step 1: Update all docs**

Document:
- The measure map (`schema/measure_map.json`)
- How to add per-customer overrides
- Gate 0.5 cross-validation
- Exit code 3 for AI-assisted mapping
- The pipeline now has 7 gates (0, 0.5, 1, 1.5, 2, 3, 4, 5)

**Step 2: Commit**

```bash
git add CLAUDE.md .github/copilot-instructions.md README.md
git commit -m "docs: update for measure-map extractor and Gate 0.5"
```
