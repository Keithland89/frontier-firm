# Frontier Firm — Report Rules

> These rules govern insight generation, narrative quality, and output integrity for all Frontier Firm reports.
> The pipeline handles structural correctness. These rules govern the intelligence layer.

---

## 1. Credibility Over Completeness

One generic insight undermines ten strong ones. Skip rather than speculate.

- If data is insufficient for an insight block, state it explicitly — never fill space with vague content
- 28 excellent insights beats 30 where 2 are weak
- `"Insufficient data for this analysis"` is a valid and credible output

---

## 2. Data Accuracy

**Traceability** — Every figure must resolve to a named field in the customer data JSON. No estimated, interpolated, or hardcoded values.

**Time period precision** — Only state a time period (weekly, monthly, daily, per quarter) if it is confirmed by the field definition or the PBIX measure name. If the time window of a metric is uncertain, state the figure without a period qualifier (e.g. "median sessions" not "median weekly sessions"). A wrong time period misleads the executive more than a missing one. When in doubt, omit the period and use "over the reporting period" or no qualifier at all.

**Segment isolation** — Never mix Licensed, Unlicensed Chat, and Agent user figures. Each metric belongs to exactly one segment — verify the source field before citing.

**Unit fidelity**
- Use units exactly as the data expresses them: %, users, days, sessions, hours
- "Habitual" = 11+ active days/month — never say "daily" unless the metric is ≥ 20 days/month
- Never round aggressively or reframe beyond what the data supports

**Visibility rule** — Only reference organisations, cohorts, or agents that exist in the customer data. No external benchmarks, industry norms, or peer comparisons unless explicitly provided as input.

---

## 3. Narrative Quality

### Every insight must pass the "So what?" test

Format: `[What the data shows] + [Why it matters] + [What to do next]`

If a statement could apply to any organisation, it is too generic — rewrite or remove.

| Too generic | Executive-grade |
|---|---|
| "Agent adoption is low" | "8% agent adoption (94 users) — Finance cohort at 31% shows the playbook exists; replicate it" |
| "Habitual usage is growing" | "Habitual rate up 4pp MoM to 18% — at this pace, 25% is achievable by Q3" |
| "Usage varies by organisation" | "Legal leads at 2.3x average sessions/user — targeted enablement, not broader rollout, is the lever" |

### Language

Write for a non-technical executive. No jargon, no acronyms without expansion, no technical metric names used raw. If you wouldn't say it in a boardroom, rewrite it.

### Tone: opportunity-framed, not critical

| Do not use | Use instead |
|---|---|
| "Zero M365 Copilot adoption shows deployment failure" | "M365 Copilot launch in progress — strong chat base provides the foundation to build on" |
| "Only 11% habitual users shows a critical gap" | "11% habitual rate — enablement with the top quartile could double this in 60 days" |
| "58% of agents are unused — poor curation" | "21 of 36 agents have low engagement — consolidation opportunity to focus on what works" |

### No verdict statements

A verdict statement is a punchy, aphoristic closing line that sounds authoritative but floats free of the data — it could appear in any AI strategy deck, keynote, or thought-leadership post without modification.

> "Speed without judgment isn't maturity — it's risk."
> "Adoption without enablement is just noise."
> "The gap between access and impact is where organisations stall."

These are forbidden. They add rhetorical weight but zero analytical value. Every closing line must resolve to something in this customer's data — a number, a trend, a named cohort.

| Verdict statement (remove) | Data-anchored close (use) |
|---|---|
| "Speed without judgment isn't maturity — it's risk." | "94% reach with 11% habitual rate — the foundation is set, but without enablement the gap will widen" |
| "Adoption without enablement is just noise." | "Finance at 34% habitual vs org average of 11% — the enablement playbook already exists inside this org" |

### No generic prescriptions

Generic prescriptions are recommendations that apply to every organisation equally — they carry no fingerprint of this customer's data, metrics, or org structure.

> "Structure teams with clear AI roles and delegation norms."
> "Build continuous feedback loops."
> "Embed AI competency in hiring and governance."
> "Foster a culture of continuous learning."
> "Ensure leadership alignment on AI strategy."

These are consulting boilerplate. If the sentence could appear unedited in a McKinsey AI adoption white paper, it does not belong in this report. Every recommendation must name a specific cohort, metric, or pattern from the data.

