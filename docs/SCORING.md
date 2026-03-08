# Scoring Algorithm

## Overview

The scoring system converts raw metric values into tier labels (Foundation, Expansion, Frontier) at three levels: metric → signal → pattern.

## Step 1: Score Individual Metrics

Each metric in `schema/ff_schema.json` has three band thresholds: `[low, mid, high]`.

```
Value < bands[1]  → Foundation
Value >= bands[1] → Expansion
Value >= bands[2] → Frontier
```

### Percentage Normalisation

Metrics stored as percentages (e.g. `m365_enablement: 75.4`) are normalised to 0-1 scale before comparison if the raw value is > 1 and the metric unit includes "%".

Example: `m365_enablement = 75.4` → normalised to `0.754`, compared against bands `[0.40, 0.70, 0.90]` → Expansion.

### Special Cases

- Metrics with `"scored": false` are excluded from signal scoring
- Some metrics (like `agent_habitual`, `agent_creators_pct`) store small percentages as raw values < 1 and use integer-scale bands — the normalisation heuristic (`> 1`) handles this correctly

## Step 2: Score Signals

Each signal aggregates its scored metrics:

1. Count how many metrics are at each tier
2. If 1+ at Frontier AND (Frontier + Expansion) >= half the metrics → **Frontier**
3. If (Frontier + Expansion) >= half the metrics → **Expansion**
4. Otherwise → **Foundation**

### Data File Overrides

If the data file contains `reach_tier`, `habit_tier`, `skill_tier`, or `value_tier`, those override the algorithmic score.

## Step 3: Determine Pattern

Pattern is determined from signal tiers, **excluding Value** (which has `exclude_from_pattern: true`):

| Rule | Pattern |
|------|---------|
| 1+ Frontier AND (Frontier + Expansion) >= 3 | **Pattern 3: Frontier** |
| 1+ Expansion or Frontier | **Pattern 2: Expansion** |
| All Foundation | **Pattern 1: Foundation** |

### Pattern Override

If the data file contains `pattern` and `pattern_name`, those override the algorithmic result.

## Gauge Widths

Signal gauges display on a 0-100 scale:
- Foundation → 30
- Expansion → 65
- Frontier → 90

Data file can override with `reach_gauge`, `habit_gauge`, `skill_gauge`, `value_gauge`.

## Metric Reference

| Metric | Signal | Bands | Unit |
|--------|--------|-------|------|
| m365_enablement | Reach | 40/70/90% | % seats active |
| license_coverage | Reach | 10/25/50% | % users licensed |
| m365_adoption | Reach | 15/30/50% | % with 6+ days |
| agent_adoption | Reach | 5/10/20% | % of total users |
| agent_enablement | Reach | 5/10/25% | % high-impact agents |
| cross_org_breadth | Reach | 2/5/12 | org count |
| m365_frequency | Habit | 10/20/40% | % habitual |
| chat_habit | Habit | 5/15/30% | % habitual |
| agent_habitual | Habit | 2/8/20 | 11+ day users |
| agent_frequency | Habit | 2/5/15 | sessions/user/week |
| m365_retention_3mo_avg | Habit | 60/75/90% | 3-month avg |
| m365_breadth | Skill | 2/4/7 | apps/user |
| agent_breadth | Skill | 1.2/2/4 | agents/user |
| complex_sessions | Skill | 25/45/65% | % multi-turn |
| agent_health | Skill | 40/60/85% | return rate |
| agent_creators_pct | Skill | 2/5/10 | creator count |
| license_priority | Value | 1.0/1.5/2.5 | ratio |
