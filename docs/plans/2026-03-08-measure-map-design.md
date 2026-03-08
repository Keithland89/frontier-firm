# Measure Map + Cross-Validation Design

## Problem

The current extractor hardcodes ~65 measure name guesses with fallback chains. When a PBIX uses different names, values are wrong or missing. There's no verification that extracted values match what the PBIX actually shows. Reports pass all pipeline gates but can contain wrong data.

## Solution

Replace the hardcoded extractor with a data-driven approach:

1. **Declarative measure map** — `schema/measure_map.json` maps every schema field to its DAX source(s)
2. **Smart extractor** — reads the map, discovers available measures, picks the best match
3. **Cross-validation gate** — after extraction, re-queries key values independently and compares
4. **AI escape hatch** — when measures don't match (custom templates), exits with code 3 for AI-assisted mapping

## Architecture

```
PBIX → discover measures → match against measure_map.json
                              ↓ (matched)          ↓ (unmatched)
                         extract values         exit code 3 → AI maps → save override → re-run
                              ↓
                    cross-validate (re-query + compare)
                              ↓
                         data/{customer}.json
```

## Measure Map Format

`schema/measure_map.json`:

```json
{
  "licensed_users": {
    "type": "scalar",
    "source": "monthly_tier_backfill",
    "measures": ["NoOfActiveChatUsers (Licensed)"],
    "note": "Use per-tier monthly data for last-month count, not all-time measure"
  },
  "m365_retention": {
    "type": "scalar",
    "measures": ["Agent Return Rate", "Avg Agent Return Rate %"],
    "transform": "toPct",
    "note": "Returns 0-1 decimal, needs *100"
  },
  "band_11_15": {
    "type": "scalar",
    "measures": ["11-15 Active Days, Last Month (Chat)", "11-19 Active Days, Last Month (Chat)"],
    "note": "Newer templates use 11-15, older use 11-19"
  },
  "retained_users": {
    "type": "computed",
    "dax": "EVALUATE VAR LastMonth=MAXX('ActiveDaysSummary',...) ... RETURN ROW(\"v\", Retained)",
    "note": "INTERSECT on ActiveDaysSummary last 2 months"
  },
  "agent_table": {
    "type": "tabular",
    "dax": "EVALUATE TOPN(15, SUMMARIZECOLUMNS('Chat + Agent Interactions (Audit Logs)'[AgentName], ...))",
    "columns": {"AgentName": "name", "Sessions": "sessions"},
    "note": "Filter blank AgentName in JS"
  },
  "org_scatter_data": {
    "type": "tabular",
    "dax": "EVALUATE TOPN(15, SUMMARIZECOLUMNS('Chat + Agent Org Data'[Organization], ...))",
    "columns": {"Organization": "label", "ActiveUsers": "x", "Agents": "y"}
  }
}
```

Each entry has:
- `type`: `scalar` (single value), `computed` (DAX expression), `tabular` (returns rows), or `derived` (computed from other fields)
- `measures`: array of measure names to try in order (for scalar)
- `dax`: full DAX query (for computed/tabular)
- `transform`: optional transform — `toPct` (multiply by 100 if 0-1), `round1` (round to 1 decimal)
- `columns`: column mapping for tabular results
- `depends_on`: fields that must be extracted first (for derived)

## Extractor Flow

### Phase 1: Discover

```
1. Connect to PBIX
2. List all measures → save to temp/available_measures.json
3. Load schema/measure_map.json
4. For each map entry with type=scalar:
   - Check if any measure in the "measures" array exists
   - Record the matched measure name
5. Report: "Matched X/Y scalar fields, Z unmatched"
```

### Phase 2: Extract

```
6. For each matched scalar: query the matched measure
7. For each computed field: run the DAX query
8. For each tabular field: run the DAX, parse rows
9. For each derived field: compute from already-extracted values
10. Apply transforms (toPct, round)
11. Run the monthly backfill step (overwrite user counts from per-tier data)
```

### Phase 3: Cross-validate

```
12. Re-query 10 independent verification checks:
    a. licensed + unlicensed ≈ total (within 5%)
    b. band counts sum to a reasonable total
    c. band percentages sum to ~100%
    d. enablement <= 100%
    e. licensed_users <= total_licensed_seats
    f. agent_users < total_active_users
    g. top agent sessions > 0
    h. org scatter x values sum ≈ total users
    i. monthly trend: last month users ≈ total_active_users
    j. retention: retained + churned ≈ previous month total
13. Fail if any check is off by >5%, warn if >1%
```

### Phase 4: Handle unmatched (AI escape hatch)

```
14. If any required fields are still unmatched:
    - Write temp/measure_mapping_request.json:
      { unmatched_fields: [...], available_measures: [...], schema_descriptions: [...] }
    - Exit code 3
    - AI tool reads request, maps measures to fields
    - Saves data/{customer}_measure_overrides.json
    - Pipeline re-runs, extractor loads overrides
```

## Per-customer overrides

`data/{customer}_measure_overrides.json`:

```json
{
  "m365_adoption": {
    "measures": ["Custom Adoption KPI"]
  },
  "complex_sessions": {
    "type": "computed",
    "dax": "EVALUATE ROW(\"v\", [Custom Multi-Turn Rate])"
  }
}
```

The extractor loads overrides first, then falls back to the standard map. Overrides persist across runs — once the AI maps a custom measure, it stays mapped.

## Cross-validation gate

New file: `src/cross-validate.js`

Runs AFTER extraction, BEFORE Gate 1. Re-queries the PBIX for ~10 independent checks. This is the "trust but verify" step. It catches:

- Wrong measure mapped to wrong field (e.g. all-time vs last-month)
- Decimal/percentage conversion errors
- Tabular data that doesn't align with scalar totals
- Monthly backfill that produced wrong values

## Pipeline changes

```
Gate 0:   Extract from PBIX (measure-map driven)
Gate 0.5: Cross-validate against PBIX (NEW)
Gate 1:   Validate data schema + sanity
Gate 1.5: AI insights
Gate 2:   Generate report
Gate 3:   Validate HTML
Gate 4:   Visual check
Gate 5:   Deep audit
```

## complex_sessions fix

Change from `% of user-months with >1 prompt` to actual prompts-per-session metric:

```dax
EVALUATE ROW("v",
  DIVIDE(
    SUMX('ActiveDaysSummary', 'ActiveDaysSummary'[PromptCount]),
    SUMX('ActiveDaysSummary', 'ActiveDaysSummary'[ChatActiveDays]),
    0
  )
)
```

This gives average prompts per active day — a direct measure of session depth. Values >2 indicate multi-turn behaviour.

## Files to create/modify

| File | Action |
|------|--------|
| `schema/measure_map.json` | CREATE — the mapping |
| `src/extract-from-pbix.js` | REWRITE — data-driven from map |
| `src/cross-validate.js` | CREATE — PBI cross-validation gate |
| `src/run-pipeline.js` | MODIFY — add Gate 0.5 |
| `CLAUDE.md` | MODIFY — document exit code 3 |
| `.github/copilot-instructions.md` | MODIFY — document exit code 3 |
