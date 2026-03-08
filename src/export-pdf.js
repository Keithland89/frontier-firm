#!/usr/bin/env node
/**
 * Frontier Firm Report PDF Exporter
 *
 * Usage:
 *   node export-pdf.js --input output/customer_frontier_firm.html
 *   node export-pdf.js --input output/customer_frontier_firm.html --output output/customer.pdf
 *
 * Requires: npx playwright install chromium
 */

const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const inputArg = args.find((a, i) => args[i - 1] === '--input');
const outputArg = args.find((a, i) => args[i - 1] === '--output');

if (!inputArg) {
  console.error('Usage: node export-pdf.js --input <report.html> [--output <output.pdf>]');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = outputArg
  ? path.resolve(outputArg)
  : inputPath.replace(/\.html$/, '.pdf');

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

async function exportPDF() {
  let chromium;
  try {
    const pw = require('playwright');
    chromium = pw.chromium;
  } catch (e) {
    console.error('Playwright not installed. Run: npx playwright install chromium');
    process.exit(1);
  }

  console.log(`Exporting: ${inputPath}`);
  console.log(`Output:    ${outputPath}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Load the HTML file
  const fileUrl = 'file:///' + inputPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Wait for charts to render
  await page.waitForTimeout(2000);

  // Export as PDF
  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' }
  });

  await browser.close();
  console.log(`PDF exported: ${outputPath}`);
}

exportPDF().catch(err => {
  console.error('PDF export failed:', err.message);
  process.exit(1);
});
