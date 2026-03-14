#!/usr/bin/env node
/**
 * Frontier Firm — Insight Generation Request Builder
 *
 * Usage:
 *   node generate-insights.js --data data/customer.json
 *
 * This script does NOT call an API. Instead it:
 * 1. Loads the customer data JSON
 * 2. Checks if _ai_insights already exists with all 30 keys
 * 3. If complete: exits 0 (insights already done)
 * 4. If missing/incomplete: generates temp/insights_request.json and exits 2
 *    (signal to the AI tool: "read the request, generate insights, save, re-run")
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dataPath = args.find((a, i) => args[i - 1] === '--data');

if (!dataPath) {
  console.error('Usage: node generate-insights.js --data <data.json>');
  process.exit(1);
}

const absDataPath = path.resolve(dataPath);
const data = JSON.parse(fs.readFileSync(absDataPath, 'utf8'));

// All 34 required insight keys
const REQUIRED_KEYS = [
  'EXEC_SUMMARY_GOOD', 'EXEC_SUMMARY_GAP', 'EXEC_SUMMARY_OPP',
  'INSIGHT_REACH', 'INSIGHT_HABIT', 'INSIGHT_SKILL',
  'TITLE_REACH', 'TITLE_HABIT', 'TITLE_SKILL', 'TITLE_VALUE',
  'SUBTITLE_REACH', 'SUBTITLE_HABIT', 'SUBTITLE_SKILL', 'SUBTITLE_VALUE',
  'SPOTLIGHT_HABIT', 'SPOTLIGHT_MATURITY',
  'PULLQUOTE_0', 'PULLQUOTE_1', 'PULLQUOTE_2', 'PULLQUOTE_3', 'PULLQUOTE_4', 'PULLQUOTE_5',
  'REC_1_TITLE', 'REC_1_DESC', 'REC_2_TITLE', 'REC_2_DESC',
  'REC_3_TITLE', 'REC_3_DESC', 'REC_4_TITLE', 'REC_4_DESC',
  // Maturity narrative — replaces all hardcoded per-pattern strings
  'CULTURE_HEADLINE', 'CULTURE_DESC', 'CULTURE_RED_FLAG', 'CULTURE_ACTION'
];

console.log('\n=== Insight Generation Check ===');
console.log('Customer: ' + data.customer_name);

// Check if _ai_insights exists and is complete
const insights = data._ai_insights;
if (insights) {
  const present = REQUIRED_KEYS.filter(k => insights[k] && insights[k].length > 0);
  const missing = REQUIRED_KEYS.filter(k => !insights[k] || insights[k].length === 0);

  if (missing.length === 0) {
    console.log('All ' + REQUIRED_KEYS.length + ' insight keys present and non-empty.');
    console.log('\nINSIGHTS READY\n');
    process.exit(0);
  }

  console.log(present.length + '/' + REQUIRED_KEYS.length + ' keys present.');
  console.log('Missing: ' + missing.join(', '));
}

// Generate the request file
console.log('\nGenerating insight request...');

// Derive a lightweight pattern profile for context
const _pn = f => typeof data[f] === 'number' ? data[f] : 0;
const p1Present = _pn('m365_enablement') >= 10;
const p2Present = _pn('agent_adoption') >= 5;
const p3Present = _pn('multi_user_agents') >= 5 || _pn('agent_habitual_rate') >= 5;
const p1Mature  = (_pn('band_11_15_pct') + _pn('band_16_plus_pct')) >= 30;
const p2Mature  = _pn('agent_health') >= 40;
const p3Mature  = (Array.isArray(data.org_scatter_data) ? data.org_scatter_data.filter(o => (o.y || 0) >= 5).length : 0) >= 3;
const patternContext = {
  p1: !p1Present ? 'Absent' : p1Mature ? 'Primary' : 'Nascent',
  p2: !p2Present ? 'Absent' : p2Mature ? 'Primary' : 'Nascent',
  p3: !p3Present ? 'Absent' : p3Mature ? 'Primary' : 'Nascent',
  dominant: p3Present ? 'P3' : p2Present ? 'P2' : p1Present ? 'P1' : 'Pre-P1',
  key_thresholds: {
    m365_enablement_pct: _pn('m365_enablement'),
    habitual_pct: _pn('band_11_15_pct') + _pn('band_16_plus_pct'),
    nudge_cohort_users: _pn('band_6_10'),
    agent_adoption_pct: _pn('agent_adoption'),
    agent_return_rate_pct: _pn('agent_health'),
    multi_user_agents: _pn('multi_user_agents'),
    total_agents: _pn('total_agents'),
    inactive_licenses: _pn('inactive_licenses')
  }
};

const request = {
  customer_name: data.customer_name,
  data_file: absDataPath,
  pattern_context: patternContext,
  key_metrics: {
    total_active_users: data.total_active_users,
    licensed_users: data.licensed_users,
    chat_users: data.chat_users,
    agent_users: data.agent_users,
    m365_enablement: data.m365_enablement,
    m365_adoption: data.m365_adoption,
    license_priority: data.license_priority,
    m365_frequency: data.m365_frequency,
    chat_habit: data.chat_habit,
    agent_adoption: data.agent_adoption,
    agent_enablement: data.agent_enablement,
    m365_retention: data.m365_retention,
    chat_retention: data.chat_retention,
    agent_retention: data.agent_retention,
    m365_breadth: data.m365_breadth,
    agent_breadth: data.agent_breadth,
    complex_sessions: data.complex_sessions,
    agent_health: data.agent_health,
    licensed_avg_prompts: data.licensed_avg_prompts,
    unlicensed_avg_prompts: data.unlicensed_avg_prompts,
    org_count: data.org_count,
    total_agents: data.total_agents,
    license_coverage: data.license_coverage
  },
  required_keys: REQUIRED_KEYS.map(k => ({
    key: k,
    description: getKeyDescription(k),
    current_value: insights && insights[k] ? '[present]' : '[MISSING]'
  })),
  quality_rules: [
    'AUDIENCE: A Business Decision Maker who will read this once and needs to be able to retell the key finding in their next leadership meeting without notes.',
    'THREE-PART FRAME: Every insight = Signal (what the data shows, with a number) + Stakes (why this matters to the business, not just to the metric) + Move (what the decision-maker should ask their team to do). Missing the Stakes is the most common failure.',
    'ACKNOWLEDGE LEADERS: When one org or cohort outperforms, name them explicitly — do not average them away. State what they achieved, why it matters, and what others can replicate.',
    'SIZE THE PRIZE: Frame gaps as quantified opportunities. "Converting 30% of the 8,072 users at 6–10 active days would double the habitual base" — not "habitual adoption is low".',
    'PLAIN LANGUAGE: Active voice. Lead with the number. One idea per sentence. Use simple words — "use" not "leverage", "group" not "cohort", spell out "habitual (11+ days a month)" on first use.',
    'Every claim backed by a specific number from this customer\'s data — no estimated or interpolated values.',
    'No verdict statements — aphoristic closing lines ("X isn\'t Y — it\'s Z", analogies) are forbidden. Close every paragraph on a number or a named cohort.',
    'No generic prescriptions — if the recommendation could appear in any AI strategy deck without modification, rewrite it with a specific org, metric, or count from this data.',
    'No external benchmarks — do not cite MIT, Gartner, McKinsey, or any source not in the input data. Use internal benchmarks: best org vs average, current state vs achievable state.',
    'No contradictions between sections — check that numbers cited in different blocks are consistent.',
    'MATERIALITY TEST: Before naming any agent or org as a model or example, verify it passes materiality. Agents: must have ≥10 users AND ≥5% of the total agent user cohort. Orgs: must represent ≥3% of total active users. An agent with very high sessions/user but only 1–5 users is a proof-of-concept — frame it as an early signal ("X shows the potential, not yet the scale"), never as a replicable model or standout success.',
    'TIME PERIOD PRECISION: Only state a time period (weekly, monthly, daily) for a metric if it is confirmed by the field name in the data JSON or the PBIX measure definition. If uncertain, omit the time period entirely — write "median sessions" not "median weekly sessions". A wrong time qualifier is worse than none.',
    'LICENSED vs UNLICENSED COHORT: Always check for material differences between licensed and unlicensed populations. If the licensed engagement rate is 2x+ higher, or the licensed habitual rate is 10pp+ above unlicensed, call it out explicitly as a headline finding — not a footnote. The gap is the business case for licence expansion. It must appear in the exec summary, Reach section, and Value section at minimum.',
    'RECOMMENDATIONS: Produce exactly 4 recommendations. Each must target one lever — Reach (more users licensed), Adoption (existing users more habitual), or Agent usage (more users on agents). Rank by ROI = cohort size × expected uplift. Large unlicensed cohorts with high activity are highest ROI for Reach. Divisions with agent adoption significantly below company average and natural workflow fit are highest ROI for Agent usage. Every recommendation must name the specific division/cohort, state the key metric justifying the choice, and quantify the expected outcome.'
  ],
  instructions: 'Generate the _ai_insights object with all 34 keys. Merge into ' + absDataPath + ' and save. Then re-run the pipeline.'
};

const tempDir = path.resolve(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
const requestPath = path.join(tempDir, 'insights_request.json');
fs.writeFileSync(requestPath, JSON.stringify(request, null, 2));

console.log('Request written to: ' + requestPath);
console.log('\nINSIGHT GENERATION NEEDED');
process.exit(2);

function getKeyDescription(key) {
  const descriptions = {
    EXEC_SUMMARY_GOOD: 'What is working well — lead with the strongest metric, name the org or cohort achieving it, then say why it matters to the business. 2 sentences max.',
    EXEC_SUMMARY_GAP: 'The most important gap — frame it as a quantified opportunity, not a failure. State the size of the prize: what becomes possible if this gap closes. 2 sentences max.',
    EXEC_SUMMARY_OPP: 'The single highest-leverage action — name the specific cohort, org, or metric, state the expected outcome in measurable terms. 2 sentences max.',
    INSIGHT_REACH: 'Signal + Stakes + Move for Reach. One sentence each. The Stakes sentence must answer: what does this activation level mean for the business? Name the best-performing org if one stands out. 3 sentences max.',
    INSIGHT_HABIT: 'Signal + Stakes + Move for Habit. Name the most important cohort (e.g. the 6-10 day group). State what converting them is worth in concrete numbers. 3 sentences max.',
    INSIGHT_SKILL: 'Signal + Stakes + Move for Skill. If one agent or surface stands out for stickiness, name it. 3 sentences max.',
    TITLE_REACH: 'Insight-driven headline: [specific number or trend] — [implication]. e.g. "75% of licences active across 14 orgs — deployed but not yet embedded". 8-12 words.',
    TITLE_HABIT: 'Insight-driven headline anchored to a number. e.g. "51% return each month — the question is whether they are building a routine". 8-12 words.',
    TITLE_SKILL: 'Insight-driven headline anchored to a number. e.g. "2.3 apps per user out of 27 available — the depth question is still open". 8-12 words.',
    TITLE_VALUE: 'Insight-driven headline anchored to a number or contrast. e.g. "12,421 idle licences, 18,991 unlicensed users showing demand — the maths is clear". 8-12 words.',
    SUBTITLE_REACH: 'One sentence that advances the story from the headline — adds the "so what" or the "therefore". Not a restatement of the title.',
    SUBTITLE_HABIT: 'One sentence that advances the story — the business implication of the habit data.',
    SUBTITLE_SKILL: 'One sentence that advances the story — the business implication of the skill/breadth data.',
    SUBTITLE_VALUE: 'One sentence that advances the story — what the value data means for investment decisions.',
    SPOTLIGHT_HABIT: 'The single biggest habit conversion opportunity. Name the cohort, size it, quantify what conversion means (e.g. "if 30% cross to 11+ days, the habitual base doubles from X to Y"). State the specific intervention. 3 sentences max.',
    SPOTLIGHT_MATURITY: 'What it takes to move to the next pattern — grounded in this customer\'s specific metrics. Name the gap and the one move that would close it. 2-3 sentences max.',
    PULLQUOTE_0: 'The single sentence the executive would repeat in their next leadership meeting. A statement of fact from the data — not a question, not an analogy, not a generic observation. Must be interesting enough to repeat and provably true.',
    PULLQUOTE_1: 'Bridge from Reach to Habit — the natural question the reach data raises. One sentence.',
    PULLQUOTE_2: 'Bridge from Habit to Skill — the natural question the habit data raises. One sentence.',
    PULLQUOTE_3: 'Bridge from Skill to Value — the natural question the skill data raises. One sentence.',
    PULLQUOTE_4: 'Bridge from Value to Maturity — one sentence connecting the value signal to the pattern classification.',
    PULLQUOTE_5: 'Bridge from Maturity to Actions — sets up the recommendations. One sentence.',
    REC_1_TITLE: 'Action verb + named cohort or org + expected outcome. e.g. "Convert the 8,072 users at 6–10 active days to habitual before scaling licences". 8-12 words.',
    REC_1_DESC: 'Name the cohort, state the size of the prize, give the specific intervention and measurable target. 2 sentences max.',
    REC_2_TITLE: 'Action verb + named cohort or org + expected outcome. 8-12 words.',
    REC_2_DESC: 'Name the org or metric, state the opportunity, give the specific next move and measurable target. 2 sentences max.',
    REC_3_TITLE: 'Action verb + named cohort or org + expected outcome. 8-12 words.',
    REC_3_DESC: 'Name the org or metric, state the opportunity, give the specific next move and measurable target. 2 sentences max.',
    REC_4_TITLE: 'Action verb + named cohort or org + expected outcome. 8-12 words.',
    REC_4_DESC: 'Name the org or metric, state the opportunity, give the specific next move and measurable target. 2 sentences max.',
    CULTURE_HEADLINE: 'One sentence with a metric. e.g. "8,072 users at 6–10 active days — the foundation is built, habit is the next gate". No generic phrases.',
    CULTURE_DESC: '2 sentences: where they are strong and where the gap is. Actual metrics only — no external benchmarks.',
    CULTURE_RED_FLAG: 'One sentence: the specific risk, the metric, and the business consequence. Opportunity-framed, not failure language.',
    CULTURE_ACTION: 'One sentence: the highest-leverage move, the specific cohort or count, and the measurable target.'
  };
  return descriptions[key] || key;
}
