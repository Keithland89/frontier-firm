# Data Dictionary

Every field in the customer data JSON file.

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `customer_name` | string | Short customer name (e.g. "Contoso") |
| `analysis_period` | string | Date range (e.g. "Sep–Nov 2025") |
| `total_active_users` | number | Total distinct users with any Copilot activity |
| `licensed_users` | number | Licensed users with activity |
| `chat_users` | number | Unlicensed users with chat activity |
| `agent_users` | number | Users who interacted with agents |
| `total_licensed_seats` | number | Total provisioned Copilot licenses |
| `inactive_licenses` | number | Seats provisioned but not active |

## Scored Metrics

| Field | Type | Unit | Signal |
|-------|------|------|--------|
| `m365_enablement` | number | % seats active | Reach |
| `license_coverage` | number | % users licensed | Reach |
| `m365_adoption` | number | % with 6+ active days | Reach |
| `agent_adoption` | number | % of total users | Reach |
| `agent_enablement` | number | % high-impact agents | Reach |
| `org_count` | number | organisations active | Reach |
| `m365_frequency` | number | % habitual (11+ days) | Habit |
| `chat_habit` | number | % habitual (11+ days) | Habit |
| `agent_habitual` | number | 11+ day agent users | Habit |
| `agent_frequency` | number | sessions/user/week | Habit |
| `m365_retention_3mo_avg` | number | 3-month avg retention % | Habit |
| `m365_breadth` | number | apps/user average | Skill |
| `agent_breadth` | number | agents/user average | Skill |
| `complex_sessions` | number | % multi-turn sessions | Skill |
| `agent_health` | number | % return rate | Skill |
| `agent_creators_pct` | number | % creating agents | Skill |
| `license_priority` | number | licensed/unlicensed ratio | Value |

## Engagement Depth

| Field | Type | Description |
|-------|------|-------------|
| `m365_intensity` | number | Avg prompts per session (licensed) |
| `chat_intensity` | number | Avg prompts per session (unlicensed) |
| `agent_intensity` | number | Avg prompts per session (agents) |
| `licensed_avg_prompts` | number | Total prompts / licensed users |
| `unlicensed_avg_prompts` | number | Total prompts / unlicensed users |
| `weekly_m365` | number | Sessions/user/week (licensed) |
| `weekly_chat` | number | Sessions/user/week (unlicensed) |
| `weekly_agents` | number | Sessions/user/week (agents) |

## Retention

| Field | Type | Description |
|-------|------|-------------|
| `m365_retention` | number | Latest month-pair retention % |
| `chat_retention` | number | Unlicensed retention % |
| `agent_retention` | number | Agent user retention % |
| `retained_users` | number | Users retained month-over-month |
| `churned_users` | number | Users who churned |
| `retention_cohort` | number | Total cohort size |

## Active Day Bands

All bands represent the latest month snapshot.

| Field | Type | Description |
|-------|------|-------------|
| `band_1_5` / `band_1_5_pct` | number | 1-5 active days (count / %) |
| `band_6_10` / `band_6_10_pct` | number | 6-10 active days |
| `band_11_15` / `band_11_15_pct` | number | 11-15 active days |
| `band_16_plus` / `band_16_plus_pct` | number | 16+ active days |
| `chat_band_*_pct` | number | Same bands for unlicensed users |
| `agent_band_*_pct` | number | Same bands for agent users |

## Agent Ecosystem

| Field | Type | Description |
|-------|------|-------------|
| `total_agents` | number | Total registered agents |
| `agents_keep` | number | Agents to keep (active, multi-user) |
| `agents_review` | number | Agents to review |
| `agents_retire` | number | Agents to retire (dormant) |
| `multi_user_agents` | number | Agents with 2+ users |
| `agent_creators` | string | Users who created agents |
| `top_agent_names` | array | Top agent names by usage |
| `top_agent_sessions` | array | Sessions/user for top agents |
| `agent_table` | array | Full agent table (name, type, users, sessions, sessions_per_user) |
| `time_saved_realised` | string | Estimated time saved (hours) |
| `time_saved_unrealised` | string | Potential time from inactive licenses |

## Scoring Overrides

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | number | Pattern number override (1/2/3) |
| `pattern_name` | string | Pattern name override |
| `reach_tier` | string | Signal tier override |
| `habit_tier` | string | Signal tier override |
| `skill_tier` | string | Signal tier override |
| `value_tier` | string | Signal tier override |
| `reach_gauge` | number | Gauge width override (0-100) |
| `habit_gauge` | number | Gauge width override |
| `skill_gauge` | number | Gauge width override |
| `value_gauge` | number | Gauge width override |

## Organisation Data

| Field | Type | Description |
|-------|------|-------------|
| `org_scatter_data` | array | Per-org: label, x (users), y (agent %), r (sessions) |
| `license_priority_data` | array | Per-org license priority scores |

## Supplementary Metrics (`_supplementary_metrics`)

| Field | Type | Description |
|-------|------|-------------|
| `monthly_data` | object | Per-month: users, prompts, sessions, avg_prompts_per_user |
| `retention_cohorts` | object | Per-transition: prev, retained, new, churned, retention_pct |
| `app_interactions` | object | Per-surface: interactions, pct, users |
| `per_tier_monthly_users` | array | Monthly user counts by tier |
| `per_tier_retention_cohorts` | array | Retention by tier per transition |
| `per_tier_active_day_bands` | array | Active day bands by month and tier |
| `percentiles` | object | Benchmark percentiles for key metrics |

## AI Insights (`_ai_insights`)

Optional object with pre-generated narrative. See `prompts/06-ai-insights.md` for the full list of 30+ keys.

## Metadata (`_metadata`)

| Field | Type | Description |
|-------|------|-------------|
| `customer_name` | string | Full short name |
| `customer_full_name` | string | Full legal/display name |
| `data_period` | string | Full date range |
| `report_date` | string | Report generation date |
| `framework` | string | Framework name |
| `current_pattern` | string | Pattern label |
