# Weekend Changelog — 2026-03-14 to 2026-03-15

All changes from this weekend's session. These may need to be reapplied after syncing with colleague's updates.

Git stash: `V6-reach-redesign-weekend-work-2026-03-15` (stash@{0})
Committed to master: commits `5103fd9` through `d9e7e5b` (pushed to GitHub)

---

## Already Pushed to GitHub (safe)

### Commit: 5103fd9 — V5 Subsection Redesign
- 3 signal sections (Reach/Habit/Skill) split into 6 subsections
- Each subsection: mini interpretation + metric cards + own drill-down
- Insightful takeaway text per subsection
- Clear metric card titles (Copilot/Agent/Unlicensed prefix)
- Signal badges restored (globe/heart/checkmark)
- Agent Return Rate → Agent Intensity in Skill > Depth
- Unlicensed Chat card removed from Retention
- Redundant drill panels removed
- JS click handler fixed: uses data-drill-idx, guards null metricsGrid
- Shortened section questions, removed pattern badges
- Collapsible Framework section
- Alternating backgrounds, softer card chrome
- Retellability guidance in RULES.md and 06-ai-insights.md

### Commit: d9e7e5b — Agents 365 Filter
- Phase 7.5 in extractor: filters agent_table to Agents 365 only
- Drops agents with type "Unknown" (not in Agents 365 catalogue)
- Recalculates agent_users, agent_adoption, total_agents, agents_keep/review/retire
- Example impact: 14 → 11 agents, 134 → 40 users, 10.5% → 3.1% adoption after filtering

---

## In Stash (not pushed) — Needs Reapplication

### V6 Reach Content Redesign
**Files changed:** template/ff_template_v4.html, src/generate-report.js, src/validate-report.js, src/visual-check.js, src/deep-audit.js

#### Activation Subsection
- Replaced 3 metric cards with 2: "User Population" + "Activity Coverage"
- User Population card: shows 517 licensed / 758 unlicensed / 40 agent users inline
- Activity Coverage card: shows 8.3x engagement gap
- Drill visual: chartUserTrend (grouped bar by month) + stat callouts + chartActivityCoverage (stacked activity share bar)
- Removed old drill panels: chartCoverage donut, chartTiers bar, chartSessionsPerOrg

#### Org Spread Subsection
- Replaced 2 metric cards: "Org Breakdown" (X orgs licensed, Y with agents) + "Licensing Opportunities" (count with ratio > 2x)
- Drill visual: chartOrgLeaderboard (horizontal grouped bar: Licensed/Unlicensed/Agents per org) + ORG_OPPORTUNITY_CARDS (top 3 licensing opportunities)
- Removed old drill panels: chartConcentration, chartOrgDonut, chartOrgScatter
- New placeholders: ORGS_WITH_LICENSED, ORGS_WITH_AGENTS, TOP_LICENSING_OPP_COUNT, ORG_LEADERBOARD_JSON, ACTIVITY_COVERAGE_JSON, ORG_OPPORTUNITY_CARDS

#### Charts Added
- chartUserTrend (grouped bar — Licensed/Unlicensed/Agents by month)
- chartActivityCoverage (stacked horizontal bar — activity share by tier)
- chartOrgLeaderboard (grouped horizontal bar — Licensed/Unlicensed/Agents per org)

#### Charts Removed
- chartCoverage (donut)
- chartTiers (bar)
- chartSessionsPerOrg (horizontal bar)
- chartConcentration (horizontal bar)
- chartOrgDonut (doughnut)
- chartOrgScatter (bubble)

#### Deep Audit Additions
- Org coverage counts (orgs with licensed, orgs with agents)
- Top licensing opportunity count

---

## Design Docs Created
- `docs/plans/2026-03-14-v5-subsection-redesign.md` — Subsection architecture
- `docs/plans/2026-03-15-v6-subsection-content-redesign.md` — V6 content spec for all 6 subsections

## Pending Work (Not Yet Built)
- Habit section V6 visual clusters (Retention + Intensity/Consistency cards)
- Skill section V6 visual clusters (Breadth + Depth cards with agent type distribution)
- Cross-org Reach/Habit/Skill scoring table redesign
- Appendix traffic light table replacement

## Memory Notes
- Agent data must be filtered to Agents 365 only (type !== "Unknown") at extraction time
- Extractor writes to .extracted.json if main file exists — need to copy over
- AI insights must reference correct Agents 365 numbers (40 users, 3.1% adoption, 11 agents)
- Org scatter data `y` field is agent adoption % — used to derive per-org agent users
