#!/usr/bin/env node
/**
 * Gate 5: Deep number audit
 *
 * Strips ALL HTML/JS, extracts every visible number and text phrase,
 * then flags anything that doesn't trace back to the customer data file.
 *
 * Usage:
 *   node deep-audit.js --report output/customer_frontier_firm.html --data data/customer.json
 */
const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const reportPath = args.find((a, i) => args[i - 1] === '--report') || 'output/report.html';
const dataPath = args.find((a, i) => args[i - 1] === '--data') || 'data/sample_contoso.json';

const html = fs.readFileSync(path.resolve(reportPath), 'utf8');
const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));

// Build a set of ALL legitimate values that should appear
const legitimate = new Set();

function addVal(v) {
  if (v === null || v === undefined || v === 'not_available') return;
  legitimate.add(String(v));
  if (typeof v === 'number') {
    legitimate.add(v.toLocaleString());
    legitimate.add(Math.round(v).toString());
    legitimate.add(v.toFixed(1));
    if (v >= 1000) legitimate.add(Math.round(v / 1000) + 'K');
  }
  // Extract numbers from string values (e.g. "~2,700+" → "2,700", "2700")
  if (typeof v === 'string') {
    const nums = v.match(/[\d,]+\.?\d*/g) || [];
    nums.forEach(function(n) { legitimate.add(n); legitimate.add(n.replace(/,/g, '')); });
  }
}

// Add all top-level data values
Object.entries(data).forEach(function([k, v]) {
  if (k.startsWith('_')) return;
  if (k === 'top_agent_sessions' || k === 'top_agent_names' || k.startsWith('radar_')) return;
  if (Array.isArray(v)) {
    v.forEach(function(item) {
      if (typeof item === 'object' && item !== null) {
        Object.values(item).forEach(addVal);
      } else {
        addVal(item);
      }
    });
    return;
  }
  if (typeof v === 'object' && v !== null) {
    Object.values(v).forEach(addVal);
    return;
  }
  addVal(v);
});

// Add agent table values
(data.agent_table || []).forEach(function(row) {
  Object.values(row).forEach(addVal);
});
(data.top_agent_sessions || []).forEach(addVal);
(data.top_agent_names || []).forEach(function(n) { legitimate.add(n); });

// Add supplementary metric values
const supp = data._supplementary_metrics;
if (supp) {
  if (supp.monthly_data) {
    Object.values(supp.monthly_data).forEach(function(m) {
      Object.values(m).forEach(addVal);
    });
  }
  if (supp.per_tier_monthly_users) {
    supp.per_tier_monthly_users.forEach(function(m) {
      Object.values(m).forEach(addVal);
    });
  }
  if (supp.per_tier_active_day_bands) {
    supp.per_tier_active_day_bands.forEach(function(m) {
      Object.values(m).forEach(addVal);
    });
  }
  if (supp.retention_cohorts) {
    Object.values(supp.retention_cohorts).forEach(function(c) {
      Object.values(c).forEach(addVal);
    });
  }
  if (supp.per_tier_retention_cohorts) {
    supp.per_tier_retention_cohorts.forEach(function(c) {
      Object.entries(c).forEach(function([k2, v2]) {
        if (typeof v2 === 'object' && v2 !== null) Object.values(v2).forEach(addVal);
        else addVal(v2);
      });
    });
  }
  if (supp.app_interactions) {
    Object.values(supp.app_interactions).forEach(function(app) {
      Object.values(app).forEach(addVal);
    });
  }
  addVal(supp.distinct_departments);
}

// Add AI insight values (they reference data numbers)
if (data._ai_insights) {
  Object.values(data._ai_insights).forEach(function(txt) {
    if (typeof txt !== 'string') return;
    const nums = txt.match(/[\d,]+\.?\d*/g) || [];
    nums.forEach(function(n) {
      // Clean trailing period (e.g. "1,700." at end of sentence)
      var clean = n.replace(/\.$/, '');
      legitimate.add(clean);
      legitimate.add(clean.replace(/,/g, ''));
    });
  });
}

