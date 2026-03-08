# Prompt 04: Organisation Data

## Purpose
Extract per-organisation scatter data for the org penetration chart and license priority matrix.

## Prerequisites
- Prompts 01-03 completed
- PBI MCP connected

## Prompt

```
Using the Power BI MCP, extract organisation-level data:

### Org Scatter Data
For each organisation/department in the data, extract:
- label: organisation name
- x: total M365 Copilot users in that org
- y: agent adoption percentage (agent_users / total_users * 100)
- r: total sessions (used for bubble size)

### License Priority Matrix
If available, extract the license priority data:
- org_name
- licensed_users
- unlicensed_users
- licensed_avg_prompts
- unlicensed_avg_prompts
- priority_score (licensed / unlicensed prompts ratio)

### Key Org Counts
For the largest organisations, extract individual user counts if used in narrative.

Format as JSON.
```

## Expected Output

```json
{
  "org_scatter_data": [
    { "label": "Org A", "x": 8500, "y": 12.3, "r": 45000 },
    { "label": "Org B", "x": 6200, "y": 8.7, "r": 31000 },
    { "label": "Org C", "x": 4100, "y": 15.1, "r": 28000 },
    { "label": "Org D", "x": 3800, "y": 5.2, "r": 18000 }
  ],
  "license_priority_data": [
    { "org": "Org A", "licensed_users": 6200, "unlicensed_users": 2300, "priority_score": 1.8 },
    { "org": "Org B", "licensed_users": 4800, "unlicensed_users": 1400, "priority_score": 2.1 }
  ]
}
```

## Validation

- Scatter data x values should roughly sum to total_active_users
- Agent adoption (y) should be between 0 and 100
- Priority scores above 1.0 indicate licensed users are more engaged
- If org data is unavailable, note this — the report can hide the org section

## Notes

- Organisation names should be anonymised in sample data
- Not all PBIX files contain org-level data — this prompt may return partial results
- The scatter chart is color-coded by agent adoption maturity in the report
