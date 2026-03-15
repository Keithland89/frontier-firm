# Prompt 06: AI Insights

## Purpose

Generate the 34 `_ai_insights` text blocks that fill the narrative slots in the Frontier Firm report.
These strings are written by the AI tool when the pipeline exits with code 2 (Gate 1.5).

The quality of the insights **is** the quality of the report.
Read `RULES.md` before generating. Every rule there applies here.

---

## Audience

A **Business Decision Maker** — a senior executive who will read this report once and needs to
retell the key finding at their next leadership meeting without notes.

They are reading to answer three questions:

1. **Are we on track?** (diagnosis)
2. **Where is the biggest opportunity?** (priority)
3. **What should I ask my team to do?** (action)

Every insight block must answer at least one of these. If it answers none, rewrite it.

---

## The Three-Part Frame

Every insight follows this structure, in this order:

```
Signal  — what the data shows (one sentence, with a specific number)
Stakes  — why this matters to the business, not just to the metric
Move    — what the decision-maker should ask their team to do
```

**The Stakes sentence is the most commonly missed.**
Stating a metric is not an insight. Explaining what that metric means for how the business will
perform — that is the insight.

| Signal only (incomplete) | Signal + Stakes + Move (complete) |
|---|---|
| "51% of users return each month." | "51% of users return each month — retention at this level means the AI deployment is past the trial phase and into habit formation. The priority now shifts from rollout to deepening use in the teams that are already coming back." |
| "Finance has a 34% habitual rate." | "Finance reaches 34% habitual use — three times the org average — which means the conditions for deep AI adoption already exist inside this business. Replicating what Finance did costs far less than building a new enablement programme from scratch." |

---

## Acknowledge What Is Working — By Name

When an organisation, team, or cohort is outperforming, name them explicitly. Never average them away.

- Name the org: "UK leads agent adoption at 84% — more than double the next org"
- Say what it signals: "That gap is not random — it reflects a deliberate approach to agent onboarding"
- Make it replicable: "The question for every other org is what UK did differently, and whether it can be exported"

---

## Frame Gaps as the Size of the Prize

Never frame a shortfall as a failure. Frame it as a quantified opportunity using the customer's own numbers.

| Failure framing | Prize framing |
|---|---|
| "79% of users barely use AI." | "Converting 30% of the 8,000 users at 6–10 active days to habitual use would double the organisation's habitual base — without licensing a single new user." |
| "12,421 licenses are idle." | "12,421 inactive licenses represent the fastest path to growth — these are already-funded seats where demand hasn't been activated yet." |

---

## Language Rules

- **Active voice** — "Finance leads at 34%", not "A 34% rate is observed in Finance"
- **Lead with the number** — "8,072 users are one nudge from habitual", not "There is a cohort close to habitual"
- **One idea per sentence** — if a sentence has more than one "and", split it
- **Plain words** — "use" not "leverage", "group" not "cohort", "training" not "enablement"
- **Spell out habitual** — "using AI 11 or more days a month (habitual)" on first use per section
- **No verdict statements** — forbidden closing lines: "Speed without judgment isn't maturity — it's risk." Every closing line must resolve to a number, trend, or named cohort.
- **No generic prescriptions** — if the recommendation could appear in any AI strategy deck unmodified, rewrite it with a specific org, metric, or count from this data.
- **No external benchmarks** — no MIT, Gartner, McKinsey, or Forrester citations. Use internal benchmarks only: best org vs average, current state vs achievable state.

---

## The 34 Insight Keys

All 34 must be populated or explicitly skipped with a stated reason.

### Executive Summary (written last, placed first)

| Key | What to write |
|---|---|
| `EXEC_SUMMARY_GOOD` | What is working well. Lead with the strongest metric, name the org or cohort, say why it matters to the business. **2 sentences max.** |
| `EXEC_SUMMARY_GAP` | The most important gap as a quantified opportunity. State the size of the prize. **2 sentences max.** |
| `EXEC_SUMMARY_OPP` | The single highest-leverage action. Name the cohort, org, or metric. State the expected outcome. **2 sentences max.** |

