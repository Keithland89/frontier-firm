#!/usr/bin/env node
/**
 * Frontier Firm Report Pipeline
 *
 * Usage:
 *   node run-pipeline.js --pbix "Customer Name" [--output output/] [--no-ai]
 *   node run-pipeline.js --data data/customer.json [--output output/] [--no-ai]
 *
 * Runs 5 mandatory quality gates:
 *   Gate 0 (optional): Extract from PBIX
 *   Gate 1: Validate data against schema
 *   Gate 1.5: Check/generate AI insights
 *   Gate 2: Generate report (with safeSub protection)
 *   Gate 3: Validate HTML output
 *   Gate 4: Headless visual verification
 *   Gate 5: Deep number audit
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const pbixName = args.find((a, i) => args[i - 1] === '--pbix');
let dataPath = args.find((a, i) => args[i - 1] === '--data');
const outputDir = args.find((a, i) => args[i - 1] === '--output') || 'output/';
const noAI = args.includes('--no-ai');

if (!dataPath && !pbixName) {
  console.error('Usage: node run-pipeline.js --pbix "Customer Name" [--output dir] [--no-ai]');
  console.error('   or: node run-pipeline.js --data data/customer.json [--output dir] [--no-ai]');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const gates = [];

// Gate 0 (optional): Extract from PBIX
if (pbixName) {
  const customerSlug = pbixName.toLowerCase().replace(/\s+/g, '_');
  dataPath = path.join('data', customerSlug + '.json');
  gates.push({
    name: 'Gate 0: Extract from PBIX',
    cmd: 'node src/extract-from-pbix.js --pbix "' + pbixName + '" --output data/',
    allowExit3: true
  });
}

// Derive report filename from data
let reportName;
if (pbixName) {
  reportName = pbixName.toLowerCase().replace(/\s+/g, '_') + '_frontier_firm.html';
} else {
  const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));
  reportName = data.customer_name.toLowerCase().replace(/\s+/g, '_') + '_frontier_firm.html';
}
const reportPath = path.join(outputDir, reportName);

// Gate 0.5 (optional): Cross-validate against PBIX
if (pbixName) {
  gates.push({
    name: 'Gate 0.5: Cross-validate against PBIX',
    cmd: 'node src/cross-validate.js --data "' + dataPath + '"'
  });
}

// Gate 1: Validate data
gates.push({
  name: 'Gate 1: Validate Data',
  cmd: 'node src/validate-data.js --data "' + dataPath + '"'
});

// Gate 1.5: Generate insights (skip if --no-ai)
if (!noAI) {
  gates.push({
    name: 'Gate 1.5: Generate Insights',
    cmd: 'node src/generate-insights.js --data "' + dataPath + '"',
    allowExit2: true
  });
}

// Gate 2: Generate report
gates.push({
  name: 'Gate 2: Generate Report',
  cmd: 'node src/generate-report.js --data "' + dataPath + '" --output "' + outputDir + '"' + (noAI ? ' --no-ai' : '')
});

// Gate 3: Validate HTML
gates.push({
  name: 'Gate 3: Validate HTML',
  cmd: 'node src/validate-report.js --report "' + reportPath + '" --data "' + dataPath + '"'
});

// Gate 4: Visual check
gates.push({
  name: 'Gate 4: Visual Check',
  cmd: 'node src/visual-check.js --report "' + reportPath + '" --data "' + dataPath + '"'
});

// Gate 5: Deep audit
gates.push({
  name: 'Gate 5: Deep Audit',
  cmd: 'node src/deep-audit.js --report "' + reportPath + '" --data "' + dataPath + '"'
});

console.log('');
console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
console.log('\u2551   FRONTIER FIRM REPORT PIPELINE      \u2551');
console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
console.log('');

let passed = 0;
for (const gate of gates) {
  console.log('\u25B6 ' + gate.name + '...');
  try {
    execSync(gate.cmd, { stdio: 'inherit', cwd: rootDir });
    console.log('  PASSED\n');
    passed++;
  } catch (e) {
    if (gate.allowExit3 && e.status === 3) {
      console.log('\n  MEASURE MAPPING NEEDED');
      console.log('  The AI tool should now:');
      console.log('  1. Read temp/measure_mapping_request.json');
      console.log('  2. Map unmatched fields to available PBIX measures');
      console.log('  3. Save to data/' + pbixName.toLowerCase().replace(/\s+/g, '_') + '_measure_overrides.json');
      console.log('  4. Re-run the pipeline\n');
      process.exit(3);
    }
    if (gate.allowExit2 && e.status === 2) {
      console.log('\n  INSIGHT GENERATION NEEDED');
      console.log('  The AI tool should now:');
      console.log('  1. Read temp/insights_request.json');
      console.log('  2. Generate _ai_insights (30 keys) following the quality rules');
      console.log('  3. Save into the data JSON file');
      console.log('  4. Re-run: npm run report -- --data "' + dataPath + '"\n');
      process.exit(2);
    }
    console.error('\n  FAILED at ' + gate.name);
    console.error('  Pipeline stopped. Fix the issue and re-run.\n');
    process.exit(1);
  }
}

console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('  ALL ' + passed + ' GATES PASSED \u2014 report is ready');
console.log('  ' + path.resolve(reportPath));
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
