#!/usr/bin/env node
/**
 * Frontier Firm Report Generator
 *
 * Usage:
 *   node generate-report.js --data customer_data.json --output ./reports/
 *   node generate-report.js --data customer_data.json --output ./reports/ --no-ai
 *
 * Reads a customer data JSON, calculates signal scores and pattern,
 * generates AI-powered insight text (via Claude API), and populates
 * the HTML template to produce a complete Frontier Firm report.
 *
 * Works with: Claude Code CLI, GitHub Copilot Chat, or standalone.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================
const useV3 = process.argv.includes('--v3');
const useSlides = process.argv.includes('--slides');
const templateFile = useSlides ? 'ff_template_v3_slides.html' : (useV3 ? 'ff_template_v3.html' : 'ff_template.html');
const TEMPLATE_PATH = path.resolve(__dirname, '..', 'template', templateFile);
const SCHEMA_PATH = path.resolve(__dirname, '..', 'schema', 'ff_schema.json');

// Parse CLI args
const args = process.argv.slice(2);
const dataArg = args.find((a, i) => args[i - 1] === '--data') || path.resolve(__dirname, '..', 'data', 'sample_contoso.json');
const outputArg = args.find((a, i) => args[i - 1] === '--output') || path.resolve(__dirname, '..', 'output');
const noAI = args.includes('--no-ai');
const brandArg = args.find((a, i) => args[i - 1] === '--brand');
const apiKey = process.env.ANTHROPIC_API_KEY || '';

// ============================================================
// LOAD FILES
// ============================================================
console.log('Loading template...');

// Load brand file if provided
let brand = null;
if (brandArg) {
  try {
    brand = JSON.parse(fs.readFileSync(path.resolve(brandArg), 'utf8'));
    console.log('Brand loaded:', brand.colors.primary, '/', brand.colors.accent, 'from', brand.url);
  } catch (e) {
    console.warn('Could not load brand file:', e.message);
  }
}

let template;
try {
  template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
} catch (e) {
  // Try relative path
  const altPath = path.resolve(__dirname, 'ff_template.html');
  try {
    template = fs.readFileSync(altPath, 'utf8');
  } catch (e2) {
    console.error('Cannot find ff_template.html. Place it in the same directory or set TEMPLATE_PATH.');
    process.exit(1);
  }
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const schemaV2Path = path.resolve(__dirname, '..', 'schema', 'ff_schema_v2.json');
const schemaV2 = fs.existsSync(schemaV2Path) ? JSON.parse(fs.readFileSync(schemaV2Path, 'utf8')) : null;
const schemaV4Path = path.resolve(__dirname, '..', 'schema', 'ff_schema_v4.json');
const schemaV4 = fs.existsSync(schemaV4Path) ? JSON.parse(fs.readFileSync(schemaV4Path, 'utf8')) : null;
const data = JSON.parse(fs.readFileSync(path.resolve(dataArg), 'utf8'));
console.log(`Loaded data for: ${data.customer_name}`);

// ============================================================
// DERIVED DATA FIELDS
// ============================================================
// Top-level numeric-safe accessor (for derived fields computed before populateTemplate)
const _n = (field, fallback) => typeof data[field] === 'number' ? data[field] : (fallback !== undefined ? fallback : 0);

// License coverage: % of total active users that have a license
if (!data.license_coverage) {
  data.license_coverage = _n('total_active_users') > 0
    ? Math.round(_n('licensed_users') / Math.max(_n('total_active_users'), 1) * 1000) / 10
    : 0;
}
// Agent habitual rate: % of agent users with 11+ active days
if (!data.agent_habitual) {
  data.agent_habitual = (data.agent_band_11_15_pct || 0) + (data.agent_band_16_plus_pct || 0);
}
// 3-month average retention — more robust than single-month
const perTierRet = data._supplementary_metrics && data._supplementary_metrics.per_tier_retention;
if (perTierRet && perTierRet.length >= 3) {
  const last3 = perTierRet.slice(-3);
  if (!data.m365_retention_3mo_avg) data.m365_retention_3mo_avg = Math.round(last3.reduce(function(s,c){return s+c.licensed_retention_pct},0)/3*10)/10;
  if (!data.chat_retention_3mo_avg) data.chat_retention_3mo_avg = Math.round(last3.reduce(function(s,c){return s+c.unlicensed_retention_pct},0)/3*10)/10;
  if (!data.agent_retention_3mo_avg) data.agent_retention_3mo_avg = Math.round(last3.reduce(function(s,c){return s+c.agent_retention_pct},0)/3*10)/10;
}

// ============================================================
// SCORE METRICS
// ============================================================
function scoreTier(value, bands) {
  if (value >= bands[2]) return 'Frontier';
  if (value >= bands[1]) return 'Expansion';
  return 'Foundation';
}

function scoreSignal(signalName) {
  const signal = schema.signals[signalName];
  const tiers = signal.metrics.map(metricId => {
    const metric = schema.metrics[metricId];
    if (!metric.bands) return null; // unscored
    const rawValue = data[metricId];
    if (rawValue === undefined) return null;
    // Normalise: if value is a percentage stored as 75.4, convert to 0.754
    const val = rawValue > 1 && metric.unit.includes('%') ? rawValue / 100 : rawValue;
    return scoreTier(val, metric.bands);
  }).filter(Boolean);

  const frontierCount = tiers.filter(t => t === 'Frontier').length;
  const expansionCount = tiers.filter(t => t === 'Expansion').length;

  if (frontierCount >= 1 && (frontierCount + expansionCount) >= Math.ceil(tiers.length / 2)) return 'Frontier';
  if ((frontierCount + expansionCount) >= Math.ceil(tiers.length / 2)) return 'Expansion';
  return 'Foundation';
}

// Compute signal tiers — use data file overrides if provided, otherwise score algorithmically
const signalTiers = {
  reach: data.reach_tier || scoreSignal('reach'),
  habit: data.habit_tier || scoreSignal('habit'),
  skill: data.skill_tier || scoreSignal('skill'),
  value: data.value_tier || scoreSignal('value'),
};
// Signals excluded from pattern scoring
const patternSignals = Object.keys(schema.signals).filter(s => !schema.signals[s].exclude_from_pattern);

console.log('Signal tiers:', signalTiers);
if (data.reach_tier || data.habit_tier || data.skill_tier || data.value_tier) {
  console.log('(Using data file tier overrides where provided)');
}

// Determine pattern
function determinePattern(tiers, includeSignals) {
  const vals = includeSignals ? includeSignals.map(s => tiers[s]) : Object.values(tiers);
  const frontierCount = vals.filter(t => t === 'Frontier').length;
  const expansionCount = vals.filter(t => t === 'Expansion').length;

  if (frontierCount >= 1 && (frontierCount + expansionCount) >= 3) return { number: 3, name: 'Frontier' };
  if ((frontierCount + expansionCount) >= 1) return { number: 2, name: 'Expansion' };
  return { number: 1, name: 'Foundation' };
}

// Use data file pattern override if provided, otherwise compute
const pattern = data.pattern && data.pattern_name
  ? { number: data.pattern, name: data.pattern_name }
  : determinePattern(signalTiers, patternSignals);
console.log(`Pattern: ${pattern.number} (${pattern.name})`);
if (data.pattern && data.pattern_name) console.log('(Using data file pattern override)');

// Gauge widths (0-100 scale) — use data file overrides if provided
const gaugeMap = { 'Foundation': 30, 'Expansion': 65, 'Frontier': 90 };
const gauges = {
  reach: data.reach_gauge || gaugeMap[signalTiers.reach],
  habit: data.habit_gauge || gaugeMap[signalTiers.habit],
  skill: data.skill_gauge || gaugeMap[signalTiers.skill],
  value: data.value_gauge || gaugeMap[signalTiers.value],
};

// ============================================================
// V2 SCORING — 11 metrics, 3 signals, no Value
// ============================================================
function scoreTierV2(value, bands) {
  if (value >= bands[1]) return 'Frontier';
  if (value >= bands[0]) return 'Expansion';
  return 'Foundation';
}

let metricTiersV2 = {};
let signalTiersV2 = {};
let patternV2 = null;

if (schemaV2) {
  // Score each v2 metric
  for (const [metricId, mDef] of Object.entries(schemaV2.metrics)) {
    const rawVal = data[mDef.data_field];
    if (typeof rawVal !== 'number') { metricTiersV2[metricId] = 'Foundation'; continue; }
    metricTiersV2[metricId] = scoreTierV2(rawVal, mDef.bands);
  }

  // Score v2 signals
  function scoreSignalV2(signalName) {
    const signal = schemaV2.signals[signalName];
    const tiers = signal.metrics.map(function(m) { return metricTiersV2[m] || 'Foundation'; });
    const n = tiers.length;
    const frontierCount = tiers.filter(function(t) { return t === 'Frontier'; }).length;
    const foundationCount = tiers.filter(function(t) { return t === 'Foundation'; }).length;
    const atExpansionPlus = n - foundationCount;
    if (frontierCount >= Math.ceil(n / 2) && foundationCount === 0) return 'Frontier';
    if (atExpansionPlus > n / 2 && foundationCount <= 1) return 'Expansion';
    return 'Foundation';
  }

  signalTiersV2 = {
    reach: scoreSignalV2('reach'),
    habit: scoreSignalV2('habit'),
    skill: scoreSignalV2('skill')
  };

  // V2 pattern
  var v2Tiers = Object.values(signalTiersV2);
  var v2Foundation = v2Tiers.filter(function(t) { return t === 'Foundation'; }).length;
  var v2Frontier = v2Tiers.filter(function(t) { return t === 'Frontier'; }).length;
  if (v2Foundation > 0) patternV2 = { number: 1, name: 'Foundation' };
  else if (v2Frontier >= 2) patternV2 = { number: 3, name: 'Frontier' };
  else patternV2 = { number: 2, name: 'Expansion' };

  console.log('V2 Signal tiers:', signalTiersV2);
  console.log('V2 Pattern:', patternV2.number, '(' + patternV2.name + ')');

  // USE V2 SCORING as the actual pattern/signal tiers for the report
  signalTiers.reach = signalTiersV2.reach;
  signalTiers.habit = signalTiersV2.habit;
  signalTiers.skill = signalTiersV2.skill;
  pattern.number = patternV2.number;
  pattern.name = patternV2.name;
  // Recalculate gauge widths with v2 tiers
  const gaugeMapV2 = { 'Foundation': 30, 'Expansion': 65, 'Frontier': 90 };
  gauges.reach = gaugeMapV2[signalTiers.reach];
  gauges.habit = gaugeMapV2[signalTiers.habit];
  gauges.skill = gaugeMapV2[signalTiers.skill];
  console.log('Using V2 scoring for report output');
}

// ============================================================
// V4 TWO LANES SCORING
// ============================================================
let v4Tiers = {};
let v4PillarTiers = {};
let v4LaneTiers = {};

if (schemaV4) {
  // Score each metric
  for (const [id, m] of Object.entries(schemaV4.metrics)) {
    const val = data[m.data_field];
    if (typeof val !== 'number') { v4Tiers[id] = 'P1'; continue; }
    v4Tiers[id] = val >= m.bands[1] ? 'P3' : val >= m.bands[0] ? 'P2' : 'P1';
  }

  // Score each pillar per lane (weakest metric = pillar tier)
  for (const lane of Object.keys(schemaV4.lanes)) {
    v4PillarTiers[lane] = {};
    for (const pillar of Object.keys(schemaV4.pillars)) {
      const metrics = Object.entries(schemaV4.metrics)
        .filter(([_, m]) => m.lane === lane && m.pillar === pillar);
      const tiers = metrics.map(([id]) => v4Tiers[id]);
      if (tiers.includes('P1')) v4PillarTiers[lane][pillar] = 'P1';
      else if (tiers.includes('P2')) v4PillarTiers[lane][pillar] = 'P2';
      else v4PillarTiers[lane][pillar] = tiers.length > 0 ? 'P3' : 'P1';
    }
  }

  // Lane tier = weakest pillar
  for (const lane of Object.keys(schemaV4.lanes)) {
    const pillars = Object.values(v4PillarTiers[lane]);
    if (pillars.includes('P1')) v4LaneTiers[lane] = 'P1';
    else if (pillars.includes('P2')) v4LaneTiers[lane] = 'P2';
    else v4LaneTiers[lane] = 'P3';
  }

  // Overall pattern = weaker lane
  const v4Lanes = Object.values(v4LaneTiers);
  if (v4Lanes.includes('P1')) { pattern.number = 1; pattern.name = 'Foundation'; }
  else if (v4Lanes.every(t => t === 'P3')) { pattern.number = 3; pattern.name = 'Frontier'; }
  else { pattern.number = 2; pattern.name = 'Expansion'; }

  // Recalculate gauges
  const gMap = { 'P1': 30, 'P2': 65, 'P3': 90 };
  if (v4PillarTiers.copilot) {
    gauges.reach = gMap[v4PillarTiers.copilot.reach || 'P1'];
    gauges.habit = gMap[v4PillarTiers.copilot.consistency || 'P1'];
    gauges.skill = gMap[v4PillarTiers.copilot.skill || 'P1'];
  }
  // Use lane tiers for signal display
  signalTiers.reach = v4LaneTiers.copilot || 'P1';
  signalTiers.habit = v4LaneTiers.agents || 'P1';
  signalTiers.skill = v4PillarTiers.agents ? v4PillarTiers.agents.skill || 'P1' : 'P1';

  console.log('V4 Metric tiers:', v4Tiers);
  console.log('V4 Pillar tiers:', v4PillarTiers);
  console.log('V4 Lane tiers:', v4LaneTiers);
  console.log('V4 Pattern:', pattern.number, '(' + pattern.name + ')');
}

// ============================================================
// PATTERN PROFILE — P1/P2/P3 gateway classification
// From PPTX: Absent / Nascent / Primary per pattern
// ============================================================
const patternProfile = { p1: 'Absent', p2: 'Absent', p3: 'Absent' };

// P1: Human with Assistant
// Presence: ≥10% licensed users with ≥1 active day (≈ m365_enablement ≥ 10%)
// Maturity: ≥30% in Frequent/Daily tier (≥11 active days) → licensed_band_11_15_pct + licensed_band_16_plus_pct ≥ 30
const p1PresenceVal = _n('m365_enablement', 0);
const p1MaturityVal = _n('licensed_band_11_15_pct', 0) + _n('licensed_band_16_plus_pct', 0);
if (p1PresenceVal >= 10) {
  patternProfile.p1 = p1MaturityVal >= 30 ? 'Primary' : 'Nascent';
}

// P2: Human-Agent Teams
// Presence: ≥5% of users with agent sessions (≈ agent_adoption ≥ 5%)
// Maturity: agent return rate ≥ 40% (≈ agent_health ≥ 40)
const p2PresenceVal = _n('agent_adoption', 0);
const p2MaturityVal = _n('agent_health', 0);
if (p2PresenceVal >= 5) {
  patternProfile.p2 = p2MaturityVal >= 40 ? 'Primary' : 'Nascent';
}

// P3: Human-Led, Agent-Operated
// Presence: ≥5 active agents in portfolio OR ≥5% users in daily agent tier
// Maturity: agents across ≥3 distinct business functions (use org_count with agents as proxy)
const p3PresenceAgents = _n('multi_user_agents', 0) >= 5 || (_n('agent_habitual_rate', 0) >= 5);
const p3MaturityVal = (Array.isArray(data.org_scatter_data) ? data.org_scatter_data.filter(function(o) { return (o.y || 0) >= 5; }).length : 0) >= 3;
if (p3PresenceAgents) {
  patternProfile.p3 = p3MaturityVal ? 'Primary' : 'Nascent';
}

// Determine dominant pattern label
const profileStatusOrder = { 'Absent': 0, 'Nascent': 1, 'Primary': 2 };
let dominantPatternLabel = 'P1';
if (profileStatusOrder[patternProfile.p2] > profileStatusOrder[patternProfile.p1]) dominantPatternLabel = 'P2';
if (profileStatusOrder[patternProfile.p3] > profileStatusOrder[patternProfile.p2] && profileStatusOrder[patternProfile.p3] > profileStatusOrder[patternProfile.p1]) dominantPatternLabel = 'P3';

// Build human-readable profile string: "Foundation primary  ·  Expansion nascent  ·  Frontier absent"
const patternLabels = { p1: 'Foundation', p2: 'Expansion', p3: 'Frontier' };
const profileParts = [];
['p1', 'p2', 'p3'].forEach(function(p) {
  const label = patternLabels[p];
  const status = patternProfile[p];
  if (status === 'Primary') profileParts.push(label + ' primary');
  else if (status === 'Nascent') profileParts.push(label + ' nascent');
  else profileParts.push(label + ' absent');
});
const patternProfileString = profileParts.join('  ·  ');

console.log('Pattern Profile:', patternProfileString);
console.log('  P1 gateway:', p1PresenceVal + '% enablement,', p1MaturityVal + '% habitual → ' + patternProfile.p1);
console.log('  P2 gateway:', p2PresenceVal + '% agent adoption,', p2MaturityVal + '% return rate → ' + patternProfile.p2);
console.log('  P3 gateway:', _n('multi_user_agents', 0) + ' multi-user agents,', (p3MaturityVal ? '3+' : '<3') + ' functions → ' + patternProfile.p3);

// ============================================================
// NARRATIVE ENGINE — data-driven storytelling using P1/P2/P3 patterns
// Determines headline, description, risk signal, and recommended action
// ============================================================
let cultureStage, cultureStageNum, cultureDesc, cultureRedFlag, cultureAction, cultureHeadline;
const activeUserPct = _n('m365_enablement', 0);
const habitualPct = _n('licensed_band_11_15_pct', 0) + _n('licensed_band_16_plus_pct', 0);
const agentAdoptPct = _n('agent_adoption', 0);
const breadthVal = _n('m365_breadth', 0);

// Determine dominant pattern narrative from P1/P2/P3 profile
if (patternProfile.p3 === 'Primary') {
  cultureStage = 'Frontier Primary'; cultureStageNum = 4;
  cultureHeadline = 'Agents are running real work \u2014 the question is governance';
  cultureDesc = 'This organisation has crossed the agent inflection point. Human-agent teams are active across multiple functions \u2014 agents don\u2019t just assist, they execute. Employees are becoming "agent bosses," orchestrating outcomes by directing autonomous agents. The question is no longer "should we use AI?" \u2014 it\u2019s "why isn\u2019t AI handling this?"';
  cultureRedFlag = 'The risk is over-automation without oversight. Agents running substantial workflows need review cadences, escalation protocols, and governance frameworks. Speed without judgment isn\u2019t maturity \u2014 it\u2019s risk.';
  cultureAction = 'Structure teams as human-agent units with clear roles. Build continuous feedback loops between humans and agents. Embed AI competency in hiring and governance.';
} else if (patternProfile.p2 === 'Primary' || (patternProfile.p2 === 'Nascent' && patternProfile.p1 === 'Primary')) {
  cultureStage = 'Foundation\u2192Expansion Transition'; cultureStageNum = 3;
  cultureHeadline = 'AI is landing \u2014 but it hasn\u2019t changed how people work yet';
  cultureDesc = 'People are using Copilot as a personal assistant \u2014 drafting, summarising, researching. Some teams are starting to delegate to agents. But for most of the organisation, AI is still something people reach for when they remember, not something they depend on. The question is shifting from "AI helps me do my job" to "we work differently because of AI" \u2014 but most haven\u2019t made that jump yet.';
  cultureRedFlag = 'This is the hardest transition on the maturity ladder. AI assistants require you to learn a tool. AI agents require something fundamentally different: trusting a colleague. Most organisations haven\u2019t built the norms for that \u2014 when to delegate, how to review, what "good enough" looks like from a machine.';
  cultureAction = 'Redesign workflows around human-AI collaboration. Establish agent trust norms \u2014 delegation playbooks, review cadences, shared handoff protocols. Gartner recommends at least 30% of AI budget goes to change management. Most organisations spend less than 5%.';
} else if (patternProfile.p1 === 'Primary' || patternProfile.p1 === 'Nascent') {
  cultureStage = 'Foundation Dominant'; cultureStageNum = 2;
  cultureHeadline = 'Copilot is deployed \u2014 but the culture hasn\u2019t shifted yet';
  cultureDesc = 'Champions have emerged \u2014 a group of enthusiasts who use Copilot intensively and see real value. But adoption is siloed. The superusers make the averages look healthier than reality, while the silent majority haven\u2019t found their entry point. Microsoft data shows 78% of employees bring their own AI tools to work \u2014 the demand is there, but the organisation hasn\u2019t channelled it into shared ways of working.';
  cultureRedFlag = 'The adoption paradox: usage goes up, but organisational capability stays flat. The tools are deployed, the dashboards show growing activity \u2014 and yet the organisation isn\u2019t fundamentally working any differently. If the top 10% of users account for 60%+ of activity, you\u2019re not scaling \u2014 you\u2019re dependent on a handful of enthusiasts.';
  cultureAction = 'Find and empower your champions. Fund quick wins that show value in real workflows. Build peer-to-peer sharing \u2014 the knowledge that lives in superusers needs to get out to everyone else. Make AI use visible through manager modeling and team rituals.';
} else {
  cultureStage = 'Pre-Foundation'; cultureStageNum = 1;
  cultureHeadline = 'AI is talked about, but not yet part of how people work';
  cultureDesc = 'Leadership mentions AI in strategy decks. A few pilots exist, usually tucked away in IT or an innovation team. Employees bounce between excitement and anxiety. AI is someone else\u2019s project \u2014 not yet part of the daily rhythm of how work gets done.';
  cultureRedFlag = 'MIT\u2019s 2025 research found that 95% of AI pilots never make it past the pilot stage. S&P Global reported that 42% of companies scrapped most of their AI initiatives in 2025, up from 17% a year earlier. The danger isn\u2019t being early \u2014 it\u2019s not knowing you\u2019re stuck.';
  cultureAction = 'Leaders must use AI visibly themselves. Share what worked, what surprised you, what flopped. Create psychological safety \u2014 frame AI as augmentation, not replacement. Give people explicit permission to experiment.';
}

console.log('Narrative:', cultureStage, '(' + cultureStageNum + '/4)');
console.log('  Headline:', cultureHeadline);
console.log('  Signals: ' + activeUserPct + '% active, ' + habitualPct + '% habitual, ' + agentAdoptPct + '% agent adoption, ' + breadthVal + ' apps/user');

// ============================================================
// CALCULATE DERIVED METRICS
// ============================================================
const timeSavedRealised = Math.round(_n('licensed_users') * _n('licensed_avg_prompts') * 6 / 60 * 12 / 1000);
const timeSavedUnrealised = Math.round(_n('inactive_licenses') * _n('licensed_avg_prompts') * 6 / 60 * 12 / 1000);
const activationRate = (_n('licensed_users') / Math.max(_n('total_licensed_seats'), 1) * 100).toFixed(1);

console.log(`Time saved: ~${timeSavedRealised}K hrs/yr realised, ~${timeSavedUnrealised}K hrs/yr unrealised`);

// ============================================================
// AI INSIGHT GENERATION
// ============================================================
async function generateInsights(data, signalTiers, pattern) {
  // Use pre-generated AI insights from data file if available
  if (data._ai_insights && Object.keys(data._ai_insights).length > 0) {
    console.log('Using pre-generated AI insights from data file (' + Object.keys(data._ai_insights).length + ' keys)');
    // Merge with template fallbacks for any missing keys
    const fallbacks = generateTemplateInsights(data, signalTiers, pattern);
    return Object.assign({}, fallbacks, data._ai_insights);
  }

  if (noAI || !apiKey) {
    console.log(noAI ? 'AI mode disabled (--no-ai)' : 'No ANTHROPIC_API_KEY set, using template mode');
    return generateTemplateInsights(data, signalTiers, pattern);
  }

  console.log('Generating AI insights via Claude API...');

  const prompt = `You are writing the narrative text blocks for a Frontier Firm Assessment report for "${data.customer_name}".

The report assesses AI maturity across 4 signals: Reach, Habit, Skill, Value.
Current assessment: Pattern ${pattern.number} (${pattern.name}).

Signal scores:
- Reach: ${signalTiers.reach} (${data.m365_enablement}% license activation, ${data.org_count} orgs, ${data.m365_adoption}% regular users)
- Habit: ${signalTiers.habit} (${data.m365_retention}% MoM retention, ${data.m365_frequency}% habitual, ${data.chat_habit}% chat habit)
- Skill: ${signalTiers.skill} (${data.m365_breadth} apps/user, ${data.agent_breadth} agents/user, ${data.complex_sessions} avg prompts/session)
- Value: ${signalTiers.value} (${data.license_priority}x engagement premium, ~${timeSavedRealised}K hrs/yr saved)

Key data points:
- ${typeof data.total_active_users === 'number' ? data.total_active_users.toLocaleString() : 'N/A'} total active users, ${typeof data.licensed_users === 'number' ? data.licensed_users.toLocaleString() : 'N/A'} licensed
- ${typeof data.inactive_licenses === 'number' ? data.inactive_licenses.toLocaleString() : 'N/A'} inactive licenses
- ${typeof data.chat_users === 'number' ? data.chat_users.toLocaleString() : 'N/A'} unlicensed Chat users (organic demand)
- Active day distribution: ${typeof data.band_1_5 === 'number' ? data.band_1_5.toLocaleString() : 'N/A'} (1-5 days), ${typeof data.band_6_10 === 'number' ? data.band_6_10.toLocaleString() : 'N/A'} (6-10), ${typeof data.band_11_15 === 'number' ? data.band_11_15.toLocaleString() : 'N/A'} (11-15), ${data.band_16_plus || 'N/A'} (16+)
- ${data.total_agents || 'N/A'} total agents, ${data.multi_user_agents || 'N/A'} multi-user
- Agent creators: ~${data.agent_creators_pct}% of users

Generate the following JSON object with narrative text blocks. Each should be 1-3 sentences, written for a non-technical executive. Use specific numbers. Be direct and insight-driven — not generic.

{
  "EXEC_SUMMARY_GOOD": "The good news headline + 2-sentence description",
  "EXEC_SUMMARY_GAP": "The gap headline + 2-sentence description",
  "EXEC_SUMMARY_OPP": "The opportunity headline + 2-sentence description",
  "INSIGHT_REACH": "So-what callout for the Reach section (what does the reach data mean?)",
  "INSIGHT_HABIT": "So-what callout for the Habit section",
  "INSIGHT_SKILL": "So-what callout for the Skill section",
  "SPOTLIGHT_HABIT": "The single biggest conversion opportunity in the habit data",
  "SPOTLIGHT_MATURITY": "What it takes to move from Pattern ${pattern.number} to Pattern ${pattern.number + 1}",
  "PULLQUOTE_0": "Opening quote summarising the overall story (10-15 words)",
  "PULLQUOTE_1": "Bridge from Reach to Habit (question format)",
  "PULLQUOTE_2": "Bridge from Habit to Skill (question format)",
  "PULLQUOTE_3": "Bridge from Skill to Value (question format)",
  "PULLQUOTE_4": "Bridge from Value to Maturity",
  "PULLQUOTE_5": "Bridge from Maturity to Actions",
  "REC_1_TITLE": "Recommendation 1 title (tied to weakest signal)",
  "REC_1_DESC": "Recommendation 1 description (2-3 sentences with specific targets)",
  "REC_2_TITLE": "Recommendation 2 title",
  "REC_2_DESC": "Recommendation 2 description",
  "REC_3_TITLE": "Recommendation 3 title",
  "REC_3_DESC": "Recommendation 3 description",
  "REC_4_TITLE": "Recommendation 4 title",
  "REC_4_DESC": "Recommendation 4 description",
  "TITLE_REACH": "Section title for Reach (complete sentence, ~10 words)",
  "TITLE_HABIT": "Section title for Habit",
  "TITLE_SKILL": "Section title for Skill",
  "TITLE_VALUE": "Section title for Value",
  "TITLE_MATURITY": "Pattern X: Name",
  "SUBTITLE_REACH": "One sentence subtitle for Reach section",
  "SUBTITLE_HABIT": "One sentence subtitle for Habit section",
  "SUBTITLE_SKILL": "One sentence subtitle for Skill section",
  "SUBTITLE_VALUE": "One sentence subtitle for Value section",
  "SUBTITLE_MATURITY": "One sentence about current pattern status",
  "INSIGHT_HABIT": "So-what callout for Habit (with HTML strong tags for emphasis)",
  "SPOTLIGHT_AGENTS": "The agent paradox insight (2 sentences with HTML strong tags)"
}

Return ONLY the JSON object, no markdown code fences.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', response.status, err);
      console.log('Falling back to template mode...');
      return generateTemplateInsights(data, signalTiers, pattern);
    }

    const result = await response.json();
    const text = result.content[0].text.trim();
    const insights = JSON.parse(text);
    console.log('AI insights generated successfully');
    return insights;
  } catch (e) {
    console.error('AI generation failed:', e.message);
    console.log('Falling back to template mode...');
    return generateTemplateInsights(data, signalTiers, pattern);
  }
}

// ============================================================
// TEMPLATE FALLBACK INSIGHTS
// ============================================================
function generateTemplateInsights(data, signalTiers, pattern) {
  // Guard: ensure numeric fields used in template text don't produce NaN
  const safe = (v, fallback) => typeof v === 'number' && isFinite(v) ? v : fallback;
  // Patch data with safe defaults for template text generation
  const d = Object.assign({}, data);
  d.m365_enablement = safe(d.m365_enablement, 0);
  d.m365_adoption = safe(d.m365_adoption, 0);
  d.m365_frequency = safe(d.m365_frequency, 0);
  d.m365_retention = safe(d.m365_retention, 0);
  d.m365_breadth = safe(d.m365_breadth, 0);
  d.complex_sessions = safe(d.complex_sessions, 0);
  d.inactive_licenses = safe(d.inactive_licenses, 0);
  d.band_1_5_pct = safe(d.band_1_5_pct, 0);
  d.band_6_10 = safe(d.band_6_10, 0);
  d.total_licensed_seats = safe(d.total_licensed_seats, 1);
  // Auto-default fields that older PBIX templates may not have
  if (d.org_penetration_pct === undefined) d.org_penetration_pct = 'not_available';
  if (d.embedded_user_rate === undefined) d.embedded_user_rate = 'not_available';
  if (d.licensed_avg_days === undefined) d.licensed_avg_days = 'not_available';
  if (d.unlicensed_avg_days === undefined) d.unlicensed_avg_days = 'not_available';
  // Agent adoption: derive if missing
  if ((d.agent_adoption === 'not_available' || d.agent_adoption === undefined) && typeof d.agent_users === 'number' && typeof d.total_active_users === 'number' && d.total_active_users > 0) {
    d.agent_adoption = Math.round(d.agent_users / d.total_active_users * 1000) / 10;
  }
  // Agent habitual rate: field name alias (some extractions use agent_habitual, schema expects agent_habitual_rate)
  if ((d.agent_habitual_rate === undefined || d.agent_habitual_rate === 'not_available') && typeof d.agent_habitual === 'number') {
    d.agent_habitual_rate = d.agent_habitual >= 1 ? d.agent_habitual : Math.round(d.agent_habitual * 1000) / 10;
  }
  if (d.agent_habitual_rate === undefined) d.agent_habitual_rate = 'not_available';
  // Concentration index: compute from org_scatter_data if not already set
  if ((d.concentration_index === undefined || d.concentration_index === 'not_available') && Array.isArray(d.org_scatter_data) && d.org_scatter_data.length >= 2) {
    var usages = d.org_scatter_data.map(function(o) { return o.x || 0; }).sort(function(a, b) { return a - b; });
    var median = usages[Math.floor(usages.length / 2)];
    d.concentration_index = Math.round(usages.filter(function(u) { return u >= median; }).length / usages.length * 100);
  }
  // Agent retention: leave as not_available if no agent-specific data — NEVER proxy from m365_retention (different population)
  if (d.agent_retention === undefined) d.agent_retention = 'not_available';
  // Agent health = agent return rate (same concept, same population) — derive from agent_retention if extracted
  if ((d.agent_health === undefined || d.agent_health === 'not_available') && typeof d.agent_retention === 'number') {
    d.agent_health = d.agent_retention;
  }
  if (d.agent_health === undefined) d.agent_health = 'not_available';
  // Licensed band percentages: derive from per-tier band data (Licensed tier, latest month)
  // NEVER copy from band_*_pct — those are Chat (unlicensed) population bands
  if (d.licensed_band_1_5_pct === undefined) {
    var perTierBands = d._supplementary_metrics && d._supplementary_metrics.per_tier_active_day_bands;
    if (Array.isArray(perTierBands) && perTierBands.length > 0) {
      // Find the latest month's Licensed tier entry
      var licensedBands = perTierBands.filter(function(b) { return b.tier === 'Licensed'; });
      if (licensedBands.length > 0) {
        var latest = licensedBands[licensedBands.length - 1]; // sorted by month in extraction
        d.licensed_band_1_5_pct = latest.band_1_5_pct;
        d.licensed_band_6_10_pct = latest.band_6_10_pct;
        d.licensed_band_11_15_pct = latest.band_11_15_pct;
        d.licensed_band_16_plus_pct = latest.band_16_plus_pct;
      }
    }
    // If still missing, mark as not_available — do NOT copy from Chat bands
    if (d.licensed_band_1_5_pct === undefined) {
      d.licensed_band_1_5_pct = 'not_available';
      d.licensed_band_6_10_pct = 'not_available';
      d.licensed_band_11_15_pct = 'not_available';
      d.licensed_band_16_plus_pct = 'not_available';
    }
  }
  data = d;
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : n;

  return {
    EXEC_SUMMARY_GOOD: `<strong>${fmt(data.total_active_users)} people</strong> have used AI across ${data.org_count} organisations. ${fmt(data.licensed_users)} hold M365 Copilot licenses, and ${Math.round(safe(data.m365_enablement, 0))}% are actively used. Month-over-month, ${data.m365_retention}% of users come back. The deployment has landed. The technology is there. But tracking AI actions without measuring whether the culture is shifting is like tracking gym attendance without checking whether anyone\u2019s getting fitter.`,
    EXEC_SUMMARY_GAP: `Here\u2019s the adoption paradox: usage goes up, but organisational capability stays flat. <strong>Only ${data.m365_frequency}% of licensed users have built a genuine daily habit.</strong> Most stick to ${data.m365_breadth} apps out of 27 available. ${data.band_1_5_pct}% engage fewer than 6 days a month \u2014 they\u2019re trying it, not relying on it. ${cultureRedFlag}`,
    EXEC_SUMMARY_OPP: `The path forward is clear: <strong>${cultureAction}</strong> There are ${fmt(data.band_6_10)} users in the 6\u201310 active day bracket who are one nudge from habitual \u2014 engaged enough to see the value, not yet embedded enough to depend on it. Meanwhile, ${fmt(data.inactive_licenses)} licenses sit completely idle, representing spend that could be redirected to orgs where demand is already proven.`,
    INSIGHT_REACH: `<strong>${Math.round(data.m365_enablement)}% of licenses are active</strong> \u2014 which sounds like progress. But a Frontier Firm isn\u2019t one where AI is available \u2014 it\u2019s one where AI is spreading equitably across every team and function. MIT\u2019s 2025 research found 95% of AI pilots never scale. The ${fmt(data.inactive_licenses)} idle licenses and the concentration gap between top and bottom organisations show this isn\u2019t a deployment problem anymore \u2014 it\u2019s a reach problem. The organisations already at P2 and P3 prove the model works; the P1 orgs need the same enabling conditions.`,
    INSIGHT_HABIT: `<strong>Retention is ${data.m365_retention > 85 ? 'world-class' : 'healthy'} at ${data.m365_retention}%</strong> \u2014 people are coming back. But on the Frontier Firm journey, coming back isn\u2019t enough. The difference between a P1 organisation and a P2 organisation isn\u2019t technology \u2014 it\u2019s habit depth. Habitual use (11+ active days) sits at just ${data.m365_frequency}%. Frontier Firms show 71% of employees thriving vs 39% globally \u2014 and that gap maps directly to whether AI has become embedded in daily working rhythms or remains something people reach for occasionally.`,
    INSIGHT_SKILL: `<strong>Most users stick to ${data.m365_breadth} apps out of 27 available surfaces.</strong> ${patternProfile.p2 === 'Absent' || patternProfile.p2 === 'Nascent' ? 'This is the P1 pattern: AI is a better search bar, a faster first draft, a smarter autocomplete. Users stay in control the whole time. Moving to P2 \u2014 human-agent teams \u2014 requires a fundamentally different relationship: trusting AI to take on tasks, not just answer questions.' : 'The P2 transition is underway \u2014 people are starting to delegate to agents. But the jump from "AI helps me" to "we work differently because of AI" is where most organisations stall. That shift requires new norms: when to delegate, how to review agent output, what good enough looks like from a machine colleague.'}`,
    SPOTLIGHT_HABIT: `<strong>${fmt(data.band_6_10)} users are in the 6\u201310 active day bracket</strong> \u2014 the most important cohort in the entire dataset. They\u2019ve found enough value to keep coming back, but they haven\u2019t crossed the threshold from "I use it sometimes" to "I can\u2019t work without it." If 30% of this group convert to 11+ active days, the habitual user base nearly doubles. The intervention isn\u2019t more training \u2014 it\u2019s peer benchmarks, manager modeling, and use-case nudges that make AI the default rather than the alternative.`,
    SPOTLIGHT_MATURITY: `<strong>${cultureHeadline}.</strong> ${cultureDesc} Microsoft\u2019s Frontier Firm research is clear: organisations that reach P3 see 3x higher ROI from AI, and 71% of their employees say their company is thriving \u2014 compared with just 39% globally. The difference isn\u2019t better technology or more licenses. It\u2019s that their leaders changed how the organisation actually works \u2014 redesigning workflows, building trust norms for human-agent collaboration, and measuring whether the culture shifted, not just whether the tools were used. The highest-leverage move right now: <em>${cultureAction}</em>`,
    PULLQUOTE_0: `${fmt(data.total_active_users)} users deployed. The technology has landed. The question now is whether working norms are shifting to match.`,
    PULLQUOTE_1: `Scale is won. But are people actually coming back?`,
    PULLQUOTE_2: `They\u2019re coming back \u2014 but what are they doing with it?`,
    PULLQUOTE_3: `Now the question becomes: is all this effort worth it?`,
    PULLQUOTE_4: `${fmt(data.inactive_licenses)} idle licenses. ${fmt(data.chat_users)} unlicensed users showing demand. The maths speaks for itself.`,
    PULLQUOTE_5: `Dominant Pattern: ${pattern.name}. Here\u2019s what it takes to move up.`,
    REC_1_TITLE: `Build the habit: convert ${fmt(data.band_6_10)} users from trying to depending`,
    REC_1_DESC: `The ${fmt(data.band_6_10)} users in the 6\u201310 active day bracket are the most important cohort in the data. They\u2019ve found enough value to keep coming back but haven\u2019t crossed the threshold to daily dependence. The intervention isn\u2019t more training \u2014 it\u2019s peer benchmarks that show what good looks like, manager modeling that makes AI use visible, and use-case nudges tied to their actual workflows. If 30% convert to 11+ active days, the habitual user base nearly doubles.`,
    REC_2_TITLE: `Break the ${data.m365_breadth}-app loop: redesign workflows around AI`,
    REC_2_DESC: `Most users are stuck in a narrow pattern \u2014 ${data.m365_breadth} apps out of 27 available. This isn\u2019t a feature awareness problem; it\u2019s a workflow design problem. Gartner recommends allocating at least 30% of AI budget to change management, yet most organisations spend less than 5%. Identify the 3-4 highest-value workflows per function, redesign them with AI embedded, and surface the top multi-user agents through a curated catalogue that makes discovery effortless.`,
    REC_3_TITLE: `Redirect ${fmt(data.inactive_licenses)} idle licenses to proven demand`,
    REC_3_DESC: `${(safe(data.total_licensed_seats, 1) > 0 ? ((safe(data.inactive_licenses, 0) / safe(data.total_licensed_seats, 1)) * 100).toFixed(0) : '0')}% of licenses show zero activity across the entire analysis period \u2014 that\u2019s real spend with zero return. Meanwhile, ${fmt(data.chat_users)} unlicensed users are already using Copilot Chat on their own \u2014 organic demand that doesn\u2019t need convincing, just licensing. Segment inactive licenses by function, match them against the orgs with highest unlicensed-to-licensed ratios, and reallocate.`,
    TITLE_REACH: Math.round(safe(data.m365_enablement, 0)) + '% of licenses are active. But is AI actually spreading?',
    TITLE_HABIT: data.m365_retention + '% come back each month. But is it becoming a habit?',
    TITLE_SKILL: data.m365_breadth + ' apps per user, ' + safe(data.agent_adoption, 0) + '% agent adoption. Are they going deep?',
    TITLE_VALUE: fmt(data.inactive_licenses || 0) + ' idle licenses, ' + fmt(data.chat_users || 0) + ' users showing demand',
    TITLE_MATURITY: cultureHeadline,
    SUBTITLE_REACH: 'Copilot is deployed across ' + data.org_count + ' organisations with ' + fmt(data.total_licensed_seats) + ' seats. The technology has landed. But ' + (safe(data.total_licensed_seats, 1) > 0 ? ((safe(data.inactive_licenses, 0) / safe(data.total_licensed_seats, 1)) * 100).toFixed(0) : '0') + '% of licenses are gathering dust, and the gap between "deployed" and "embedded" is where most organisations get stuck.',
    SUBTITLE_HABIT: 'People are coming back \u2014 that\u2019s the good news. The harder question is whether they\u2019re building real routines or just checking in. The difference between monthly visitors and daily dependence is the culture shift that separates AI leaders from the rest.',
    SUBTITLE_SKILL: 'This is where the data reveals what dashboards usually miss. It\u2019s not enough to use AI \u2014 the question is whether people are using it in ways that actually change how they work. Breadth across surfaces, depth of multi-turn engagement, and the emergence of agent-based workflows all point to the same thing: how sophisticated is the relationship with AI becoming?',
    SUBTITLE_VALUE: 'The numbers above tell a capability story. This section translates it into pounds, hours, and priorities \u2014 the language that unlocks executive action.',
    SUBTITLE_MATURITY: cultureDesc,
    INSIGHT_HABIT: '<strong>Retention is ' + (data.m365_retention > 85 ? 'world-class' : 'healthy') + ' at ' + data.m365_retention + '%</strong> \u2014 but habitual use (11+ days) is only ' + data.m365_frequency + '%. The gap between coming back and building routine is the conversion opportunity.',
    SPOTLIGHT_AGENTS: '<strong>' + (typeof data.total_agents === 'number' && data.total_agents > 0 ? Math.round(((data.total_agents - (safe(data.multi_user_agents, 0))) / data.total_agents) * 100) : 83) + '% of agents have exactly one user</strong> \u2014 their creator. But the ' + fmt(safe(data.multi_user_agents, 0)) + ' that broke through are the real signal. Purpose-built agents achieve higher stickiness than generic first-party agents.',
        REC_4_TITLE: `Prepare for the agent inflection point`,
    REC_4_DESC: `The jump from P1 (human with assistant) to P2 (human-agent teams) is the hardest transition on the maturity ladder. AI assistants require you to learn a tool. AI agents require something fundamentally different: trusting a colleague. That means establishing delegation norms, building review cadences, and defining what "good enough" looks like from an agent \u2014 before scaling deployment. The ${fmt(safe(data.multi_user_agents, 0))} multi-user agents already in the portfolio are proof the model works. The task now is building the cultural infrastructure to scale it.`,
    // Org-specific insights (generic fallbacks — override in data JSON or AI mode)
    INSIGHT_REACH_TIER: data.licensed_users > data.chat_users
      ? 'Licensed users <strong>outnumber</strong> unlicensed Chat — a sign of strong deployment. But the ' + fmt(data.chat_users) + ' unlicensed users represent latent demand.'
      : '<strong>' + fmt(data.chat_users) + ' unlicensed Chat users dwarf the ' + fmt(data.licensed_users) + ' licensed base</strong> — organic demand is massive. Converting even 10% would transform the engagement profile.',
    ORG_INTENSITY_HEADLINE: 'The same tools, very different outcomes across ' + data.org_count + ' organisations',
    ORG_INTENSITY_BODY: 'This is one of the most telling patterns in the data. Every organisation has the same technology. The difference is culture \u2014 management modeling, peer sharing, and workflow integration vary enormously. The top-quartile organisations show 2-3x the engagement of the bottom, and that gap isn\u2019t closing on its own.',
    ORG_SCATTER_HEADLINE: 'Pockets of maturity exist \u2014 the question is whether they can be replicated',
    ORG_INTENSITY_COMPARISON: 'The top organisations aren\u2019t just using AI more \u2014 they\u2019re using it differently. Study what the leaders do that the laggards don\u2019t, and make that the playbook.',
    ORG_AGENT_INSIGHT: '<strong>Agent adoption tells the real story of cultural readiness.</strong> Leading orgs show ' + (safe(data.agent_adoption, 0) * 2) + '% adoption \u2014 double the tenant average of ' + safe(data.agent_adoption, 0) + '%. These aren\u2019t just early adopters; they\u2019re the organisations where the culture has shifted enough to trust AI as a colleague, not just a tool. They\u2019re your proof of concept for the rest of the business.',
    GEO_PATTERN_INSIGHT: '<strong>Top organisations lead on both licensed intensity and agent adoption</strong>, while the bottom quartile averages below the engagement threshold. Targeted enablement for lagging organisations would lift the overall habit score.',
    AGENT_HABIT_SIGNAL: 'Agent users average <strong>' + (data.agent_frequency || 'low') + ' sessions/user/week</strong> — below the habitual threshold. The gap between interest and routine is the conversion opportunity. See the <a href="#proficiency" style="color:#8477FB;text-decoration:underline">Skill Set</a> section for agent portfolio depth analysis.',
    ORG_DEPTH_INSIGHT: '<strong>Leading organisations show strongest agent adoption and session depth</strong> — suggesting pockets where human-agent collaboration is genuinely embedded. By contrast, large orgs with high M365 Copilot volume but narrow agent breadth indicate Pattern 1 dominance.',
    VALUE_LICENSING_INSIGHT: '<strong>' + fmt(data.chat_users) + ' unlicensed Chat users</strong> represent proven organic demand. Markets with the highest unlicensed-to-licensed ratios are high-potential licensing targets where demand is already strong.',
  };
}

// ============================================================
// POPULATE TEMPLATE
// ============================================================

function computeMetricTiers(data, schema) {
  const result = {};
  const mapping = {
    ENABLEMENT: { metric: 'm365_enablement', signal: 'reach' },
    LIC_COVERAGE: { metric: 'license_coverage', signal: 'reach' },
    ADOPTION: { metric: 'm365_adoption', signal: 'reach' },
    AGENT_ADOPT: { metric: 'agent_adoption', signal: 'reach' },
    AGENT_ENABLE: { metric: 'agent_enablement', signal: 'reach' },
    ORG_BREADTH: { metric: 'org_count', signal: 'reach' },
    FREQUENCY: { metric: 'm365_frequency', signal: 'habit' },
    AGENT_HABIT: { metric: 'agent_habitual', signal: 'habit' },
    RETENTION_3MO: { metric: 'm365_retention_3mo_avg', signal: 'habit' },
    BREADTH: { metric: 'm365_breadth', signal: 'skill' },
    COMPLEX: { metric: 'complex_sessions', signal: 'skill' },
    AGENT_HLTH: { metric: 'agent_health', signal: 'skill' },
  };
  for (const [tag, info] of Object.entries(mapping)) {
    const metricDef = schema.metrics[info.metric];
    if (!metricDef || !metricDef.bands) { result[tag] = { tier: 'Foundation' }; continue; }
    const rawValue = data[info.metric];
    if (rawValue === undefined || rawValue === null) { result[tag] = { tier: 'Foundation' }; continue; }
    const val = rawValue > 1 && metricDef.unit && metricDef.unit.includes('%') ? rawValue / 100 : rawValue;
    if (val >= metricDef.bands[2]) result[tag] = { tier: 'Frontier' };
    else if (val >= metricDef.bands[1]) result[tag] = { tier: 'Expansion' };
    else result[tag] = { tier: 'Foundation' };
  }
  return result;
}

// ============================================================
// BUILD MINI_THRESHOLDS — data-driven for metric card bars
// ============================================================
function buildMiniThresholds(data, schema) {
  const colors = ['#007fff','#007fff','#8477FB','#0D9488'];
  const metrics = {
    M365_ENABLEMENT: { field: 'm365_enablement', pct: true },
    LICENSE_COVERAGE: { field: 'license_coverage', pct: true },
    M365_ADOPTION: { field: 'm365_adoption', pct: true },
    AGENT_ADOPTION: { field: 'agent_adoption', pct: true },
    AGENT_ENABLEMENT: { field: 'agent_enablement', pct: true },
    CROSS_ORG_BREADTH: { field: 'org_count', pct: false },
    LICENSE_PRIORITISATION: { field: 'license_priority', pct: false },
    M365_INTENSITY: { field: 'm365_intensity', pct: false },
    M365_FREQUENCY: { field: 'm365_frequency', pct: true },
    M365_RETENTION: { field: 'm365_retention', pct: true },
    M365_RETENTION_3MO: { field: 'm365_retention_3mo_avg', pct: true },
    CHAT_INTENSITY: { field: 'chat_intensity', pct: false },
    CHAT_HABIT: { field: 'chat_habit', pct: true },
    AGENT_INTENSITY: { field: 'agent_intensity', pct: false },
    AGENT_HABITUAL: { field: 'agent_habitual', pct: true },
    AGENT_FREQUENCY: { field: 'agent_frequency', pct: false },
    M365_BREADTH: { field: 'm365_breadth', pct: false },
    AGENT_BREADTH: { field: 'agent_breadth', pct: false },
    AGENT_HEALTH: { field: 'agent_health', pct: true },
    COMPLEX_SESSIONS: { field: 'complex_sessions', pct: false },
  };

  const result = {};
  for (const [key, info] of Object.entries(metrics)) {
    const metricDef = schema.metrics[info.field];
    let rawVal = data[info.field];
    if (rawVal === undefined || rawVal === null) continue;
    const val = info.pct && rawVal > 1 ? rawVal / 100 : rawVal;
    const bands = metricDef && metricDef.bands ? metricDef.bands : [0.2, 0.5, 0.8];
    const entry = { val: val, bands: bands, colors: colors };
    // Add max for non-percentage metrics
    if (!info.pct || val > 1) {
      entry.max = Math.max(bands[bands.length - 1] * 1.5, val * 1.2);
    }
    result[key] = entry;
  }
  return result;
}

// ============================================================
// BUILD METRIC_DETAIL — data-driven PBI references
// ============================================================
function buildMetricDetail(data, schema) {
  const fmtN = n => typeof n === 'number' ? n.toLocaleString() : String(n);

  // Static framework definitions — PBI visual references
  const visualDefs = {
    M365_ENABLEMENT: [
      {page: "M365 Copilot - Usage Trends", type: "cardVisual", measures: ["NoOfActiveChatUsers (Licensed)","Average Active Days Per User Per Week (Licensed Copilot)","Licensed Sessions MoM %"], instruction: "Read 'NoOfActiveChatUsers (Licensed)' KPI card -- licensed active user count"},
      {page: "License Prioritisation", type: "cardVisual", measures: ["NoOfActiveChatUsers (Licensed)","NoOfActiveChatUsers (Unlicensed)"], instruction: "Top-left KPI card showing licensed vs unlicensed active user counts"}
    ],
    M365_ADOPTION: [
      {page: "M365 Copilot - Usage Trends", type: "cardVisual", measures: ["NoOfActiveChatUsers (Licensed)"], instruction: "First numeric value in the top KPI bar -- active M365 Copilot users"},
      {page: "Copilot Overall - Combined Leaderboard", type: "cardVisual", measures: ["NoOfActiveChatUsers (Licensed)","NoOfActiveChatUsers (Unlicensed)","UsersInteractingWithAgents"], instruction: "Top summary bar -- all three user populations side-by-side"}
    ],
    M365_BREADTH: [
      {page: "M365 Copilot - Usage Trends", type: "treemap", measures: ["Sessions (Licensed Users Only)"], instruction: "Treemap shows relative session volume by feature/app"}
    ],
    M365_FREQUENCY: [
      {page: "M365 Copilot - Habit Formation", type: "cardVisual", measures: ["Licensed Users 16+ Active Day Rate Last Month"], instruction: "Rightmost KPI card -- habitual/power user %"},
      {page: "M365 Copilot - Habit Formation", type: "clusteredColumnChart", measures: ["Licensed Users 1-5 Active Days (Dynamic)","Licensed Users 6-10 Active Days (Dynamic)","Licensed Users 11-15 Active Days (Dynamic)","Licensed Users 16+ Active Days (Dynamic)"], instruction: "Bar chart showing distribution of users across 4 active-day buckets over time"}
    ],
    M365_RETENTION: [
      {page: "M365 Copilot - Usage Trends", type: "cardVisual", measures: ["Licensed Sessions MoM %"], instruction: "Read 'Licensed Sessions MoM %' -- positive = growing retention"},
      {page: "M365 Copilot - Habit Formation", type: "cardVisual", measures: ["Licensed Users 16+ Active Day Rate Last Month"], instruction: "16+ active days = retained power users proxy"}
    ],
    AGENT_ADOPTION: [
      {page: "Agents - Usage Trends", type: "cardVisual", measures: ["UsersInteractingWithAgents","Agent Adoption Rate","Agent Return Rate"], instruction: "Main KPI bar -- read UsersInteractingWithAgents and Agent Adoption Rate"}
    ],
    AGENT_ENABLEMENT: [
      {page: "Agents - Health Check", type: "cardVisual", measures: ["High Impact Agents","Dormant Agents","Agent Return Rate"], instruction: "Right KPI bar: portfolio quality signal"}
    ],
    AGENT_HEALTH: [
      {page: "Agents - Health Check", type: "cardVisual", measures: ["High Impact Agents","Dormant Agents","Agent Return Rate"], instruction: "Right KPI bar: High Impact count, Dormant count, and Return Rate %."}
    ],
    COMPLEX_SESSIONS: []
  };

  const defs = {
    M365_ENABLEMENT: { definition: "% licensed users within tenant", scored_field: "EnablementPct", unit: "% seats active" },
    LICENSE_COVERAGE: { definition: "% of total active users that hold an M365 Copilot license", scored_field: "LicenseCoverage", unit: "% of users licensed" },
    M365_ADOPTION: { definition: "% of active users who are regular (6+ active days/month)", scored_field: "RegularUserRate", unit: "% regular users (6+ days)" },
    M365_BREADTH: { definition: "# different features/apps used per user", scored_field: "Licensed_AvgAppsPerUser", unit: "apps/user" },
    M365_FREQUENCY: { definition: "% active weeks / total eligible weeks -- habitual user rate", scored_field: "Licensed_HabitualRate_11Plus", unit: "% habitual (11+ days)" },
    M365_RETENTION: { definition: "MoM user retention rate (latest month)", scored_field: "Licensed_RetentionRate", unit: "% MoM retention" },
    M365_RETENTION_3MO: { definition: "Average MoM retention over last 3 month pairs", scored_field: "Licensed_Retention3MoAvg", unit: "% avg retention (3 months)" },
    CHAT_ADOPTION: { definition: "Unlicensed Chat active user count (contextual -- not scored)", scored_field: "ActiveChatUsers_Unlicensed", unit: "user count (unscored)", excluded: true },
    CHAT_INTENSITY: { definition: "Actions per active user (chat sessions per user per week)", scored_field: "ChatSessionsPerWeek", unit: "sessions/user/week" },
    CHAT_HABIT: { definition: "Active day distribution -- habitual chat users", scored_field: "Unlicensed_HabitualRate_11Plus", unit: "% habitual (11+ days)" },
    AGENT_ENABLEMENT: { definition: "% high-impact agents in portfolio", scored_field: "HighImpactAgentPct", unit: "% high-impact agents" },
    AGENT_ADOPTION: { definition: "% active agent users", scored_field: "AgentAdoptionRate", unit: "% adoption" },
    AGENT_INTENSITY: { definition: "Agent interactions per user per week", scored_field: "AgentSessionsPerActiveUser", unit: "sessions/user" },
    AGENT_BREADTH: { definition: "# different agents used per user", scored_field: "AvgAgentsPerUser", unit: "agents/user" },
    AGENT_HABITUAL: { definition: "% agent users with 11+ active days per month", scored_field: "AgentHabitualRate", unit: "% habitual (11+ days)" },
    AGENT_FREQUENCY: { definition: "Agent sessions per user per week", scored_field: "AgentSessionsPerWeek", unit: "sessions/user/week" },
    CROSS_ORG_BREADTH: { definition: "# / % active organisations or functions using AI", scored_field: "OrgsWithAgentUsers", unit: "# orgs with agent users" },
    LICENSE_PRIORITISATION: { definition: "Engagement premium -- licensed vs unlicensed", scored_field: "LicensePriority", unit: "engagement multiplier" },
    AGENT_HEALTH: { definition: "Agent portfolio quality -- high impact vs dormant vs active", scored_field: "AgentReturnRate", unit: "% return rate" },
    COMPLEX_SESSIONS: { definition: "Average prompts per conversation thread — higher values indicate deeper, multi-turn engagement", scored_field: "AveragePromptsPerSession", unit: "avg prompts/session" },
  };

  const fieldMap = {
    M365_ENABLEMENT: 'm365_enablement', LICENSE_COVERAGE: 'license_coverage', M365_ADOPTION: 'm365_adoption',
    M365_BREADTH: 'm365_breadth', M365_FREQUENCY: 'm365_frequency',
    M365_RETENTION: 'm365_retention', M365_RETENTION_3MO: 'm365_retention_3mo_avg', CHAT_ADOPTION: 'chat_users',
    CHAT_INTENSITY: 'chat_intensity', CHAT_HABIT: 'chat_habit',
    AGENT_ENABLEMENT: 'agent_enablement', AGENT_ADOPTION: 'agent_adoption',
    AGENT_INTENSITY: 'agent_intensity', AGENT_BREADTH: 'agent_breadth',
    AGENT_HABITUAL: 'agent_habitual', AGENT_FREQUENCY: 'agent_frequency', CROSS_ORG_BREADTH: 'org_count',
    LICENSE_PRIORITISATION: 'license_priority', AGENT_HEALTH: 'agent_health',
    COMPLEX_SESSIONS: 'complex_sessions',
  };

  const pctFields = new Set(['m365_enablement','license_coverage','m365_adoption','agent_adoption','agent_enablement','m365_frequency','m365_retention','m365_retention_3mo_avg','chat_habit','agent_habitual','agent_health']);

  const result = {};
  for (const [key, def] of Object.entries(defs)) {
    const field = fieldMap[key];
    let rawVal = data[field];
    if (rawVal === undefined || rawVal === null) rawVal = 0;
    const isPct = pctFields.has(field);
    const val = isPct && rawVal > 1 ? rawVal / 100 : rawVal;

    const metricDef = schema.metrics[field];
    const bands = metricDef && metricDef.bands ? metricDef.bands : null;
    const bandLabels = bands ? [
      '<' + (isPct ? (bands[0]*100)+'%' : bands[0]) + ' Foundation',
      (isPct ? (bands[0]*100)+'%' : bands[0]) + '-' + (isPct ? (bands[1]*100)+'%' : bands[1]) + ' Foundation',
      (isPct ? (bands[1]*100)+'%' : bands[1]) + '-' + (isPct ? (bands[2]*100)+'%' : bands[2]) + ' Expansion',
      '>' + (isPct ? (bands[2]*100)+'%' : bands[2]) + ' Frontier'
    ] : null;

    result[key] = {
      definition: def.definition,
      scored_field: def.scored_field,
      scored_value: val,
      bands: bands,
      band_labels: bandLabels,
      unit: def.unit,
      dax_fields: {},
      visuals: visualDefs[key] || []
    };
    if (def.excluded) result[key].excluded = true;
  }
  return result;
}

function populateTemplate(template, data, insights, signalTiers, pattern, gauges) {
  let html = template;

  // ── Brand override: inject CSS variables if brand file is loaded ──
  if (brand && brand.colors) {
    var brandCss = '<style>:root{--brand:' + brand.colors.primary + ';--brand-dark:' + brand.colors.primary + ';--copilot-blue:' + brand.colors.primary + '}';
    brandCss += '.hero-badge{border-color:' + brand.colors.primary + '40;color:' + brand.colors.primary + '}';
    brandCss += '.nav-brand{color:' + brand.colors.primary + '}';
    brandCss += '.nav-link:hover,.nav-link.active{color:' + brand.colors.primary + ';border-bottom-color:' + brand.colors.primary + '}';
    if (brand.logo_candidates && brand.logo_candidates[0]) {
      brandCss += '.nav-brand::before{content:"";display:inline-block;width:20px;height:20px;background:url(' + brand.logo_candidates[0] + ') center/contain no-repeat;margin-right:.4rem}';
    }
    if (brand.fonts && brand.fonts[0]) {
      brandCss += 'body{font-family:"' + brand.fonts[0] + '",\'Segoe UI Variable\',sans-serif}';
    }
    brandCss += '</style>';
    html = html.replace('</head>', brandCss + '</head>');
    console.log('Brand CSS injected');
  }

  // Pre-process: for inline arithmetic safety, create numeric-safe versions of all fields
  // This prevents NaN from Math operations on "not_available" strings
  const n = (field, fallback) => typeof data[field] === 'number' ? data[field] : (fallback !== undefined ? fallback : 0);
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : String(n);

  // ── safeSub: fail-safe placeholder replacement ──
  const subErrors = [];
  function safeSub(html, placeholder, value, fieldName) {
    if (value === 'not_available') {
      // Context-aware: use '0' if placeholder appears inside a JS data array, HTML span otherwise
      return html.replace(placeholder, function(match, offset) {
        // Check surrounding chars: if inside [...] or after 'data:', use 0
        var before = html.substring(Math.max(0, offset - 20), offset);
        if (before.includes('data:[') || before.includes(':[') || before.includes(',')) {
          var after = html.substring(offset + match.length, offset + match.length + 5);
          if (after.match(/^[,\]]/)) return '0';
        }
        return '<span class="not-available">\u2014</span>';
      });
    }
    if (value === undefined || value === null) {
      subErrors.push(fieldName + ': value is ' + value);
      return html;
    }
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
      subErrors.push(fieldName + ': value is ' + value + ' (NaN/Infinity)');
      return html;
    }
    // Round floats to 1 decimal — no 15-digit decimals in the report
    if (typeof value === 'number' && !Number.isInteger(value)) {
      return html.replace(placeholder, String(Math.round(value * 10) / 10));
    }
    return html.replace(placeholder, String(value));
  }

  function safeJSON(value, fieldName) {
    if (value === undefined || value === null || value === 'not_available') {
      subErrors.push(fieldName + ': cannot inject undefined/null into chart JSON');
      return '[]';
    }
    if (Array.isArray(value)) {
      const hasNaN = value.some(v => typeof v === 'number' && isNaN(v));
      if (hasNaN) subErrors.push(fieldName + ': array contains NaN values');
    }
    return JSON.stringify(value);
  }

  // Customer name
  html = safeSub(html, /\{\{CUSTOMER_NAME\}\}/g, data.customer_name, 'customer_name');

  // Core metrics
  html = safeSub(html, /\{\{TOTAL_ACTIVE_USERS\}\}/g, data.total_active_users, 'total_active_users');
  html = safeSub(html, /\{\{LICENSED_USERS\}\}/g, data.licensed_users, 'licensed_users');
  html = safeSub(html, /\{\{CHAT_USERS\}\}/g, data.chat_users, 'chat_users');
  html = safeSub(html, /\{\{CHAT_USERS_FMT\}\}/g, fmt(data.chat_users), 'chat_users_fmt');
  html = safeSub(html, /\{\{AGENT_USERS\}\}/g, data.agent_users, 'agent_users');
  html = safeSub(html, /\{\{TOTAL_LICENSED_SEATS\}\}/g, fmt(data.total_licensed_seats), 'total_licensed_seats');
  html = safeSub(html, /\{\{INACTIVE_LICENSES\}\}/g, data.inactive_licenses, 'inactive_licenses');

  // Reach metrics
  html = safeSub(html, /\{\{M365_ENABLEMENT\}\}/g, data.m365_enablement, 'm365_enablement');
  html = safeSub(html, /\{\{M365_ADOPTION\}\}/g, data.m365_adoption, 'm365_adoption');
  html = safeSub(html, /\{\{AGENT_ADOPTION\}\}/g, data.agent_adoption, 'agent_adoption');
  html = safeSub(html, /\{\{AGENT_ENABLEMENT\}\}/g, data.agent_enablement, 'agent_enablement');
  html = safeSub(html, /\{\{ORG_COUNT\}\}/g, data.org_count, 'org_count');
  html = safeSub(html, /\{\{LICENSE_PRIORITY\}\}/g, data.license_priority, 'license_priority');

  // Habit metrics
  html = safeSub(html, /\{\{M365_FREQUENCY\}\}/g, data.m365_frequency, 'm365_frequency');
  html = safeSub(html, /\{\{CHAT_HABIT\}\}/g, data.chat_habit, 'chat_habit');
  html = safeSub(html, /\{\{AGENT_FREQUENCY\}\}/g, data.agent_frequency, 'agent_frequency');
  html = safeSub(html, /\{\{M365_RETENTION\}\}/g, data.m365_retention, 'm365_retention');
  html = safeSub(html, /\{\{M365_RETENTION_INT\}\}/g, typeof data.m365_retention === 'number' ? Math.round(data.m365_retention) : 'not_available', 'm365_retention_int');
  html = safeSub(html, /\{\{CHAT_RETENTION\}\}/g, data.chat_retention, 'chat_retention');
  html = safeSub(html, /\{\{AGENT_RETENTION\}\}/g, data.agent_retention, 'agent_retention');

  // Intensity
  html = safeSub(html, /\{\{M365_INTENSITY\}\}/g, data.m365_intensity, 'm365_intensity');
  html = safeSub(html, /\{\{CHAT_INTENSITY\}\}/g, data.chat_intensity, 'chat_intensity');
  html = safeSub(html, /\{\{AGENT_INTENSITY\}\}/g, data.agent_intensity, 'agent_intensity');
  html = safeSub(html, /\{\{LICENSED_AVG_PROMPTS\}\}/g, data.licensed_avg_prompts, 'licensed_avg_prompts');
  html = safeSub(html, /\{\{UNLICENSED_AVG_PROMPTS\}\}/g, data.unlicensed_avg_prompts, 'unlicensed_avg_prompts');
  html = safeSub(html, /\{\{WEEKLY_M365\}\}/g, data.weekly_m365, 'weekly_m365');
  html = safeSub(html, /\{\{WEEKLY_CHAT\}\}/g, data.weekly_chat, 'weekly_chat');
  html = safeSub(html, /\{\{WEEKLY_AGENTS\}\}/g, data.weekly_agents, 'weekly_agents');

  // Skill
  html = safeSub(html, /\{\{M365_BREADTH\}\}/g, data.m365_breadth, 'm365_breadth');
  html = safeSub(html, /\{\{AGENT_BREADTH\}\}/g, data.agent_breadth, 'agent_breadth');
  html = safeSub(html, /\{\{COMPLEX_SESSIONS\}\}/g, data.complex_sessions, 'complex_sessions');
  html = safeSub(html, /\{\{AGENT_HEALTH\}\}/g, data.agent_health, 'agent_health');
  html = safeSub(html, /\{\{AGENT_CREATORS_PCT\}\}/g, data.agent_creators_pct, 'agent_creators_pct');
  html = safeSub(html, /\{\{LICENSE_COVERAGE_PCT\}\}/g, data.license_coverage, 'license_coverage');
  html = safeSub(html, /\{\{LICENSE_COVERAGE\}\}/g, data.license_coverage, 'license_coverage');
  html = safeSub(html, /\{\{ORG_PENETRATION_PCT\}\}/g, data.org_penetration_pct, 'org_penetration_pct');
  html = safeSub(html, /\{\{EMBEDDED_USER_RATE\}\}/g, data.embedded_user_rate, 'embedded_user_rate');
  html = safeSub(html, /\{\{AGENT_HABITUAL_PCT\}\}/g, typeof data.agent_habitual_rate === 'number' ? data.agent_habitual_rate : (typeof data.agent_habitual === 'number' ? data.agent_habitual : 'not_available'), 'agent_habitual_pct');
  html = safeSub(html, /\{\{COHORT_CHURN_DELTA\}\}/g,
    typeof data.m365_retention === 'number' && typeof data.chat_retention === 'number'
      ? Math.round(data.m365_retention - data.chat_retention) + 'pp' : 'not_available', 'cohort_churn_delta');
  // 3-month avg retention — NEVER fall back to single-month (different metric)
  html = html.replace(/\{\{M365_RETENTION_3MO\}\}/g, String(typeof data.m365_retention_3mo_avg === 'number' ? data.m365_retention_3mo_avg : '—'));

  // Chart-level insight callouts
  const growthPct = data._supplementary_metrics && data._supplementary_metrics.user_growth_5_month_pct;
  html = html.replace(/\{\{INSIGHT_MONTHLY_GROWTH\}\}/g,
    '<strong>' + fmt(data.total_active_users) + ' active users</strong> across the analysis period' +
    (growthPct ? ' — a <strong>' + growthPct + '% increase</strong> over 5 months.' : '.') +
    ' Unlicensed Chat users drive most of the growth (' + fmt(data.chat_users) + '), while licensed users (' + fmt(data.licensed_users) + ') show steadier but narrower expansion.');

  html = html.replace(/\{\{INSIGHT_ENGAGEMENT_DEPTH\}\}/g,
    'Licensed users average <strong>' + n('licensed_avg_prompts') + ' prompts</strong> vs <strong>' + n('unlicensed_avg_prompts') + ' for unlicensed</strong> — a ' + (n('licensed_avg_prompts') / Math.max(n('unlicensed_avg_prompts'), 1)).toFixed(1) + 'x depth gap. Licensing doesn\u2019t just give access — it converts casual use into meaningful engagement.');

  // ── Key Takeaways for all major visuals ──
  // Weekly trend
  var weeklyTrendTakeaway = '';
  if (Array.isArray(data.weekly_trend) && data.weekly_trend.length >= 3) {
    var wt = data.weekly_trend;
    var firstWeek = wt[0], lastWeek = wt[wt.length - 1], peakWeek = wt.reduce(function(a, b) { return (a.m365 || 0) > (b.m365 || 0) ? a : b; });
    var m365Growth = firstWeek.m365 > 0 ? Math.round((lastWeek.m365 - firstWeek.m365) / firstWeek.m365 * 100) : 0;
    var agentGrowth = firstWeek.agents > 0 ? Math.round((lastWeek.agents - firstWeek.agents) / firstWeek.agents * 100) : 0;
    weeklyTrendTakeaway = '<div style="display:flex;flex-direction:column;gap:.4rem;font-size:.72rem;color:var(--text-2);line-height:1.5">';
    weeklyTrendTakeaway += '<div><strong style="color:#007fff">M365 Copilot ' + (m365Growth >= 0 ? '+' : '') + m365Growth + '% growth</strong> over the period — from ' + fmt(firstWeek.m365) + ' to ' + fmt(lastWeek.m365) + ' weekly active users</div>';
    weeklyTrendTakeaway += '<div><strong style="color:#D270F0">Agent users ' + (agentGrowth >= 0 ? '+' : '') + agentGrowth + '% growth</strong> — from ' + fmt(firstWeek.agents) + ' to ' + fmt(lastWeek.agents) + ' per week</div>';
    if (lastWeek.m365 < peakWeek.m365 * 0.9) weeklyTrendTakeaway += '<div><strong style="color:#EF4444">Last week dipped ' + Math.round((1 - lastWeek.m365 / peakWeek.m365) * 100) + '% from peak</strong> — seasonal or a signal to watch?</div>';
    weeklyTrendTakeaway += '</div>';
  }
  html = html.replace(/\{\{TAKEAWAY_WEEKLY_TREND\}\}/g, weeklyTrendTakeaway || '');

  // Retention — guard against not_available values
  var retM365 = typeof data.m365_retention === 'number' ? data.m365_retention : null;
  var retAgent = typeof data.agent_retention === 'number' ? data.agent_retention : null;
  var retChat = typeof data.chat_retention === 'number' ? data.chat_retention : null;
  html = html.replace(/\{\{TAKEAWAY_RETENTION\}\}/g,
    '<div style="display:flex;flex-direction:column;gap:.4rem;font-size:.72rem;color:var(--text-2);line-height:1.5">' +
    (retM365 !== null
      ? '<div><strong style="color:#007fff">Licensed retention: ' + retM365 + '%</strong> — ' + (retM365 >= 85 ? 'world-class, above the P3 threshold' : retM365 >= 75 ? 'healthy but below the P3 bar of 93%' : 'below the P2 threshold — a risk signal') + '</div>'
      : '<div><strong style="color:#007fff">Licensed retention:</strong> not available in this dataset</div>') +
    (retAgent !== null
      ? '<div><strong style="color:#8477FB">Agent retention: ' + retAgent + '%</strong> — ' + (retAgent >= 80 ? 'agents that people come back to are agents worth keeping' : 'agents need higher stickiness before scaling') + '</div>'
      : '<div><strong style="color:#8477FB">Agent retention:</strong> not available in this dataset</div>') +
    (retM365 !== null && retChat !== null
      ? '<div><strong style="color:var(--amber)">The gap</strong>: ' + Math.abs(Math.round(retM365 - retChat)) + 'pp between licensed and unlicensed retention — licensing drives stickiness</div>'
      : '') +
    '</div>');

  // App surface
  html = html.replace(/\{\{TAKEAWAY_APP_SURFACE\}\}/g,
    '<div style="display:flex;flex-direction:column;gap:.4rem;font-size:.72rem;color:var(--text-2);line-height:1.5">' +
    '<div><strong style="color:var(--text)">' + n('m365_breadth') + ' apps/user</strong> out of 27 available — ' + (n('m365_breadth') >= 5 ? 'good breadth, approaching P3 levels' : n('m365_breadth') >= 3 ? 'moderate breadth — room to expand beyond the core 2-3 apps' : 'narrow adoption concentrated in BizChat — the biggest proficiency gap') + '</div>' +
    '<div><strong style="color:#8477FB">' + n('agent_breadth') + ' agents/user</strong> — ' + (n('agent_breadth') >= 2 ? 'users engaging with multiple agents signals genuine delegation' : 'most users interact with just one agent — discovery is the bottleneck') + '</div>' +
    '</div>');

  // Agent leaderboard
  var topAgent = (data.top_agent_names || [])[0] || 'N/A';
  var topAgentSess = (data.top_agent_sessions || [])[0] || 0;
  html = html.replace(/\{\{TAKEAWAY_AGENT_LEADERBOARD\}\}/g,
    '<div style="display:flex;flex-direction:column;gap:.4rem;font-size:.72rem;color:var(--text-2);line-height:1.5">' +
    '<div><strong style="color:#0D9488">' + topAgent + '</strong> leads with ' + topAgentSess + ' sessions/user — study what makes it stick</div>' +
    '<div><strong style="color:var(--text)">' + n('multi_user_agents') + ' multi-user agents</strong> out of ' + n('total_agents') + ' total — only ' + (n('total_agents') > 0 ? Math.round(n('multi_user_agents') / n('total_agents') * 100) : 0) + '% break through from creator to team use</div>' +
    '<div><strong style="color:var(--amber)">The pattern</strong>: purpose-built agents achieve higher stickiness than generic first-party ones</div>' +
    '</div>');

  // Habit Key Insight — data-driven from band distribution
  (function() {
    var lb15 = n('licensed_band_1_5_pct', 0), lb610 = n('licensed_band_6_10_pct', 0), lb1115 = n('licensed_band_11_15_pct', 0), lb16p = n('licensed_band_16_plus_pct', 0);
    var ab15 = n('agent_band_1_5_pct', 0), ab610 = n('agent_band_6_10_pct', 0), ab1115 = n('agent_band_11_15_pct', 0), ab16p = n('agent_band_16_plus_pct', 0);
    var copilotHabitual = Math.round((lb1115 + lb16p) * 10) / 10;
    var copilotConversion = Math.round(lb610 * 10) / 10;
    var band610Count = n('band_6_10', 0);

    // Determine the key insight based on data shape
    var keyInsightTitle, keyInsightBody, keyInsightColor;
    if (copilotHabitual < 10 && copilotConversion > 15) {
      // Big conversion opportunity — lots in 6-10 band
      keyInsightTitle = fmt(band610Count) + ' users are one nudge from habitual';
      keyInsightBody = '<strong>' + copilotConversion + '%</strong> of licensed M365 Copilot users sit in the <strong>6\u201310 active day</strong> band — engaged but not yet embedded. Converting 30% of this cohort would nearly double the habitual user base.';
      keyInsightColor = '#0D9488';
    } else if (copilotHabitual >= 25) {
      // Strong habit — celebrate it
      keyInsightTitle = copilotHabitual + '% are deeply habitual';
      keyInsightBody = '<strong>' + copilotHabitual + '%</strong> of licensed users hit <strong>11+ active days/month</strong> — this is a strong habit signal. Focus shifts from building habit to expanding breadth and agent adoption.';
      keyInsightColor = '#0D9488';
    } else {
      // Default — shallow engagement
      keyInsightTitle = lb15 + '% are in the shallow zone';
      keyInsightBody = '<strong>' + lb15 + '%</strong> of licensed M365 Copilot users engage <strong>1\u20135 active days/month</strong> — they are trying it but not building routine. The ' + fmt(band610Count) + ' users in the <strong>6\u201310 day</strong> bracket represent the fastest path to conversion.';
      keyInsightColor = '#D270F0';
    }

    var insightHtml = '';
    // Key insight card
    insightHtml += '<div style="background:linear-gradient(135deg,rgba(255,255,255,.03),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:1.25rem;margin-bottom:.75rem;border-left:4px solid ' + keyInsightColor + '">';
    insightHtml += '<div style="font-size:.45rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:' + keyInsightColor + ';margin-bottom:.4rem">Key Insight</div>';
    insightHtml += '<div style="font-size:1rem;font-weight:900;color:#fff;line-height:1.2;margin-bottom:.5rem">' + keyInsightTitle + '</div>';
    insightHtml += '<div style="font-size:.72rem;color:rgba(255,255,255,.55);line-height:1.55">' + keyInsightBody + '</div>';
    insightHtml += '</div>';

    // Two-lane summary beneath
    insightHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">';
    // Copilot bands
    insightHtml += '<div style="background:rgba(34,100,229,.04);border:1px solid rgba(34,100,229,.1);border-radius:8px;padding:.75rem">';
    insightHtml += '<div style="font-size:.45rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#007fff;margin-bottom:.5rem">M365 Copilot Bands</div>';
    insightHtml += '<div style="display:flex;flex-direction:column;gap:.3rem;font-size:.6rem;color:rgba(255,255,255,.5)">';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>1\u20135 days</span><span style="font-weight:700;color:rgba(255,255,255,.7)">' + lb15 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>6\u201310 days</span><span style="font-weight:700;color:#D270F0">' + lb610 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>11\u201315 days</span><span style="font-weight:700;color:#0D9488">' + lb1115 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>16+ days</span><span style="font-weight:700;color:#0D9488">' + lb16p + '%</span></div>';
    insightHtml += '</div></div>';
    // Agent bands
    insightHtml += '<div style="background:rgba(123,47,242,.04);border:1px solid rgba(123,47,242,.1);border-radius:8px;padding:.75rem">';
    insightHtml += '<div style="font-size:.45rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8477FB;margin-bottom:.5rem">Agent Bands</div>';
    insightHtml += '<div style="display:flex;flex-direction:column;gap:.3rem;font-size:.6rem;color:rgba(255,255,255,.5)">';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>1\u20135 days</span><span style="font-weight:700;color:rgba(255,255,255,.7)">' + ab15 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>6\u201310 days</span><span style="font-weight:700;color:#D270F0">' + ab610 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>11\u201315 days</span><span style="font-weight:700;color:#0D9488">' + ab1115 + '%</span></div>';
    insightHtml += '<div style="display:flex;justify-content:space-between"><span>16+ days</span><span style="font-weight:700;color:#0D9488">' + ab16p + '%</span></div>';
    insightHtml += '</div></div>';
    insightHtml += '</div>';

    html = html.replace(/\{\{HABIT_KEY_INSIGHT_HTML\}\}/g, insightHtml);
  })();

  // License priority table insight
  const topOrg = data._supplementary_metrics && data._supplementary_metrics.license_priority_orgs && data._supplementary_metrics.license_priority_orgs[0];
  const highRatio = data._supplementary_metrics && data._supplementary_metrics.license_priority_orgs
    ? data._supplementary_metrics.license_priority_orgs.filter(function(o) { return o.ratio_unlicensed_to_licensed > 10; })
    : [];
  html = html.replace(/\{\{INSIGHT_LICENSE_PRIORITY\}\}/g,
    (highRatio.length > 0
      ? '<strong>' + highRatio.length + ' organisations have 10x+ more unlicensed than licensed users</strong> — these represent the strongest unmet demand. '
      : '') +
    (topOrg ? topOrg.org + ' leads on session intensity (' + topOrg.unlicensed_median_sessions_weekly + ' sessions/week per unlicensed user). ' : '') +
    'Start licensing where demand is already proven.');

  // Value / derived
  html = html.replace(/\{\{TIME_SAVED_REALISED\}\}/g, `~${timeSavedRealised}K`);
  html = html.replace(/\{\{TIME_SAVED_UNREALISED\}\}/g, `~${timeSavedUnrealised}K`);

  // Active day bands
  html = safeSub(html, /\{\{BAND_1_5_PCT\}\}/g, data.band_1_5_pct, 'band_1_5_pct');
  html = safeSub(html, /\{\{BAND_6_10_PCT\}\}/g, data.band_6_10_pct, 'band_6_10_pct');
  html = safeSub(html, /\{\{BAND_11_15_PCT\}\}/g, data.band_11_15_pct, 'band_11_15_pct');
  html = safeSub(html, /\{\{BAND_16_PLUS_PCT\}\}/g, data.band_16_plus_pct, 'band_16_plus_pct');
  html = safeSub(html, /\{\{LIC_BAND_1_5_PCT\}\}/g, data.licensed_band_1_5_pct || 0, 'lic_band_1_5_pct');
  html = safeSub(html, /\{\{LIC_BAND_6_10_PCT\}\}/g, data.licensed_band_6_10_pct || 0, 'lic_band_6_10_pct');
  html = safeSub(html, /\{\{LIC_BAND_11_15_PCT\}\}/g, data.licensed_band_11_15_pct || 0, 'lic_band_11_15_pct');
  html = safeSub(html, /\{\{LIC_BAND_16_PLUS_PCT\}\}/g, data.licensed_band_16_plus_pct || 0, 'lic_band_16_plus_pct');
  html = safeSub(html, /\{\{CHAT_BAND_1_5_PCT\}\}/g, data.chat_band_1_5_pct, 'chat_band_1_5_pct');
  html = safeSub(html, /\{\{CHAT_BAND_6_10_PCT\}\}/g, data.chat_band_6_10_pct, 'chat_band_6_10_pct');
  html = safeSub(html, /\{\{CHAT_BAND_11_15_PCT\}\}/g, data.chat_band_11_15_pct, 'chat_band_11_15_pct');
  html = safeSub(html, /\{\{CHAT_BAND_16_PLUS_PCT\}\}/g, data.chat_band_16_plus_pct, 'chat_band_16_plus_pct');
  html = safeSub(html, /\{\{AGENT_BAND_1_5_PCT\}\}/g, data.agent_band_1_5_pct, 'agent_band_1_5_pct');
  html = safeSub(html, /\{\{AGENT_BAND_6_10_PCT\}\}/g, data.agent_band_6_10_pct, 'agent_band_6_10_pct');
  html = safeSub(html, /\{\{AGENT_BAND_11_15_PCT\}\}/g, data.agent_band_11_15_pct, 'agent_band_11_15_pct');
  html = safeSub(html, /\{\{AGENT_BAND_16_PLUS_PCT\}\}/g, data.agent_band_16_plus_pct, 'agent_band_16_plus_pct');

  // Retention cohort
  html = safeSub(html, /\{\{RETAINED_USERS\}\}/g, data.retained_users, 'retained_users');
  html = safeSub(html, /\{\{CHURNED_USERS\}\}/g, data.churned_users, 'churned_users');

  // Agents
  html = safeSub(html, /\{\{AGENTS_KEEP\}\}/g, data.agents_keep, 'agents_keep');
  html = safeSub(html, /\{\{AGENTS_REVIEW\}\}/g, data.agents_review, 'agents_review');
  html = safeSub(html, /\{\{AGENTS_RETIRE\}\}/g, data.agents_retire, 'agents_retire');
  html = html.replace(/\{\{TOP_AGENT_SESSIONS\}\}/g, safeJSON(data.top_agent_sessions, 'top_agent_sessions'));
  html = html.replace(/\{\{TOP_AGENT_NAMES_JSON\}\}/g, safeJSON(data.top_agent_names, 'top_agent_names'));
  // Total sessions per agent (for leaderboard chart — ranked by reach × depth)
  const topAgentTotalSessions = (Array.isArray(data.agent_table) ? data.agent_table : []).slice(0, 8).map(a => a.sessions || 0);
  html = html.replace(/\{\{TOP_AGENT_TOTAL_SESSIONS\}\}/g, JSON.stringify(topAgentTotalSessions));

  // Radar charts
  html = html.replace(/\{\{RADAR_REACH\}\}/g, safeJSON(data.radar_reach, 'radar_reach'));
  html = html.replace(/\{\{RADAR_HABIT\}\}/g, safeJSON(data.radar_habit, 'radar_habit'));
  html = html.replace(/\{\{RADAR_SKILL\}\}/g, safeJSON(data.radar_skill, 'radar_skill'));

  // Signal gauges
  html = safeSub(html, /\{\{REACH_GAUGE\}\}/g, gauges.reach, 'reach_gauge');
  html = safeSub(html, /\{\{HABIT_GAUGE\}\}/g, gauges.habit, 'habit_gauge');
  html = safeSub(html, /\{\{SKILL_GAUGE\}\}/g, gauges.skill, 'skill_gauge');
  html = safeSub(html, /\{\{VALUE_GAUGE\}\}/g, gauges.value, 'value_gauge');

    html = html.replace(/{{MULTI_USER_AGENTS}}/g, String(data.multi_user_agents || 0));
  html = html.replace(/{{AGENT_CREATORS}}/g, String(data.agent_creators || 0));

  // Formatted values (with commas, K suffix, etc.)
  const fmtN = n => typeof n === 'number' ? n.toLocaleString() : String(n);
  const toK = n => Math.round(n / 1000) + 'K';
  html = html.replace(/\{\{TOTAL_ACTIVE_USERS_ROUND\}\}/g, fmt(data.total_active_users));
  html = html.replace(/\{\{TOTAL_ACTIVE_USERS_K\}\}/g, toK(n('total_active_users')));
  html = html.replace(/\{\{LICENSED_USERS_FMT\}\}/g, fmtN(data.licensed_users));
  html = html.replace(/\{\{CHAT_USERS_FMT\}\}/g, fmtN(data.chat_users));
  html = html.replace(/\{\{INACTIVE_LICENSES_FMT\}\}/g, fmtN(data.inactive_licenses || 0));
  html = html.replace(/\{\{TOTAL_LICENSED_SEATS_FMT\}\}/g, fmtN(data.total_licensed_seats));
  html = safeSub(html, /\{\{LICENSED_AVG_DAYS\}\}/g, data.licensed_avg_days, 'licensed_avg_days');
  html = safeSub(html, /\{\{UNLICENSED_AVG_DAYS\}\}/g, data.unlicensed_avg_days, 'unlicensed_avg_days');
  html = html.replace(/\{\{BAND_1_5_FMT\}\}/g, fmtN(data.band_1_5));
  html = html.replace(/\{\{BAND_6_10_FMT\}\}/g, fmtN(data.band_6_10));
  html = html.replace(/\{\{BAND_11_15_FMT\}\}/g, fmtN(data.band_11_15));
  html = html.replace(/\{\{BAND_16_PLUS_FMT\}\}/g, fmtN(data.band_16_plus));
  const retainedVal = typeof data.retained_users === 'number' ? data.retained_users : null;
  const churnedVal = typeof data.churned_users === 'number' ? data.churned_users : null;
  html = safeSub(html, /\{\{RETAINED_USERS_FMT\}\}/g, retainedVal !== null ? fmtN(retainedVal) : 'not_available', 'retained_users_fmt');
  html = safeSub(html, /\{\{RETENTION_COHORT_FMT\}\}/g,
    retainedVal !== null && churnedVal !== null ? fmtN(retainedVal + churnedVal) : 'not_available', 'retention_cohort_fmt');
  html = html.replace(/\{\{TOTAL_AGENTS_FMT\}\}/g, fmtN(data.total_agents || 0));
  html = html.replace(/\{\{HABITUAL_USERS_FMT\}\}/g, fmtN(n('band_11_15') + n('band_16_plus')));
  html = html.replace(/\{\{RETENTION_TIER_LABEL\}\}/g, data.m365_retention >= 85 ? 'Frontier-tier' : data.m365_retention >= 70 ? 'Expansion-tier' : 'Foundation-tier');

  // Pattern / Maturity placeholders
  html = html.replace(/\{\{PATTERN_LABEL\}\}/g, cultureHeadline);
  html = html.replace(/\{\{PATTERN_NUMBER\}\}/g, String(pattern.number));
  html = html.replace(/\{\{PATTERN_NEXT\}\}/g, String(Math.min(pattern.number + 1, 3)));

  // Pattern Profile — P1/P2/P3 Absent/Nascent/Primary
  html = html.replace(/\{\{PATTERN_PROFILE_STRING\}\}/g, patternProfileString);
  html = html.replace(/\{\{CULTURE_STAGE\}\}/g, cultureStage);
  html = html.replace(/\{\{CULTURE_STAGE_NUM\}\}/g, String(cultureStageNum));
  html = html.replace(/\{\{CULTURE_DESC\}\}/g, cultureDesc);
  html = html.replace(/\{\{CULTURE_RED_FLAG\}\}/g, cultureRedFlag);
  html = html.replace(/\{\{CULTURE_ACTION\}\}/g, cultureAction);
  html = html.replace(/\{\{CULTURE_HEADLINE\}\}/g, cultureHeadline);
  html = html.replace(/\{\{NARRATIVE_HEADLINE\}\}/g, cultureHeadline);
  // Dominant pattern — full Frontier Firm name
  const patternNames = { 1: 'Human with Assistant', 2: 'Human-Agent Teams', 3: 'Human-led, Agent-operated' };
  const patternDescs = {
    1: 'Every employee has an AI assistant. AI supports individual work — drafting, summarising, researching — in the flow of work.',
    2: 'Agents join teams as digital colleagues. Humans delegate; agents execute; humans steer and review.',
    3: 'Humans set direction; agents execute business processes end-to-end with oversight and governance.'
  };
  // Use V4 pattern.number (1, 2, or 3) — derived from weakest lane in the scorecard
  const domNum = pattern.number || 1;
  html = html.replace(/\{\{DOMINANT_PATTERN_NAME\}\}/g, patternNames[domNum]);
  html = html.replace(/\{\{DOMINANT_PATTERN_DESC\}\}/g, patternDescs[domNum]);
  html = html.replace(/\{\{DOMINANT_PATTERN_NUM\}\}/g, String(domNum));
  html = html.replace(/\{\{P1_STATUS\}\}/g, patternProfile.p1);
  html = html.replace(/\{\{P2_STATUS\}\}/g, patternProfile.p2);
  html = html.replace(/\{\{P3_STATUS\}\}/g, patternProfile.p3);
  html = html.replace(/\{\{P1_GATEWAY_VAL\}\}/g, String(Math.round(p1PresenceVal)));
  html = html.replace(/\{\{P1_MATURITY_VAL\}\}/g, String(Math.round(p1MaturityVal)));
  html = html.replace(/\{\{P2_GATEWAY_VAL\}\}/g, String(Math.round(p2PresenceVal * 10) / 10));
  html = html.replace(/\{\{P2_MATURITY_VAL\}\}/g, String(Math.round(p2MaturityVal * 10) / 10));
  html = html.replace(/\{\{P3_MULTI_AGENTS\}\}/g, String(n('multi_user_agents')));

  // Signal tier labels and CSS classes
  const tierClass = t => t === 'P3' ? 'tier-4' : t === 'P2' ? 'tier-3' : 'tier-2';
  const tierCssClass = t => 'tier-' + (t === 'P3' ? 'fr' : t === 'P2' ? 'e' : 'f');
  const tierColor = t => t === 'P3' ? 'var(--tier-4)' : t === 'P2' ? 'var(--tier-3)' : 'var(--tier-2)';
  const tierHexColor = t => t === 'P3' ? '#0D9488' : t === 'P2' ? '#D270F0' : '#94A3B8';
  const tierLabel = t => t === 'P3' ? 'Frontier: Human-led, Agent-operated' : t === 'P2' ? 'Expansion: Human-Agent Teams' : 'Foundation: Human with Assistant';
  const tierLabelShort = t => t === 'P3' ? 'Frontier' : t === 'P2' ? 'Expansion' : 'Foundation';
  html = html.replace(/\{\{REACH_TIER\}\}/g, tierLabel(signalTiers.reach));
  html = html.replace(/\{\{HABIT_TIER\}\}/g, tierLabel(signalTiers.habit));
  html = html.replace(/\{\{SKILL_TIER\}\}/g, tierLabel(signalTiers.skill));
  html = html.replace(/\{\{VALUE_TIER\}\}/g, tierLabel(signalTiers.value));
  html = html.replace(/\{\{REACH_TIER_SHORT\}\}/g, tierLabelShort(signalTiers.reach));
  html = html.replace(/\{\{HABIT_TIER_SHORT\}\}/g, tierLabelShort(signalTiers.habit));
  html = html.replace(/\{\{SKILL_TIER_SHORT\}\}/g, tierLabelShort(signalTiers.skill));
  html = html.replace(/\{\{REACH_TIER_CLASS\}\}/g, tierCssClass(signalTiers.reach));
  html = html.replace(/\{\{HABIT_TIER_CLASS\}\}/g, tierCssClass(signalTiers.habit));
  html = html.replace(/\{\{SKILL_TIER_CLASS\}\}/g, tierCssClass(signalTiers.skill));
  html = html.replace(/\{\{REACH_TIER_COLOR\}\}/g, tierHexColor(signalTiers.reach));
  html = html.replace(/\{\{HABIT_TIER_COLOR\}\}/g, tierHexColor(signalTiers.habit));
  html = html.replace(/\{\{SKILL_TIER_COLOR\}\}/g, tierHexColor(signalTiers.skill));
  html = html.replace(/\{\{VALUE_TIER_CLASS\}\}/g, tierCssClass(signalTiers.value));

  // Phase wrapper for "★ Dominant Pattern" badge
  const currentPatternBadge = '<div style="position:relative"><div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);z-index:10;background:#8477FB;color:#fff;padding:.2rem .7rem;border-radius:100px;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;box-shadow:0 2px 8px rgba(123,47,242,.4)">★ Dominant Pattern</div>';
  const dimWrapper = '<div style="opacity:.5">';
  const normalWrapper = '<div style="opacity:.7">';
  // Phase 1 wrapper: if pattern=1 show badge, otherwise dim
  html = html.replace(/\{\{PHASE_1_WRAPPER_OPEN\}\}/g,
    pattern.number === 1 ? currentPatternBadge : dimWrapper);
  // Phase 2 wrapper: if pattern=2 show badge, if pattern=3 dim it, if pattern=1 dim it
  html = html.replace(/\{\{PHASE_2_WRAPPER_OPEN\}\}/g,
    pattern.number === 2 ? currentPatternBadge : pattern.number > 2 ? normalWrapper : dimWrapper);
  // Phase 3 wrapper: if pattern=3 show badge, otherwise dim
  html = html.replace(/\{\{PHASE_3_WRAPPER_OPEN\}\}/g,
    pattern.number === 3 ? currentPatternBadge : dimWrapper);
  // Phase 2 card highlight (box-shadow) — only if pattern=2
  html = html.replace(/\{\{PHASE_2_HIGHLIGHT\}\}/g,
    pattern.number === 2 ? ';box-shadow:0 0 0 2px #8477FB,0 8px 32px rgba(123,47,242,.25)' : '');

  // Agent-specific metrics — NEVER proxy from m365_frequency (different population)
  html = html.replace(/\{\{AGENT_HABITUAL_RATE\}\}/g, String(typeof data.agent_habitual_rate === 'number' ? data.agent_habitual_rate : '—'));
  html = html.replace(/\{\{AGENT_SESSIONS_PER_USER\}\}/g, String(typeof data.agent_sessions_per_user === 'number' ? data.agent_sessions_per_user : (typeof data.agent_intensity === 'number' ? data.agent_intensity : '—')));

  // Agent governance formatted
  html = html.replace(/\{\{AGENTS_KEEP_FMT\}\}/g, fmtN(data.agents_keep || 0));
  html = html.replace(/\{\{AGENTS_REVIEW_FMT\}\}/g, fmtN(data.agents_review || 0));
  html = html.replace(/\{\{AGENTS_DORMANT_FMT\}\}/g, fmtN(data.agents_retire || 0));
  html = html.replace(/\{\{AGENTS_3P\}\}/g, String(data.agents_3p || 0));
  const totalAgents = n('agents_keep') + n('agents_review') + n('agents_retire');
  html = html.replace(/\{\{AGENTS_DORMANT_PCT\}\}/g, totalAgents > 0 ? Math.round(n('agents_retire') / totalAgents * 100) : '0');
  html = html.replace(/\{\{AGENTS_KEEP_PCT\}\}/g, totalAgents > 0 ? Math.round(n('agents_keep') / totalAgents * 100) : '0');

  // Retention threshold for display
  html = html.replace(/\{\{RETENTION_THRESHOLD\}\}/g, data.m365_retention >= 85 ? '85' : data.m365_retention >= 70 ? '70' : '50');

  // Total agents (raw number for counter targets)
  html = html.replace(/\{\{TOTAL_AGENTS\}\}/g, String(data.total_agents || 0));

  // Agent discovery stats
  const multiUserRaw = n('total_agents') > 0 ? (n('multi_user_agents') / n('total_agents') * 100) : 0;
  const multiUserPct = multiUserRaw < 1 && multiUserRaw > 0 ? '<1' : Math.round(multiUserRaw);
  html = html.replace(/\{\{AGENT_MULTI_USER_PCT\}\}/g, String(multiUserPct));
  html = html.replace(/\{\{AGENTS_SINGLE_USER_PCT\}\}/g, multiUserPct === '<1' ? '>99' : String(100 - multiUserPct));
  html = html.replace(/\{\{AGENTS_SINGLE_USER\}\}/g, fmtN((data.total_agents || 0) - (data.multi_user_agents || 0)));
  html = html.replace(/\{\{AGENTS_10_PLUS\}\}/g, String(data.agents_10_plus || Math.round((data.multi_user_agents || 0) * 0.3)));
  html = html.replace(/\{\{AGENT_MULTI_SESSIONS\}\}/g, 'N/A');

  // Agent quality insight — data-driven
  html = html.replace(/\{\{AGENT_QUALITY_INSIGHT\}\}/g,
    '<strong>' + (data.multi_user_agents || 0) + ' agents have multiple users</strong>. The quality is real but concentrated in a small number of well-built agents. Most agents are single-user experiments.');

  // App surface distribution — use supplementary data if available, otherwise generic
  const appData = data._supplementary_metrics && data._supplementary_metrics.app_interactions;
  if (appData) {
    const appEntries = Object.entries(appData).sort(function(a, b) { return b[1].pct - a[1].pct; });
    const fmt2 = function(e) { return fmtN(e[1].interactions) + ' (' + e[1].pct + '%)'; };
    html = html.replace(/\{\{APP_OFFICE\}\}/g, appEntries[0] ? fmt2(appEntries[0]) : 'N/A');
    html = html.replace(/\{\{APP_WORD\}\}/g, appEntries[2] ? fmt2(appEntries[2]) : 'N/A');
    html = html.replace(/\{\{APP_TEAMS\}\}/g, appEntries[1] ? fmt2(appEntries[1]) : 'N/A');
    html = html.replace(/\{\{APP_OUTLOOK\}\}/g, appEntries[3] ? fmt2(appEntries[3]) : 'N/A');
    html = html.replace(/\{\{APP_EDGE\}\}/g, appEntries[4] ? fmt2(appEntries[4]) : 'N/A');
    html = html.replace(/\{\{APP_MINOR\}\}/g, appEntries[6] ? fmt2(appEntries[6]) : 'N/A');
  } else {
    html = html.replace(/\{\{APP_OFFICE\}\}/g, 'Top surface');
    html = html.replace(/\{\{APP_WORD\}\}/g, '#2');
    html = html.replace(/\{\{APP_TEAMS\}\}/g, '#3');
    html = html.replace(/\{\{APP_OUTLOOK\}\}/g, '#4');
    html = html.replace(/\{\{APP_EDGE\}\}/g, '#5');
    html = html.replace(/\{\{APP_MINOR\}\}/g, 'Low');
  }

  // Org/function summary
  const deptCount = data._supplementary_metrics && data._supplementary_metrics.distinct_departments;
  html = html.replace(/\{\{ORG_FUNCTION_SUMMARY\}\}/g,
    data.org_count + ' organisations active.' + (deptCount ? ' ' + deptCount + ' distinct departments detected.' : ''));

  // Value licensing detail
  html = html.replace(/\{\{VALUE_LICENSING_DETAIL\}\}/g,
    fmtN(data.chat_users) + ' unlicensed Chat users represent proven organic demand. Target the highest-ratio markets for M365 Copilot licensing.');

  // Metric scorecard tier badges
  const metricTierData = computeMetricTiers(data, schema);
  for (const [tag, info] of Object.entries(metricTierData)) {
    html = html.replace(new RegExp('\\{\\{' + tag + '_TIER_COLOR\\}\\}', 'g'), tierColor(info.tier));
    html = html.replace(new RegExp('\\{\\{' + tag + '_TIER_CLASS\\}\\}', 'g'), tierClass(info.tier));
    html = html.replace(new RegExp('\\{\\{' + tag + '_TIER_NAME\\}\\}', 'g'), info.tier);
  }

  // ── V4 Scorecard — individual metric flip cards ──
  if (schemaV4) {
    var v4TierBg = function(t) { return t === 'P3' ? 'rgba(16,185,129,.15)' : t === 'P2' ? 'rgba(245,158,11,.15)' : 'rgba(100,116,139,.12)'; };
    var v4TierColor = function(t) { return t === 'P3' ? '#0D9488' : t === 'P2' ? '#D270F0' : '#94A3B8'; };
    var v4TierLabel = function(t) { return t === 'P3' ? 'Frontier' : t === 'P2' ? 'Expansion' : 'Foundation'; };
    var pillarKeys = Object.keys(schemaV4.pillars);
    var laneKeys = Object.keys(schemaV4.lanes);

    var gridHtml = '';
    var radarChartIdx = 0;

    // Build per-pillar sections: radar chart + metric cards
    pillarKeys.forEach(function(pKey) {
      var pDef = schemaV4.pillars[pKey];
      var chartId = 'radarPillar' + radarChartIdx++;

      // Get metrics for both lanes in this pillar
      var copilotMetrics = Object.entries(schemaV4.metrics).filter(function(e) { return e[1].lane === 'copilot' && e[1].pillar === pKey; });
      var agentMetrics = Object.entries(schemaV4.metrics).filter(function(e) { return e[1].lane === 'agents' && e[1].pillar === pKey; });
      var allMetrics = copilotMetrics.concat(agentMetrics);
      // Sort hero metrics first
      allMetrics.sort(function(a, b) { return (b[1].hero ? 1 : 0) - (a[1].hero ? 1 : 0); });

      // Normalise values to 0-100 for radar (using Frontier threshold as 100%)
      function normalise(mDef, val) {
        if (typeof val !== 'number') return 0;
        var max = mDef.bands && mDef.bands[1] ? mDef.bands[1] : 100;
        return Math.min(Math.round(val / max * 100), 120);
      }

      // Build radar data arrays
      var radarLabels = allMetrics.map(function(e) { return e[1].name; });
      var copilotData = allMetrics.map(function(e) { return e[1].lane === 'copilot' ? normalise(e[1], data[e[1].data_field]) : 0; });
      var agentData = allMetrics.map(function(e) { return e[1].lane === 'agents' ? normalise(e[1], data[e[1].data_field]) : 0; });

      // Pillar section
      gridHtml += '<div style="margin-bottom:1.5rem">';

      // Pillar header
      gridHtml += '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">';
      gridHtml += '<div style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:' + pDef.color_accent + '">' + pDef.label + '</div>';
      gridHtml += '<div style="font-size:.55rem;color:rgba(255,255,255,.35);font-style:italic">' + pDef.question + '</div>';
      gridHtml += '<div style="flex:1;height:1px;background:' + pDef.color_accent + ';opacity:.2"></div>';
      gridHtml += '</div>';

      // Two-column: radar left, cards right
      gridHtml += '<div style="display:grid;grid-template-columns:240px 1fr;gap:1rem;align-items:start">';

      // Radar chart
      gridHtml += '<div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:.75rem">';
      gridHtml += '<div style="height:200px"><canvas id="' + chartId + '"></canvas></div>';
      gridHtml += '<div style="display:flex;justify-content:center;gap:1rem;margin-top:.4rem">';
      gridHtml += '<span style="display:flex;align-items:center;gap:.3rem;font-size:.48rem;color:rgba(255,255,255,.4)"><span style="width:8px;height:3px;background:#007fff;display:inline-block;border-radius:1px"></span>M365 Copilot</span>';
      gridHtml += '<span style="display:flex;align-items:center;gap:.3rem;font-size:.48rem;color:rgba(255,255,255,.4)"><span style="width:8px;height:3px;background:#8477FB;display:inline-block;border-radius:1px"></span>Agents</span>';
      gridHtml += '</div></div>';

      // Metric cards grid (2 columns for cards)
      gridHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">';

      allMetrics.forEach(function(entry) {
        var mId = entry[0];
        var mDef = entry[1];
        var lKey = mDef.lane;
        var lane = schemaV4.lanes[lKey];
        var val = data[mDef.data_field];
        var display = typeof val === 'number' ? (Number.isInteger(val) ? String(val) : String(Math.round(val * 10) / 10)) : '\u2014';
        var mTier = v4Tiers[mId] || 'P1';
        var laneColor = lane.color;
        var laneBg = lKey === 'copilot' ? 'rgba(34,100,229,' : 'rgba(123,47,242,';
        var isHero = mDef.hero === true;
        var heroSize = isHero ? '1.8rem' : '1.4rem';
        var heroSpan = isHero ? ';grid-column:span 2' : '';

        // Flip card — hero cards span full width
        gridHtml += '<div class="flip-card scorecard-cell" style="min-height:' + (isHero ? '120' : '110') + 'px' + heroSpan + '">';
        gridHtml += '<div class="flip-card-inner">';

        // FRONT — hero cards get gradient background, non-hero get subtle lane tint
        var frontBg = isHero
          ? 'background:linear-gradient(135deg,' + laneBg + '.12),' + laneBg + '.06));border:1px solid ' + laneBg + '.2);border-left:5px solid ' + laneColor
          : 'background:' + laneBg + '.06);border:1px solid ' + laneBg + '.12);border-left:3px solid ' + laneColor;
        gridHtml += '<div class="flip-card-front" style="' + frontBg + ';padding:' + (isHero ? '.85rem 1rem' : '.65rem') + '">';
        gridHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem">';
        gridHtml += '<span style="font-size:.42rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:' + laneColor + '">' + lane.label + (isHero ? ' \u00b7 HERO' : '') + '</span>';
        gridHtml += '<span style="font-size:.38rem;font-weight:700;padding:.1rem .35rem;border-radius:100px;background:' + v4TierBg(mTier) + ';color:' + v4TierColor(mTier) + ';border:1px solid ' + v4TierColor(mTier) + '33">' + v4TierLabel(mTier) + '</span>';
        gridHtml += '</div>';
        gridHtml += '<div style="font-size:' + heroSize + ';font-weight:900;color:' + (isHero ? '#fff' : v4TierColor(mTier)) + ';line-height:1;margin-bottom:.25rem">' + display + (mDef.unit === '%' ? '%' : '') + '</div>';
        gridHtml += '<div style="font-size:' + (isHero ? '.55rem' : '.48rem') + ';font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:rgba(255,255,255,' + (isHero ? '.6' : '.4') + ')">' + mDef.name + '</div>';
        gridHtml += '</div>';

        // BACK
        gridHtml += '<div class="flip-card-back" style="background:' + laneBg + '.06);border:1px solid ' + laneBg + '.12);border-left:3px solid ' + laneColor + ';padding:.65rem">';
        gridHtml += '<div style="font-size:.5rem;font-weight:700;color:' + laneColor + ';margin-bottom:.3rem">' + mDef.name + '</div>';
        gridHtml += '<div style="font-size:.48rem;color:rgba(255,255,255,.45);line-height:1.5;margin-bottom:.4rem">' + (mDef.description || '') + '</div>';
        if (mDef.bands && mDef.bands.length >= 2) {
          var u = mDef.unit === '%' ? '%' : '';
          var barMax = mDef.unit === '%' ? 100 : mDef.bands[1] * 1.5;
          var valNorm = typeof val === 'number' ? Math.min(val / barMax * 100, 100) : 0;
          gridHtml += '<div style="position:relative;height:5px;background:rgba(255,255,255,.06);border-radius:3px;margin-bottom:.2rem">';
          gridHtml += '<div style="height:100%;width:' + valNorm + '%;background:' + v4TierColor(mTier) + ';border-radius:3px;opacity:.6"></div>';
          gridHtml += '<div style="position:absolute;left:' + (mDef.bands[0] / barMax * 100) + '%;top:-1px;bottom:-1px;width:1px;background:#D270F0"></div>';
          gridHtml += '<div style="position:absolute;left:' + (mDef.bands[1] / barMax * 100) + '%;top:-1px;bottom:-1px;width:1px;background:#0D9488"></div>';
          gridHtml += '</div>';
          gridHtml += '<div style="display:flex;justify-content:space-between;font-size:.38rem;color:rgba(255,255,255,.3)"><span style="color:#D270F0">' + mDef.bands[0] + u + '</span><span style="color:#0D9488">' + mDef.bands[1] + u + '</span></div>';
        }
        gridHtml += '</div>';

        gridHtml += '</div></div>';
      });

      gridHtml += '</div>'; // close cards grid
      gridHtml += '</div>'; // close two-column
      gridHtml += '</div>'; // close pillar section
    });

    // Build radar chart data for each pillar
    var radarData = {};
    var radarIdx = 0;
    pillarKeys.forEach(function(pKey) {
      var pDef = schemaV4.pillars[pKey];
      var copilotM = Object.entries(schemaV4.metrics).filter(function(e) { return e[1].lane === 'copilot' && e[1].pillar === pKey; });
      var agentM = Object.entries(schemaV4.metrics).filter(function(e) { return e[1].lane === 'agents' && e[1].pillar === pKey; });
      var allM = copilotM.concat(agentM);

      radarData['radarPillar' + radarIdx] = {
        labels: allM.map(function(e) { return e[1].name; }),
        copilot: allM.map(function(e) {
          if (e[1].lane !== 'copilot') return 0;
          var v = data[e[1].data_field];
          var max = e[1].bands ? e[1].bands[1] : 100;
          return typeof v === 'number' ? Math.min(Math.round(v / max * 100), 120) : 0;
        }),
        agents: allM.map(function(e) {
          if (e[1].lane !== 'agents') return 0;
          var v = data[e[1].data_field];
          var max = e[1].bands ? e[1].bands[1] : 100;
          return typeof v === 'number' ? Math.min(Math.round(v / max * 100), 120) : 0;
        }),
        frontier: allM.map(function() { return 100; })
      };
      radarIdx++;
    });
    html = html.replace(/\{\{PILLAR_RADAR_JSON\}\}/g, JSON.stringify(radarData));

    html = html.replace(/\{\{V2_SCORECARD_HTML\}\}/g, gridHtml);
    html = html.replace(/\{\{V4_SCORECARD_HTML\}\}/g, gridHtml);
  } else {
    html = html.replace(/\{\{V2_SCORECARD_HTML\}\}/g, '');
    html = html.replace(/\{\{V4_SCORECARD_HTML\}\}/g, '');
    html = html.replace(/\{\{PILLAR_RADAR_JSON\}\}/g, '{}');
  }

  // ── METRIC GLOSSARY ──────────────────────────────────────
  if (schemaV4 && schemaV4.metrics) {
    const laneColors = { copilot: '#007fff', agents: '#8477FB' };
    const laneLabels = { copilot: 'M365 Copilot', agents: 'Agents' };
    const pillarColors = { reach: '#0D9488', consistency: '#D270F0', skill: '#0891B2' };
    const pillarLabels = { reach: 'Reach', consistency: 'Habit', skill: 'Skill' };
    const pillarIcons = {
      reach: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>',
      consistency: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      skill: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
    };

    // Group by pillar for visual organisation
    const byPillar = {};
    for (const [id, m] of Object.entries(schemaV4.metrics)) {
      if (!byPillar[m.pillar]) byPillar[m.pillar] = [];
      byPillar[m.pillar].push({ id, ...m });
    }

    let glossaryHtml = '<div class="glossary-grid">';
    const pillarOrder = ['reach', 'consistency', 'skill'];
    for (const pillar of pillarOrder) {
      const metrics = byPillar[pillar] || [];
      for (const m of metrics) {
        const laneColor = laneColors[m.lane] || '#007fff';
        const laneBg = m.lane === 'agents' ? 'rgba(123,47,242,.1)' : 'rgba(34,100,229,.1)';
        const laneBorder = m.lane === 'agents' ? 'rgba(123,47,242,.2)' : 'rgba(34,100,229,.2)';
        const val = data[m.data_field];
        const valDisplay = typeof val === 'number' ? (m.unit === '%' ? Math.round(val * 10) / 10 + '%' : Number.isInteger(val) ? String(val) : val.toFixed(1)) : '—';
        const tier = v4Tiers[m.id] || 'P1';
        const heroTag = m.hero ? '<span class="glossary-hero-badge">Hero</span>' : '';

        glossaryHtml += `<div class="glossary-card" style="--gc-color:${laneColor}">`;
        glossaryHtml += `<div class="glossary-card-head">`;
        glossaryHtml += `<div class="glossary-card-name">${m.name}${heroTag}</div>`;
        glossaryHtml += `<span class="glossary-card-lane" style="background:${laneBg};color:${laneColor};border:1px solid ${laneBorder}">${laneLabels[m.lane]}</span>`;
        glossaryHtml += `</div>`;
        glossaryHtml += `<div class="glossary-card-desc">${m.description}</div>`;
        glossaryHtml += `<div class="glossary-card-meta">`;
        glossaryHtml += `<span class="glossary-card-pillar" style="color:${pillarColors[m.pillar]}">${pillarIcons[m.pillar] || ''} ${pillarLabels[m.pillar]}</span>`;
        glossaryHtml += `<span class="glossary-band glossary-band-p1">Foundation &lt; ${m.bands[0]}${m.unit === '%' ? '%' : ''}</span>`;
        glossaryHtml += `<span class="glossary-band glossary-band-p2">Expansion ${m.bands[0]}–${m.bands[1]}${m.unit === '%' ? '%' : ''}</span>`;
        glossaryHtml += `<span class="glossary-band glossary-band-p3">Frontier &gt; ${m.bands[1]}${m.unit === '%' ? '%' : ''}</span>`;
        glossaryHtml += `</div>`;
        glossaryHtml += `<div class="glossary-card-value">${valDisplay}</div>`;
        glossaryHtml += `</div>`;
      }
    }
    glossaryHtml += '</div>';
    html = html.replace(/\{\{METRIC_GLOSSARY_HTML\}\}/g, glossaryHtml);
  } else {
    html = html.replace(/\{\{METRIC_GLOSSARY_HTML\}\}/g, '');
  }

  // Org scatter chart data — transform to Chart.js bubble dataset format
  // Each org becomes a dataset: {label, data: [{x, y, r}], backgroundColor, borderColor}
  const orgScatter = Array.isArray(data.org_scatter_data) ? data.org_scatter_data : [];
  const scatterDatasets = orgScatter.map(function(org) {
    // Normalize r (bubble size) — scale to 3-20 range
    const maxR = Math.max.apply(null, orgScatter.map(function(o) { return o.r || 1; }));
    const rNorm = Math.max(3, Math.round((org.r || 1) / maxR * 20));
    return {
      label: org.label,
      data: [{ x: org.x, y: org.y, r: rNorm }]
    };
  });
  html = html.replace(/\{\{ORG_SCATTER_DATA\}\}/g, safeJSON(scatterDatasets, 'org_scatter_data'));

  // Concentration Index — already computed in derived-data phase above; no duplicate needed here

  // Per-org Frontier Firm maturity — composite score across available signals
  // Combines: Reach (user count as % of total), Habit (relative scale), Skill (agent adoption %)
  // Score 0-100, classified into Pattern 1/2/3
  var orgPatternCounts = { P1: 0, P2: 0, P3: 0 };
  var orgPatternList = [];
  if (orgScatter.length > 0) {
    var maxOrgUsers = Math.max.apply(null, orgScatter.map(function(o) { return o.x || 1; }));
    var maxAgentPct = Math.max.apply(null, orgScatter.map(function(o) { return o.y || 1; }));
    var totalUsers = n('total_active_users', 1);

    orgScatter.forEach(function(org) {
      var users = org.x || 0;
      var agentPct = org.y || 0;

      // Reach score (0-100): how much of total user base is in this org
      var reachScore = Math.min(100, Math.round(users / totalUsers * 100 * 5)); // scale up — even small orgs get credit
      // Habit proxy (0-100): relative user scale normalised to largest org
      var habitScore = Math.min(100, Math.round(users / maxOrgUsers * 100));
      // Skill score (0-100): agent adoption normalised to threshold
      var skillScore = Math.min(100, Math.round(agentPct / 30 * 100)); // 30% = P3 threshold

      // Composite: weighted average — Skill (agent progression) weighs most
      var composite = Math.round(reachScore * 0.2 + habitScore * 0.3 + skillScore * 0.5);

      var orgPattern;
      if (composite >= 60) orgPattern = 'P3';
      else if (composite >= 30) orgPattern = 'P2';
      else orgPattern = 'P1';

      orgPatternCounts[orgPattern]++;
      orgPatternList.push({
        label: org.label,
        pattern: orgPattern,
        agentPct: agentPct,
        users: users,
        composite: composite,
        scores: { reach: reachScore, habit: habitScore, skill: skillScore }
      });
    });
  }
  var orgPatternJSON = JSON.stringify({
    labels: ['Foundation · Assistant', 'Expansion · Agent Teams', 'Frontier · Agent-Operated'],
    keys: ['P1', 'P2', 'P3'],
    counts: [orgPatternCounts.P1, orgPatternCounts.P2, orgPatternCounts.P3],
    total: orgScatter.length,
    orgs: orgPatternList
  });
  html = html.replace(/\{\{ORG_PATTERN_DISTRIBUTION_JSON\}\}/g, orgPatternJSON);

  // Dominant org pattern
  var dominantOrgPattern = orgPatternCounts.P1 >= orgPatternCounts.P2 && orgPatternCounts.P1 >= orgPatternCounts.P3 ? 'Foundation · Human with Assistant'
    : orgPatternCounts.P2 >= orgPatternCounts.P3 ? 'Expansion · Human-Agent Teams' : 'Frontier · Agent-Operated';
  html = html.replace(/\{\{DOMINANT_ORG_PATTERN\}\}/g, dominantOrgPattern);
  html = html.replace(/\{\{ORG_FOUNDATION_COUNT\}\}/g, String(orgPatternCounts.P1));
  html = html.replace(/\{\{ORG_EXPANSION_COUNT\}\}/g, String(orgPatternCounts.P2));
  html = html.replace(/\{\{ORG_FRONTIER_COUNT\}\}/g, String(orgPatternCounts.P3));
  html = html.replace(/\{\{ORG_FOUNDATION_PCT\}\}/g, orgScatter.length > 0 ? String(Math.round(orgPatternCounts.P1 / orgScatter.length * 100)) : '0');
  html = html.replace(/\{\{ORG_EXPANSION_PCT\}\}/g, orgScatter.length > 0 ? String(Math.round(orgPatternCounts.P2 / orgScatter.length * 100)) : '0');
  html = html.replace(/\{\{ORG_FRONTIER_PCT\}\}/g, orgScatter.length > 0 ? String(Math.round(orgPatternCounts.P3 / orgScatter.length * 100)) : '0');

  // Org scatter insights — dynamic from the data
  var orgInsights = '';
  if (orgScatter.length > 0) {
    var sorted = orgScatter.slice().sort(function(a,b) { return (b.y||0) - (a.y||0); });
    var topAdopt = sorted[0];
    var biggest = orgScatter.slice().sort(function(a,b) { return (b.x||0) - (a.x||0); })[0];
    var lowAdopt = sorted.filter(function(o) { return (o.y||0) < 5; });
    orgInsights += '<div style="display:flex;flex-direction:column;gap:.75rem">';
    if (topAdopt) orgInsights += '<div style="font-size:.78rem;color:var(--text-2);line-height:1.5"><strong style="color:var(--green)">' + topAdopt.label + '</strong> leads agent adoption at <strong style="color:#fff">' + topAdopt.y + '%</strong> — study what they do differently</div>';
    if (biggest && biggest.label !== topAdopt.label) orgInsights += '<div style="font-size:.78rem;color:var(--text-2);line-height:1.5"><strong style="color:var(--brand)">' + biggest.label + '</strong> is the largest org (' + fmtN(biggest.x) + ' users) at <strong style="color:#fff">' + biggest.y + '%</strong> agent adoption</div>';
    if (lowAdopt.length > 0) orgInsights += '<div style="font-size:.78rem;color:var(--text-2);line-height:1.5"><strong style="color:var(--amber)">' + lowAdopt.length + ' orgs</strong> below 5% agent adoption — the untapped opportunity</div>';
    orgInsights += '</div>';
  }
  html = html.replace(/\{\{ORG_SCATTER_INSIGHTS\}\}/g, orgInsights || '<p style="font-size:.78rem;color:var(--text-3)">Org data not available</p>');

  // Value section — time savings comparison
  const licensedHrsPerUserYr = Math.round(n('licensed_avg_prompts') * 6 / 60 * 12);
  const unlicensedHrsPerUserYr = Math.round(n('unlicensed_avg_prompts') * 6 / 60 * 12);
  const engagementMultiplier = (n('licensed_avg_prompts') / Math.max(n('unlicensed_avg_prompts'), 1)).toFixed(1);
  const chatCurrentSavingsK = Math.round(n('unlicensed_avg_prompts') * n('chat_users') * 6 / 60 * 12 / 1000);
  const chatUpliftK = Math.round((n('licensed_avg_prompts') - n('unlicensed_avg_prompts')) * n('chat_users') * 6 / 60 * 12 / 1000);
  html = html.replace(/\{\{VALUE_LICENSED_HRS\}\}/g, String(licensedHrsPerUserYr));
  html = html.replace(/\{\{VALUE_UNLICENSED_HRS\}\}/g, String(unlicensedHrsPerUserYr));
  html = html.replace(/\{\{VALUE_MULTIPLIER\}\}/g, engagementMultiplier);
  html = html.replace(/\{\{VALUE_CHAT_CURRENT_K\}\}/g, fmtN(chatCurrentSavingsK));
  html = html.replace(/\{\{VALUE_CHAT_UPLIFT_K\}\}/g, fmtN(chatUpliftK));

  // License priority table — from supplementary data or placeholder
  const licPriorityOrgs = data._supplementary_metrics && data._supplementary_metrics.license_priority_orgs;
  if (licPriorityOrgs && licPriorityOrgs.length) {
    let tbl = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">';
    tbl += '<thead><tr style="border-bottom:2px solid rgba(255,255,255,.1)"><th style="text-align:left;padding:.5rem .4rem;font-weight:600;color:rgba(255,255,255,.4);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em">Organisation</th><th style="text-align:right;padding:.5rem .4rem;font-weight:600;color:rgba(255,255,255,.4);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em">Unlicensed</th><th style="text-align:right;padding:.5rem .4rem;font-weight:600;color:rgba(255,255,255,.4);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em">Licensed</th><th style="text-align:right;padding:.5rem .4rem;font-weight:600;color:rgba(255,255,255,.4);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em">Ratio</th><th style="text-align:right;padding:.5rem .4rem;font-weight:600;color:rgba(255,255,255,.4);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em">Sessions/Wk</th></tr></thead><tbody>';
    licPriorityOrgs.slice(0, 10).forEach(function(org) {
      const unlicCount = org.unlicensed_users || org.unlicensed || 0;
      const licCount = org.licensed_users || org.licensed || 0;
      const ratioVal = org.ratio_unlicensed_to_licensed || org.ratio || (licCount > 0 ? Math.round(unlicCount / licCount * 100) / 100 : 0);
      const ratioStr = typeof ratioVal === 'number' && ratioVal < 900 ? ratioVal.toFixed(1) + 'x' : '—';
      const total = licCount + unlicCount;
      const unlicPct = total > 0 ? Math.round(unlicCount / total * 100) : 0;
      tbl += '<tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:.5rem .4rem;color:#fff;font-weight:600">' + org.org + '</td><td style="text-align:right;padding:.5rem .4rem;color:#0891B2">' + fmtN(unlicCount) + '</td><td style="text-align:right;padding:.5rem .4rem;color:#007fff">' + fmtN(licCount) + '</td><td style="text-align:right;padding:.5rem .4rem;color:#D270F0;font-weight:700">' + unlicPct + '%</td><td style="text-align:right;padding:.5rem .4rem;color:rgba(255,255,255,.7)">' + (org.unlicensed_median_sessions_weekly || '—') + '</td></tr>';
    });
    tbl += '</tbody></table></div>';
    html = html.replace(/\{\{LICENSE_PRIORITY_TABLE\}\}/g, tbl);
  } else {
    html = html.replace(/\{\{LICENSE_PRIORITY_TABLE\}\}/g,
      '<div style="padding:1.5rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;text-align:center"><p style="font-size:.82rem;color:rgba(255,255,255,.5);margin:0">Per-organisation license priority data not yet loaded. Run the GHCP extraction to populate this table.</p></div>');
  }

  // Agent leaderboard rows — ranked by total sessions (reach × depth)
  const agentColors = [
    'linear-gradient(90deg,var(--brand),var(--amber))',
    'linear-gradient(90deg,var(--purple),#C040C8)',
    'linear-gradient(90deg,var(--teal),var(--dark-teal))',
    'linear-gradient(90deg,var(--lime),#8A9600)',
    'linear-gradient(90deg,#FECB00,var(--amber))',
  ];
  const agentArr = Array.isArray(data.agent_table) ? data.agent_table : [];
  const names = data.top_agent_names || agentArr.slice(0, 8).map(a => a.name);
  // Use total sessions for the bar chart (not sessions_per_user)
  const totalSessions = agentArr.slice(0, 8).map(a => a.sessions || 0);
  const agentUsers = agentArr.slice(0, 8).map(a => a.users || 0);
  const sessions = totalSessions.length > 0 ? totalSessions : (data.top_agent_sessions || []);
  const maxSess = Math.max(...sessions, 1);
  let leaderRows = '';
  for (let i = 0; i < Math.min(names.length, 5); i++) {
    const pct = Math.round((sessions[i] || 0) / maxSess * 100);
    const bg = agentColors[i % agentColors.length];
    const userLabel = agentUsers[i] ? ' · ' + fmt(agentUsers[i]) + ' users' : '';
    leaderRows += '<div class="top-agent-row"><span class="top-agent-name">' + names[i] + '<span style="font-size:.55rem;color:var(--text-3);font-weight:400;margin-left:.4rem">' + userLabel + '</span></span><div class="top-agent-track"><div class="top-agent-fill" data-width="' + pct + '" style="width:0;background:' + bg + '"><span>' + fmt(sessions[i] || 0) + '</span></div></div><span class="top-agent-count">' + fmt(sessions[i] || 0) + '</span></div>\n';
  }
  html = html.replace(/\{\{AGENT_LEADERBOARD_ROWS\}\}/g, leaderRows);

  // Agent type cards — use a simple generic version
  html = html.replace(/\{\{AGENT_TYPE_CARDS\}\}/g, '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;max-width:900px;margin:0 auto">' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.25rem;border-top:3px solid var(--purple)"><div style="font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--purple);margin-bottom:.75rem">FirstParty (Microsoft-Built)</div><div style="font-size:.82rem;color:var(--text-2);line-height:1.5">Standard agents available across all tenants. High reach but moderate stickiness.</div></div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.25rem;border-top:3px solid var(--copilot-teal)"><div style="font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--copilot-teal);margin-bottom:.75rem">Agent Builder (' + data.customer_name + '-Built)</div><div style="font-size:.82rem;color:var(--text-2);line-height:1.5">Custom agents built for specific workflows. Purpose-built agents typically drive higher engagement.</div></div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.25rem;border-top:3px solid var(--amber)"><div style="font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--amber);margin-bottom:.75rem">Stickiness Leaders</div><div style="font-size:.82rem;color:var(--text-2);line-height:1.5">The agents with the highest sessions-per-user show what embedded AI looks like.</div></div>' +
    '</div>');

  // Agent table rows — prefer agent_table array (has full data), fallback to top_agent_* arrays
  let tableRows = '';
  const agentTableArr = Array.isArray(data.agent_table) ? data.agent_table : [];
  if (agentTableArr.length > 0) {
    agentTableArr.slice(0, 10).forEach(function(row) {
      const sessPerUser = row.sessions_per_user || (row.users > 0 ? Math.round(row.sessions / row.users * 10) / 10 : 0);
      tableRows += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:.55rem .4rem;font-weight:600;color:var(--text)">' + (row.name || '—') + '</td>' +
        '<td style="padding:.55rem .4rem;font-size:.72rem;color:var(--text-2)">' + (row.type || '—') + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums">' + fmtN(row.users || 0) + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums">' + fmtN(row.sessions || 0) + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums;font-weight:600;color:var(--purple)">' + sessPerUser + '</td>' +
        '</tr>\n';
    });
  } else {
    // Fallback to top_agent_* arrays
    const types = data.top_agent_types || [];
    const users = data.top_agent_users || [];
    for (let i = 0; i < Math.min(names.length, 8); i++) {
      const type = types[i] || '—';
      const uCount = users[i] || 0;
      const sess = sessions[i] || 0;
      const sessPerUser = uCount > 0 ? (sess / uCount).toFixed(1) : '—';
      tableRows += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:.55rem .4rem;font-weight:600;color:var(--text)">' + names[i] + '</td>' +
        '<td style="padding:.55rem .4rem;font-size:.72rem;color:var(--text-2)">' + type + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums">' + fmtN(uCount) + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums">' + fmtN(sess) + '</td>' +
        '<td style="text-align:right;padding:.55rem .4rem;font-variant-numeric:tabular-nums;font-weight:600;color:var(--purple)">' + sessPerUser + '</td>' +
        '</tr>\n';
    }
  }
  html = html.replace(/\{\{AGENT_TABLE_ROWS\}\}/g, tableRows);

  // Agent insights
  html = html.replace(/\{\{AGENT_LOB_INSIGHT\}\}/g, '<strong>Purpose-built agents</strong> designed for specific workflows achieve higher stickiness than generic first-party agents.');
  html = html.replace(/\{\{AGENT_PROFICIENCY_INSIGHT\}\}/g, 'Most agent users stick to a single agent. The goal isn\u2019t more agents per person \u2014 it\u2019s making the few good agents (like ' + (names[0] || 'top performers') + ') easy to find and share across teams.');
  html = html.replace(/\{\{TOP_AGENT_1\}\}/g, names[0] || 'N/A');

  // ── NEW v3 PLACEHOLDERS ──────────────────────────────────

  // Actions section
  // Build pattern-aware actions title
  html = html.replace(/\{\{ACTIONS_TITLE\}\}/g,
    'Four moves towards becoming a Frontier Firm');
  html = html.replace(/\{\{ACTIONS_SUBTITLE\}\}/g,
    'Each recommendation targets a specific dimension of maturity \u2014 building the habits, proficiency, and reach that separate organisations where AI is deployed from those where it\u2019s truly embedded.');

  // Recommendation KPIs — data-driven
  html = html.replace(/\{\{REC_1_KPI\}\}/g,
    'Target: ' + n('m365_frequency') + '% habitual \u2192 ' + Math.max(Math.round(n('m365_frequency') * 2), 25) + '%+ in 3 months');
  html = html.replace(/\{\{REC_2_KPI\}\}/g,
    'Target: ' + (n('m365_breadth') || 'N/A') + ' \u2192 ' + Math.max((n('m365_breadth', 3)) + 2, 7) + '+ apps/user | BizChat concentration ' + (data._supplementary_metrics && data._supplementary_metrics.bizchat_concentration_pct || 63) + '% \u2192 <50%');
  html = html.replace(/\{\{REC_3_KPI\}\}/g,
    'Target: License top ' + fmtN(Math.min(Math.round(n('chat_users') * 0.13), 5000)) + ' unlicensed Chat users by org priority');
  html = html.replace(/\{\{REC_4_KPI\}\}/g,
    'Target: Retire ' + fmtN(data.agents_retire || 0) + ' dormant agents. Publish governed catalogue within 60 days');

  // Analysis period & retention metadata
  const meta = data._metadata || {};
  html = html.replace(/\{\{ANALYSIS_PERIOD\}\}/g, meta.data_period || 'See data file');
  html = html.replace(/\{\{RETENTION_NOTE\}\}/g,
    data.retention_note || 'Retention uses most recent complete month pair');

  // Retention months — derive from supplementary data or defaults
  const retentionCohorts = data._supplementary_metrics && data._supplementary_metrics.retention_cohorts;
  const retentionKeys = retentionCohorts ? Object.keys(retentionCohorts) : [];
  const lastCohort = retentionKeys.length ? retentionKeys[retentionKeys.length - 1] : '';
  const monthNames = {jan:'January',feb:'February',mar:'March',apr:'April',may:'May',jun:'June',jul:'July',aug:'August',sep:'September',oct:'October',nov:'November',dec:'December'};
  function parseRetentionMonths(key) {
    const parts = key.split('_to_');
    if (parts.length === 2) {
      return { from: monthNames[parts[0]] || parts[0], to: monthNames[parts[1]] || parts[1] };
    }
    return { from: 'Previous month', to: 'Current month' };
  }
  const retMonths = parseRetentionMonths(lastCohort);
  html = html.replace(/\{\{RETENTION_MONTH_FROM\}\}/g, retMonths.from);
  html = html.replace(/\{\{RETENTION_MONTH_TO\}\}/g, retMonths.to);
  html = html.replace(/\{\{RETENTION_PERIOD_LABEL\}\}/g, retMonths.from.substring(0,3) + '-' + retMonths.to.substring(0,3) + ' retention');

  // Retention correction note
  html = html.replace(/\{\{RETENTION_CORRECTION_NOTE\}\}/g,
    'Average MoM retention across complete months (excluding partial current month). The ' + data.m365_retention + '% average retention is a <strong style="color:#fff">' + (data.m365_retention >= 85 ? 'Frontier-tier' : data.m365_retention >= 70 ? 'Expansion-tier' : 'Foundation-tier') + ' signal</strong>.');

  // Monthly active users trend — from monthly_data
  const monthlyData = data._supplementary_metrics && data._supplementary_metrics.monthly_data;
  if (monthlyData) {
    const monthLabels = Object.keys(monthlyData).map(function(k) {
      var parts = k.split('_');
      var m = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return m + ' ' + parts[1].substring(2);
    });
    const monthlyUsers = Object.values(monthlyData).map(function(m) { return m.users; });
    const monthlyPromptsPerUser = Object.values(monthlyData).map(function(m) { return m.avg_prompts_per_user; });
    html = html.replace(/\{\{MONTHLY_LABELS_JSON\}\}/g, JSON.stringify(monthLabels));
    html = html.replace(/\{\{MONTHLY_USERS_JSON\}\}/g, JSON.stringify(monthlyUsers));
    html = html.replace(/\{\{MONTHLY_PROMPTS_PER_USER_JSON\}\}/g, JSON.stringify(monthlyPromptsPerUser));
  } else {
    html = html.replace(/\{\{MONTHLY_LABELS_JSON\}\}/g, '[]');
    html = html.replace(/\{\{MONTHLY_USERS_JSON\}\}/g, '[]');
    html = html.replace(/\{\{MONTHLY_PROMPTS_PER_USER_JSON\}\}/g, '[]');
  }

  // Weekly trend data — compute scorecard-aligned rates from raw counts
  const weeklyTrend = data.weekly_trend;
  var totalSeats = n('total_licensed_seats', 1);
  if (Array.isArray(weeklyTrend) && weeklyTrend.length > 0) {
    const wtData = {
      labels: weeklyTrend.map(function(w) {
        // Parse DD/MM/YYYY HH:MM:SS or ISO formats
        var raw = w.week || '';
        var d;
        var ukMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ukMatch) {
          d = new Date(Number(ukMatch[3]), Number(ukMatch[2]) - 1, Number(ukMatch[1]));
        } else {
          d = new Date(raw);
        }
        return isNaN(d.getTime()) ? raw.substring(0, 6) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }),
      // Raw counts (for tooltip)
      m365_raw: weeklyTrend.map(function(w) { return w.m365 || 0; }),
      chat_raw: weeklyTrend.map(function(w) { return w.chat || 0; }),
      agents_raw: weeklyTrend.map(function(w) { return w.agents || 0; }),
      // Activation rate: M365 users as % of licensed seats
      activation: weeklyTrend.map(function(w) { return Math.round((w.m365 || 0) / totalSeats * 1000) / 10; }),
      // Agent adoption: agents as % of M365 users
      agent_adoption: weeklyTrend.map(function(w) { return (w.m365 || 0) > 0 ? Math.round((w.agents || 0) / (w.m365 || 1) * 1000) / 10 : 0; }),
      // Total active: all three combined
      total: weeklyTrend.map(function(w) { return (w.m365 || 0) + (w.chat || 0) + (w.agents || 0); })
    };
    html = html.replace(/\{\{WEEKLY_TREND_JSON\}\}/g, JSON.stringify(wtData));
  } else {
    html = html.replace(/\{\{WEEKLY_TREND_JSON\}\}/g, JSON.stringify({ labels: [], activation: [], agent_adoption: [], total: [], m365_raw: [], chat_raw: [], agents_raw: [] }));
  }

  // Per-tier monthly data — for tier toggle charts
  const perTierMonthlyUsers = data._supplementary_metrics && data._supplementary_metrics.per_tier_monthly_users;
  const perTierActiveDay = data._supplementary_metrics && data._supplementary_metrics.per_tier_active_day_bands;
  const perTierRetention = data._supplementary_metrics && data._supplementary_metrics.per_tier_retention_cohorts;

  if (perTierMonthlyUsers) {
    const tierData = {
      labels: perTierMonthlyUsers.map(function(m) { return m.month; }),
      m365: perTierMonthlyUsers.map(function(m) { return m.licensed; }),
      chat: perTierMonthlyUsers.map(function(m) { return m.unlicensed; }),
      agents: perTierMonthlyUsers.map(function(m) { return m.agents; })
    };
    html = html.replace(/\{\{PER_TIER_MONTHLY_USERS_JSON\}\}/g, JSON.stringify(tierData));
  } else {
    html = html.replace(/\{\{PER_TIER_MONTHLY_USERS_JSON\}\}/g, 'null');
  }

  if (perTierRetention) {
    const tierRetData = {
      labels: perTierRetention.map(function(c) { return c.period; }),
      m365: { retained: perTierRetention.map(function(c) { return c.licensed.retained; }), new_users: perTierRetention.map(function(c) { return c.licensed.new; }), churned: perTierRetention.map(function(c) { return c.licensed.churned; }) },
      chat: { retained: perTierRetention.map(function(c) { return c.unlicensed.retained; }), new_users: perTierRetention.map(function(c) { return c.unlicensed.new; }), churned: perTierRetention.map(function(c) { return c.unlicensed.churned; }) },
      agents: { retained: perTierRetention.map(function(c) { return c.agents.retained; }), new_users: perTierRetention.map(function(c) { return c.agents.new; }), churned: perTierRetention.map(function(c) { return c.agents.churned; }) }
    };
    html = html.replace(/\{\{PER_TIER_RETENTION_JSON\}\}/g, JSON.stringify(tierRetData));
  } else {
    html = html.replace(/\{\{PER_TIER_RETENTION_JSON\}\}/g, 'null');
  }

  if (perTierActiveDay) {
    // Group by month, then by tier
    const months = [...new Set(perTierActiveDay.map(function(r) { return r.month; }))];
    const monthLabelsAD = months.map(function(m) {
      var d = new Date(m); return d.toLocaleString('en',{month:'short'}) + ' ' + String(d.getFullYear()).substring(2);
    });
    function extractTierBands(tier) {
      // Try case-insensitive match and support both count and pct field names
      return months.map(function(month) {
        var row = perTierActiveDay.find(function(r) { return r.month === month && r.tier.toLowerCase() === tier.toLowerCase(); });
        if (!row) return { b1_5: 0, b6_10: 0, b11_19: 0, b20: 0 };
        // If _pct fields exist, data is already percentages — use directly
        if (row.band_1_5_pct !== undefined) {
          return {
            b1_5: row.band_1_5_pct || 0,
            b6_10: row.band_6_10_pct || 0,
            b11_19: row.band_11_15_pct || row.band_11_19_pct || 0,
            b20: row.band_16_plus_pct || row.band_20_plus_pct || 0
          };
        }
        // Otherwise calculate from counts
        var total = (row.band_1_5 || 0) + (row.band_6_10 || 0) + (row.band_11_19 || row.band_11_15 || 0) + (row.band_20_plus || row.band_16_plus || 0);
        return {
          b1_5: total ? Math.round((row.band_1_5 || 0) / total * 1000) / 10 : 0,
          b6_10: total ? Math.round((row.band_6_10 || 0) / total * 1000) / 10 : 0,
          b11_19: total ? Math.round((row.band_11_19 || row.band_11_15 || 0) / total * 1000) / 10 : 0,
          b20: total ? Math.round((row.band_20_plus || row.band_16_plus || 0) / total * 1000) / 10 : 0
        };
      });
    }
    const tierADData = {
      labels: monthLabelsAD,
      m365: extractTierBands('Licensed'),
      chat: extractTierBands('Unlicensed'),
      agents: extractTierBands('Agents').length > 0 && extractTierBands('Agents').some(function(r) { return r.b1_5 > 0; })
        ? extractTierBands('Agents')
        : [{ b1_5: data.agent_band_1_5_pct || 0, b6_10: data.agent_band_6_10_pct || 0, b11_19: data.agent_band_11_15_pct || 0, b20: data.agent_band_16_plus_pct || 0 }],
      agentLabels: extractTierBands('Agents').length > 0 && extractTierBands('Agents').some(function(r) { return r.b1_5 > 0; })
        ? monthLabelsAD
        : ['Latest Month']
    };
    html = html.replace(/\{\{PER_TIER_ACTIVE_DAY_JSON\}\}/g, JSON.stringify(tierADData));
  } else {
    html = html.replace(/\{\{PER_TIER_ACTIVE_DAY_JSON\}\}/g, 'null');
  }

  // ── Habit: Monthly Users by Tier (V3 chartHabitTiers) ──
  const perTierM = data._supplementary_metrics && data._supplementary_metrics.per_tier_monthly_users;
  if (Array.isArray(perTierM) && perTierM.length > 0) {
    // Exclude last month if it looks partial (< 60% of previous month's total)
    var tierMonths = perTierM;
    if (tierMonths.length >= 2) {
      var lastTotal = (tierMonths[tierMonths.length-1].licensed||0) + (tierMonths[tierMonths.length-1].unlicensed||0);
      var prevTotal = (tierMonths[tierMonths.length-2].licensed||0) + (tierMonths[tierMonths.length-2].unlicensed||0);
      if (lastTotal < prevTotal * 0.6) tierMonths = tierMonths.slice(0, -1);
    }
    html = html.replace(/\{\{HABIT_TIER_LABELS\}\}/g, JSON.stringify(tierMonths.map(function(m) { return m.month; })));
    html = html.replace(/\{\{HABIT_TIER_LICENSED\}\}/g, JSON.stringify(tierMonths.map(function(m) { return m.licensed || 0; })));
    html = html.replace(/\{\{HABIT_TIER_UNLICENSED\}\}/g, JSON.stringify(tierMonths.map(function(m) { return m.unlicensed || 0; })));
    html = html.replace(/\{\{HABIT_TIER_AGENTS\}\}/g, JSON.stringify(tierMonths.map(function(m) { return m.agents || 0; })));
  } else {
    html = html.replace(/\{\{HABIT_TIER_LABELS\}\}/g, '["No data"]');
    html = html.replace(/\{\{HABIT_TIER_LICENSED\}\}/g, '[0]');
    html = html.replace(/\{\{HABIT_TIER_UNLICENSED\}\}/g, '[0]');
    html = html.replace(/\{\{HABIT_TIER_AGENTS\}\}/g, '[0]');
  }

  // ── Retention: MoM per month pair (V3 bar chart) ──
  // Compute retention from per_tier_monthly_users: retained = min(current_total, prev_total) / prev_total
  // Real retention requires cohort overlap, so use m365_retention as baseline
  if (Array.isArray(perTierM) && perTierM.length >= 2) {
    var retLabels = [], retValues = [], retColors = [];
    var fullMonths = perTierM;
    // Exclude partial last month
    if (fullMonths.length >= 2) {
      var lt = (fullMonths[fullMonths.length-1].licensed||0) + (fullMonths[fullMonths.length-1].unlicensed||0);
      var pt = (fullMonths[fullMonths.length-2].licensed||0) + (fullMonths[fullMonths.length-2].unlicensed||0);
      if (lt < pt * 0.6) fullMonths = fullMonths.slice(0, -1);
    }
    // Use data.retention_per_month if available, otherwise estimate from overall retention
    var retPerMonth = data._supplementary_metrics && data._supplementary_metrics.retention_per_month;
    for (var ri = 1; ri < fullMonths.length; ri++) {
      var fromM = fullMonths[ri-1].month || ('M' + ri);
      var toM = fullMonths[ri].month || ('M' + (ri+1));
      var label = fromM.replace(/\d{4}-/, '').replace('09','Sep').replace('10','Oct').replace('11','Nov').replace('12','Dec').replace('01','Jan') + ' \u2192 ' + toM.replace(/\d{4}-/, '').replace('09','Sep').replace('10','Oct').replace('11','Nov').replace('12','Dec').replace('01','Jan');
      var retPct = retPerMonth && retPerMonth[ri-1] ? retPerMonth[ri-1] : (typeof data.m365_retention === 'number' ? data.m365_retention : 0);
      retLabels.push(label);
      retValues.push(Math.round(retPct * 10) / 10);
      retColors.push(retPct >= 85 ? "'#0D9488'" : retPct >= 70 ? "'#D270F0'" : "'#EF4444'");
    }
    html = html.replace(/\{\{RETENTION_MONTH_LABELS\}\}/g, JSON.stringify(retLabels));
    html = html.replace(/\{\{RETENTION_MONTH_VALUES\}\}/g, JSON.stringify(retValues));
    html = html.replace(/\{\{RETENTION_MONTH_COLORS\}\}/g, '[' + retColors.join(',') + ']');
  } else {
    html = html.replace(/\{\{RETENTION_MONTH_LABELS\}\}/g, '["No data"]');
    html = html.replace(/\{\{RETENTION_MONTH_VALUES\}\}/g, '[0]');
    html = html.replace(/\{\{RETENTION_MONTH_COLORS\}\}/g, '["#64748B"]');
  }

  // Cohort flow chart data — from retention_cohorts
  if (retentionCohorts) {
    const cohortLabels = retentionKeys.map(function(k) {
      var parts = k.split('_to_');
      return (monthNames[parts[0]] || parts[0]).substring(0,3) + ' \u2192 ' + (monthNames[parts[1]] || parts[1]).substring(0,3);
    });
    const cohortRetained = retentionKeys.map(function(k) { return retentionCohorts[k].retained; });
    const cohortNew = retentionKeys.map(function(k) { return retentionCohorts[k].new; });
    const cohortChurned = retentionKeys.map(function(k) { return retentionCohorts[k].churned; });
    html = html.replace(/\{\{COHORT_LABELS_JSON\}\}/g, JSON.stringify(cohortLabels));
    html = html.replace(/\{\{COHORT_RETAINED_JSON\}\}/g, JSON.stringify(cohortRetained));
    html = html.replace(/\{\{COHORT_NEW_JSON\}\}/g, JSON.stringify(cohortNew));
    html = html.replace(/\{\{COHORT_CHURNED_JSON\}\}/g, JSON.stringify(cohortChurned));
  } else {
    html = html.replace(/\{\{COHORT_LABELS_JSON\}\}/g, '[]');
    html = html.replace(/\{\{COHORT_RETAINED_JSON\}\}/g, '[]');
    html = html.replace(/\{\{COHORT_NEW_JSON\}\}/g, '[]');
    html = html.replace(/\{\{COHORT_CHURNED_JSON\}\}/g, '[]');
  }

  // App surface bars — generate from supplementary data
  if (appData) {
    const appEntries = Object.entries(appData).sort(function(a, b) { return b[1].pct - a[1].pct; });
    const maxPct = appEntries[0] ? appEntries[0][1].pct : 100;
    const appNameMap = {office_bizchat:'BizChat',teams:'Teams',word:'Word',outlook:'Outlook',outlook_sidepane:'Outlook Sidepane',forms:'Forms',excel:'Excel',powerpoint:'PowerPoint',power_bi:'Power BI',copilot_studio:'Copilot Studio'};
    const appGradients = [
      'linear-gradient(90deg,var(--copilot-purple),var(--copilot-blue))',
      'linear-gradient(90deg,var(--copilot-blue),var(--copilot-teal))',
      'linear-gradient(90deg,var(--copilot-blue),var(--copilot-teal))',
      'linear-gradient(90deg,var(--copilot-teal),var(--copilot-green))',
      'rgba(148,163,184,.4)',
      'rgba(245,158,11,.5)',
      'rgba(245,158,11,.5)',
    ];
    let barsHtml = '';
    appEntries.forEach(function(entry, i) {
      const name = appNameMap[entry[0]] || entry[0];
      const pct = entry[1].pct;
      const widthPct = Math.round((pct / maxPct) * 100);
      const bg = appGradients[Math.min(i, appGradients.length - 1)];
      const opacity = pct < 1 ? ';opacity:.55' : '';
      barsHtml += '<div style="display:flex;align-items:center;gap:.6rem' + opacity + '"><span style="width:100px;font-size:.78rem;color:var(--text-2)">' + name + '</span><div style="flex:1;height:24px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:' + widthPct + '%;height:100%;background:' + bg + ';border-radius:4px"></div></div><span style="min-width:100px;text-align:right;font-size:.75rem;font-variant-numeric:tabular-nums;color:var(--text)">' + fmtN(entry[1].interactions) + ' (' + pct + '%)</span></div>\n';
    });
    html = html.replace(/\{\{APP_SURFACE_BARS\}\}/g, barsHtml);
  } else {
    html = html.replace(/\{\{APP_SURFACE_BARS\}\}/g, '<p style="font-size:.78rem;color:var(--text-3);font-style:italic">App surface data not available</p>');
  }

  // App surface chart data (for V3 chartAppSurface canvas)
  if (appData) {
    const appEntries2 = Object.entries(appData).sort(function(a, b) { return b[1].pct - a[1].pct; }).slice(0, 10);
    const appLabels = appEntries2.map(function(e) {
      var names = {office_bizchat:'BizChat',office:'BizChat',teams:'Teams',word:'Word',outlook:'Outlook',edge:'Edge',forms:'Forms',excel:'Excel',powerpoint:'PowerPoint',sharepoint:'SharePoint',designer:'Designer',outlooksidepane:'Outlook Sidepane'};
      return '"' + (names[e[0]] || e[0]) + '"';
    }).join(',');
    var appValues = appEntries2.map(function(e) { return e[1].pct; }).join(',');
    html = html.replace(/\{\{APP_SURFACE_LABELS\}\}/g, appLabels);
    html = html.replace(/\{\{APP_SURFACE_DATA\}\}/g, appValues);
  } else {
    html = html.replace(/\{\{APP_SURFACE_LABELS\}\}/g, '"No data"');
    html = html.replace(/\{\{APP_SURFACE_DATA\}\}/g, '0');
  }

  // Skill growth signal — data-driven
  if (appData) {
    const sorted = Object.entries(appData).sort(function(a, b) { return a[1].pct - b[1].pct; });
    const bottomTwo = sorted.slice(0, 2).map(function(e) {
      const n = {office_bizchat:'BizChat',teams:'Teams',word:'Word',outlook:'Outlook',outlook_sidepane:'Outlook Sidepane',forms:'Forms',excel:'Excel',powerpoint:'PowerPoint',power_bi:'Power BI',copilot_studio:'Copilot Studio'};
      return (n[e[0]] || e[0]) + ' (' + e[1].pct + '%)';
    });
    html = html.replace(/\{\{SKILL_GROWTH_SIGNAL\}\}/g,
      '<strong>' + bottomTwo.join(' & ') + ' are the least-used surfaces</strong> \u2014 targeted use-case training could unlock these underweight app surfaces.');
  } else {
    html = html.replace(/\{\{SKILL_GROWTH_SIGNAL\}\}/g,
      '<strong>Underweight app surfaces</strong> represent growth opportunities for targeted use-case training.');
  }

  // ── MINI_THRESHOLDS_JS ──────────────────────────────────
  const miniThresholds = buildMiniThresholds(data, schema);
  html = html.replace(/\{\{MINI_THRESHOLDS_JS\}\}/g, JSON.stringify(miniThresholds));

  // ── METRIC_DETAIL_JS ────────────────────────────────────
  const metricDetail = buildMetricDetail(data, schema);
  html = html.replace(/\{\{METRIC_DETAIL_JS\}\}/g, JSON.stringify(metricDetail));

  // Inject all AI insight blocks into template
  if (insights) {
    Object.keys(insights).forEach(key => {
      const re = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
      html = html.replace(re, insights[key]);
    });
    console.log('Insight blocks injected:', Object.keys(insights).length);
  }

  // ── FAIL ON SAFESUB ERRORS ──
  if (subErrors.length > 0) {
    console.error('\n=== GENERATION ERRORS (' + subErrors.length + ') ===');
    subErrors.forEach(e => console.error('  ' + e));
    console.error('\nReport NOT generated. Fix the data file and retry.');
    process.exit(1);
  }

  // Clean up any remaining unresolved placeholders
  html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, (match) => {
    console.warn('Unresolved placeholder:', match);
    return '';
  });

  return html;
}

// ============================================================
// MAIN
// ============================================================

// ============================================================
// REPORT VALIDATION
// ============================================================
function validateReport(html, data, customerName) {
  const errors = [];
  const warnings = [];

  // 1. Customer name check — should appear, and NO other customer names
  if (!html.includes(customerName)) {
    errors.push('Customer name "' + customerName + '" not found in report');
  }
  const contoso = html.match(/Contoso/gi);
  if (contoso) errors.push('Found ' + contoso.length + ' "Contoso" references — report not properly customised');

  // 2. Unreplaced placeholders
  const unreplaced = html.match(/\{\{[A-Z_0-9]+\}\}/g);
  if (unreplaced) {
    const unique = [...new Set(unreplaced)];
    errors.push('Unreplaced placeholders (' + unique.length + '): ' + unique.join(', '));
  }

  // 3. Key numbers cross-check — verify data values appear in output
  const crossChecks = [
    { name: 'total_active_users', value: data.total_active_users, formatted: typeof data.total_active_users === 'number' ? data.total_active_users.toLocaleString() : '' },
    { name: 'licensed_users', value: data.licensed_users, formatted: typeof data.licensed_users === 'number' ? data.licensed_users.toLocaleString() : '' },
    { name: 'inactive_licenses', value: data.inactive_licenses, formatted: typeof data.inactive_licenses === 'number' ? data.inactive_licenses.toLocaleString() : '' },
    { name: 'm365_retention', value: data.m365_retention, formatted: String(data.m365_retention) },
    { name: 'm365_enablement', value: data.m365_enablement, formatted: String(data.m365_enablement) },
    { name: 'licensed_avg_prompts', value: data.licensed_avg_prompts, formatted: String(data.licensed_avg_prompts) },
  ];
  for (const check of crossChecks) {
    if (!html.includes(String(check.value)) && !html.includes(check.formatted)) {
      warnings.push('Data value ' + check.name + '=' + check.value + ' not found in report');
    }
  }

  // 4. Factual consistency checks
  if (html.includes('outnumber')) {
    const outnumberCtx = html.substring(Math.max(0, html.indexOf('outnumber') - 150), html.indexOf('outnumber') + 50);
    // Check direction: "Licensed outnumber unlicensed" is wrong when licensed < chat
    // "Unlicensed outnumber licensed" is correct when licensed < chat
    const licensedFirst = outnumberCtx.indexOf('Licensed') < outnumberCtx.indexOf('outnumber');
    if (data.licensed_users < data.chat_users && licensedFirst) {
      errors.push('Report claims licensed outnumber unlicensed, but data shows licensed=' + data.licensed_users + ' < chat=' + data.chat_users);
    } else if (data.licensed_users > data.chat_users && !licensedFirst) {
      errors.push('Report claims unlicensed outnumber licensed, but data shows licensed=' + data.licensed_users + ' > chat=' + data.chat_users);
    }
  }

  // 5. Pattern consistency
  const patternMatch = html.match(/Pattern (\d)/g);
  if (patternMatch) {
    // The "Current Pattern" or title should reference the correct pattern number
    // (Pattern 1/2/3 references in flip cards are OK as they describe all three)
  }

  // 6. Known hardcoded value check (Contoso-era values that should never appear)
  const forbidden = ['CNSL', 'CNHU', 'CNES', 'Westland', 'Eastfield', 'Northgate', 'Greenhill', 'South Region'];
  for (const val of forbidden) {
    if (html.includes(val)) {
      errors.push('Found hardcoded org name "' + val + '" — must be replaced with customer-specific data');
    }
  }

  // 7. Check for stale numeric values from Contoso template
  // Build set of actual customer values so we don't false-positive on matching numbers
  const customerNums = new Set();
  for (const key of ['licensed_users', 'chat_users', 'agent_users', 'total_licensed_seats', 'total_active_users']) {
    const v = data[key];
    if (v && v !== 'not_available') customerNums.add(Number(v).toLocaleString());
  }
  const staleValues = ['32,104', '27,496', '50,496', '38,075'];
  for (const val of staleValues) {
    if (html.includes(val) && !customerNums.has(val)) {
      warnings.push('Found potentially stale value "' + val + '" from Contoso template');
    }
  }

  // Report results
  if (errors.length) {
    console.error('\n=== VALIDATION ERRORS (' + errors.length + ') ===');
    errors.forEach(e => console.error('  ✗ ' + e));
  }
  if (warnings.length) {
    console.warn('\n=== VALIDATION WARNINGS (' + warnings.length + ') ===');
    warnings.forEach(w => console.warn('  ⚠ ' + w));
  }
  if (!errors.length && !warnings.length) {
    console.log('\n✓ Report validation passed — no issues found');
  }
  return { errors, warnings };
}

async function main() {
  const insights = await generateInsights(data, signalTiers, pattern);

  console.log('\nPopulating template...');
  const html = populateTemplate(template, data, insights, signalTiers, pattern, gauges);

  // Write output
  const outputName = `${data.customer_name.toLowerCase().replace(/\s+/g, '_')}_frontier_firm.html`;
  const outputPath = path.resolve(outputArg, outputName);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  
  // Validate the generated report
  const validation = validateReport(html, data, data.customer_name);
  if (validation.errors.length) {
    console.error('\nReport has ' + validation.errors.length + ' error(s) — review before sharing!');
  }

  fs.writeFileSync(outputPath, html);
  console.log(`\nReport generated: ${outputPath}`);
  console.log(`Customer: ${data.customer_name}`);
  console.log(`Pattern: ${pattern.number} (${pattern.name})`);
  console.log(`Signals: Reach=${signalTiers.reach}, Habit=${signalTiers.habit}, Skill=${signalTiers.skill}, Value=${signalTiers.value}`);
  console.log(`Time saved: ~${timeSavedRealised}K hrs/yr realised, ~${timeSavedUnrealised}K hrs/yr unrealised`);
  console.log('\nDone!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
