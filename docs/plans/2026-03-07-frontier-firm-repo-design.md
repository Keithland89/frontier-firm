# Frontier Firm Repo — Design Document

> Date: 2026-03-07
> Status: Approved
> Author: Keith McGrane + Claude Code

## Purpose

Create a public GitHub repo that lets anyone generate a Frontier Firm Assessment report from a customer's AI-in-One Power BI dashboard. The user opens the repo in VS Code (GHCP) or terminal (Claude Code), points it at a PBIX, and the AI tool orchestrates the full pipeline — extract, score, generate, validate.

## Target Users

Open source community. Anyone with:
- An AI-in-One Dashboard PBIX
- GitHub Copilot (Agent mode) or Claude Code
- Node.js installed
- Power BI Desktop + PBI MCP

## Core Design Principle

**The repo IS the workspace.** The user clones it, opens it, and GHCP/CC reads the instructions automatically. The AI tool knows:
- What data to extract (schema + numbered prompts)
- How to score maturity (schema bands + scoring algorithm)
- How to generate the report (template + generator)
- How to validate quality (deep audit + validation checks)

The less the user types, the better. Ideally: "Generate a Frontier Firm report for [Customer]."

---

## Repo Structure

```
frontier-firm/
├── README.md                        # Overview, quick start, prerequisites
├── CLAUDE.md                        # Full pipeline instructions for Claude Code
├── .github/
│   └── copilot-instructions.md      # Full pipeline instructions for GHCP
│
├── schema/
│   └── ff_schema.json               # Metric definitions, bands, signal groupings
│
├── template/
│   └── ff_template.html             # Templatised HTML report (dark mode, interactive)
│
├── src/
│   ├── generate-report.js           # Main generator: data JSON → HTML report
│   ├── validate-report.js           # Report validation (placeholder check, data cross-ref)
│   ├── deep-audit.js                # Extract all visible numbers, verify against data
│   └── export-pdf.js                # Playwright-based PDF export
│
├── prompts/
│   ├── README.md                    # How the prompt system works
│   ├── 01-core-metrics.md           # Core metrics extraction prompt
│   ├── 02-supplementary-metrics.md  # Monthly data, retention cohorts, app surface
│   ├── 03-per-tier-data.md          # Per-tier monthly users, active days, retention
│   ├── 04-org-data.md               # Org scatter data, license priority matrix
│   ├── 05-agent-data.md             # Agent table (names, types, users, sessions)
│   └── 06-ai-insights.md            # Optional: AI insight generation prompt
│
├── data/
│   ├── sample_contoso.json          # Anonymised sample data (full structure)
│   └── .gitkeep                     # Customer data saved here (gitignored)
│
├── output/
│   ├── sample_report.html           # What the final report looks like
│   └── .gitkeep                     # Generated reports saved here (gitignored)
│
├── docs/
│   ├── FRAMEWORK.md                 # The Frontier Firm framework (4 signals, 3 patterns)
│   ├── SCORING.md                   # How metrics map to tiers, how signals aggregate
│   ├── DATA-DICTIONARY.md           # Every field in the data JSON explained
│   └── CUSTOMISATION.md             # How to add metrics, adjust bands, modify template
│
├── .gitignore                       # Ignore data/*.json (except sample), output/*.html
└── package.json                     # Node deps (none beyond stdlib for generator)
```

---

## Key Files — What Each Does

### `CLAUDE.md` / `copilot-instructions.md`

The most important file. This is what the AI tool reads automatically. It contains:

1. **Pipeline overview** — the 5-step process
2. **Step 1: Extract** — "Open the PBIX, then run each prompt in `prompts/` in order. Save results to `data/{customer}.json`"
3. **Step 2: Score** — "The generator handles this automatically from the schema"
4. **Step 3: Generate** — "Run `node src/generate-report.js --data data/{customer}.json --output output/`"
5. **Step 4: Validate** — "Run `node src/validate-report.js output/{customer}_frontier_firm.html`. Fix any errors."
6. **Step 5: Export** — "Run `node src/export-pdf.js output/{customer}_frontier_firm.html`"
7. **Quality rules** — "Every number in the report must trace to the data file. Use simple language. Dark mode only."

### `prompts/` — The Extraction Prompt Library