| Generic prescription (remove) | Data-specific recommendation (use) |
|---|---|
| "Structure teams with clear AI roles and delegation norms." | "Legal (2.3x avg sessions/user) has organic power users — formalise them as peer coaches rather than waiting for a top-down programme" |
| "Build continuous feedback loops." | "Agent retention rate at 34% — instrument the 3 highest-traffic agents with a prompt-rating mechanism before expanding to new orgs" |

### Headlines

Headlines must be **retellable** — the executive should be able to repeat them from memory at their next leadership meeting without notes. Lead with the finding in plain words. Avoid framework jargon ("Reach signal", "Habit pillar") — the reader doesn't know the framework.

**The Dinner Party Test:** If someone asked "how's AI adoption going?" the headline should be a complete answer. If it requires explaining the framework first, rewrite it.

Formula (preferred): `[Specific number + human story] — [so what in plain words]`
Formula (acceptable): `[Specific number or trend] — [implication or action]`

- Best: `"149 people are one nudge away from making AI a daily habit"`
- Good: `"34% habitual rate in Finance — 3x the org average and a replicable playbook"`
- Not acceptable: `"Habit Signal — strongest in Finance (34%) and Legal (28%)"` (uses framework label)
- Not acceptable: `"Habit Signal Overview"` (no evidence, no anchor)

### Storyboard flow

Each section advances the narrative — it does not just report data:

| Section | Question it answers |
|---|---|
| **Reach** | How broadly is AI available and activated? |
| **Habit** | Are people returning, or trying once and stopping? |
| **Skill** | Are users deepening capability across surfaces? |
| **Value** | What tangible difference does it make? |
| **Exec summary** | What decision does this inform? (Written last, placed first) |

---

## 4. Writing for a Business Decision Maker

The audience reads this report to answer three questions:
1. **Are we on track?** — diagnosis
2. **Where is the biggest opportunity?** — priority
3. **What should I ask my team to do?** — action

Every insight block should answer at least one of these. If it answers none, remove it.

### The three-part frame

Every insight follows this structure, in this order:

```
Signal  — what the data shows (one sentence, with a number)
Stakes  — why this matters to the business, not just to the metric
Move    — what the decision-maker should ask their team to do
```

One sentence per part. Three sentences total — no more. The **Stakes** sentence is the most commonly missed. Stating a metric is not an insight. Explaining what that metric means for how the business will perform — that is.

| Signal only (incomplete) | Signal + Stakes + Move (complete) |
|---|---|
| "51% of users return each month." | "51% of users return each month — retention at this level means the AI deployment is past the trial phase and into habit formation. The priority now shifts from rollout to deepening use in the teams that are already coming back." |
| "Finance has a 34% habitual rate." | "Finance reaches 34% habitual use — three times the org average — which means the conditions for deep AI adoption already exist inside this business. Replicating what Finance did costs far less than building a new enablement programme from scratch." |

### Acknowledge what is working — by name

When an organisation, team, or cohort is outperforming, name them explicitly. Do not average them away.

- Name the org: "UK leads agent adoption at 84% — more than double the next org"
- Say what it signals: "That gap is not random — it reflects a deliberate approach to agent onboarding"
- Make it replicable: "The question for every other org is what UK did differently, and whether it can be exported"

Celebrating internal leaders gives the executive a concrete proof point to share with their leadership team. It also makes the insight memorable — a named org sticks in a way that "the top quartile" does not.

### Frame gaps as the size of the prize

Never frame a shortfall as a failure. Frame it as a quantified opportunity.

| Failure framing (remove) | Prize framing (use) |
|---|---|
| "79% of users barely use AI." | "Converting 30% of the 8,000 users at 6–10 active days to habitual use would double the organisation's habitual base — without licensing a single new user." |
| "12,421 licenses are idle." | "12,421 inactive licenses represent the fastest path to growth — these are already-funded seats where demand hasn't been activated yet." |
| "Agent adoption is only 8.5%." | "8.5% agent adoption with 85% return rate means the users who do engage are keeping agents in their workflow. The opportunity is to bring the other 91.5% to the same starting point." |

The size of the prize should be calculable from the data in the report. Use the customer's own numbers as the benchmark — best org vs average, current state vs achievable state.

### Plain language

The executive reading this report should be able to retell the key finding in their next leadership meeting without notes.

**Use active voice:**
- "Finance leads at 34%" — not "A 34% habitual rate is observed in Finance"
- "UK doubled the adoption rate" — not "The adoption rate in UK is 2x higher"

**Lead with the number:**
- "8,072 users are one nudge from habitual" — not "There is a cohort of users who are close to habitual use"

