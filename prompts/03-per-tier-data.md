# Prompt 03: Per-Tier Data

## Purpose
Extract active day band distributions and retention for each user tier (Licensed, Unlicensed/Chat, Agent).

## Prerequisites
- Prompts 01-02 completed
- PBI MCP connected

## Prompt

```
Using the Power BI MCP, extract per-tier breakdowns:

### Active Day Bands (latest month)
For ALL users combined, and then separately for Licensed, Unlicensed (Chat), and Agent users:
- band_1_5: count and % of users with 1-5 active days
- band_6_10: count and % with 6-10 active days
- band_11_15: count and % with 11-15 active days
- band_16_plus: count and % with 16+ active days

### Per-Tier Monthly Users
For each month, break down active users by tier:
- licensed_users: count per month
- unlicensed_users: count per month
- agent_users: count per month

### Per-Tier Retention
For each month transition:
- licensed_retention_pct
- unlicensed_retention_pct
- agent_retention_pct

### Per-Tier Active Day Bands (monthly trend)
For each month × tier, the band distribution (for the Active Day trend chart).

Format as JSON.
```

## Expected Output

```json
{
  "band_1_5": 22678,
  "band_6_10": 6683,
  "band_11_15": 1751,
  "band_16_plus": 323,
  "band_1_5_pct": 72.2,
  "band_6_10_pct": 21.3,
  "band_11_15_pct": 5.6,
  "band_16_plus_pct": 1.0,
  "chat_band_1_5_pct": 79.5,
  "chat_band_6_10_pct": 15.5,
  "chat_band_11_15_pct": 4.1,
  "chat_band_16_plus_pct": 0.9,
  "agent_band_1_5_pct": 95.0,
  "agent_band_6_10_pct": 4.0,
  "agent_band_11_15_pct": 1.0,
  "agent_band_16_plus_pct": 0.0,
  "per_tier_monthly_users": [
    { "month": "Sep 2025", "licensed": 14200, "unlicensed": 5890, "agents": 1200 },
    { "month": "Oct 2025", "licensed": 17500, "unlicensed": 7058, "agents": 2100 },
    { "month": "Nov 2025", "licensed": 18700, "unlicensed": 7354, "agents": 2800 }
  ],
  "per_tier_retention_cohorts": [
    { "transition": "Sep→Oct", "licensed_retention_pct": 85.2, "unlicensed_retention_pct": 68.4, "agent_retention_pct": 42.1 },
    { "transition": "Oct→Nov", "licensed_retention_pct": 87.3, "unlicensed_retention_pct": 71.2, "agent_retention_pct": 45.8 }
  ],
  "per_tier_active_day_bands": [
    { "month": "Sep 2025", "tier": "Licensed", "band_1_5_pct": 70, "band_6_10_pct": 22, "band_11_15_pct": 6, "band_16_plus_pct": 2 },
    { "month": "Sep 2025", "tier": "Unlicensed", "band_1_5_pct": 80, "band_6_10_pct": 15, "band_11_15_pct": 4, "band_16_plus_pct": 1 }
  ]
}
```

## Validation

- Band percentages per tier should sum to ~100%
- Licensed retention should be higher than unlicensed, which is higher than agent
- Agent active day distribution will typically be heavily weighted to 1-5 band
