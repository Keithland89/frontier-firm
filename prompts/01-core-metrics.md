# Prompt 01: Core Metrics

## Purpose
Extract the fundamental user counts and adoption metrics from the AI-in-One Dashboard.

## Prerequisites
- Power BI Desktop open with the customer's AI-in-One Dashboard
- PBI MCP connected in GitHub Copilot

## Prompt

```
Using the Power BI MCP, extract these core metrics from the open PBIX:

1. customer_name — the customer/tenant name
2. analysis_period — date range shown in the dashboard (e.g. "Sep–Nov 2025")
3. total_active_users — total distinct users with any Copilot activity
4. licensed_users — licensed users with activity
5. chat_users — unlicensed users with chat activity
6. agent_users — users who interacted with agents
7. total_licensed_seats — total provisioned Copilot licenses
8. inactive_licenses — total_licensed_seats minus licensed_users

Derived metrics (calculate from the above):
9. m365_enablement — licensed_users / total_licensed_seats * 100
10. m365_adoption — users with 6+ active days / total_active_users * 100
11. m365_frequency — users with 11+ active days / total_active_users * 100
12. chat_habit — unlicensed users with 11+ days / chat_users * 100
13. agent_adoption — agent_users / total_active_users * 100
14. m365_breadth — average distinct AppHost surfaces per licensed user
15. m365_intensity — average prompts per session (licensed users)
16. complex_sessions — sessions with 2+ prompts / total sessions * 100
17. licensed_avg_prompts — total licensed prompts / licensed_users
18. unlicensed_avg_prompts — total unlicensed prompts / chat_users
19. license_priority — licensed_avg_prompts / unlicensed_avg_prompts
20. org_count — distinct organisations in the data

Format as JSON. Numbers should be raw values (e.g. 75.4 not "75.4%").
```

## Expected Output

```json
{
  "customer_name": "Customer",
  "analysis_period": "Sep–Nov 2025",
  "total_active_users": 57126,
  "licensed_users": 38075,
  "chat_users": 18991,
  "agent_users": 4846,
  "total_licensed_seats": 50496,
  "inactive_licenses": 12421,
  "m365_enablement": 75.4,
  "m365_adoption": 27.9,
  "m365_frequency": 16.8,
  "chat_habit": 5.1,
  "agent_adoption": 8.5,
  "m365_breadth": 2.74,
  "m365_intensity": 19.1,
  "complex_sessions": 23.5,
  "licensed_avg_prompts": 20.19,
  "unlicensed_avg_prompts": 12.14,
  "license_priority": 1.66,
  "org_count": 26
}
```

## Validation

- `licensed_users + chat_users` should approximately equal `total_active_users`
- `m365_enablement` should be `licensed_users / total_licensed_seats * 100`
- `license_priority` should be `licensed_avg_prompts / unlicensed_avg_prompts`
- All percentage values should be between 0 and 100
