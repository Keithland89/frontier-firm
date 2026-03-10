# Frontier Firm Assessment

Generate AI adoption maturity reports from Microsoft 365 Copilot usage data.

The **Frontier Firm Assessment** measures an organisation's AI adoption across four signals — **Reach**, **Habit**, **Skill**, and **Value** — and classifies their maturity into one of three patterns: **Foundation**, **Expansion**, or **Frontier**.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/Keithland89/frontier-firm.git
cd frontier-firm

# 2. Install dependencies
npm install
npx playwright install chromium

# 3. Place the customer's AI-in-One Dashboard .pbix file in the repo root
#    e.g. "Customer AI-in-One Dashboard 2202 - w Agent 365.pbix"

# 4. Open the .pbix file in Power BI Desktop (must stay open during extraction)

# 5. Generate the report (PBIX must be open in Power BI Desktop)
npm run frontier -- "Customer AI-in-One Dashboard 2202 - w Agent 365"

# 6. Open the generated HTML in a browser
```

## Generate a Customer Report

### Option A: GitHub Copilot (recommended)

1. Place the customer's `.pbix` file in the repo root directory
2. Open it in **Power BI Desktop** — keep it running
3. Open this repo in VS Code with GitHub Copilot (Agent mode)
4. Tell Copilot: **"Generate a Frontier Firm report for [Customer Name]"**

Copilot reads `.github/copilot-instructions.md` automatically and orchestrates the full pipeline — extract data via PBI MCP, compute scorecard metrics, generate the HTML report, and validate.

### Option B: Claude Code

1. Place the customer's `.pbix` file in the repo root directory
2. Open it in **Power BI Desktop** — keep it running
3. `cd frontier-firm && claude`
4. **"Generate a Frontier Firm report for [Customer]"**

Claude Code reads `CLAUDE.md` automatically. It will guide you through extraction (since PBI MCP requires GHCP) and handle generation + validation.

### Option C: Manual

1. Extract data using the prompts in `prompts/01` through `prompts/05`
2. Save as `data/{customer}.json` (use `data/sample_contoso.json` as reference)
3. Compute scorecard metrics: `node src/compute-scorecard-metrics.js --data data/{customer}.json`
4. Generate: `node src/generate-report.js --data data/{customer}.json --output output/`
5. Validate: `node src/deep-audit.js --report output/{customer}_frontier_firm.html --data data/{customer}.json`
6. Export PDF: `node src/export-pdf.js --input output/{customer}_frontier_firm.html`

## Prerequisites

- **Node.js** >= 18
- **Playwright** (`npm install && npx playwright install chromium`)
- **Power BI Desktop** with the AI-in-One Dashboard open (for extraction)
- **Power BI MCP** v0.4.0+ (for automated extraction via GitHub Copilot)
- Optional: `ANTHROPIC_API_KEY` for AI-generated narrative insights

## The Four Signals

| Signal | Question | Key Metrics |
|--------|----------|-------------|
| **Reach** | How well is it represented? | License activation, adoption rates, org penetration |
| **Habit** | Is it sticking? | Habitual usage (11+ days), retention, frequency |
| **Skill** | Is it going deep? | App breadth, multi-turn sessions, agent health |
| **Value** | Is it worth it? | Engagement premium, time savings, license ROI |

## Three Maturity Patterns

| Pattern | Description |
|---------|-------------|
| **Foundation** | Early adoption — licenses activated but usage is light and exploratory |
| **Expansion** | Growing adoption — regular users emerging, habits forming across surfaces |
| **Frontier** | Mature adoption — deep, habitual usage with measurable business value |

---

## Maturity Scorecard — Metrics & Formulae

The report includes a **3×3 maturity scorecard** (Patterns × Signals) plus a **Phase 1 deep-dive section**. Every metric is computed from the PBIX via DAX queries or derived from extracted data. Below are the exact definitions.

### Scorecard Grid (3×3)

| Cell | Metric Name | Formula | Source |
|------|-------------|---------|--------|
| **P1 × Reach** | Copilot Reach | `total_active_users / total_employees × 100` | `total_active_users` = licensed + unlicensed from second-to-last month; `total_employees` = `COUNTROWS('Chat + Agent Org Data')` |
| **P1 × Habit** | Habitual Users | `(band_11_15 + band_16_plus) / (band_1_5 + band_6_10 + band_11_15 + band_16_plus) × 100` | Active day bands from `ActiveDaysSummary`, latest complete month |
| **P1 × Skill** | Deep Interactions | `COUNTROWS(FILTER(Sessions, [PromptMsgs] >= 5)) / COUNTROWS(Sessions) × 100` | Sessions = `VALUES(ThreadId)` with `PromptMsgs = DISTINCTCOUNT(Message_Id) WHERE Message_IsPrompt = "True"` |
| **P2 × Reach** | Agent Active Users | `agent_users / total_active_users × 100` | `agent_users` from extraction |
| **P2 × Habit** | Agent MoM Retention | `COUNTROWS(INTERSECT(MonthN_Agents, MonthN-1_Agents)) / COUNTROWS(MonthN-1_Agents) × 100` | `ActiveDaysSummary` where `IsAgentUser = 1`, two most recent complete months |
| **P2 × Skill** | Users with 3+ Agents | `COUNTROWS(FILTER(Users, [AgentCount] >= 3)) / total_active_users × 100` | `AgentCount = DISTINCTCOUNT(AgentName)` per user |
| **P3 × Reach** | Agent Return Rate | `count(agents where repeat_users/total_users > 0.5) / total_agents × 100` | Per-agent: `RepeatUsers = users with 2+ sessions` |
| **P3 × Habit** | Avg Sessions / Agent | *Coming soon* | — |
| **P3 × Skill** | Agents 5+ Users | `count(agents where total_users > 5) / total_agents × 100` | From per-agent return rate query |

### Phase 1 Deep-Dive Cards

Each card shows **2–3 hero metrics** plus bullet-point commentary.

#### ① Reach Card

| Metric | Formula |
|--------|---------|
| **Growth %** | `(latest_month_users - first_month_users) / first_month_users × 100` over the analysis period |
| **Licensed %** | `license_coverage` from extraction (% of active users holding M365 licence) |

*Commentary includes*: total active users, employee count, licensed vs unlicensed user counts.

#### ② Habit Card

| Metric | Formula |
|--------|---------|
| **Chat Sessions / Week** | `weekly_chat` from extraction |
| **M365 Sessions / Week** | `weekly_m365` from extraction |

*Commentary includes*: combined habitual rate (11+ days), per-channel habitual rates (Chat vs M365), habitual user count.

**Habitual user definition**: A user with **11+ active days per month**. Computed from active-day bands:
- Chat habitual (11+) = `chat_band_11_15_pct + chat_band_16_plus_pct`
- M365 habitual (11+) = M365 Copilot Habit Formation page: `Frequent (11-15) + Daily (16+)` users / total users
- Combined = `(band_11_15 + band_16_plus) / sum(all_bands)`

#### ③ Skill Card

| Metric | Formula |
|--------|---------|
| **Deep Interactions %** | Same as scorecard: `sessions with 5+ prompt messages / total sessions × 100` |
| **Apps per User** | `m365_breadth` from extraction — avg distinct M365 app surfaces used per licensed user |

*Commentary includes*: licensed vs unlicensed prompts/month, licence priority multiplier.

### PBIX Table & Column Reference

| Table | Key Columns | Used For |
|-------|-------------|----------|
| `Chat + Agent Interactions (Audit Logs)` | `ThreadId`, `Message_Id`, `Audit_UserId`, `AgentName`, `Message_IsPrompt` (string: `"True"` / `"False"`) | Multi-turn sessions, per-agent stats, user-agent mapping |
| `ActiveDaysSummary` | `Audit_UserId`, `MonthStart`, `IsAgentUser`, `LicenseStatus`, `ChatActiveDays`, `PromptCount` | Active day bands, agent MoM retention |
| `Chat + Agent Org Data` | `Organization`, `Total Employees` (use `COUNTROWS` as fallback) | Employee count |
| `Copilot Licensed` | Seat data | Licensed user count |
| `Calendar` | `Year-Month`, `Date` | Time filtering |
| `Agents 365` | `Title ID`, `Agent Type Combined` | Agent metadata |

### DAX Query Examples

**Multi-turn sessions (5+ prompts)**:
```dax
EVALUATE
VAR Sessions =
  ADDCOLUMNS(
    VALUES('Chat + Agent Interactions (Audit Logs)'[ThreadId]),
    "PromptMsgs", CALCULATE(
      DISTINCTCOUNT('Chat + Agent Interactions (Audit Logs)'[Message_Id]),
      'Chat + Agent Interactions (Audit Logs)'[Message_IsPrompt] = "True"
    )
  )
