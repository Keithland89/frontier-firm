# Frontier Firm Assessment

Generate AI adoption maturity reports from Microsoft 365 Copilot usage data.

The **Frontier Firm Assessment** measures an organisation's Microsoft Copilot maturity across **13 metrics**, **3 pillars** (Reach, Habit, Skill), and **2 lanes** (M365 Copilot, Agents) — classifying their maturity into **Pattern 1** (Foundation), **Pattern 2** (Expansion), or **Pattern 3** (Frontier).

## Quick Start

### Prerequisites
- **Power BI Desktop** with the customer's AI-in-One Dashboard PBIX open
- **Node.js** >= 18
- This repo cloned: `git clone https://github.com/Keithland89/frontier-firm.git`

### 2 Steps

**Step 1: Extract data from the PBIX**
```bash
node src/extract-from-pbix.js --pbix "Customer Name"
```
This connects to your open PBIX, extracts all fields via DAX, and saves to `data/{customer_slug}.json`.

**Step 2: Generate the report**
```bash
node src/generate-report.js --data data/{customer_slug}.json --name "Customer Name" --v4
```
This scores the 13 metrics, generates narrative, and outputs the HTML report.

**Open the report:**
```
output/customer_name_frontier_firm.html
```
Self-contained HTML — opens in any browser, no server needed.

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--v4` | **Yes** | Use the V4 template (without this, old V1 template is used) |
| `--name` | **Yes** | Customer name for the report title and narrative |
| `--data` | **Yes** | Path to the extracted JSON data file |
| `--no-ai` | No | Skip AI narrative generation (uses template fallbacks) |

### With GitHub Copilot (Agent mode)
1. Open the customer's PBIX in Power BI Desktop
2. Open this repo in VS Code with GitHub Copilot
3. Tell Copilot: **"Generate a Frontier Firm report for [Customer Name]"**

### With Claude Code
1. Open the customer's PBIX in Power BI Desktop
2. `cd frontier-firm && claude`
3. **"Generate a Frontier Firm report for [Customer]"**

---

## The Framework

### 3 Pillars

| Pillar | Question | What it measures |
|--------|----------|-----------------|
| **Reach** | Is AI spreading? | License activation, coverage, org penetration, agent adoption |
| **Habit** | Is it sticking? | Habitual user rate, MoM retention, agent habitual rate |
| **Skill** | Are they building proficiency? | App surface breadth, deep interactions, agent breadth |

### 3 Patterns

| Pattern | Name | Description |
|---------|------|-------------|
| **Pattern 1** | Foundation | Every employee has an AI assistant. Consistent weekly use replaces "try-and-see" spikes. |
| **Pattern 2** | Expansion | Agents join teams as digital colleagues. Repeatable team workflows emerge. |
| **Pattern 3** | Frontier | Humans set direction; agents execute business processes end-to-end. |

### 13 Metrics (2 Lanes x 3 Pillars)

| Metric | Lane | Pillar | Unit | P1-P2 | P2-P3 |
|--------|------|--------|------|-------|-------|
| License Activation | Copilot | Reach | % | 70 | 90 |
| License Coverage | Copilot | Reach | % | 40 | 70 |
| Usage Concentration | Copilot | Reach | % | 50 | 75 |
| Habitual User Rate | Copilot | Habit | % | 20 | 40 |
| Licensed User Return Rate | Copilot | Habit | % | 80 | 93 |
| App Surface Breadth | Copilot | Skill | apps/user | 4 | 7 |
| Deep Interactions | Copilot | Skill | % | 10 | 25 |
| Agent Adoption | Agents | Reach | % | 12 | 30 |
| Org Penetration | Agents | Reach | % | 30 | 60 |
| Agent Habitual Rate | Agents | Habit | % | 8 | 20 |
| Agent User Return Rate | Agents | Habit | % | 55 | 80 |
| Agent Breadth | Agents | Skill | agents/user | 2 | 5 |
| Agent Return Rate | Agents | Skill | % | 55 | 85 |

## Repo Structure

```
frontier-firm/
├── schema/
│   ├── ff_schema_v4.json          # 13 metrics, bands, scoring rules
│   └── measure_map.json           # PBIX measure -> data field mapping
├── template/
│   └── ff_template_v4.html        # V4 report template (current)
├── src/
│   ├── generate-report.js         # Main generator: JSON -> HTML
│   ├── extract-from-pbix.js       # PBIX auto-extraction via PBI MCP
│   └── extract-brand.js           # Brand extraction from customer website
├── data/                          # Extracted customer data files
├── output/                        # Generated reports (gitignored)
└── .github/
    └── copilot-instructions.md    # Instructions for GitHub Copilot
```

## V4 Report Features

- **Metric card navigation** — clickable cards filter drill-down visuals per metric
- **Hero metric** with click-to-explore for each signal section
- **Per-org scoring** — Reach, Habit (from real per-org DAX data), Skill
- **Agent stickiness** bubble chart (reach vs depth)
- **Active day distribution** CSS bars for Licensed and Agent users
- **Unified drill-insight** component for consistent narrative
- **No data substitution** — missing fields show as "—", never fabricated

## License

MIT
