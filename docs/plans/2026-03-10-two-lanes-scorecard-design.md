# Two Lanes Scorecard — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## The Story

Your organisation's AI journey has two chapters that build on each other.

**Chapter 1: Copilot** — Getting M365 Copilot into people's hands and making it stick. Individual users draft, summarise, research. The question isn't "are people using it?" but "is it becoming part of how they work?"

**Chapter 2: Agents** — Moving beyond individual productivity into team-level AI. Agents handle delegated tasks embedded in real workflows. AI stops being a personal tool and starts changing how the organisation operates.

## Scorecard Structure

**2 Lanes × 3 Pillars = 6 cells, 12-13 metrics**

| | **Skill / Sophistication** | **Consistency** | **Reach / Expansion** |
|---|---|---|---|
| **M365 Copilot** | App Surface Breadth (apps/user) | Habitual User Rate (6+ days/3mo) | License Activation % |
| | Multi-Turn Session Rate % | MoM Retention (avg complete months) | License Coverage % |
| | | | Concentration Index (orgs above median) |
| **Agents** | Agent Breadth (agents/user) | Agent Habitual Rate (6+ days/mo) | Agent Adoption % |
| | Agent Return Rate (multi-user only) | Agent MoM Retention | Org Penetration (% orgs w/ both) |

### Three Questions (Pillars)

**Are they going deep? (Skill / Sophistication)**
Not just opening Copilot, but using it across multiple apps, having real multi-turn conversations, engaging with agents that solve actual problems.

**Is it sticking? (Consistency)**
Not a one-week experiment, but a daily habit. Users who come back week after week, month after month. The difference between "tried it" and "can't work without it."

**Is it spreading? (Reach / Expansion)**
Not concentrated in one team of enthusiasts, but reaching across departments, roles, and geographies. AI becomes an organisational capability, not a pocket of innovation.

## Tier Thresholds

| Metric | Data Field | Expansion | Frontier |
|--------|-----------|-----------|----------|
| App Surface Breadth | m365_breadth | 3 | 5 |
| Multi-Turn Rate | complex_sessions | 40% | 70% |
| Habitual User Rate | embedded_user_rate | 15% | 35% |
| MoM Retention | m365_retention | 75% | 90% |
| License Activation | m365_enablement | 60% | 85% |
| License Coverage | license_coverage | 30% | 60% |
| Concentration Index | concentration_index | 40% | 70% |
| Agent Breadth | agent_breadth | 2 | 4 |
| Agent Return Rate | agent_health | 50% | 80% |
| Agent Habitual Rate | agent_habitual_rate | 5% | 15% |
| Agent MoM Retention | agent_retention | 50% | 75% |
| Agent Adoption | agent_adoption | 10% | 25% |
| Org Penetration | org_penetration_pct | 20% | 50% |

## Pattern Determination

- Each pillar scores Foundation/Expansion/Frontier based on its metrics (majority rule)
- **Lane tier = weakest pillar** in that lane
- **Overall Pattern = the weaker lane**
- You can't be Frontier if your agents are Foundation

**Pattern 1: Foundation** — Copilot is landing, agents are early
**Pattern 2: Expansion** — Copilot is embedded, agents are growing
**Pattern 3: Frontier** — Both Copilot and agents are deep, consistent, and widespread

## Report Flow

1. **Headlines** → quick 3-card summary
2. **Maturity Assessment** → 2-lane scorecard (click any cell to jump to evidence)
3. **Copilot Deep-Dives** → Skill / Consistency / Reach evidence for the Copilot lane
4. **Agent Deep-Dives** → Skill / Consistency / Reach evidence for the Agent lane
5. **License Intelligence** → Where to reallocate, per-org demand
6. **Recommended Actions** → 3 focused actions tied to weakest cells

## Scorecard Visual Design

The scorecard should be a 2×3 grid where:
- Rows are lanes (Copilot, Agents)
- Columns are pillars (Skill, Consistency, Reach)
- Each cell shows the pillar tier + key metric values
- Clicking a cell navigates to the relevant deep-dive section
- The overall pattern is shown prominently above the grid
- Each lane's tier is shown at the row start

## Data Sources (PBIX)

All metrics computable from:
- `ActiveDaysSummary` — user-level active days, license status, monthly data
- `Chat + Agent Interactions (Audit Logs)` — AppHost, AgentName, sessions
- `Chat + Agent Org Data` — per-org breakdowns
- `Copilot Licensed` — seat counts
- `Agents 365` — agent types, agent metadata
- `Calendar` — time filtering

## Aspirational Metrics (not yet in PBIX)

- Prompt/task diversity
- Advanced feature use
- Multi-step task completion
- Role/geography-level reach data
- Concentration-adjusted Gini coefficient (compute from org scatter as proxy)