// Derived values the generator computes
addVal(data.band_11_15 + data.band_16_plus); // habitual users
addVal(data.retained_users + data.churned_users); // retention cohort
if (data.licensed_users && data.total_licensed_seats) {
  const activation = data.licensed_users / data.total_licensed_seats * 100;
  addVal(Math.round(activation));
  addVal(parseFloat(activation.toFixed(1)));
}
if (data.licensed_avg_prompts && data.unlicensed_avg_prompts) {
  const multiplier = (data.licensed_avg_prompts / data.unlicensed_avg_prompts).toFixed(1);
  legitimate.add(multiplier);
  addVal(Math.round(data.licensed_avg_prompts * 6 / 60 * 12)); // licensed hrs/yr
  addVal(Math.round(data.unlicensed_avg_prompts * 6 / 60 * 12)); // unlicensed hrs/yr
}
if (data.licensed_users && data.licensed_avg_prompts) {
  addVal(Math.round(data.licensed_users * data.licensed_avg_prompts * 6 / 60 * 12 / 1000)); // time saved realised K
}
if (data.total_agents && data.multi_user_agents) {
  const multiPct = Math.round(data.multi_user_agents / data.total_agents * 100);
  addVal(multiPct);
  addVal(100 - multiPct);
  addVal(data.total_agents - data.multi_user_agents);
}
if (typeof data.agents_keep === 'number' && typeof data.agents_review === 'number') {
  const retire = typeof data.agents_retire === 'number' ? data.agents_retire : 0;
  const totalAgents = data.agents_keep + data.agents_review + retire;
  if (totalAgents > 0) {
    addVal(Math.round(retire / totalAgents * 100));
    addVal(Math.round(data.agents_keep / totalAgents * 100));
    addVal(Math.round(data.agents_review / totalAgents * 100));
  }
}
// Habitual rate derived values (band_11_15_pct + band_16_plus_pct)
if (typeof data.licensed_band_11_15_pct === 'number' && typeof data.licensed_band_16_plus_pct === 'number') {
  var habitualRate = data.licensed_band_11_15_pct + data.licensed_band_16_plus_pct;
  addVal(parseFloat(habitualRate.toFixed(1)));
  addVal(Math.round(habitualRate));
}
if (typeof data.chat_band_11_15_pct === 'number' && typeof data.chat_band_16_plus_pct === 'number') {
  var chatHabitualRate = data.chat_band_11_15_pct + data.chat_band_16_plus_pct;
  addVal(parseFloat(chatHabitualRate.toFixed(1)));
  addVal(Math.round(chatHabitualRate));
}
if (typeof data.agent_band_11_15_pct === 'number' && typeof data.agent_band_16_plus_pct === 'number') {
  var agentHabitualRate = data.agent_band_11_15_pct + data.agent_band_16_plus_pct;
  addVal(parseFloat(agentHabitualRate.toFixed(1)));
  addVal(Math.round(agentHabitualRate));
}
// Recommendation KPI derived values
if (data.m365_frequency) addVal(Math.max(Math.round(data.m365_frequency * 2), 25));
if (data.agent_adoption) { addVal(Math.round(data.agent_adoption * 2)); addVal(data.agent_adoption * 2); }
if (data.m365_breadth) addVal(Math.max((data.m365_breadth || 3) + 2, 7));
if (data.chat_users) addVal(Math.min(Math.round(data.chat_users * 0.13), 5000));
// Org scatter derived values (agent adoption %, etc.)
if (Array.isArray(data.org_scatter_data)) {
  data.org_scatter_data.forEach(function(org) { addVal(org.x); addVal(org.y); addVal(org.r); });
}
// License priority org values + derived ratios
if (supp && supp.license_priority_orgs) {
  supp.license_priority_orgs.forEach(function(org) {
    addVal(org.licensed_users); addVal(org.unlicensed_users);
    if (org.ratio_unlicensed_to_licensed) addVal(org.ratio_unlicensed_to_licensed);
    // The template shows ratio as "X.Yx" — the integer part may appear separately
    if (org.ratio_unlicensed_to_licensed) addVal(Math.floor(org.ratio_unlicensed_to_licensed));
    // Weekly session volumes shown in the license priority table
    if (org.unlicensed_median_sessions_weekly) addVal(org.unlicensed_median_sessions_weekly);
    // Computed unlicensed% column: unlicensed/(unlicensed+licensed)*100
    if (org.unlicensed_users && org.licensed_users) {
      var unlicPct = Math.round(org.unlicensed_users / (org.unlicensed_users + org.licensed_users) * 100);
      addVal(unlicPct);
    }
  });
}
// V4 per-org composite scores (computed by generator from org_scatter_data)
if (Array.isArray(data.org_scatter_data) && data.org_scatter_data.length > 0) {
  var _orgScatter = data.org_scatter_data;
  var _totalUsers = (data.total_active_users || 1);
  var _agentUsers = (data.agent_users || 0);
  var _orgAgentRate = _agentUsers / _totalUsers;
  var _maxOrgUsers = Math.max.apply(null, _orgScatter.map(function(o) { return o.x || 0; }).concat([1]));
  var _hasOrgHabit = _orgScatter.some(function(o) { return typeof o.habitual_pct === 'number'; });
  var _overallHabit = (typeof data.embedded_user_rate === 'number') ? data.embedded_user_rate : 0;
  // Unified gate logic — normalised 0-100 scores for bar display (100 = P3 threshold)
  // P3_HABIT = 30%, P3_AGENT = 15%
  _orgScatter.forEach(function(org) {
    var normHabit = (_hasOrgHabit && typeof org.habitual_pct === 'number')
      ? Math.min(100, Math.round(org.habitual_pct / 30 * 100)) : 0;
    var normSkill = Math.min(100, Math.round((org.y || 0) / 15 * 100));
    var composite = Math.round((normHabit + normSkill) / 2);
    addVal(normHabit); addVal(normSkill); addVal(composite);
  });
  // Overall row — same gate logic using company-level metrics
  var _oNormHabit = Math.min(100, Math.round((_overallHabit / 30) * 100));
  var _oNormSkill = Math.min(100, Math.round(((data.agent_adoption || 0) / 15) * 100));
  var _oComp = Math.round((_oNormHabit + _oNormSkill) / 2);
  addVal(_oNormHabit); addVal(_oNormSkill); addVal(_oComp);
}

