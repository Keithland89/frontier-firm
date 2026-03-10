# Scorecard & Phase Detail Commentary Rules

> These rules govern the McKinsey-style narrative commentary in the Phase detail cards. Every insight must be data-driven, specific, and actionable. Use flowing paragraphs (not bullet lists) with bold inline numbers.

## General Rules

1. **Every claim references a specific number** — no adjectives without evidence
2. **Name departments** — use org_scatter data to identify leaders and laggards by habit score
3. **Name cohort sizes** — e.g. "396 users in the 6–10 day band" not "many moderate users"
4. **Quantify the opportunity** — e.g. "484 idle licences" not "some licences are unused"
5. **One action per bullet** — keep recommendations atomic and executable
6. **No jargon** — written for a non-technical executive sponsor
7. **Complete months only** — never include partial months in growth calculations. If the analysis period ends mid-month, exclude that month entirely. Document the basis (e.g. "Apr→May, complete months")

## Reach Card

### Greenshoots (✓)
- **Growth trajectory**: Calculate month-on-month acceleration. Highlight the steepest month.
  - Formula: `(month_N_users - month_N-1_users) / month_N-1_users × 100`
- **Organic demand signal**: Compare `chat_users` (unlicensed) vs `licensed_users`. If chat > licensed, demand outpaces provisioning — a positive signal.
- **Top departments**: Identify top 2-3 orgs by habit score from `org_scatter` data.

### Highest-return action (⚡)
- **Licence reallocation**: Count unused licences = `total_licences - licensed_users_active`. Name departments with worst unlicensed:licensed ratio.
  - Formula: Ratio = `org_unlicensed_users / org_licensed_users` per org from org_scatter
- **Licensed multiplier**: `license_priority` = licensed prompts / unlicensed prompts. States the ROI of converting a free user to licensed.

## Habit Card

### Greenshoots (✓)
- **Power user count**: `_scorecard_metrics.habitual_users` (users at 11+ active days)
- **Cross-channel balance**: Compare `m365_hab_11plus_pct` vs `chat_hab_11plus_pct`. If within 5pp, habit is cross-channel.
- **Retention rate**: Use `m365_retention` and `chat_retention`. If >70%, users stick once they start.
- **Champion departments**: Top 2 orgs by habit score — recommend them as internal champions.

### Highest-return action (⚡)
- **Conversion pipeline**: Count users in the moderate band (6-10 active days). These are the closest to habitual — smallest nudge needed.
  - Source: `band_6_10` from supplementary metrics or PBIX ActiveDaysSummary
- **Lagging departments**: Bottom 2 orgs by habit score. Recommend department-specific enablement sprints.

## Skill Card

### Greenshoots (✓)
- **Breadth metric**: `m365_breadth` (apps/user). Compare to Frontier band (>7 is Frontier-level).
- **Licensed depth premium**: `licensed_avg_prompts` / `unlicensed_avg_prompts` = multiplier. Proves licensing value.
- **Volume trajectory**: Compare first vs last month prompt totals. Calculate % growth.

### Highest-return action (⚡)
- **Single-shot ratio**: `100 - multi_turn_pct` = single-shot %. Train users to iterate.
- **Skill transfer**: Identify top-performing departments and recommend sharing their prompt patterns with lagging ones.

## P3 Scorecard Metrics

| Cell | Metric | Source | Formula |
|------|--------|--------|---------|
| P3 Reach | % Agents Active | `agent_adoption` | agent_users / total_active_users × 100 |
| P3 Habit | Agent Habitual Users % | `agent_habitual` | agent users with 11+ days / agent_users × 100 |
| P3 Skill | Agents with 5+ Users | `_scorecard_metrics.pct_agents_5plus_users` | agents_with_5plus / total_agents × 100 |

## Data Dependencies

These fields MUST exist in the data file for commentary to generate correctly:

```
org_scatter[]            — array of {org, adoption, habit_score, licensed, unlicensed}
_scorecard_metrics       — object with habitual_users, growth_pct, growth_months, multi_turn_pct, etc.
license_priority         — licensed/unlicensed prompt ratio
licensed_avg_prompts     — avg prompts for licensed users
unlicensed_avg_prompts   — avg prompts for unlicensed users
m365_retention           — M365 month-over-month retention %
chat_retention           — Chat month-over-month retention %
band_6_10               — count of users in 6-10 active day band (from supplementary)
```

---

## Phase 2 — Human-Agent Teams

### Narrative Style

Use McKinsey-style flowing paragraphs. Each card has two sections separated by a coloured divider:
1. **Green divider** → What's working (wins, greenshoots, proof points)
2. **Amber divider** → Where to act (biggest unlock, specific intervention)

### Reach Card

**Metrics:** Agent Active User % (`agent_adoption`), Agent User Growth Rate MoM (`_scorecard_metrics.agent_user_growth_pct`)

