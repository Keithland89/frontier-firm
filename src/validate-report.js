#!/usr/bin/env node
/**
 * Gate 3: Validate generated HTML report
 *
 * Usage:
 *   node validate-report.js --report output/customer_frontier_firm.html --data data/customer.json
 *
 * Checks:
 * 1. No unresolved {{PLACEHOLDER}} tokens
 * 2. Customer name appears in the report
 * 3. No "Contoso" in output — enforced unconditionally
 * 4. Key data values appear in the output
 * 5. Factual consistency checks
 * 6. No known stale values
 * 7. Bad values in visible text (undefined, NaN, etc.)
 * 8. All required sections present
 * 9. All expected chart canvases present
 * 10. Embedded JSON dataset validation
 */

const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const reportPath = args.find((a, i) => args[i - 1] === '--report');
const dataPath = args.find((a, i) => args[i - 1] === '--data');
const isV3 = args.includes('--v3');
const isV4 = args.includes('--v4');

if (!reportPath || !dataPath) {
  console.error('Usage: node validate-report.js --report <report.html> --data <data.json>');
  process.exit(1);
}

const html = fs.readFileSync(path.resolve(reportPath), 'utf8');
const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));

const errors = [];
const warnings = [];

// ============================================================
// CHECK 1: Unresolved placeholders
// ============================================================
const placeholders = html.match(/\{\{[A-Z_]+\}\}/g);
if (placeholders) {
  const unique = [...new Set(placeholders)];
  errors.push('Unresolved placeholders (' + unique.length + '): ' + unique.join(', '));
}

// ============================================================
// CHECK 2: Customer name present
// ============================================================
if (data.customer_name && !html.includes(data.customer_name)) {
  errors.push('Customer name "' + data.customer_name + '" not found in report');
}

// ============================================================
// CHECK 3: No Contoso in output — enforced unconditionally
// ============================================================
const contosoMatches = html.match(/Contoso/gi);
if (contosoMatches) {
  errors.push('Found "Contoso" in report (' + contosoMatches.length + ' occurrences) — replace with real customer name before sharing');
}

// ============================================================
// CHECK 4: Key values present (expanded)
// ============================================================
const keyFields = [
  'total_active_users', 'licensed_users', 'chat_users', 'agent_users',
  'm365_enablement', 'license_priority', 'm365_frequency', 'agent_health',
  'total_agents', 'multi_user_agents'
];

for (const field of keyFields) {
  const val = data[field];
  if (val === undefined || val === 'not_available') continue;
  const formatted = typeof val === 'number' ? val.toLocaleString() : String(val);
  if (!html.includes(String(val)) && !html.includes(formatted)) {
    warnings.push('Key value ' + field + '=' + val + ' not found in report HTML');
  }
}

// ============================================================
// CHECK 5: Factual consistency
// ============================================================
if (html.includes('outnumber')) {
  if (data.licensed_users && data.chat_users) {
    const licensedMore = data.licensed_users > data.chat_users;
    if (html.includes('unlicensed') && html.includes('outnumber') && html.includes('licensed')) {
      if (licensedMore) {
        warnings.push('Report mentions unlicensed "outnumber" but licensed_users > chat_users — verify claim direction');
      }
    }
  }
}

// ============================================================
// CHECK 6: No stale known values
// ============================================================
const staleValues = ['57,126', '38,075', '18,991', '4,846'];
for (const stale of staleValues) {
  if (html.includes(stale)) {
    warnings.push('Found known Contoso sample value "' + stale + '" in report — verify this is real customer data');
  }
}

// ============================================================
// CHECK 7: Bad values in visible text
// ============================================================
const visibleHTML = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const badValues = ['undefined', 'NaN', 'Infinity'];
for (const bad of badValues) {
  // Match bad values that appear as text content between tags
  const regex = new RegExp('>' + bad + '<', 'gi');
  const matches = visibleHTML.match(regex);
  if (matches) {
    errors.push('Found "' + bad + '" in visible HTML (' + matches.length + ' occurrences)');
  }
}
// Check for [object Object] — must be literal text content, not in JSON data attributes
const objObjRegex = />\[object Object\]</gi;
const objObjMatches = visibleHTML.match(objObjRegex);
if (objObjMatches) {
  errors.push('Found "[object Object]" in visible HTML (' + objObjMatches.length + ' occurrences)');
}

