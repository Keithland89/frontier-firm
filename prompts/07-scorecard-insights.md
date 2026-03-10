# Scorecard & Phase Detail Commentary Rules

> These rules govern the "Greenshoots" and "Highest-return action" commentary in the Phase detail cards. Every insight must be data-driven, specific, and actionable.

## General Rules

1. **Every claim references a specific number** — no adjectives without evidence
2. **Name departments** — use org_scatter data to identify leaders and laggards by habit score
3. **Name cohort sizes** — e.g. "396 users in the 6–10 day band" not "many moderate users"
4. **Quantify the opportunity** — e.g. "484 idle licences" not "some licences are unused"
5. **One action per bullet** — keep recommendations atomic and executable
6. **No jargon** — written for a non-technical executive sponsor

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