**IMPORTANT:** Only use completed months for growth calculations. Partial months (e.g. Jun 1-6) MUST be excluded as they skew rates downward.

**What's Working (green):**
- State user growth: `agent_user_growth_pct`% MoM (prev_month_users → current_month_users)
- State org-wide reach: all `org_count` orgs have agent users (if true)
- Name **top 3 agents by user count** from `agent_table` or `_scorecard_metrics.agent_return_details`
- Highlight agents with clear functional purposes (IT Service Agent, CRU QA Analyzer) — these signal real workflow embedding
- Note return rates for top agents (100% = perfect stickiness)

**Where to Act (amber):**
- State the adoption gap: `agent_adoption`% is early-stage, `agent_users` out of `total_active_users`
- Identify concentration risk: top 3 agents account for majority of usage
- Name the long tail: `total_agents` agents exist but most have low adoption
- Recommend promoting proven winners to untouched departments

**Formula:** Agent User Growth % = `(current_month_users - prev_month_users) / prev_month_users × 100` — completed months only
**Source:** `agent_mom_prev` (previous complete month), `agent_users` (latest complete month)

### Habit Card

**Metrics:** Agent MoM Return Rate (`_scorecard_metrics.agent_mom_retention`), Agent Session Growth Rate MoM (`_scorecard_metrics.agent_sessions_mom_pct` — from PBIX "Agent Sessions MoM %" KPI on Agents Usage Trends page)

**IMPORTANT:** Only use completed months. The PBIX MoM % KPI inherently uses complete month pairs. Verify date range excludes partial months.

**What's Working (green):**
- State session growth: `agent_sessions_mom_pct`% MoM — usage is accelerating
- State retention: `agent_mom_retained` of `agent_mom_prev` returned = `agent_mom_retention`%
- Name **agents with highest return rates** from `agent_return_details` — focus on those with 100% return AND meaningful user counts (>5 users)
- Link stickiness to functional value: agents that solve real problems retain perfectly

**Where to Act (amber):**
- Name **top and bottom orgs by weekly sessions** from `_scorecard_metrics.agent_weekly_sessions_by_org` — highlight the spread (e.g. Finance 7.6 vs IT 2.0)
- State habitual gap: only `agent_habitual`% reach 11+ active days
- Recommend embedding top agents into existing workflows as default starting points

**Formula:** Agent Session Growth MoM = PBIX "Agent Sessions MoM %" KPI (complete months)
**Formula:** Agent MoM Return = `agent_mom_retained / agent_mom_prev × 100`
**Source:** `agent_sessions_mom_pct` = "Agent Sessions MoM %" KPI card, `agent_weekly_sessions_by_org` = "Weekly Sessions Per User" bar chart (both on Agents Usage Trends page)

### Skill Card

**Metrics:** Agent Creators % (`agent_creators_pct`), Users with 3+ Agents (`_scorecard_metrics.pct_users_3plus_agents`)

**What's Working (green):**
- State multi-agent exploration: `pct_users_3plus_agents`% using 3+ agents shows curiosity
- Name **purpose-built agents** with high intensity (sessions/user) — these signal sophisticated use
- Look for agents that serve specific business processes (QA, compliance, SOP, PMO)

**Where to Act (amber):**
- State creator gap: only `agent_creators_pct`% are building agents
- State usage concentration: `agent_band_1_5_pct`% of users stick to 1-5 agents
- Recommend "agent builder sprint" targeting power users to grow creator cohort

**Formula:** Agent Creators % = `agent_creators / total_active_users × 100`

### P2 Data Dependencies

```
agent_adoption           — % of users engaging with agents
agent_users              — count of agent users
agent_frequency          — % agent users with 16+ active days (legacy, same as habitual)
agent_weekly_sessions    — avg weekly agent sessions per user (from PBIX "Sessions (Weekly)" KPI)
_scorecard_metrics.agent_user_growth_pct  — MoM user growth % (completed months only)
_scorecard_metrics.agent_sessions_mom_pct — MoM session growth % (from PBIX KPI, completed months)
_scorecard_metrics.agent_weekly_sessions_by_org — {org: sessions/week} per department
agent_habitual           — % agent users with 11+ active days
agent_creators_pct       — % users building agents
org_count                — number of orgs with active agents
agent_table[]            — array of {name, users, sessions, sessions_per_user}
_scorecard_metrics.agent_mom_retention  — MoM retention %
_scorecard_metrics.agent_mom_retained   — users who returned
_scorecard_metrics.agent_mom_prev       — users in prior month
_scorecard_metrics.agent_return_details[] — per-agent {name, totalUsers, repeatUsers, returnRate}
_scorecard_metrics.pct_users_3plus_agents — % using 3+ agents
_scorecard_metrics.total_agents_full    — total agent count
agent_band_1_5_pct      — % users with 1-5 agents
```