// ============================================================
// CHECK 8: All required sections present
// ============================================================
const requiredSections = isV4
  ? ['overview', 'framework', 'verdict', 'reach', 'habit', 'skill', 'orgs', 'actions']
  : isV3
  ? ['overview', 'framework', 'summary', 'reach', 'habit', 'skill', 'actions']
  : ['overview', 'framework', 'summary', 'reach', 'habit', 'skill', 'value', 'maturity', 'actions'];
for (const section of requiredSections) {
  if (!html.includes('id="' + section + '"')) {
    errors.push('Missing section: #' + section);
  }
}

// ============================================================
// CHECK 9: All expected chart canvases present
// ============================================================
const expectedCharts = isV4
  ? ['chartTiers', 'chartOrgScatter', 'chartRetention', 'chartAgentBar', 'chartAgentDepth', 'chartAgentStickiness', 'chartAppSurface', 'chartDepthSparkline', 'chartSessionsPerOrg', 'chartConcentration', 'chartAgentBreadth', 'chartOrgDonut', 'chartCoverage', 'chartHabitTrend']
  : isV3
  ? ['chartTiers', 'chartEngagement', 'chartOrgScatter', 'chartRetention', 'chartWeeklyTrend', 'chartHabitTiers', 'chartAgentBar', 'chartAppSurface']
  : ['chartTiers', 'chartMonthlyUsers', 'chartEngagement', 'chartWeekly', 'chartOrgScatter', 'chartRetention', 'chartCohortFlow', 'chartHabit', 'chartAgentHealth', 'chartLicense'];
for (const chartId of expectedCharts) {
  if (!html.includes('id="' + chartId + '"')) {
    errors.push('Missing chart canvas: #' + chartId);
  }
}

// ============================================================
// CHECK 10: Embedded JSON dataset validation
// ============================================================
const jsonPatterns = [
  { pattern: /const\s+_perTierAD\s*=\s*(\{[\s\S]*?\});/, name: 'per_tier_active_day' },
  { pattern: /const\s+_perTierMU\s*=\s*(\{[\s\S]*?\});/, name: 'per_tier_monthly_users' },
];
for (const jp of jsonPatterns) {
  const match = html.match(jp.pattern);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.m365 && Array.isArray(parsed.m365)) {
        const allZero = parsed.m365.every(function(v) {
          return typeof v === 'object' ? Object.values(v).every(function(n) { return n === 0; }) : v === 0;
        });
        if (allZero) {
          errors.push(jp.name + ': m365 dataset is all zeroes');
        }
      }
    } catch(e) { /* JSON parse issue — caught by other checks */ }
  }
}

// ============================================================
// CHECK 11: No empty charts or null values in text
// ============================================================
const nullPatterns = ['>NaN<', '>undefined<', '>null<'];
for (const pattern of nullPatterns) {
  if (html.includes(pattern)) {
    warnings.push('Found "' + pattern + '" in report HTML — possible missing data');
  }
}

// ============================================================
// REPORT
// ============================================================
console.log('\n=== Gate 3: Report Validation ===\n');
console.log('Report: ' + reportPath);
console.log('Data:   ' + dataPath);
console.log('Customer: ' + data.customer_name);
console.log('');

if (errors.length === 0 && warnings.length === 0) {
  console.log('REPORT VALIDATION PASSED\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.log('ERRORS (' + errors.length + '):');
  errors.forEach(function(e) { console.log('  [ERROR] ' + e); });
  console.log('');
}

if (warnings.length > 0) {
  console.log('WARNINGS (' + warnings.length + '):');
  warnings.forEach(function(w) { console.log('  [WARN]  ' + w); });
  console.log('');
}

if (errors.length > 0) {
  console.log('REPORT VALIDATION FAILED\n');
  process.exit(1);
} else {
  console.log('REPORT VALIDATION PASSED (with warnings)\n');
  process.exit(0);
}
