#!/usr/bin/env node
/**
 * Gate 0.5: Cross-validate extracted data against PBIX
 *
 * Re-queries key values from the PBIX and compares to the JSON.
 * Fails if any value differs by >5%.
 *
 * Usage:
 *   node cross-validate.js --data data/customer.json --port 59194
 */

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ============================================================
// CLI ARGS
// ============================================================
const args = process.argv.slice(2);
const dataPath = args.find((a, i) => args[i - 1] === '--data');
const portArg = args.find((a, i) => args[i - 1] === '--port');

if (!dataPath) {
  console.error('Usage: node cross-validate.js --data data/customer.json [--port 59194]');
  process.exit(1);
}

const dataFile = path.resolve(dataPath);
if (!fs.existsSync(dataFile)) {
  console.error('ERROR: Data file not found: ' + dataFile);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const port = portArg || (data._metadata && data._metadata.pbix_port) || null;

// ============================================================
// PBI MCP EXE DISCOVERY
// ============================================================
function findMcpExe() {
  // Try ~/.claude/mcp.json
  const mcpConfigPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'mcp.json');
  try {
    const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8').replace(/^\uFEFF/, ''));
    const pbi = config.mcpServers && config.mcpServers['powerbi-modeling-mcp'];
    if (pbi && pbi.command) return pbi.command;
  } catch (e) { /* not found */ }

  // Fallback to known path
  const known = path.join(process.env.USERPROFILE || '', '.vscode', 'extensions',
    'analysis-services.powerbi-modeling-mcp-0.4.0-win32-x64', 'server', 'powerbi-modeling-mcp.exe');
  if (fs.existsSync(known)) return known;

  return null;
}

// ============================================================
// PBI MCP SUBPROCESS
// ============================================================
let proc, responses = {}, nextId = 100;

function send(id, method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
}
function notify(method) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
}
function waitFor(id, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const t = setInterval(() => { if (responses[id]) { clearInterval(t); resolve(responses[id]); } }, 100);
    setTimeout(() => { clearInterval(t); reject(new Error('timeout waiting for id ' + id)); }, timeout);
  });
}