### Section Headlines and Subtitles

Each headline must be **retellable** — the executive should be able to repeat it from memory at their next leadership meeting. Lead with a specific number, then the "so what" in plain words. Avoid framework jargon (don't say "Reach signal" or "Habit pillar").

**The Dinner Party Test:** If someone asked "what did the report say about adoption?" the headline should be the answer. If the headline requires explaining the framework first, rewrite it.

| Key | What to write |
|---|---|
| `TITLE_REACH` | e.g. "9 out of 10 licences are in use — the problem isn't adoption, it's depth". 8–15 words. Must be retellable without knowing the framework. |
| `TITLE_HABIT` | e.g. "149 people are one nudge away from making AI a daily habit". 8–15 words. Lead with the human story, not the metric name. |
| `TITLE_SKILL` | e.g. "Agents went from 9 users to 106 in four months — that's the signal". 8–15 words. Name the trend the executive should care about. |
| `TITLE_VALUE` | e.g. "Licensed users generate 8x more prompts — every licence conversion pays for itself". 8–15 words. |
| `SUBTITLE_REACH` | One sentence that advances the story from the headline — adds the "so what" or "therefore". Not a restatement. |
| `SUBTITLE_HABIT` | One sentence — the business implication of the habit data. |
| `SUBTITLE_SKILL` | One sentence — the business implication of the skill/breadth data. |
| `SUBTITLE_VALUE` | One sentence — what the value data means for investment decisions. |

### Signal Narratives (Signal + Stakes + Move)

| Key | What to write |
|---|---|
| `INSIGHT_REACH` | Signal + Stakes + Move. One sentence each. Stakes must answer: what does this activation level mean for the business? Name the best-performing org if one stands out. **3 sentences max.** |
| `INSIGHT_HABIT` | Signal + Stakes + Move. Name the most important cohort (e.g. the 6–10 day group). State what converting them is worth in concrete numbers. **3 sentences max.** |
| `INSIGHT_SKILL` | Signal + Stakes + Move. If one agent or surface stands out, name it. **3 sentences max.** |

### Spotlights

| Key | What to write |
|---|---|
| `SPOTLIGHT_HABIT` | Name the cohort, size it, quantify what conversion means (e.g. "if 30% cross to 11+ days, the habitual base doubles from X to Y"). State the specific intervention. **3 sentences max.** |
| `SPOTLIGHT_MATURITY` | Name the gap to the next pattern and the one move that would close it. Grounded in this customer's specific metrics. **2–3 sentences max.** |

### Pull Quotes

Each pull quote must be a **statement of fact** the executive would repeat in their next leadership meeting.
Not a question. Not an analogy. Provably true from the data and interesting enough to be worth repeating.

| Key | What to write |
|---|---|
| `PULLQUOTE_0` | The single sentence the executive would repeat. A fact from the data. |
| `PULLQUOTE_1` | Bridge from Reach to Habit — the natural question the reach data raises. One sentence. |
| `PULLQUOTE_2` | Bridge from Habit to Skill — the natural question the habit data raises. One sentence. |
| `PULLQUOTE_3` | Bridge from Skill to Value — the natural question the skill data raises. One sentence. |
| `PULLQUOTE_4` | Bridge from Value to Maturity — connecting the value signal to the pattern classification. One sentence. |
| `PULLQUOTE_5` | Bridge from Maturity to Actions — sets up the recommendations. One sentence. |

### Recommendations

Each recommendation requires all four: **action verb + named cohort or org + expected outcome + traceability to a metric**.

| Key | What to write |
|---|---|
| `REC_1_TITLE` | Action verb + named cohort + expected outcome. e.g. "Convert the 8,072 users at 6–10 active days to habitual before scaling licences". 8–12 words. |
| `REC_1_DESC` | Name the cohort, the size of the prize, the intervention, and the measurable target. **2 sentences max.** |
| `REC_2_TITLE` | Action verb + named cohort + expected outcome. 8–12 words. |
| `REC_2_DESC` | Same structure. **2 sentences max.** |
| `REC_3_TITLE` | Action verb + named cohort + expected outcome. 8–12 words. |
| `REC_3_DESC` | Same structure. **2 sentences max.** |
| `REC_4_TITLE` | Action verb + named cohort + expected outcome. 8–12 words. |
| `REC_4_DESC` | Same structure. **2 sentences max.** |

### Maturity / Culture Section

These four keys describe the customer's current maturity position and the path forward.
They must be grounded in this customer's specific metrics — no pattern-generic boilerplate.

| Key | What to write |
|---|---|
| `CULTURE_HEADLINE` | What this customer's pattern data shows — in one sentence with a metric. e.g. "8,072 users at 6–10 active days — the foundation is built, habit is the next gate". No generic phrases. |
| `CULTURE_DESC` | Where they are strong and where the gap is. Actual metrics only. **2 sentences max.** |
| `CULTURE_RED_FLAG` | The specific risk, the metric, and the business consequence. Opportunity-framed. **1 sentence.** |
| `CULTURE_ACTION` | The highest-leverage move, the specific cohort or count, the measurable target. **1 sentence.** |

---

## Prompt Template

This is the prompt sent to the AI when insights are needed (via `temp/insights_request.json`):

```
You are the analyst for a Frontier Firm Assessment report.

AUDIENCE: {customer_name}'s leadership team. A Business Decision Maker who will read this once
and needs to retell the key finding at their next leadership meeting without notes.

PATTERN: {pattern_context.dominant} ({pattern_context.p1} / {pattern_context.p2} / {pattern_context.p3})

KEY METRICS:
{key_metrics as formatted list}

THE THREE-PART FRAME
Every insight = Signal (what the data shows, with a number) + Stakes (why this matters to
the business, not just to the metric) + Move (what the decision-maker should ask their team to do).
Missing the Stakes is the most common failure.

REQUIRED OUTPUTS — generate all 34 keys listed in required_keys.

QUALITY RULES:
1. Every claim backed by a specific number from this customer's data — no estimated values.
2. No verdict statements — aphoristic closing lines ("X isn't Y — it's Z") are forbidden.
   Close every paragraph on a number or a named cohort.
3. No generic prescriptions — if the recommendation could appear in any AI strategy deck
   without modification, rewrite it with a specific org, metric, or count from this data.
4. No external benchmarks — no MIT, Gartner, McKinsey. Use internal benchmarks only.
5. Acknowledge outperforming orgs or cohorts by name — do not average them away.
6. Frame gaps as the size of the prize — convert shortfalls to quantified opportunities.
7. Plain language — active voice, lead with the number, one idea per sentence,
   "use" not "leverage", spell out "habitual (11+ days a month)" on first use.

Output a single JSON object with all 34 keys. Merge into the data file and re-run the pipeline.
```

---

## Self-Audit Before Accepting

Before saving insights to the data file, verify:

- [ ] Every number traces to a named field in the data JSON
- [ ] No segment mixing — Licensed, Unlicensed Chat, and Agent figures are kept separate
- [ ] Every insight answers Signal + Stakes + Move
- [ ] Every headline leads with a specific number, trend, or named pattern
- [ ] Tone is opportunity-framed — no failure or critical language
- [ ] All 34 keys populated (or explicitly skipped with reason stated)
- [ ] Outperforming orgs or cohorts named explicitly — not averaged away
- [ ] Gaps framed as quantified prize, not failure
- [ ] "Contoso" absent from all output
- [ ] All recommendations name a cohort, state an outcome, and trace to a metric
- [ ] No verdict statements — every closing line traces to a number or named cohort
- [ ] No generic prescriptions — every recommendation names a specific cohort or metric
- [ ] No `undefined` / `NaN` / `Infinity` / unresolved `{{placeholder}}` in output
