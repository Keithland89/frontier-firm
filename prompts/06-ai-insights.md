# Prompt 06: AI Insights (Optional)

## Purpose
Generate AI-powered narrative insights for the report. This is optional — the generator has template-based fallbacks.

## Three Options

### Option A: Pre-generate insights and add to data file (recommended)

Use Claude or Copilot to generate the insights, then add them to the data file under `_ai_insights`.

### Option B: Claude API (automatic)

Set `ANTHROPIC_API_KEY` environment variable and run the generator without `--no-ai`. The generator calls the Claude API directly.

### Option C: Template fallback

Run with `--no-ai`. The generator produces data-driven template text (functional but less polished).

## Insight Keys

The report requires these insight blocks (all stored under `_ai_insights` in the data file):

```json
{
  "_ai_insights": {
    "EXEC_SUMMARY_GOOD": "What's working well (2-3 sentences)",
    "EXEC_SUMMARY_GAP": "Key gap or risk (2-3 sentences)",
    "EXEC_SUMMARY_OPP": "Biggest opportunity (2-3 sentences)",
    "INSIGHT_REACH": "Reach signal narrative (3-4 sentences)",
    "INSIGHT_HABIT": "Habit signal narrative (3-4 sentences)",
    "INSIGHT_SKILL": "Skill signal narrative (3-4 sentences)",
    "TITLE_REACH": "Short reach headline (5-8 words)",
    "TITLE_HABIT": "Short habit headline (5-8 words)",
    "TITLE_SKILL": "Short skill headline (5-8 words)",
    "TITLE_VALUE": "Short value headline (5-8 words)",
    "SUBTITLE_REACH": "One-line reach summary",
    "SUBTITLE_HABIT": "One-line habit summary",
    "SUBTITLE_SKILL": "One-line skill summary",
    "SUBTITLE_VALUE": "One-line value summary",
    "SPOTLIGHT_HABIT": "Habit deep-dive paragraph",
    "SPOTLIGHT_MATURITY": "Maturity assessment paragraph",
    "PULLQUOTE_0": "Executive pull quote",
    "PULLQUOTE_1": "Reach pull quote",
    "PULLQUOTE_2": "Habit pull quote",
    "PULLQUOTE_3": "Skill pull quote",
    "PULLQUOTE_4": "Value pull quote",
    "PULLQUOTE_5": "Closing pull quote",
    "REC_1_TITLE": "Recommendation 1 title",
    "REC_1_DESC": "Recommendation 1 description (2-3 sentences)",
    "REC_2_TITLE": "Recommendation 2 title",
    "REC_2_DESC": "Recommendation 2 description",
    "REC_3_TITLE": "Recommendation 3 title",
    "REC_3_DESC": "Recommendation 3 description",
    "REC_4_TITLE": "Recommendation 4 title",
    "REC_4_DESC": "Recommendation 4 description"
  }
}
```

## Quality Rules for Insights

- **Simple language** — no jargon, written for a non-technical executive
- **Every claim backed by a specific number** from the data
- **Each insight answers "so what?"** — not just stating a metric
- **Recommendations are specific** — name cohorts, orgs, targets, timelines
- **No generic insights** — every sentence should be grounded in this customer's data
- **"Habitual" = 11+ active days/month** — never say "daily" unless 20+ days
- **No contradictions** between sections

## Prompt for Generating Insights

```
You are writing executive-level narrative for a Frontier Firm Assessment report.

The customer is {customer_name}. Their maturity pattern is {pattern_name}.

Key data:
- {total_active_users} total users, {licensed_users} licensed, {chat_users} unlicensed chat
- License activation: {m365_enablement}%
- Habitual rate (11+ days): {m365_frequency}% licensed, {chat_habit}% unlicensed
- Agent adoption: {agent_adoption}%, {agent_users} users
- Retention: {m365_retention}% month-over-month
- App breadth: {m365_breadth} surfaces/user
- Engagement premium: {license_priority}x (licensed vs unlicensed)

Write all insight blocks listed above. Follow the quality rules strictly.
Keep language simple and direct. Lead with the most important finding.
```
