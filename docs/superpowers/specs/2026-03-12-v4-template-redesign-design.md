# V4 Template Redesign — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Scope:** New `ff_template_v4.html` + generator `--v4` flag

## Problem

V3 template is data-first: scorecard + radar charts interrupt the narrative before the reader understands the story. The shorter "Skill Habit Reach Emphasis" report proves that narrative-first (question → evidence → so what) is more compelling for exec audiences. V4 combines the shorter report's narrative flow with V3's data depth.

## Structure (9 sections)

| # | Section | ID | Content |
|---|---------|-----|---------|
| 1 | **Hero** | `#hero` | Verdict sentence as H1 (not a score). 3 KPIs (not 4). Full-screen deliberate pause. |
| 2 | **Exec Summary** | `#verdict` | Working / What's Next / The Move — 3 cards, one stat each, colour = dimension |
| 3 | **Framework** | `#framework` | P1→P2→P3 journey track with "you are here" pin. 3 pattern cards with org counts. Transition callout. |
| 4 | **Reach** | `#reach` | Question headline + big number right + 3 stat cards + So What. Expand: weekly trend chart, org scatter, licence priority table |
| 5 | **Habit** | `#habit` | Question headline + CSS distribution bars (conversion zone label) + So What. Expand: retention MoM chart, per-tier bands |
| 6 | **Skill** | `#skill` | Question headline + 3 stat cards + agent spotlight (CSS bars) + So What. Expand: app surface chart, agent leaderboard |
| 7 | **Orgs** | `#orgs` | Table with inline score bars, OVERALL row at top, P1/P2/P3 badges per org |
| 8 | **Actions** | `#actions` | 4 numbered recommendation cards with targets |
| 9 | **Appendix** | `#appendix` | Scorecard (radar charts + flip cards), metric glossary — reference material |

## Design System

### Colour tokens (RGB triplets for alpha flexibility)
```css
--dim-reach:  52,211,153;   /* teal-green */
--dim-habit:  251,191,36;   /* amber */
--dim-skill:  96,165,250;   /* blue */
--p1: 59,130,246;           /* blue — Pattern 1 */
--p2: 16,185,129;           /* green — Pattern 2 */
--p3: 139,92,246;           /* purple — Pattern 3 */
```

### Typography
- System font stack: `'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- H1: `clamp(1.9rem, 4.5vw, 3rem)`, weight 700, letter-spacing -.025em
- Body: `.875rem–.95rem`, colour `--text-secondary`, line-height 1.72

### Key CSS classes (from shorter report)
- `.eyebrow` — section label with accent bar
- `.stitle` / `.ssub` — section title / subtitle
- `.sowhat` — "So what?" callout with accent border-left
- `.signal-bar` — coloured dot + signal name header
- `.sig-header` — question text left, big number right
- `.r` / `.r.on` / `.d1–.d4` — scroll-reveal animations
- `.kpi` / `.kpi-v` / `.kpi-l` — hero stat cards
- `.v-card` / `.v-label` / `.v-stat` — verdict cards

## 7 Design Elements Adopted

### 1. Question-format headlines
Each signal section leads with a provocative question: "75% of licenses are active. **But is AI actually spreading?**" The "But" creates tension.

### 2. "So What?" callouts
Every data section ends with a bordered callout (`border-left: 4px solid <signal-colour>`, `So what?` label). Forces the narrative to answer why the data matters.

### 3. Big number flush-right
`.sig-header` grid: text left, hero stat right. Scanning pattern: question → stat → explanation.

### 4. Verdict cards (Working / What's Next / The Move)
3 cards in exec summary. One stat per card. Colour = dimension (green/amber/blue).

### 5. Agent spotlight with CSS intensity bars
CSS-only bars ranked by sessions/user. Custom vs 1P badges. No Chart.js dependency.

### 6. Habit distribution as CSS bars
Horizontal bars with "Conversion zone ←" annotation. CSS-only, zero dependencies.

### 7. Journey track
Dotted P1→P2→P3 progression line with "you are here" dot and half-filled progress bar.

## Signal Section Pattern

Each of Reach / Habit / Skill follows identical structure:
1. **Signal bar** — coloured dot + "Reach — Expanding Impact"
2. **Question headline** — provocative, tension-creating
3. **Big number** — flush right, opposite the question
4. **Evidence** — 3 stat cards OR CSS bars (varies by signal)
5. **"So What?" callout** — bordered, forces conclusion
6. **Expand toggle** — "Dive deeper — charts, trend, detail +"
7. **Expanded content** — Chart.js canvases, tables, additional breakdowns (hidden by default)

## Expandable Detail Sections

Each signal has a collapsible detail section containing the heavy charts from V3:
- **Reach expand:** Weekly activation trend (Chart.js), org scatter plot, licence priority table
- **Habit expand:** Retention MoM bar chart, per-tier habit formation, active day distribution
- **Skill expand:** App surface breakdown (Chart.js), agent leaderboard bar chart, agent table

## Org Table Design

Table format (not horizontal bars). Columns: Org | Pattern Badge | Composite Score (inline bar) | Reach | Habit | Skill. OVERALL row pinned at top with divider.

## Implementation Approach

1. **New template file:** `template/ff_template_v4.html` — does NOT modify V3
2. **Generator flag:** `--v4` in `generate-report.js` selects V4 template
3. **Shared `populateTemplate()`:** Same function populates V3 and V4 — placeholders are identical, only HTML structure changes
4. **New placeholders needed:**
   - `{{VERDICT_WORKING_TITLE}}`, `{{VERDICT_WORKING_TEXT}}`, `{{VERDICT_WORKING_STAT}}`, `{{VERDICT_WORKING_LABEL}}`
   - Same for NEXT and MOVE
   - `{{REACH_QUESTION}}`, `{{HABIT_QUESTION}}`, `{{SKILL_QUESTION}}`
   - `{{REACH_SOWHAT}}`, `{{HABIT_SOWHAT}}`, `{{SKILL_SOWHAT}}`
   - `{{JOURNEY_TRACK_FILL_PCT}}`, `{{DOMINANT_PATTERN_PIN}}`
   - `{{HABIT_CSS_BARS_HTML}}` — pre-rendered CSS bars
   - `{{AGENT_SPOTLIGHT_HTML}}` — pre-rendered agent intensity bars
   - `{{ORG_TABLE_HTML}}` — pre-rendered org table
5. **CSS:** Adopt the shorter report's design system wholesale (tokens, classes, animations)
6. **Chart.js:** Retained ONLY in expandable sections (not in main flow)

## Testing

- Generate with multiple customer datasets
- Verify all placeholders populated (no `{{...}}` in output)
- Check expandable sections toggle correctly
- Verify CSS bars render without Chart.js
- Print layout works (A4 landscape)

## Files Changed

| File | Change |
|------|--------|
| `template/ff_template_v4.html` | NEW — full V4 template |
| `src/generate-report.js` | Add `--v4` flag, new placeholder population for verdict/question/sowhat/CSS bars |
| `schema/ff_schema_v4.json` | No change — same scoring system |
| `schema/measure_map.json` | No change — same extraction |