RETURN ROW(
  "TotalSessions", COUNTROWS(Sessions),
  "MultiTurn", COUNTROWS(FILTER(Sessions, [PromptMsgs] >= 5))
)
```

**Agent MoM retention (Apr→May)**:
```dax
EVALUATE
VAR AprAgents = CALCULATETABLE(
  DISTINCT('ActiveDaysSummary'[Audit_UserId]),
  'ActiveDaysSummary'[MonthStart] = DATE(2025, 4, 1),
  'ActiveDaysSummary'[IsAgentUser] = 1
)
VAR MayAgents = CALCULATETABLE(
  DISTINCT('ActiveDaysSummary'[Audit_UserId]),
  'ActiveDaysSummary'[MonthStart] = DATE(2025, 5, 1),
  'ActiveDaysSummary'[IsAgentUser] = 1
)
RETURN ROW(
  "AprTotal", COUNTROWS(AprAgents),
  "MayTotal", COUNTROWS(MayAgents),
  "Retained", COUNTROWS(INTERSECT(AprAgents, MayAgents))
)
```

**Users with 3+ agents**:
```dax
EVALUATE
ROW(
  "Users3Plus",
  COUNTROWS(
    FILTER(
      ADDCOLUMNS(
        VALUES('Chat + Agent Interactions (Audit Logs)'[Audit_UserId]),
        "AgentCount", CALCULATE(
          DISTINCTCOUNT('Chat + Agent Interactions (Audit Logs)'[AgentName])
        )
      ),
      [AgentCount] >= 3
    )
  )
)
```

### Computation Rules

1. **Partial month exclusion** — always drop the most recent month if it is incomplete. Use the second-to-last month for headline metrics.
2. **Habitual = 11+ active days** — never say "daily" unless 16+ days. The 11-15 band is "frequent"; 16+ is "daily".
3. **`Message_IsPrompt` is a string** — compare with `= "True"`, not a boolean.
4. **`total_active_users` backfill** — the pipeline uses `licensed + unlicensed` from the second-to-last month, which may differ from the raw PBIX scalar.
5. **Band totals ≠ `total_active_users`** — band data comes from the original PBIX population before backfill. Do not mix the two denominators.
6. **Per-agent return rate** — "repeat user" = a user who interacted with that agent in 2+ distinct sessions.
7. **Deep interactions** — a session (ThreadId) qualifies if it has ≥ 5 distinct `Message_Id`s where `Message_IsPrompt = "True"`.

---

## Repo Structure

```
frontier-firm/
├── CLAUDE.md                        # Instructions for Claude Code
├── .github/copilot-instructions.md  # Instructions for GitHub Copilot
├── schema/
│   ├── ff_schema.json               # Metric definitions and scoring bands
│   ├── ff_data_schema.json          # Required fields and types (65 fields)
│   └── measure_map.json             # PBIX measure → schema field mapping
├── template/ff_template.html        # Templatised HTML report
├── src/
│   ├── run-pipeline.js              # Pipeline orchestrator (6 gates)
│   ├── extract-from-pbix.js         # Gate 0: PBIX extraction
│   ├── cross-validate.js            # Gate 0.5: Cross-validation
│   ├── validate-data.js             # Gate 1: Schema validation
│   ├── generate-insights.js         # Gate 1.5: AI insight request
│   ├── generate-report.js           # Gate 2: HTML generator (safeSub)
│   ├── validate-report.js           # Gate 3: HTML validation
│   ├── visual-check.js              # Gate 4: Playwright visual check
│   ├── deep-audit.js                # Gate 5: Number tracing audit
│   ├── compute-scorecard-metrics.js # Scorecard PBIX queries + derivations
│   └── export-pdf.js                # PDF export via Playwright
├── prompts/                         # Numbered extraction prompts (01–06)
├── data/
│   └── sample_contoso.json          # Anonymised sample data
├── output/                          # Generated reports (gitignored)
└── docs/                            # Framework, scoring, and data docs
```

## Pipeline Gates

```
Gate 0 (optional): Extract from PBIX     → data/{customer}.json
Gate 0.5:          Cross-validate PBIX   → re-queries key values, fails if >5% diff
Gate 1:            Validate data         → schema, user hierarchy, % ranges
Gate 1.5:          Check AI insights     → pauses if insights needed (exit 2)
Gate 2:            Generate report       → safeSub protection, fails on undefined/NaN
Gate 3:            Validate HTML         → checks for bad values, sections, charts
Gate 4:            Visual check          → 10 charts verified with pixel data
Gate 5:            Deep number audit     → every visible number traced to data
```

## Documentation

- [Framework](docs/FRAMEWORK.md) — the Frontier Firm maturity model
- [Scoring](docs/SCORING.md) — how metrics map to tiers and patterns
- [Data Dictionary](docs/DATA-DICTIONARY.md) — every field in the data JSON
- [Customisation](docs/CUSTOMISATION.md) — adding metrics, adjusting bands

## License

MIT
