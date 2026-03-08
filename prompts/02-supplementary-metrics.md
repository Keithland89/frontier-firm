# Prompt 02: Supplementary Metrics

## Purpose
Extract monthly time-series data, retention cohorts, and app surface breakdown.

## Prerequisites
- Prompt 01 completed
- PBI MCP connected

## Prompt

```
Using the Power BI MCP, extract these supplementary metrics:

### Monthly Data
For each month in the analysis period, extract:
- users: distinct active users
- prompts: total prompts
- sessions: total sessions
- avg_prompts_per_user: prompts / users

### Retention Cohorts
For each consecutive month pair (e.g. Sep→Oct, Oct→Nov):
- prev: users active in the earlier month
- retained: users active in both months
- new: users active only in the later month
- churned: users active only in the earlier month
- retention_pct: retained / prev * 100

### App Interactions
Breakdown by M365 surface:
- office_bizchat: interactions, percentage, users
- teams: interactions, percentage, users
- word: interactions, percentage, users
- powerpoint: interactions, percentage, users
- excel: interactions, percentage, users
- outlook: interactions, percentage, users
- onenote: interactions, percentage, users
- loop: interactions, percentage, users
(Include any others that appear in the data)

### Additional
- m365_retention: latest month-pair retention_pct
- weekly_m365: average sessions per user per week (licensed)
- weekly_chat: average sessions per user per week (unlicensed)
- weekly_agents: average sessions per user per week (agent users)

Format as JSON matching the structure below.
```

## Expected Output

```json
{
  "monthly_data": {
    "sep_2025": { "users": 20090, "prompts": 169244, "sessions": 114130, "avg_prompts_per_user": 8.4 },
    "oct_2025": { "users": 24558, "prompts": 224877, "sessions": 150221, "avg_prompts_per_user": 9.2 },
    "nov_2025": { "users": 26054, "prompts": 259381, "sessions": 168901, "avg_prompts_per_user": 10.0 }
  },
  "retention_cohorts": {
    "sep_to_oct": { "prev": 20090, "retained": 15955, "new": 8603, "churned": 4135, "retention_pct": 79.4 },
    "oct_to_nov": { "prev": 24558, "retained": 19842, "new": 6212, "churned": 4716, "retention_pct": 80.8 }
  },
  "app_interactions": {
    "office_bizchat": { "interactions": 635051, "pct": 63.5, "users": 31752 },
    "teams": { "interactions": 124660, "pct": 12.5, "users": 9603 },
    "word": { "interactions": 98432, "pct": 9.8, "users": 14201 },
    "powerpoint": { "interactions": 55218, "pct": 5.5, "users": 8944 },
    "excel": { "interactions": 42100, "pct": 4.2, "users": 6521 },
    "outlook": { "interactions": 25890, "pct": 2.6, "users": 5102 }
  },
  "m365_retention": 80.8,
  "weekly_m365": 1.73,
  "weekly_chat": 1.63,
  "weekly_agents": 1.49
}
```

## Validation

- Monthly user counts should trend upward or be relatively stable
- Retention percentages should be between 50-95% typically
- App interaction percentages should sum to ~100%
- `retained + churned` should equal `prev` for each cohort
