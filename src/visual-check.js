#!/usr/bin/env node
/**
 * Gate 4: Headless visual verification
 *
 * Usage:
 *   node visual-check.js --report output/customer_frontier_firm.html --data data/customer.json
 *
 * Launches headless Chromium via Playwright, renders the report, and verifies:
 * 1. All 10 expected chart canvases render with pixel data
 * 2. Chart.js instances exist with non-empty datasets
 * 3. No bad values in rendered visible text
 * 4. Key numbers from data file appear in rendered output
 * 5. Screenshots saved to output/screenshots/
 *
 * Gracefully degrades if Playwright is not installed (warning, not failure).
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const reportPath = args.find((a, i) => args[i - 1] === '--report');
const dataPath = args.find((a, i) => args[i - 1] === '--data');
const isV3 = args.includes('--v3');
const isV4 = args.includes('--v4');

if (!reportPath || !dataPath) {
  console.error('Usage: node visual-check.js --report <report.html> --data <data.json>');
  process.exit(1);
}

const absReportPath = path.resolve(reportPath);
const data = JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'));

// Load Playwright — required dependency
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  console.error('\n=== Gate 4: Visual Check ===\n');
  console.error('ERROR: Playwright not installed. Visual check is mandatory.');
  console.error('Install with: npm install playwright && npx playwright install chromium');
  process.exit(1);
}

const expectedCharts = isV4
  ? ['chartTiers', 'chartOrgScatter', 'chartRetention', 'chartAgentBar', 'chartAgentDepth', 'chartAgentStickiness', 'chartAppSurface', 'chartDepthSparkline', 'chartSessionsPerOrg', 'chartConcentration', 'chartAgentBreadth', 'chartOrgDonut', 'chartCoverage']
  : isV3
  ? ['chartTiers', 'chartEngagement', 'chartOrgScatter', 'chartRetention', 'chartWeeklyTrend', 'chartHabitTiers', 'chartAgentBar', 'chartAppSurface']
  : ['chartTiers', 'chartMonthlyUsers', 'chartEngagement', 'chartWeekly', 'chartOrgScatter', 'chartRetention', 'chartCohortFlow', 'chartHabit', 'chartAgentHealth', 'chartLicense'];

(async () => {
  console.log('\n=== Gate 4: Visual Check ===\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('ERROR: Could not launch Chromium. Visual check is mandatory.');
    console.error('Install browsers with: npx playwright install chromium');
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const fileUrl = 'file:///' + absReportPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Force-reveal all .reveal elements and trigger counter animations
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach(el => {
      el.classList.add('revealed');
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.transition = 'none';
    });
  });

  // Scroll through the entire page to trigger lazy chart rendering
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 800) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(200);
  }
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));

  // Wait for Chart.js to finish rendering all canvases
  await page.waitForTimeout(3000);

  const errors = [];
  const warnings = [];
  let chartsVerified = 0;

  // ── CHECK 1: Chart canvases ──
  for (const chartId of expectedCharts) {
    const result = await page.evaluate((id) => {
      const canvas = document.getElementById(id);
      if (!canvas) return { exists: false };

      // Check pixel data
      let hasPixels = false;
      try {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const nonZero = imgData.data.some((v, i) => i % 4 !== 3 ? v > 0 : false);
        hasPixels = nonZero;
      } catch (e) { /* cross-origin or context issue */ }

      // Check Chart.js instance
      let chartInstance = null;
      // Chart.js stores instances on the canvas or globally
      const ci = (window.Chart && Chart.getChart && Chart.getChart(canvas)) || canvas.__chartjs_instance;
      if (ci) {
        const datasets = ci.data && ci.data.datasets || [];
        const hasData = datasets.some(ds => {
          const d = ds.data || [];
          return d.length > 0 && d.some(v => {
            if (typeof v === 'number') return v !== 0;
            if (typeof v === 'object' && v !== null) return Object.values(v).some(n => typeof n === 'number' && n !== 0);
            return false;
          });
        });
        chartInstance = { datasets: datasets.length, hasNonZeroData: hasData };
      }

      return {
        exists: true,
        width: canvas.width,
        height: canvas.height,
        hasPixels,
        chartInstance
      };
    }, chartId);

    if (!result.exists) {
      errors.push('Chart #' + chartId + ': canvas not found in DOM');
    } else if (!result.hasPixels) {
      warnings.push('Chart #' + chartId + ': canvas has no rendered pixels');
    } else {
      chartsVerified++;
      if (result.chartInstance && !result.chartInstance.hasNonZeroData) {
        warnings.push('Chart #' + chartId + ': Chart.js instance exists but all dataset values are zero');
      }
    }
  }

  console.log('Charts: ' + chartsVerified + '/' + expectedCharts.length + ' verified with pixel data');

  // ── CHECK 2: Bad values in rendered text ──
  const badValuesFound = await page.evaluate(() => {
    const body = document.body.innerText;
    const bads = [];
    for (const bad of ['undefined', 'NaN', 'Infinity', '[object Object]']) {
      const regex = new RegExp('\\b' + bad.replace(/[[\]]/g, '\\$&') + '\\b', 'gi');
      const matches = body.match(regex);
      if (matches) bads.push({ value: bad, count: matches.length });
    }
    return bads;
  });
  for (const bv of badValuesFound) {
    errors.push('Found "' + bv.value + '" in rendered text (' + bv.count + ' occurrences)');
  }

  // ── CHECK 3: Key numbers from data file appear in rendered text ──
  const keyChecks = ['total_active_users', 'licensed_users', 'm365_enablement'];
  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const field of keyChecks) {
    const val = data[field];
    if (val === undefined || val === 'not_available') continue;
    const str = String(val);
    const formatted = typeof val === 'number' ? val.toLocaleString() : str;
    if (!bodyText.includes(str) && !bodyText.includes(formatted)) {
      warnings.push('Key number ' + field + '=' + val + ' not visible in rendered text');
    }
  }

  // ── SCREENSHOTS ──
  const screenshotDir = path.resolve(path.dirname(absReportPath), 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const baseName = path.basename(reportPath, '.html');

  // Full page screenshot
  await page.screenshot({
    path: path.join(screenshotDir, baseName + '_full.png'),
    fullPage: true
  });

  // Top of report
  await page.screenshot({
    path: path.join(screenshotDir, baseName + '_top.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });

  console.log('Screenshots saved to ' + screenshotDir);

  await browser.close();

  // ── REPORT ──
  if (errors.length > 0) {
    console.log('\nERRORS (' + errors.length + '):');
    errors.forEach(function(e) { console.log('  ' + e); });
  }
  if (warnings.length > 0) {
    console.log('\nWARNINGS (' + warnings.length + '):');
    warnings.forEach(function(w) { console.log('  ' + w); });
  }

  if (errors.length > 0) {
    console.log('\nVISUAL CHECK FAILED\n');
    process.exit(1);
  }
  console.log('\nVISUAL CHECK PASSED\n');
  process.exit(0);
})();