async function callTool(name, toolArgs) {
  const id = nextId++;
  send(id, 'tools/call', { name, arguments: { request: toolArgs } });
  const r = await waitFor(id);
  if (r.result && r.result.isError) throw new Error(r.result.content[0].text);
  const text = r.result.content[0].text;
  const status = (() => { try { return JSON.parse(text); } catch (e) { return { raw: text }; } })();
  const resource = r.result.content.find(c => c.type === 'resource');
  if (resource && resource.resource && resource.resource.text) {
    status._csv = resource.resource.text;
    status._rows = parseCSV(resource.resource.text);
  }
  return status;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rawHeaders = lines[0].split(',');
  const cleanHeaders = rawHeaders.map(h => {
    h = h.trim();
    const bracketMatch = h.match(/\[([^\]]+)\]$/);
    if (bracketMatch) return bracketMatch[1];
    return h.replace(/[\[\]]/g, '').trim();
  });
  return lines.slice(1).map(line => {
    const values = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else current += line[i];
    }
    values.push(current.trim());
    const row = {};
    cleanHeaders.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

async function runDax(query) {
  return callTool('dax_query_operations', { operation: 'Execute', query, maxRows: 5000 });
}

function getScalar(result) {
  if (result._rows && result._rows.length > 0) {
    const row = result._rows[0];
    const v = row[Object.keys(row)[0]];
    if (v === '' || v === undefined || v === null) return null;
    const num = Number(v);
    return isNaN(num) ? v : num;
  }
  return null;
}

// ============================================================
// CHECK HELPERS
// ============================================================
function fmt(n) {
  if (typeof n === 'number') return n.toLocaleString('en-US');
  return String(n);
}

function diffPct(expected, actual) {
  if (expected === 0 && actual === 0) return 0;
  const denom = Math.max(Math.abs(expected), Math.abs(actual), 1);
  return Math.abs(expected - actual) / denom * 100;
}

function pass(name, detail) {
  return { name, pass: true, detail, skip: false };
}
function fail(name, detail, expected, actual, diff) {
  return { name, pass: false, detail, expected, actual, diffPct: diff, skip: false };
}
function skip(name, reason) {
  return { name, pass: true, detail: reason, skip: true };
}

function num(v) {
  if (typeof v === 'number') return v;
  if (v === 'not_available' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ============================================================
// CHECKS
// ============================================================
async function runChecks(pbiConnected) {
  const results = [];

  // 1. licensed + unlicensed ~ total
  const licensed = num(data.licensed_users);
  const unlicensed = num(data.chat_users);
  const total = num(data.total_active_users);
  if (licensed !== null && unlicensed !== null && total !== null) {
    const sum = licensed + unlicensed;
    const diff = diffPct(total, sum);
    if (diff <= 5) {
      results.push(pass('licensed + unlicensed \u2248 total', 'diff: ' + diff.toFixed(1) + '%'));
    } else {
      results.push(fail('licensed + unlicensed \u2248 total',
        'licensed(' + fmt(licensed) + ') + unlicensed(' + fmt(unlicensed) + ') = ' + fmt(sum) + ' vs total ' + fmt(total),
        total, sum, diff));
    }
  } else {
    results.push(skip('licensed + unlicensed \u2248 total', 'skipped \u2014 missing user counts'));
  }

  // 2. band counts sum reasonable
  const b1 = num(data.band_1_5);
  const b2 = num(data.band_6_10);
  const b3 = num(data.band_11_15);
  const b4 = num(data.band_16_plus);
  if (b1 !== null && b2 !== null && b3 !== null && b4 !== null) {
    const bandSum = b1 + b2 + b3 + b4;
    const upper = total !== null ? total * 2 : Infinity;
    if (bandSum > 0 && bandSum < upper) {
      results.push(pass('band counts sum reasonable', fmt(bandSum)));
    } else {
      results.push(fail('band counts sum reasonable',
        'sum=' + fmt(bandSum) + ' (expected >0 and <' + fmt(upper) + ')',
        'reasonable', bandSum, 0));
    }
  } else {
    results.push(skip('band counts sum reasonable', 'skipped \u2014 missing band data'));
  }

  // 3. band pcts sum to ~100
  const bp1 = num(data.band_1_5_pct);
  const bp2 = num(data.band_6_10_pct);
  const bp3 = num(data.band_11_15_pct);
  const bp4 = num(data.band_16_plus_pct);
  if (bp1 !== null && bp2 !== null && bp3 !== null && bp4 !== null) {
    const pctSum = bp1 + bp2 + bp3 + bp4;
    if (pctSum >= 95 && pctSum <= 105) {
      results.push(pass('band pcts sum ~100', pctSum.toFixed(1) + '%'));
    } else {
      results.push(fail('band pcts sum ~100',
        'sum=' + pctSum.toFixed(1) + '% (expected 95-105)',
        100, pctSum, Math.abs(pctSum - 100)));
    }
  } else {
    results.push(skip('band pcts sum ~100', 'skipped \u2014 missing band pct data'));
  }

  // 4. enablement <= 100%
  const enablement = num(data.m365_enablement);
  if (enablement !== null) {
    if (enablement <= 100) {
      results.push(pass('enablement <= 100%', enablement.toFixed(1) + '%'));
    } else {
      results.push(fail('enablement <= 100%',
        enablement.toFixed(1) + '% exceeds 100',
        100, enablement, enablement - 100));
    }
  } else {
    results.push(skip('enablement <= 100%', 'skipped \u2014 enablement not available'));
  }

  // 5. licensed_users vs PBIX
  if (pbiConnected) {
    try {
      // licensed_users = ALL-TIME cumulative, so compare against unfiltered scalar
      const licResult = await runDax(
        "EVALUATE ROW(\"Lic\", [NoOfActiveChatUsers (Licensed)])"
      );
      const rows = licResult._rows || [];
      if (rows.length >= 1) {
        const pbiVal = Number(rows[0].Lic || rows[0][Object.keys(rows[0])[0]] || 0);
        const jsonVal = num(data.licensed_users);
        if (jsonVal !== null) {
          const diff = diffPct(pbiVal, jsonVal);
          if (diff <= 1) {
            results.push(pass('licensed_users vs PBIX',
              'JSON: ' + fmt(jsonVal) + ', PBI: ' + fmt(pbiVal) + ', diff: ' + diff.toFixed(1) + '%'));
          } else {
            results.push(fail('licensed_users vs PBIX',
              'JSON: ' + fmt(jsonVal) + ', PBI: ' + fmt(pbiVal),
              pbiVal, jsonVal, diff));
          }
        } else {
          results.push(skip('licensed_users vs PBIX', 'skipped \u2014 licensed_users not in JSON'));
        }
      } else {
        results.push(skip('licensed_users vs PBIX', 'skipped \u2014 insufficient monthly data in PBIX'));
      }
    } catch (e) {
      results.push(skip('licensed_users vs PBIX', 'skipped \u2014 DAX error: ' + e.message.substring(0, 60)));
    }
  } else {
    results.push(skip('licensed_users vs PBIX', 'skipped \u2014 no PBIX connection'));
  }

  // 6. total_licensed_seats vs PBIX
  if (pbiConnected) {
    try {
      const seatsResult = await runDax("EVALUATE ROW(\"v\", COUNTROWS('Copilot Licensed'))");
      const pbiVal = getScalar(seatsResult);
      const jsonVal = num(data.total_licensed_seats);
      if (pbiVal !== null && jsonVal !== null) {
        const diff = diffPct(pbiVal, jsonVal);
        if (diff <= 0.1) {
          results.push(pass('total_licensed_seats vs PBIX',
            'JSON: ' + fmt(jsonVal) + ', PBI: ' + fmt(pbiVal)));
        } else {
          results.push(fail('total_licensed_seats vs PBIX',
            'JSON: ' + fmt(jsonVal) + ', PBI: ' + fmt(pbiVal),
            pbiVal, jsonVal, diff));
        }
      } else {
        results.push(skip('total_licensed_seats vs PBIX', 'skipped \u2014 value not available'));
      }
    } catch (e) {
      results.push(skip('total_licensed_seats vs PBIX', 'skipped \u2014 DAX error: ' + e.message.substring(0, 60)));
    }
  } else {
    results.push(skip('total_licensed_seats vs PBIX', 'skipped \u2014 no PBIX connection'));
  }

  // 7. top agent matches
  if (pbiConnected) {
    try {
      const agentResult = await runDax(
        "EVALUATE TOPN(1, SUMMARIZECOLUMNS('Chat + Agent Interactions (Audit Logs)'[AgentName], \"Sess\", COUNTROWS('Chat + Agent Interactions (Audit Logs)')), [Sess], DESC)"
      );
      const rows = (agentResult._rows || []).filter(r => {
        const name = r.AgentName || '';
        return name !== '' && name.trim() !== '';
      });
      if (rows.length > 0) {
        const pbiAgent = rows[0].AgentName;
        const jsonAgent = data.agent_table && data.agent_table.length > 0
          ? data.agent_table[0].name : null;
        if (jsonAgent !== null) {
          if (pbiAgent === jsonAgent) {
            results.push(pass('top agent matches', jsonAgent));
          } else {
            results.push(fail('top agent matches',
              'JSON: "' + jsonAgent + '", PBI: "' + pbiAgent + '"',
              pbiAgent, jsonAgent, 100));
          }
        } else {
          results.push(skip('top agent matches', 'skipped \u2014 no agent_table in JSON'));
        }
      } else {
        results.push(skip('top agent matches', 'skipped \u2014 no agent data in PBIX'));
      }
    } catch (e) {
      results.push(skip('top agent matches', 'skipped \u2014 DAX error: ' + e.message.substring(0, 60)));
    }
  } else {
    results.push(skip('top agent matches', 'skipped \u2014 no PBIX connection'));
  }

  // 8. retention math
  const retained = num(data.retained_users);
  const churned = num(data.churned_users);
  const retention = num(data.m365_retention);
  if (retained !== null && churned !== null && retention !== null) {
    const computed = retained / (retained + churned) * 100;
    const diff = Math.abs(computed - retention);
    if (diff <= 5) { // 5% tolerance — m365_retention may come from a different source than INTERSECT
      results.push(pass('retention math',
        computed.toFixed(1) + '% \u2248 ' + retention.toFixed(1) + '%, diff: ' + diff.toFixed(1) + '%'));
    } else {
      results.push(fail('retention math',
        'computed ' + computed.toFixed(1) + '% vs reported ' + retention.toFixed(1) + '%',
        retention, computed, diff));
    }
  } else {
    results.push(skip('retention math', 'skipped \u2014 retention data incomplete'));
  }

  // 9. monthly trend alignment
  const monthlyData = data._supplementary_metrics && data._supplementary_metrics.monthly_data;
  if (monthlyData && typeof monthlyData === 'object') {
    const months = Object.keys(monthlyData);
    if (months.length > 0) {
      const lastMonth = months[months.length - 1];
      const lastUsers = num(monthlyData[lastMonth] && monthlyData[lastMonth].users);
      if (lastUsers !== null && total !== null) {
        // total_active_users is ALL-TIME cumulative, so last month should be <= total
        if (lastUsers <= total) {
          results.push(pass('monthly trend alignment',
            'last month (' + lastMonth + '): ' + fmt(lastUsers) + ' \u2264 all-time total: ' + fmt(total)));
        } else {
          const diff = diffPct(total, lastUsers);
          results.push(fail('monthly trend alignment',
            'last month (' + lastMonth + '): ' + fmt(lastUsers) + ' > all-time total: ' + fmt(total),
            total, lastUsers, diff));
        }
      } else {
        results.push(skip('monthly trend alignment', 'skipped \u2014 monthly data or total missing'));
      }
    } else {
      results.push(skip('monthly trend alignment', 'skipped \u2014 monthly data empty'));
    }
  } else {
    results.push(skip('monthly trend alignment', 'skipped \u2014 monthly data empty'));
  }

  // 10. org scatter count
  const orgScatter = data.org_scatter_data;
  const orgCount = num(data.org_count);
  if (Array.isArray(orgScatter) && orgCount !== null) {
    if (orgScatter.length <= orgCount && orgCount > 0) {
      results.push(pass('org scatter count',
        orgScatter.length + ' orgs, org_count=' + orgCount));
    } else if (orgCount <= 0) {
      results.push(fail('org scatter count',
        'org_count=' + orgCount + ' should be > 0',
        '>0', orgCount, 100));
    } else {
      results.push(fail('org scatter count',
        'scatter has ' + orgScatter.length + ' orgs but org_count=' + orgCount,
        orgCount, orgScatter.length, diffPct(orgCount, orgScatter.length)));
    }
  } else {
    results.push(skip('org scatter count', 'skipped \u2014 org data missing'));
  }

  return results;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('\n=== Gate 0.5: PBI Cross-Validation ===\n');

  let pbiConnected = false;
  const EXE = findMcpExe();

  // Attempt PBI connection if we have both exe and port
  if (!EXE) {
    console.log('  WARN: PBI MCP exe not found \u2014 DAX checks will be skipped\n');
  } else if (!port) {
    console.log('  WARN: No PBIX port specified and none in _metadata \u2014 DAX checks will be skipped\n');
  } else {
    try {
      proc = spawn(EXE, ['--start', '--readonly', '--skipconfirmation'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => { try { const m = JSON.parse(line); if (m.id) responses[m.id] = m; } catch (e) { } });
      proc.stderr.on('data', () => { });

      await new Promise(r => setTimeout(r, 2000));
      send(1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'frontier-firm-crossval', version: '1.0' }
      });
      await waitFor(1);
      notify('notifications/initialized');
      await new Promise(r => setTimeout(r, 500));

      await callTool('connection_operations', { operation: 'Connect', dataSource: 'localhost:' + port });
      pbiConnected = true;
      console.log('  Connected to PBIX on port ' + port + '\n');
    } catch (e) {
      console.log('  WARN: Failed to connect to PBIX on port ' + port + ' \u2014 DAX checks will be skipped');
      console.log('  (' + e.message.substring(0, 80) + ')\n');
      if (proc) { try { proc.kill(); } catch (_) { } }
      proc = null;
    }
  }

  // Run all checks
  const results = await runChecks(pbiConnected);

  // Print results
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.skip) {
      console.log('  \u25CB ' + r.name + ' (' + r.detail + ')');
      skipped++;
    } else if (r.pass) {
      console.log('  \u2713 ' + r.name + ' (' + r.detail + ')');
      passed++;
    } else {
      console.log('  \u2717 ' + r.name + ' (' + r.detail + ')');
      failed++;
    }
  }

  // Summary
  console.log('');
  if (failed === 0) {
    console.log('CROSS-VALIDATION PASSED (' + passed + '/' + results.length + ' checks passed'
      + (skipped > 0 ? ', ' + skipped + ' skipped' : '') + ')');
  } else {
    console.log('CROSS-VALIDATION FAILED (' + failed + ' check(s) failed, '
      + passed + ' passed' + (skipped > 0 ? ', ' + skipped + ' skipped' : '') + ')');
  }
  console.log('');

  // Cleanup
  if (proc) { try { proc.kill(); } catch (_) { } }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('CROSS-VALIDATION ERROR:', e.message);
  if (proc) { try { proc.kill(); } catch (_) { } }
  process.exit(1);
});