Each prompt file contains:
- **Purpose** — what data this extracts
- **Prerequisites** — which PBI page(s) to be on
- **The prompt** — copy-paste into GHCP or use directly
- **Expected output format** — JSON schema showing exact field names and types
- **Validation** — how to verify the extracted data is correct

The prompts are numbered for order. Each one produces a JSON fragment that gets merged into the final data file.

### `schema/ff_schema.json`

Defines:
- All metrics with names, units, scoring bands
- Signal groupings (Reach, Habit, Skill, Value)
- Pattern rules (how signals aggregate to patterns)
- Which signals are excluded from pattern scoring

### `data/sample_contoso.json`

A complete, anonymised data file using the Contoso pattern. Every field populated with realistic values. Users can run the full pipeline against this without a PBIX to understand the output.

---

## The User Journey

### First time (learning):
```
1. Clone repo
2. npm install (if any deps)
3. node src/generate-report.js --data data/sample_contoso.json --output output/
4. Open output/contoso_frontier_firm.html
5. → See the full report, understand what it produces
```

### Real customer run:
```
1. Open customer PBIX in PBI Desktop
2. Open repo in VS Code
3. Tell GHCP: "Extract Frontier Firm data for [Customer Name]"
   → GHCP reads copilot-instructions.md
   → GHCP runs prompts 01-05 against PBI MCP
   → GHCP saves to data/{customer}.json
4. Tell GHCP: "Generate the report"
   → GHCP runs generator
   → Opens report in browser
5. Tell GHCP: "Validate the report"
   → GHCP runs validation
   → Reports any issues
6. Optional: "Generate AI insights and regenerate"
   → Uses Claude API or GHCP to generate narrative
   → Regenerates with insights
```

### Claude Code run:
```
1. Open customer PBIX in PBI Desktop
2. cd frontier-firm && claude
3. "Generate a Frontier Firm report for [Customer]"
   → CC reads CLAUDE.md
   → CC can't use PBI MCP directly, so it guides user
   → CC generates, validates, audits
```

---

## What NOT to Include

- No PBIX files (too large, customer-specific)
- No customer data files (privacy)
- No v1/v2 legacy scripts
- No OneDrive path dependencies
- No hardcoded values — everything comes from data or schema

---

## Quality Gates

The repo must enforce:

1. **No unresolved placeholders** — `{{ANYTHING}}` in output = error
2. **No Contoso leakage** — customer name must appear, Contoso must not
3. **Key data cross-check** — critical values must appear in the output
4. **Factual consistency** — e.g. "outnumber" claims match actual data direction
5. **No stale values** — check against known Contoso-era numbers

These are all implemented in `validate-report.js` (already built).

---

## AI Insight Generation (Optional Enhancement)

The generator supports three modes:
1. **Template mode** (default) — data-driven insights generated from formulas
2. **Pre-generated** — `_ai_insights` in the data JSON, merged at generation time
3. **Live AI** — calls Claude API with `ANTHROPIC_API_KEY` env var

The repo documents option 3 as an enhancement in `prompts/06-ai-insights.md`.

---

## Migration from Current Codebase

Files to copy from `tmp_serve/` into the repo:

| Source | Destination | Notes |
|--------|------------|-------|
| `ff_template.html` | `template/ff_template.html` | Production template |
| `generate-report.js` | `src/generate-report.js` | Fix TEMPLATE_PATH to use relative path |
| `ff_schema.json` | `schema/ff_schema.json` | Current schema |
| `deep_audit.js` | `src/deep-audit.js` | Validation script |
| `export-pdf.js` | `src/export-pdf.js` | PDF export |
| `FRONTIER_FIRM_PROCESS.md` | Refactor into README + prompts/ | Split into structured docs |
| `ff_sample_data.json` | `data/sample_contoso.json` | Expand with full field set |

Files NOT to include: `assemble_v2.js`, `build_v2_part1.js`, `fix_*.js`, `deep_templatise*.js`, any `*contoso*` HTML files.

---

## Success Criteria

1. A new user can clone the repo and generate a sample report in < 5 minutes
2. A user with a PBIX can generate a full customer report in < 30 minutes using GHCP
3. The generated report passes all validation checks with zero errors
4. The repo has clear enough docs that GHCP can orchestrate the pipeline autonomously
5. No customer data is committed to the repo