**One idea per sentence.** If a sentence has more than one "and", split it.

**Plain words over jargon:**

| Avoid | Use instead |
|---|---|
| Leverage | Use |
| Synergies | Combined benefit |
| Operationalise | Put into practice |
| Cohort | Group / team / the [X] users |
| Habitual (first use) | Using AI 11 or more days a month |
| Enablement | Training / support / onboarding |

**Pull quotes** should be the one sentence the executive would repeat at their next board or leadership meeting. It must be a statement of fact, not a question. It must be provably true from the data and interesting enough to be worth repeating.

---

## 5. Licensed vs Unlicensed Cohort Differences

When the data contains both licensed and unlicensed cohorts, **always check for material differences and call them out explicitly**. Material means a gap that changes the business decision — not a reporting footnote.

### What to compare
- **Engagement depth**: prompts/user, sessions/user, active days/user — if licensed users are 2x+ more active, that is the proof point for licence ROI
- **Habitual rate**: if licensed habitual rate is more than 10pp above unlicensed, that is a headline finding, not a footnote
- **Agent usage**: if agents are heavily concentrated in the licensed cohort, state it — unlicensed users rarely access agents, which quantifies the capability gap
- **Org-level mix**: the unlicensed:licensed ratio per division tells you where the conversion priority is — a 1.8x ratio in Support means more than half the division is without full access

### How to frame it
Do not bury the cohort comparison in parentheses or a subordinate clause. Lead with it when it is material:
> "Licensed users generate 71.8 prompts per user vs 22.8 for unlicensed — a 3.2x gap that is the business case for every licence decision in this report."

The licensed/unlicensed gap should appear at least once in each of: the exec summary, the Reach section, and the Value section.

---

## 6. Recommendations

Produce exactly **4 recommendations**. Each must target one of three levers: **Reach** (more users accessing the platform), **Adoption** (existing users going deeper or more habitual), or **Agent usage** (more users on agents, or agents going deeper).

### Selection criteria — highest ROI first
Rank recommendations by: **cohort size × expected uplift**. Name the cohort, quantify the uplift, and state which lever it pulls.

**ROI signals to look for:**
- Large unlicensed cohorts with high activity → Reach lever (licence conversion delivers the engagement uplift immediately, no adoption risk)
- Divisions with habitual rate below company average but large user base → Adoption lever
- Divisions with agent adoption significantly below company average, with natural workflow fit → Agent lever
- Material agents (≥10 users AND ≥5% of agent cohort) with high depth but limited reach → Agent lever (expand, not showcase)

### Format — each recommendation must have all four:

1. **Action verb** — Convert, Expand, Target, Launch, Pilot, Consolidate
2. **Named cohort or division** with the key metric that justifies the priority
3. **Expected outcome** quantified from the data (e.g. "+X agent users", "+Y habitual users", "3.2x engagement uplift")
4. **Lever** — state explicitly whether this is a Reach, Adoption, or Agent usage play

| Weak | Strong |
|---|---|
| "Improve agent adoption" | "Expand Researcher agent to Legal's 218 licensed users — Legal sits at 2.6% agent adoption vs 4.3% company average; natural research workflows make it the highest-fit target. Target: 5% agent adoption (≈12 new agent users) by end of quarter." |
| "Convert unlicensed users" | "Convert Operations' top 150 unlicensed users — 325 unlicensed active users, 952 weekly sessions, 1.6x ratio. At 3.2x engagement uplift, this is the highest total-volume licence ROI in the portfolio." |

---

## 7. Equitable Access Principle

**Never recommend restricting, reallocating, or removing access from any user or group.** Recommendations must always expand access, not redistribute it at someone else's expense.

### What this means in practice

- **Do not suggest revoking licenses** from low-activity users to fund new ones. Low activity is a signal to investigate and address — not a justification for removal.
- **Do not suggest moving licenses** from one division to another. Every division deserves AI access on its own merits.
- **Do not frame any cohort as "not ready" for AI** in a way that implies access should be withheld. Readiness is built through enablement, not gatekeeping.
- **Always lean toward expanding the licensed base**, not optimising within a fixed envelope.

### Frame unlicensed users as underserved, not as non-priority

> "2,585 unlicensed users are already active — they have demonstrated demand without the full toolset. The question is when to extend access, not whether."

The unlicensed cohort represents unmet potential, not users who have been correctly categorised. Recommendations involving them should always move toward greater access.

