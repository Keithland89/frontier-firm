# Frontier Firm Assessment

Generate AI adoption maturity reports from Microsoft 365 Copilot usage data.

The **Frontier Firm Assessment** measures an organisation's AI adoption across four signals — **Reach**, **Habit**, **Skill**, and **Value** — and classifies their maturity into one of three patterns: **Foundation**, **Expansion**, or **Frontier**.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/frontier-firm.git
cd frontier-firm

# 2. Generate the sample report
node src/generate-report.js --data data/sample_contoso.json --output output/

# 3. Open output/contoso_frontier_firm.html in a browser
```

## Generate a Customer Report

### Option A: GitHub Copilot (recommended)

1. Open the customer's AI-in-One Dashboard PBIX in Power BI Desktop
2. Open this repo in VS Code with GitHub Copilot (Agent mode)
3. Tell Copilot: **"Generate a Frontier Firm report for [Customer Name]"**

Copilot reads `.github/copilot-instructions.md` automatically and orchestrates the full pipeline — extract data via PBI MCP, generate the HTML report, and validate.

### Option B: Claude Code

1. Open the customer's PBIX in Power BI Desktop
2. `cd frontier-firm && claude`
3. **"Generate a Frontier Firm report for [Customer]"**

Claude Code reads `CLAUDE.md` automatically. It will guide you through extraction (since PBI MCP requires GHCP) and handle generation + validation.

### Option C: Manual

1. Extract data using the prompts in `prompts/01` through `prompts/05`
2. Save as `data/{customer}.json` (use `data/sample_contoso.json` as reference)
3. Run: `node src/generate-report.js --data data/{customer}.json --output output/`
4. Validate: `node src/deep-audit.js --report output/{customer}_frontier_firm.html --data data/{customer}.json`
5. Export PDF: `node src/export-pdf.js --input output/{customer}_frontier_firm.html`

## Prerequisites

- **Node.js** >= 18
- **Power BI Desktop** with the AI-in-One Dashboard
- **Power BI MCP** (for automated extraction via GitHub Copilot)
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

## Repo Structure

```
frontier-firm/
├── CLAUDE.md                     # Instructions for Claude Code
├── .github/copilot-instructions.md  # Instructions for GitHub Copilot
├── schema/ff_schema.json         # Metric definitions and scoring bands
├── template/ff_template.html     # Templatised HTML report
├── src/
│   ├── generate-report.js        # Main generator: JSON → HTML
│   ├── validate-report.js        # Report validation
│   ├── deep-audit.js             # Number extraction and verification
│   └── export-pdf.js             # Playwright PDF export
├── prompts/                      # Numbered extraction prompts
├── data/
│   └── sample_contoso.json       # Anonymised sample data
├── output/                       # Generated reports (gitignored)
└── docs/                         # Framework, scoring, and data docs
```

## Documentation

- [Framework](docs/FRAMEWORK.md) — the Frontier Firm maturity model
- [Scoring](docs/SCORING.md) — how metrics map to tiers and patterns
- [Data Dictionary](docs/DATA-DICTIONARY.md) — every field in the data JSON
- [Customisation](docs/CUSTOMISATION.md) — adding metrics, adjusting bands

## License

MIT
