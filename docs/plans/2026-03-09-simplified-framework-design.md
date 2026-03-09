# Simplified Frontier Firm Framework — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Goal

Replace the 17-metric, 4-signal framework with a 5-metric, 3-signal framework that is clearer, more defensible, and directly computable from the PBIX. Value is narrative only — not a scoring dimension.

## The 5 Hero Metrics

| Signal | Metric | Definition | Computable from |
|--------|--------|-----------|----------------|
| **Reach** | License Activation % | licensed_users / total_licensed_seats * 100 | Derived from extracted values |
| **Reach** | Agent Adoption % | agent_users / total_active_users * 100 | Derived from extracted values |
| **Habit** | Embedded User Rate % | Users with avg 6+ active days/month over last 3 complete months / total active users * 100 | Computed from `ActiveDaysSummary` — requires per-user aggregation |
| **Skill** | App Surface Breadth | Avg distinct M365 apps/surfaces per user | Scalar measure `[AverageAppSurfacesPerUser]` or computed from app interactions |
| **Skill** | Agent Breadth | Avg distinct agents per user | Scalar measure or computed |

### Embedded User Rate — the key metric

This blends frequency + consistency into one number:
```
Embedded = users where AVG(ChatActiveDays) >= 6 across last 3 complete months
                  AND present in at least 2 of those 3 months
```

DAX computation:
```dax
EVALUATE
VAR Last3Months = TOPN(3,
  FILTER(DISTINCT('ActiveDaysSummary'[MonthStart]),
    'ActiveDaysSummary'[MonthStart] < MAXX('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart])),
  [MonthStart], DESC)
VAR UserStats = SUMMARIZE(
  FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart] IN Last3Months),
  'ActiveDaysSummary'[Audit_UserId],
  "AvgDays", AVERAGE('ActiveDaysSummary'[ChatActiveDays]),
  "MonthsActive", DISTINCTCOUNT('ActiveDaysSummary'[MonthStart])
)
VAR Embedded = COUNTROWS(FILTER(UserStats, [AvgDays] >= 6 && [MonthsActive] >= 2))
VAR TotalUsers = DISTINCTCOUNT('ActiveDaysSummary'[Audit_UserId])
RETURN ROW("EmbeddedRate", DIVIDE(Embedded, TotalUsers, 0), "EmbeddedCount", Embedded, "TotalUsers", TotalUsers)
```

### Pattern Determination (simplified)

| Pattern | Criteria |
|---------|----------|
| **Foundation** | 0-1 hero metrics at Expansion threshold |
| **Expansion** | 2-3 metrics at Expansion threshold |
| **Frontier** | 4-5 metrics at Expansion threshold, or 3+ at Frontier threshold |

Thresholds (to be calibrated):

| Metric | Foundation | Expansion | Frontier |
|--------|-----------|-----------|----------|
| License Activation | <50% | 50-80% | >80% |
| Agent Adoption | <5% | 5-15% | >15% |
| Embedded User Rate | <5% | 5-15% | >15% |
| App Surface Breadth | <2 | 2-4 | >4 |
| Agent Breadth | <1.5 | 1.5-3 | >3 |

## Report Structure (simplified)

1. **Hero Banner** — Customer name, pattern, 5 metric cards with tier badges
2. **Framework** — 3 phases (same as current)
3. **Signal Deep-Dives** (3 sections, not 4)
   - **Reach** — User population chart, org scatter, license activation gauge
   - **Habit** — Monthly trend, embedded user rate trend, retention cohort flow
   - **Skill** — App surface bars, agent leaderboard, breadth metrics
4. **Value** — Time saved narrative, licensing multiplier (informational, NOT scored)
5. **Maturity Assessment** — Pattern badge, 3 signal gauges (not 4)
6. **Recommendations** — 3 specific actions (not 4)

## What gets removed from current template

- Radar charts (replaced by 5 metric cards)
- Per-metric scorecard detail panels (17 → 5 metrics)
- Value signal gauge/scoring (becomes narrative only)
- Active day band distribution chart (embedded user rate replaces this)
- Weekly intensity chart (covered by embedded rate)
- Multiple redundant retention visualisations (one cohort flow chart is enough)

## Accuracy Requirements

**The #1 priority is data accuracy.** Every number in the report must match the PBIX exactly.

Key accuracy fixes from this session to carry forward:
- `NoOfActiveChatUsers (Licensed/Unlicensed)` = ALL-TIME — must use monthly backfill
- `COUNTROWS('Copilot Licensed')` = correct total licensed seats
- All 0-1 rates need toPct conversion
- Cross-validation gate (Gate 0.5) is mandatory
- Embedded User Rate must be computed from raw `ActiveDaysSummary`, not approximated

## Implementation Approach

1. New template: `template/ff_template_v2.html` — clean slate, 6 sections
2. New schema: `schema/ff_data_schema_v2.json` — ~25 fields instead of 65
3. New scoring: `schema/ff_schema_v2.json` — 5 metrics, 3 signals
4. Update generator to support v2 template
5. Update measure_map.json with new computed fields (Embedded User Rate)
6. Keep the existing pipeline (all 7 gates) — just swap the template/schema
7. Same extraction infrastructure — measure map, cross-validation, AI insights

## Design Approach for Template

Use the `frontend-design` skill for the new template. Dark mode, premium feel. The current template is good but overloaded — the v2 should feel like a high-end consultancy deliverable with 50% fewer sections but each one landing harder.

Key design principles:
- Each section has ONE chart and ONE insight callout — no clutter
- Numbers are large, prominent, colour-coded by tier
- AI narrative is the primary content, not the charts
- Charts support the narrative, not the other way around