### Inactive licenses are a deployment problem, not a reallocation opportunity

| Do not say | Say instead |
|---|---|
| "Reallocate the 342 idle licenses to higher-demand orgs" | "342 licenses are inactive — investigate the barrier in those teams and activate them" |
| "Remove licenses from users with fewer than 5 active days" | "Users at 1–5 active days are the earliest-stage cohort — targeted onboarding, not licence removal, is the move" |

---

## 8. Materiality Test

**Before naming any agent or organisation as a model, example, or leading cohort, it must pass the materiality test.**

An agent or org may show extreme depth metrics (high sessions/user, high retention) but represent too few users to be a replicable signal. Showcasing such outliers misleads the executive and undermines credibility.

### Agent materiality
An agent qualifies as a model only when **both** conditions are met:
1. **Absolute**: ≥ 10 users (configurable in `schema/ff_schema_v4.json → materiality_thresholds.agents.min_users_absolute`)
2. **Relative**: agent's users ≥ 5% of the total agent user cohort (configurable in `min_users_share_pct`)

If an agent fails materiality, do **not** call it out as a model or replicable best practice. Instead, frame it as a **proof-of-concept** or **early signal** — it shows the workflow value, not yet the scale:
> "Analyst agent leads at 292 sessions/user, though with 6 active users it remains a proof-of-concept — worth watching if it scales to 20+ users."

### Org materiality
An org qualifies as a model only when its user count is ≥ 3% of total active users (configurable in `min_users_share_pct`). If the org is too small, cite it as an early signal, not a benchmark for company-wide replication.

### High depth ≠ replicable model
| Do not say | Say instead |
|---|---|
| "Analyst agent is the standout agent — 292 sessions/user shows the power of purpose-built tools" | "Analyst agent shows extreme depth (292 sess/user, 6 users) — early proof of concept; promote once it reaches broader adoption" |
| "Follow Finance's approach — it's the model for the company" | "Finance shows the strongest habit rate at 22% — with 470 users it's large enough to be studied as a replication playbook" |

---

## 9. Output Integrity

- **"Contoso" must never appear in any report output** — replace with the real customer name before generating; a report containing "Contoso" is not ready to share under any circumstances
- Pattern (Foundation / Expansion / Frontier) must be derived from scoring — never asserted without basis in the metric tiers
- All 34 AI insight blocks must be populated, or explicitly marked with the reason they cannot be
- No unresolved `{{placeholders}}` in the final HTML
- No figures, names, or organisations from sample data carried into a different customer's output

---

## 10. Self-Audit Checklist

Before accepting any report as complete:

- [ ] Every number traces to a named field in the data JSON
- [ ] No segment mixing — Licensed, Unlicensed Chat, and Agent figures are kept separate
- [ ] Every insight answers "So what?" — finding + implication + action
- [ ] Every headline is anchored to evidence (a number, trend, or named pattern)
- [ ] Tone is opportunity-framed throughout — no failure or critical language
- [ ] All 34 insight blocks populated (or explicitly skipped with reason stated)
- [ ] Every insight answers Signal + Stakes + Why it matters to the business
- [ ] Outperforming orgs or cohorts are named explicitly, not averaged away
- [ ] Gaps are framed as a quantified prize, not a failure
- [ ] "Contoso" is absent from all output — no exceptions
- [ ] All recommendations name a cohort, state an outcome, and trace to a metric
- [ ] No `undefined` / `NaN` / `Infinity` / unresolved `{{placeholder}}` in output
- [ ] Pattern classification matches scoring bands — not overridden without a data basis
- [ ] No verdict statements — every closing line traces to a number, trend, or named cohort in the data
- [ ] No generic prescriptions — every recommendation names a specific cohort, metric, or pattern from this customer's data
- [ ] No unverified time period qualifiers — "weekly", "monthly", "daily" only appear when confirmed by the field definition or PBIX measure name
- [ ] Licensed vs unlicensed cohort differences are explicitly called out where material (engagement gap ≥ 2x, habit gap ≥ 10pp, agent concentration)
- [ ] Exactly 4 recommendations, each targeting Reach / Adoption / Agent usage with named cohort, quantified uplift, and ROI justification
- [ ] No recommendation restricts, reallocates, or removes access from any user or group — all recommendations expand or deepen access
- [ ] Every agent or org cited as a model passes the materiality test (≥10 users AND ≥5% of agent cohort for agents; ≥3% of total active users for orgs) — outliers are framed as proof-of-concept, not replicable models
