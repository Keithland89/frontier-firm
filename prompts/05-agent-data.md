# Prompt 05: Agent Data

## Purpose
Extract agent ecosystem metrics: the agent table, health classification, and creator data.

## Prerequisites
- Prompts 01-04 completed
- PBI MCP connected

## Prompt

```
Using the Power BI MCP, extract agent ecosystem data:

### Agent Table (top agents by usage)
For each of the top agents (up to 20), extract:
- name: agent name
- type: "Published" or "Custom"
- users: distinct users
- sessions: total sessions
- sessions_per_user: sessions / users

### Agent Health (Keep/Review/Retire)
- total_agents: total registered agents
- agents_keep: agents classified as "Keep" (active, multi-user)
- agents_review: agents classified as "Review" (some activity, needs evaluation)
- agents_retire: agents classified as "Retire" (dormant, no recent activity)
- multi_user_agents: agents with 2+ distinct users
- agent_creators: count of users who created at least one agent

### Agent Portfolio Quality
- agent_enablement: % of agents classified as high-impact (Keep / total * 100)

### Top Agent Sessions (for leaderboard chart)
- top_agent_names: array of top agent names
- top_agent_sessions: array of corresponding sessions-per-user values

Format as JSON.
```

## Expected Output

```json
{
  "agent_table": [
    { "name": "Service Remedy", "type": "Published", "users": 1245, "sessions": 75621, "sessions_per_user": 60.7 },
    { "name": "Draft Coach", "type": "Custom", "users": 890, "sessions": 4040, "sessions_per_user": 4.5 },
    { "name": "Network Buddy", "type": "Published", "users": 654, "sessions": 2688, "sessions_per_user": 4.1 }
  ],
  "total_agents": 3232,
  "agents_keep": 1594,
  "agents_review": 623,
  "agents_retire": 7958,
  "multi_user_agents": 547,
  "agent_creators": 2700,
  "agent_creators_pct": 4.7,
  "agent_enablement": 15.7,
  "top_agent_names": ["Service Remedy", "Draft Coach", "Network Buddy", "Pulse Sales", "Summarizer"],
  "top_agent_sessions": [60.7, 4.5, 4.1, 4.3, 2.7]
}
```

## Validation

- `agents_keep + agents_review + agents_retire` should approximately equal `total_agents` (may not be exact — reconcile)
- `agent_creators_pct` should be `agent_creators / total_active_users * 100`
- Top agent sessions array should be in descending order
- Agent names should match what's visible in the PBI dashboard

## Notes

- The agent ecosystem is often nascent — many customers will have few agents
- If agent health data (Keep/Review/Retire) is not available, estimate or flag
- The GHCP extract from AI-in-One typically has 5 columns: Agent, Type, Users, Sessions, Sess/User
