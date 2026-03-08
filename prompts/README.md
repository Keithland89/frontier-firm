# Extraction Prompts

These numbered prompt files guide data extraction from the AI-in-One Power BI Dashboard.

## How It Works

1. Open the customer PBIX in Power BI Desktop
2. Connect Power BI MCP in GitHub Copilot (Agent mode)
3. Run each prompt in order (01 → 05)
4. Each prompt produces a JSON fragment
5. Merge all fragments into `data/{customer}.json`
6. Optionally run prompt 06 for AI-generated insights

## Prompt Order

| # | File | What It Extracts |
|---|------|-----------------|
| 01 | `01-core-metrics.md` | User counts, adoption rates, enablement, frequency |
| 02 | `02-supplementary-metrics.md` | Monthly data, retention cohorts, app surfaces |
| 03 | `03-per-tier-data.md` | Per-tier active day bands, monthly users, retention |
| 04 | `04-org-data.md` | Org scatter data, license priority matrix |
| 05 | `05-agent-data.md` | Agent table, health metrics, creators |
| 06 | `06-ai-insights.md` | AI-generated narrative (optional, needs API key) |

## Output

Each prompt specifies the exact JSON fields and format. The merged result should match the structure in `data/sample_contoso.json`.

## Tips

- Run prompts in order — later prompts may reference earlier data
- Verify extracted numbers against the PBI visuals
- If a metric doesn't exist in the PBIX, note it as estimated in the data file
- The PBI MCP works best with GitHub Copilot; Claude Code cannot connect directly
