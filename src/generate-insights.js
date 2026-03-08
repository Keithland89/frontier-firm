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

// All 30 required insight keys
const REQUIRED_KEYS = [
  'EXEC_SUMMARY_GOOD', 'EXEC_SUMMARY_GAP', 'EXEC_SUMMARY_OPP',
  'INSIGHT_REACH', 'INSIGHT_HABIT', 'INSIGHT_SKILL',
  'TITLE_REACH', 'TITLE_HABIT', 'TITLE_SKILL', 'TITLE_VALUE',
  'SUBTITLE_REACH', 'SUBTITLE_HABIT', 'SUBTITLE_SKILL', 'SUBTITLE_VALUE',
  'SPOTLIGHT_HABIT', 'SPOTLIGHT_MATURITY',
  'PULLQUOTE_0', 'PULLQUOTE_1', 'PULLQUOTE_2', 'PULLQUOTE_3', 'PULLQUOTE_4', 'PULLQUOTE_5',
  'REC_1_TITLE', 'REC_1_DESC', 'REC_2_TITLE', 'REC_2_DESC',
  'REC_3_TITLE', 'REC_3_DESC', 'REC_4_TITLE', 'REC_4_DESC'
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

const request = {
  customer_name: data.customer_name,
  data_file: absDataPath,
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
    'Simple language — written for a non-technical executive',
    'Every claim backed by a specific number from the data',
    'Each insight answers "so what?"',
    'Recommendations are specific — name cohorts, orgs, targets',
    '"Habitual" = 11+ active days/month — never say "daily" unless 20+',
    'No contradictions between sections',
    'No generic insights that could apply to any customer'
  ],
  instructions: 'Generate the _ai_insights object with all 30 keys. Merge into ' + absDataPath + ' and save. Then re-run the pipeline.'
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
    EXEC_SUMMARY_GOOD: "What's working well (2-3 sentences)",
    EXEC_SUMMARY_GAP: 'Key gap or risk (2-3 sentences)',
    EXEC_SUMMARY_OPP: 'Biggest opportunity (2-3 sentences)',
    INSIGHT_REACH: 'Reach signal narrative (3-4 sentences)',
    INSIGHT_HABIT: 'Habit signal narrative (3-4 sentences)',
    INSIGHT_SKILL: 'Skill signal narrative (3-4 sentences)',
    TITLE_REACH: 'Short reach headline (5-8 words)',
    TITLE_HABIT: 'Short habit headline (5-8 words)',
    TITLE_SKILL: 'Short skill headline (5-8 words)',
    TITLE_VALUE: 'Short value headline (5-8 words)',
    SUBTITLE_REACH: 'One-line reach summary',
    SUBTITLE_HABIT: 'One-line habit summary',
    SUBTITLE_SKILL: 'One-line skill summary',
    SUBTITLE_VALUE: 'One-line value summary',
    SPOTLIGHT_HABIT: 'Habit deep-dive paragraph',
    SPOTLIGHT_MATURITY: 'Maturity assessment paragraph',
    PULLQUOTE_0: 'Executive pull quote',
    PULLQUOTE_1: 'Reach pull quote',
    PULLQUOTE_2: 'Habit pull quote',
    PULLQUOTE_3: 'Skill pull quote',
    PULLQUOTE_4: 'Value pull quote',
    PULLQUOTE_5: 'Closing pull quote',
    REC_1_TITLE: 'Recommendation 1 title',
    REC_1_DESC: 'Recommendation 1 description (2-3 sentences)',
    REC_2_TITLE: 'Recommendation 2 title',
    REC_2_DESC: 'Recommendation 2 description',
    REC_3_TITLE: 'Recommendation 3 title',
    REC_3_DESC: 'Recommendation 3 description',
    REC_4_TITLE: 'Recommendation 4 title',
    REC_4_DESC: 'Recommendation 4 description'
  };
  return descriptions[key] || key;
}
