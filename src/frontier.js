#!/usr/bin/env node
// Friendly entry point: npm run frontier -- "Customer Name"
// Requires the customer's PBIX to be open in Power BI Desktop.

const { execSync } = require('child_process');
const path = require('path');

const name = process.argv[2];
if (!name) {
  console.log(`
  Usage:  npm run frontier -- "Customer Name"

  Generates a Frontier Firm report for the given customer.
  The customer's PBIX must be open in Power BI Desktop.

  Examples:
    npm run frontier -- "JCB AI-in-One Dashboard 2202 - w Agent 365"
    npm run frontier -- "Contoso Ltd"
  `);
  process.exit(1);
}

console.log(`\n  Generating Frontier Firm report for: ${name}\n`);

const cmd = `node src/run-pipeline.js --pbix "${name}" --output output/`;

try {
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
} catch (e) {
  process.exit(e.status || 1);
}
