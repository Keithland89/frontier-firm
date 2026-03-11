# Frontier Firm Assessment

Generate AI adoption maturity reports from Microsoft 365 Copilot usage data.

The **Frontier Firm Assessment** measures an organisation's Microsoft Copilot maturity across **13 metrics**, **3 pillars** (Reach, Habit, Skill), and **2 lanes** (M365 Copilot, Agents) — classifying their maturity into **Pattern 1** (Human with Assistant), **Pattern 2** (Human-Agent Teams), or **Pattern 3** (Human-led, Agent-operated).

## Quick Start

### Prerequisites
- The **AI-in-One Dashboard PBIX** with your customer's data loaded
- **Node.js** >= 18
- This repo cloned

### 3 Steps

**1. Extract data and generate the report**
```bash
npm run report -- --pbix "Customer Name" --v3
```
This connects to your open PBIX, extracts all 65 fields via DAX, scores the 13 metrics, generates AI narrative, and outputs the HTML report.

**2. Open the report**
```
output/customer_name_frontier_firm.html
```
Self-contained HTML — opens in any browser, no server needed.

**3. (Optional) Apply customer branding**
```bash
node src/extract-brand.js --url https://customer-website.com --output data/brand_customer.json
npm run report -- --data data/customer_name.json --v3 --brand data/brand_customer.json
```

### That's it
One command, one HTML file, under 2 minutes.

---

## Other Ways to Run

### From pre-extracted data (skip PBIX)
```bash
node src/generate-report.js --data data/contoso.json --v3
```

### Without AI narrative
```bash
node src/generate-report.js --data data/contoso.json --v3 --no-ai
```

### With GitHub Copilot (Agent mode)
1. Open the customer's PBIX in Power BI Desktop
2. Open this repo in VS Code with GitHub Copilot
3. Tell Copilot: **"Generate a Frontier Firm report for [Customer Name]"**

### With Claude Code
1. Open the customer's PBIX in Power BI Desktop
2. `cd frontier-firm && claude`
3. **"Generate a Frontier Firm report for [Customer]"**

## The Framework

### 3 Pillars

| Pillar | Question | What it measures |
|--------|----------|-----------------|
| **Reach** | Is AI spreading? | License activation, coverage, org penetration, agent adoption |
| **Habit** | Is it sticking? | Habitual user rate, MoM retention, agent habitual rate |
| **Skill** | Are they building proficiency? | App surface breadth, multi-turn rate, agent breadth |

### 3 Patterns

| Pattern | Name | Description |
|---------|------|-------------|
| **Pattern 1** | Human with Assistant | Every employee has an AI assistant. Consistent weekly use replaces "try-and-see" spikes. |
| **Pattern 2** | Human-Agent Teams | Agents join teams as digital colleagues. Repeatable team workflows emerge. |
| **Pattern 3** | Human-led, Agent-operated | Humans set direction; agents execute business processes end-to-end. |

### 13 Metrics (2 Lanes × 3 Pillars)

| Metric | Lane | Pillar | Unit | P1→P2 | P2→P3 |
|--------|------|--------|------|-------|-------|
| License Activation | Copilot | Reach | % | 70 | 90 |
| License Coverage | Copilot | Reach | % | 40 | 70 |
| Concentration Index | Copilot | Reach | % | 50 | 80 |
| Habitual User Rate | Copilot | Habit | % | 20 | 40 |
| MoM Retention | Copilot | Habit | % | 80 | 93 |
| App Surface Breadth | Copilot | Skill | apps/user | 4 | 7 |
| Multi-Turn Rate | Copilot | Skill | % | 45 | 75 |
| Agent Adoption | Agents | Reach | % | 12 | 30 |
| Org Penetration | Agents | Reach | % | 30 | 60 |
| Agent Habitual Rate | Agents | Habit | % | 8 | 20 |
| Agent MoM Retention | Agents | Habit | % | 55 | 80 |
| Agent Breadth | Agents | Skill | agents/user | 2 | 5 |
| Agent Return Rate | Agents | Skill | % | 55 | 85 |

## Quality Pipeline (7 Gates)

| Gate | What happens |
|------|-------------|
| **0. Extract** | Map-driven DAX extraction from PBIX (65 fields) |
| **0.5 Cross-validate** | Re-query PBIX, fail if >5% variance |
| **1. Schema** | Validate all fields, catch impossible values |
| **1.5 AI Insights** | Claude API generates narrative interpretation |
| **2. Generate** | Populate HTML template with data and stories |
| **3. HTML Check** | Verify no missing placeholders or broken charts |
| **4. Visual Audit** | Headless browser check that charts render |

## Repo Structure

```
frontier-firm/
├── schema/
│   ├── ff_schema_v4.json          # 13 metrics, bands, scoring rules
│   └── measure_map.json           # PBIX measure → data field mapping
├── template/
│   ├── ff_template_v3.html        # Main report template (dark theme)
│   └── ff_template_v3_slides.html # Presentation/slide mode
├── src/
│   ├── generate-report.js         # Main generator: JSON → HTML
│   ├── run-pipeline.js            # Full 7-gate pipeline
│   ├── extract-brand.js           # Brand extraction from customer website
│   ├── cross-validate.js          # Gate 0.5: PBIX cross-validation
│   └── deep-audit.js              # Number extraction and verification
├── data/
│   ├── ff_example_full.json       # Contoso example data (65 fields)
│   ├── network_rail.json          # Real customer: Network Rail
│   └── brand_*.json               # Extracted brand files
├── output/                        # Generated reports
└── docs/plans/                    # Design documents
```

## Optional: Customer Branding

The brand extractor fetches a customer's website and pulls colours, logo, and fonts:

```bash
node src/extract-brand.js --url https://customer.com --output data/brand_customer.json
```

Tested with: Barclays, Network Rail, Vodafone, Cappfinity.

## License

MIT