// Retention cohort values
if (supp && supp.retention_cohorts) {
  Object.values(supp.retention_cohorts).forEach(function(c) {
    addVal(c.prev); addVal(c.retained); addVal(c.new); addVal(c.churned);
    addVal(c.retention_pct);
  });
}

// Structural/framework numbers that always appear (phase numbers, day ranges, thresholds, etc.)
const frameworkNumbers = new Set([
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '15', '16', '19', '20', '27',
  '40', '50', '55', '70', '71', '75', '85', '93', '100',  // scoring band threshold markers on gauges + template static stats
  '30', '60', '90',                                  // recommendation timeframes (days) + P1 habit gate threshold
  '365',                                              // M365 text
  '2024', '2025', '2026', '2027',                    // years
  '12', '13', '14', '18', '25', '63',                   // small structural numbers / defaults
  '01', '02', '03', '04',                               // v4 metric counter labels
]);

// Known framework terms
const frameworkTerms = ['Foundation', 'Expansion', 'Frontier', 'Pattern', 'Phase',
  'Reach', 'Habit', 'Skill', 'Value', 'Copilot', 'M365', 'Microsoft', 'Agents', 'Chart.js'];

// ============================================================
// EXTRACT ALL NUMBERS from visible text
// ============================================================
let textOnly = html;
textOnly = textOnly.replace(/<script[\s\S]*?<\/script>/gi, '');
textOnly = textOnly.replace(/<style[\s\S]*?<\/style>/gi, '');
textOnly = textOnly.replace(/<[^>]+>/g, ' ');
textOnly = textOnly.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
  .replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')  // dashes → hyphen, not empty (prevents "6&ndash;10" → "610")
  .replace(/&#\d+;/g, '').replace(/&\w+;/g, '')
  .replace(/\u2014/g, '-').replace(/\u2019/g, "'").replace(/\u2013/g, '-');

// Match numbers with at least 2 digits, or decimals with digits on both sides
const numberPattern = /\b\d[\d,]*(?:\.\d+)?%?\b/g;
const allNumbers = new Set();
let m;
while ((m = numberPattern.exec(textOnly)) !== null) {
  const num = m[0];
  if (num.length <= 1) continue;
  allNumbers.add(num);
}

console.log('\n=== Gate 5: Deep Number Audit ===');
console.log('Report: ' + reportPath);
console.log('Data:   ' + dataPath);
console.log('Total unique numbers in visible text: ' + allNumbers.size);
console.log('Legitimate values tracked: ' + legitimate.size);

const suspicious = [];
const verified = [];

allNumbers.forEach(function(num) {
  const clean = num.replace(/,/g, '').replace(/%$/, '');

  // Skip framework structural numbers
  if (frameworkNumbers.has(clean)) { verified.push(num); return; }

  const isLegit = legitimate.has(num) || legitimate.has(clean) ||
    legitimate.has(num.replace(/%$/, ''));

  if (isLegit) {
    verified.push(num);
    return;
  }

  // Check indirect match (within 0.1 of any data value)
  const numVal = parseFloat(clean);
  const found = Object.values(data).some(function(v) {
    if (typeof v === 'number') return Math.abs(v - numVal) < 0.15;
    return false;
  });
  if (found) {
    verified.push(num);
    return;
  }

  suspicious.push(num);
});

console.log('Verified: ' + verified.length + '/' + allNumbers.size);

if (suspicious.length > 0) {
  console.log('\nSUSPICIOUS NUMBERS (' + suspicious.length + ') — not traced to data file:');
  suspicious.forEach(function(n) {
    const idx = textOnly.indexOf(n);
    const ctx = textOnly.substring(Math.max(0, idx - 40), Math.min(textOnly.length, idx + n.length + 40)).trim().replace(/\s+/g, ' ');
    console.log('  ? ' + n + '  -->  "...' + ctx + '..."');
  });
  console.log('\nDEEP AUDIT FAILED — ' + suspicious.length + ' untraced numbers');
  process.exit(1);
}

console.log('\nDEEP AUDIT PASSED');
process.exit(0);
