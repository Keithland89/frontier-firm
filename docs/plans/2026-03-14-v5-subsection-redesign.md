# V5 Subsection Redesign

**Date:** 2026-03-14
**Goal:** Restructure the 3 signal sections (Reach, Habit, Skill) into 2 subsections each, with always-visible hero visuals and clear M365 Copilot vs Agent distinction within each subsection.

## Design Principles

1. **Story-driven subsections** — each subsection answers a specific question, not a framework label
2. **Both lanes visible within each subsection** — M365 Copilot and Agents shown side-by-side via colour coding, not as separate columns
3. **No hero metric** — removed. The subsection visual IS the hero. No single number to pick.
4. **No pattern badges** — removed from section headers. Pattern classification stays in the collapsible Framework section.
5. **Progressive disclosure** — subsection visuals always visible; metric cards and drill-downs behind click

## Section Structure

### Reach: "Are they showing up?"

| Subsection | Question | Visual (always visible) | Metrics |
|------------|----------|------------------------|---------|
| **Activity** | "How many are using it?" | Stacked population bar (Licensed/Unlicensed/Inactive) + engagement gap callout + agent adoption % | Activation 90.7%, Coverage 40.5%, Agent Adoption 10.5% |
| **Org Spread** | "Is it spread or concentrated?" | Concentration bar (top 3 vs rest) + org penetration donut | Concentration 98.3%, Org Penetration 23.2% |

### Habit: "Are they building a habit?"

| Subsection | Question | Visual (always visible) | Metrics |
|------------|----------|------------------------|---------|
| **Retention** | "Are they coming back?" | Side-by-side retention bars (Licensed/Unlicensed/Agent) with thresholds | Licensed Return 95.6%, Agent Return 66.7%, Chat Return 50% |
| **Habitual Users** | "Are they making it routine?" | Active day band bar (Copilot + Agent side-by-side) + habitual trend sparkline | Habitual Rate 16.3%, Agent Habitual 10.2% |

### Skill: "Are they going deeper?"

| Subsection | Question | Visual (always visible) | Metrics |
|------------|----------|------------------------|---------|
| **Breadth** | "How many surfaces are they using?" | App surface chart + agent portfolio health | App Breadth 2.1, Agent Breadth 3.5 |
| **Depth** | "How deep are the conversations?" | Deep interactions gauge + agent growth line | Deep Interactions 5.4%, Agent Growth 9 to 106 |

## Lane Differentiation

Within each subsection visual, M365 Copilot and Agent data are differentiated by:
- **Colour**: Copilot = blue (#007fff), Agents = purple (#8477FB)
- **Labels**: Small lane badges ("M365 Copilot" / "Agents") on each data element
- **Not** by separate columns or separate sections

## Template Layout Per Section

```
Section Question (bold, 1.9rem)
AI-generated headline (0.95-1.15rem, text-2 colour)
AI-generated subtitle (0.85rem, text-3 colour)

  ┌─ Subsection: Activity ──────────────────────┐
  │ "How many are using it?"                      │
  │ [Visual: population bar + engagement gap]     │
  │ [2-3 compact metric cards]                    │
  └───────────────────────────────────────────────┘

  ┌─ Subsection: Org Spread ────────────────────┐
  │ "Is it spread or concentrated?"               │
  │ [Visual: concentration bar + penetration]     │
  │ [2 compact metric cards]                      │
  └───────────────────────────────────────────────┘

  So What insight (AI-generated)

  [Drill-down area — click metric cards to explore detail]
```

## What Gets Removed

- Headline-stat (the big single number per section)
- Hero drill button
- Pattern tier badges on sections
- "Explore prompt" divider line (replaced by natural subsection flow)
- Inline hero visuals added in previous iteration (replaced by subsection visuals)

## What Stays

- Section question (bold headline)
- AI-generated TITLE and SUBTITLE
- Metric cards (smaller, inside subsections)
- Drill-down panels (behind metric card clicks)
- So What insight callout
- All Chart.js charts (repositioned into subsections)

## Build Order

1. Reach section as proof of concept
2. Review with Keith
3. Apply pattern to Habit and Skill
4. Update visual-check and deep-audit
5. Full pipeline verification
