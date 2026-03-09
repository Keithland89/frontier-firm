#!/usr/bin/env node
/**
 * Frontier Firm — Map-Driven PBIX Data Extraction via PBI MCP
 *
 * Usage:
 *   node extract-from-pbix.js --pbix "Customer Name" --output data/
 *   node extract-from-pbix.js --pbix "Network Rail" --output data/ --mcp-exe /path/to/exe
 *
 * Driven by schema/measure_map.json — no hardcoded measure names.
 * Validates output against ff_data_schema.json before saving.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ============================================================
// CLI ARGS
// ============================================================
const args = process.argv.slice(2);
const pbixName = args.find((a, i) => args[i - 1] === '--pbix');
const outputDir = args.find((a, i) => args[i - 1] === '--output') || 'data/';
const mcpExeArg = args.find((a, i) => args[i - 1] === '--mcp-exe');

if (!pbixName) {
  console.error('Usage: node extract-from-pbix.js --pbix "Customer Name" [--output data/] [--mcp-exe path]');
  process.exit(1);
}

// Find PBI MCP exe — from arg, mcp.json, or known VS Code extension path
function findMcpExe() {
  if (mcpExeArg) return mcpExeArg;

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

  console.error('ERROR: Cannot find PBI MCP exe. Specify with --mcp-exe or configure in ~/.claude/mcp.json');
  process.exit(1);
}

const EXE = findMcpExe();
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schema', 'ff_data_schema.json'), 'utf8'));

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
  // Split header on commas, then strip table prefixes and brackets from each
  const rawHeaders = lines[0].split(',');
  const cleanHeaders = rawHeaders.map(h => {
    h = h.trim();
    // Strip table prefix: "Chat + Agent Org Data[Organization]" -> "Organization"
    // Also handle "[Users]" -> "Users"
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

async function getScalarMeasure(measureExpr, label) {
  try {
    const r = await runDax('EVALUATE ROW("' + label + '", ' + measureExpr + ')');
    const v = getScalar(r);
    console.log('  ' + label + ': ' + v);
    return v;
  } catch (e) {
    console.log('  ' + label + ': ERROR - ' + e.message.substring(0, 100));
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

// Convert 0-1 decimal rates to percentages (0.82 -> 82.0)
function toPct(v) {
  return typeof v === 'number' && v > 0 && v <= 1 ? Math.round(v * 1000) / 10 : v;
}

// Parse Year-Month from a CSV row — handles multiple header formats
function parseYearMonth(row) {
  return row['Year-Month']
    || row['Calendar[Year-Month]']
    || Object.values(row).find(v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v))
    || '';
}

// ============================================================
// MAIN EXTRACTION
// ============================================================
async function main() {
  console.log('\n=== Frontier Firm PBIX Extraction (Map-Driven) ===');
  console.log('Customer: ' + pbixName);
  console.log('MCP exe: ' + EXE + '\n');

  proc = spawn(EXE, ['--start', '--readonly', '--skipconfirmation'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => { try { const m = JSON.parse(line); if (m.id) responses[m.id] = m; } catch (e) { } });
  proc.stderr.on('data', () => { });

  await new Promise(r => setTimeout(r, 2000));
  send(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'frontier-firm-extract', version: '2.0' } });
  await waitFor(1);
  notify('notifications/initialized');
  await new Promise(r => setTimeout(r, 500));

  // ============================================================
  // PBIX DISCOVERY & CONNECTION
  // ============================================================
  console.log('Discovering open PBIX files...');
  const instances = await callTool('connection_operations', { operation: 'ListLocalInstances' });

  const instanceList = instances.data || instances._rows || [];
  console.log('Found ' + instanceList.length + ' open PBIX instances');

  instanceList.forEach(inst => {
    const title = inst.parentWindowTitle || inst.Name || inst.name || '(unknown)';
    const p = inst.port || inst.Port || '?';
    console.log('  - ' + title + ' (port ' + p + ')');
  });

  const searchLower = pbixName.toLowerCase();
  const match = instanceList.find(inst => {
    const candidates = [
      inst.parentWindowTitle, inst.Name, inst.name,
      inst.DatabaseName, inst.databaseName
    ].filter(Boolean);
    return candidates.some(c => c.toLowerCase().includes(searchLower));
  });

  if (!match) {
    console.error('ERROR: No open PBIX matching "' + pbixName + '" found.');
    console.error('Available instances: ' + instanceList.map(i => i.parentWindowTitle || i.Name || '?').join(', '));
    console.error('Make sure the PBIX file is open in Power BI Desktop.');
    proc.kill();
    process.exit(1);
  }

  const port = match.port || match.Port;
  const matchName = match.parentWindowTitle || match.Name || match.name;
  console.log('Matched: ' + matchName + ' on port ' + port);
  await callTool('connection_operations', { operation: 'Connect', dataSource: 'localhost:' + port });
  console.log('Connected.\n');

  // ============================================================
  // PHASE 1: DISCOVER — Load measure map & available measures
  // ============================================================
  console.log('=== Phase 1: Discover ===');

  const measureMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schema', 'measure_map.json'), 'utf8'));

  // Load per-customer overrides if they exist
  const slug = pbixName.toLowerCase().replace(/\s+/g, '_');
  const overridePath = path.resolve(outputDir, slug + '_measure_overrides.json');
  if (fs.existsSync(overridePath)) {
    const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    for (const [k, v] of Object.entries(overrides)) measureMap[k] = v;
    console.log('Loaded ' + Object.keys(overrides).length + ' measure overrides');
  }

  // Discover available measures in the PBIX
  console.log('Discovering measures...');
  const allMeasures = await callTool('measure_operations', { operation: 'List' });
  const measureNames = new Set((allMeasures.data || allMeasures._rows || []).map(m => m.name || m.Name || ''));
  console.log('Found ' + measureNames.size + ' measures in PBIX\n');

  // ============================================================
  // DATA OBJECT & HELPERS
  // ============================================================
  const data = { customer_name: pbixName };
  const notAvailable = [];
  const unmatched = [];

  function set(field, value) {
    if (value === null || value === undefined) {
      data[field] = 'not_available';
      notAvailable.push(field);
    } else {
      data[field] = value;
    }
  }

  // ============================================================
  // PHASE 2: EXTRACT SCALARS — map-driven measure lookups
  // ============================================================
  console.log('=== Phase 2: Extract Scalars ===');

  for (const [field, config] of Object.entries(measureMap)) {
    if (field.startsWith('$')) continue;  // skip metadata keys
    if (config.type !== 'scalar' && config.type !== 'monthly_backfill') continue;

    const measures = config.measures || [];
    const matched = measures.find(m => {
      // Measure names in the map are bracketed like "[Active Agents]"
      // measureNames set contains bare names like "Active Agents"
      const bare = m.replace(/^\[/, '').replace(/\]$/, '');
      return measureNames.has(bare) || measureNames.has(m);
    });

    if (matched) {
      let value = await getScalarMeasure(matched, field);
      if (config.transform === 'toPct') value = toPct(value);
      set(field, value);
    } else if (measures.length > 0) {
      // No measure matched in PBIX — try them anyway (measure_operations List may be incomplete)
      let found = false;
      for (const m of measures) {
        const value = await getScalarMeasure(m, field);
        if (value !== null) {
          set(field, config.transform === 'toPct' ? toPct(value) : value);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log('  ' + field + ': no matching measure found (tried: ' + measures.join(', ') + ')');
        unmatched.push(field);
        set(field, null);
      }
    } else {
      // No measures defined (e.g. string fields) — skip
    }
  }

  // ============================================================
  // PHASE 3: EXTRACT COMPUTED FIELDS — DAX expressions from map
  // ============================================================
  console.log('\n=== Phase 3: Extract Computed Fields ===');

  for (const [field, config] of Object.entries(measureMap)) {
    if (field.startsWith('$') || field.startsWith('_')) continue;
    if (config.type !== 'computed') continue;
    if (data[field] !== undefined && data[field] !== 'not_available') continue;  // already extracted

    try {
      const result = await runDax(config.dax);
      let value = getScalar(result);
      if (config.transform === 'toPct') value = toPct(value);
      set(field, value);
      console.log('  ' + field + ': ' + data[field]);
    } catch (e) {
      console.log('  ' + field + ': computed DAX failed - ' + e.message.substring(0, 60));
      set(field, null);
    }
  }

  // ============================================================
  // PHASE 4: EXTRACT TABULAR FIELDS
  // ============================================================
  console.log('\n=== Phase 4: Extract Tabular Fields ===');

  // --- Agent Table ---
  const agentTableConfig = measureMap['agent_table'];
  if (agentTableConfig && agentTableConfig.type === 'tabular') {
    try {
      const agentResult = await runDax(agentTableConfig.dax);
      const agents = (agentResult._rows || []).filter(r => r.AgentName && r.AgentName !== '');
      data.agent_table = agents.map(r => ({
        name: r.AgentName,
        type: 'Store Agent (1P/3P)',
        users: 0,
        sessions: Number(r.Sessions) || 0,
        sessions_per_user: Number(r.Sessions) || 0
      }));
      data.top_agent_names = data.agent_table.slice(0, 8).map(a => a.name);
      data.top_agent_sessions = data.agent_table.slice(0, 8).map(a => a.sessions_per_user);
      console.log('  agent_table: ' + data.agent_table.length + ' agents');
    } catch (e) {
      console.log('  agent_table: error - ' + e.message.substring(0, 150));
      set('agent_table', null);
      set('top_agent_names', null);
      set('top_agent_sessions', null);
    }
  }

  // --- Org Scatter Data ---
  const orgConfig = measureMap['org_scatter_data'];
  if (orgConfig && orgConfig.type === 'tabular') {
    try {
      let orgResult;
      const orgQueries = orgConfig.dax_variants || [orgConfig.dax];
      for (const q of orgQueries) {
        try {
          orgResult = await runDax(q);
          console.log('  org_scatter: rows=' + (orgResult._rows ? orgResult._rows.length : 'none'));
          if (orgResult._rows && orgResult._rows.length > 0) break;
        } catch (e) {
          console.log('  org_scatter: query attempt failed - ' + e.message.substring(0, 60));
        }
      }
      const orgs = (orgResult && orgResult._rows || []).filter(r => r.Organization && r.Organization !== '');
      data.org_scatter_data = orgs.slice(0, 15).map(r => ({
        label: r.Organization,
        x: Number(r.ActiveUsers) || 0,
        y: Math.round((Number(r.Agents) || 0) / Math.max(Number(r.ActiveUsers), 1) * 100 * 10) / 10,
        r: Number(r.ActiveUsers) || 0
      }));
      // Set org_count from results if not already set from scalar
      if (data.org_count === 'not_available' || data.org_count === undefined) {
        data.org_count = orgs.length;
      }
      console.log('  org_scatter_data: ' + orgs.length + ' orgs, using top 15');
    } catch (e) {
      console.log('  org_scatter_data: error - ' + e.message.substring(0, 150));
      set('org_scatter_data', null);
    }
  }

  // --- Monthly Data ---
  const monthlyConfig = measureMap['_supplementary_metrics.monthly_data'];
  data._supplementary_metrics = {};

  if (monthlyConfig && monthlyConfig.type === 'tabular') {
    try {
      const monthlyResult = await runDax(monthlyConfig.dax);
      const rows = monthlyResult._rows || [];
      const monthlyData = {};
      const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

      rows.forEach(r => {
        const ym = parseYearMonth(r);
        const parts = ym.split('-');
        if (parts.length < 2) return;
        const year = parts[0];
        const monthIdx = parseInt(parts[1], 10) - 1;
        if (monthIdx < 0 || monthIdx > 11) return;
        const key = monthAbbr[monthIdx] + '_' + year;
        const licensed = Number(r.Licensed) || 0;
        const unlicensed = Number(r.Unlicensed) || 0;
        const users = licensed + unlicensed;
        monthlyData[key] = {
          users,
          prompts: 0,
          sessions: 0,
          avg_prompts_per_user: 0
        };
      });

      data._supplementary_metrics.monthly_data = monthlyData;
      console.log('  monthly_data: ' + Object.keys(monthlyData).length + ' months');

      // Derive analysis_period from monthly data
      const months = Object.keys(monthlyData);
      if (months.length > 0) {
        const first = months[0].split('_');
        const last = months[months.length - 1].split('_');
        const mNames = { jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec' };
        data.analysis_period = (mNames[first[0]] || first[0]) + ' ' + first[1] + ' \u2013 ' + (mNames[last[0]] || last[0]) + ' ' + last[1];
      }
    } catch (e) {
      console.log('  monthly_data: error - ' + e.message.substring(0, 150));
    }
  }

  // Set analysis_period fallback if not derived from monthly data
  if (!data.analysis_period || data.analysis_period === 'not_available') {
    set('analysis_period', 'TBD');
  }

  // --- Per-Tier Monthly Users ---
  const tierConfig = measureMap['_supplementary_metrics.per_tier_monthly_users'];
  if (tierConfig && tierConfig.type === 'tabular') {
    try {
      const tierResult = await runDax(tierConfig.dax);
      const rows = tierResult._rows || [];
      const monthFull = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      data._supplementary_metrics.per_tier_monthly_users = rows.map(r => {
        const ym = parseYearMonth(r);
        const parts = ym.split('-');
        const year = parts[0] || '';
        const monthIdx = parseInt(parts[1], 10) - 1;
        return {
          month: (monthFull[monthIdx] || parts[1]) + ' ' + year,
          licensed: Number(r.Licensed) || 0,
          unlicensed: Number(r.Unlicensed) || 0,
          agents: Number(r.Agents) || 0
        };
      });
      console.log('  per_tier_monthly_users: ' + rows.length + ' months');
    } catch (e) {
      console.log('  per_tier_monthly_users: error - ' + e.message.substring(0, 150));
    }
  }

  // --- App Interactions ---
  const appConfig = measureMap['_supplementary_metrics.app_interactions'];
  if (appConfig && appConfig.type === 'tabular') {
    try {
      const appResult = await runDax(appConfig.dax);
      const rows = appResult._rows || [];
      const appMap = {};
      let totalInteractions = 0;

      rows.forEach(r => {
        const app = (r.CopilotApp || r['Copilot Actions[CopilotApp]'] || '').toLowerCase().replace(/\s+/g, '_');
        if (!app) return;
        const interactions = Number(r.Interactions) || 0;
        totalInteractions += interactions;
        appMap[app] = { interactions, pct: 0, users: Number(r.Users) || 0 };
      });

      Object.values(appMap).forEach(v => {
        v.pct = totalInteractions > 0 ? Math.round(v.interactions / totalInteractions * 1000) / 10 : 0;
      });

      data._supplementary_metrics.app_interactions = appMap;
      console.log('  app_interactions: ' + Object.keys(appMap).length + ' app surfaces');
    } catch (e) {
      console.log('  app_interactions: error - ' + e.message.substring(0, 150));
    }
  }

  // ============================================================
  // PHASE 5: DERIVE FIELDS — computed from already-extracted data
  // ============================================================
  console.log('\n=== Phase 5: Derive Fields ===');

  for (const [field, config] of Object.entries(measureMap)) {
    if (field.startsWith('$') || field.startsWith('_')) continue;
    if (config.type !== 'derived') continue;
    // Skip if already populated (e.g. from agent_table post-processing)
    if (data[field] !== undefined && data[field] !== 'not_available') continue;

    const deps = config.depends_on || [];
    const formula = config.formula || '';

    // --- inactive_licenses ---
    if (field === 'inactive_licenses') {
      if (typeof data.total_licensed_seats === 'number' && typeof data.licensed_users === 'number') {
        data[field] = Math.max(0, data.total_licensed_seats - data.licensed_users);
        console.log('  ' + field + ': ' + data[field]);
      } else { set(field, null); }
      continue;
    }

    // --- m365_enablement ---
    if (field === 'm365_enablement') {
      if (typeof data.licensed_users === 'number' && typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
        data[field] = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
        console.log('  ' + field + ': ' + data[field] + '%');
      } else { set(field, null); }
      continue;
    }

    // --- license_priority ---
    if (field === 'license_priority') {
      if (typeof data.licensed_avg_prompts === 'number' && typeof data.unlicensed_avg_prompts === 'number' && data.unlicensed_avg_prompts > 0) {
        data[field] = Math.round(data.licensed_avg_prompts / data.unlicensed_avg_prompts * 100) / 100;
        console.log('  ' + field + ': ' + data[field] + 'x');
      } else { set(field, null); }
      continue;
    }

    // --- license_coverage ---
    if (field === 'license_coverage') {
      if (typeof data.licensed_users === 'number' && typeof data.total_active_users === 'number' && data.total_active_users > 0) {
        data[field] = Math.round(data.licensed_users / data.total_active_users * 1000) / 10;
        console.log('  ' + field + ': ' + data[field] + '%');
      } else { set(field, null); }
      continue;
    }

    // --- band_X_pct (percentage of band totals) ---
    if (field.match(/^band_.*_pct$/)) {
      const bandFields = ['band_1_5', 'band_6_10', 'band_11_15', 'band_16_plus'];
      const allBandsNum = bandFields.every(b => typeof data[b] === 'number');
      if (allBandsNum) {
        const bandTotal = bandFields.reduce((sum, b) => sum + (data[b] || 0), 0);
        if (bandTotal > 0) {
          // Determine which band this pct field corresponds to
          const bandName = field.replace(/_pct$/, '');
          data[field] = Math.round((data[bandName] || 0) / bandTotal * 1000) / 10;
          console.log('  ' + field + ': ' + data[field] + '%');
        } else { set(field, null); }
      } else { set(field, null); }
      continue;
    }

    // --- top_agent_names / top_agent_sessions (from agent_table) ---
    if (field === 'top_agent_names' && Array.isArray(data.agent_table)) {
      data[field] = data.agent_table.slice(0, 8).map(a => a.name);
      console.log('  ' + field + ': ' + data[field].length + ' names');
      continue;
    }
    if (field === 'top_agent_sessions' && Array.isArray(data.agent_table)) {
      data[field] = data.agent_table.slice(0, 8).map(a => a.sessions_per_user);
      console.log('  ' + field + ': ' + data[field].length + ' values');
      continue;
    }

    // --- org_count (from org scatter data) ---
    if (field === 'org_count') {
      data[field] = Array.isArray(data.org_scatter_data) ? data.org_scatter_data.length : 0;
      console.log('  ' + field + ': ' + data[field] + ' orgs');
      continue;
    }

    // --- radar placeholders (scoring engine computes real values) ---
    if (field === 'radar_reach') { data[field] = [0, 0, 0, 0, 0, 0]; continue; }
    if (field === 'radar_habit') { data[field] = [0, 0, 0, 0, 0, 0, 0]; continue; }
    if (field === 'radar_skill') { data[field] = [0, 0, 0, 0]; continue; }

    // --- Catch-all: field not handled above ---
    if (data[field] === undefined) {
      console.log('  ' + field + ': derived formula not implemented, skipping');
      set(field, null);
    }
  }

  // ============================================================
  // PHASE 6: MONTHLY BACKFILL — overwrite core user counts from
  // most recent complete month in per_tier_monthly_users
  // ============================================================
  console.log('\n=== Phase 6: Monthly Backfill ===');

  if (data._supplementary_metrics && data._supplementary_metrics.per_tier_monthly_users) {
    const tiers = data._supplementary_metrics.per_tier_monthly_users;
    if (tiers.length >= 2) {
      const fullMonth = tiers[tiers.length - 2];  // second-to-last (avoid partial)
      console.log('  Backfilling from ' + fullMonth.month);
      data.licensed_users = fullMonth.licensed;
      data.chat_users = fullMonth.unlicensed;
      data.total_active_users = fullMonth.licensed + fullMonth.unlicensed;

      // Recalculate derived fields that depend on user counts
      if (typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
        data.m365_enablement = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
        data.m365_adoption = data.m365_adoption === 'not_available'
          ? data.m365_enablement
          : data.m365_adoption;
      }
      if (data.total_active_users > 0) {
        data.license_coverage = Math.round(data.licensed_users / data.total_active_users * 1000) / 10;
      }
      if (typeof data.total_licensed_seats === 'number') {
        data.inactive_licenses = Math.max(0, data.total_licensed_seats - data.licensed_users);
      }
      if (typeof data.licensed_avg_prompts === 'number' && typeof data.unlicensed_avg_prompts === 'number' && data.unlicensed_avg_prompts > 0) {
        data.license_priority = Math.round(data.licensed_avg_prompts / data.unlicensed_avg_prompts * 100) / 100;
      }
    }
  }

  // ============================================================
  // PHASE 7: COMPUTED FALLBACKS — fill gaps using raw DAX queries
  // These run AFTER scalar/computed extraction, filling any fields
  // still marked 'not_available' that have fallback_dax in the map.
  // ============================================================
  console.log('\n=== Phase 7: Computed Fallbacks ===');

  // m365_adoption: derive from licensed/seats if measure was unavailable
  if (data.m365_adoption === 'not_available') {
    const adoptionConfig = measureMap['m365_adoption'];
    if (adoptionConfig && adoptionConfig.fallback_derived) {
      if (typeof data.licensed_users === 'number' && typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
        data.m365_adoption = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
        console.log('  m365_adoption: derived = ' + data.m365_adoption + '%');
      }
    }
  }

  // m365_retention: fallback DAX (ActiveDaysSummary INTERSECT)
  if (data.m365_retention === 'not_available') {
    const retConfig = measureMap['m365_retention'];
    if (retConfig && retConfig.fallback_dax) {
      try {
        const retResult = await runDax(retConfig.fallback_dax);
        if (retResult._rows && retResult._rows.length > 0) {
          const pct = Number(retResult._rows[0].RetentionPct);
          data.m365_retention = isNaN(pct) ? 'not_available' : Math.round(pct * 1000) / 10;
          console.log('  m365_retention: fallback DAX = ' + data.m365_retention + '%');
        }
      } catch (e) { console.log('  m365_retention fallback failed: ' + e.message.substring(0, 80)); }
    }
  }

  // Retention counts (retained_users / churned_users)
  // These have their own computed DAX in the map, but may also produce
  // m365_retention as a side-effect if both are run together. Run the
  // retained_users/churned_users DAX individually from the map.
  // (They were already attempted in Phase 3. If still not_available, try
  // the combined retention query as final fallback.)
  if (data.retained_users === 'not_available' || data.churned_users === 'not_available') {
    try {
      const combinedDax = `
        EVALUATE
        VAR LastMonth = MAXX('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart])
        VAR PrevMonth = MAXX(FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart] < LastMonth), 'ActiveDaysSummary'[MonthStart])
        VAR UsersLast = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = LastMonth)
        VAR UsersPrev = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = PrevMonth)
        VAR Retained = COUNTROWS(INTERSECT(UsersLast, UsersPrev))
        VAR Churned = COUNTROWS(UsersPrev) - Retained
        RETURN ROW("Retained", Retained, "Churned", Churned, "RetentionPct", DIVIDE(Retained, COUNTROWS(UsersPrev), 0))
      `;
      const retResult = await runDax(combinedDax);
      if (retResult._rows && retResult._rows.length > 0) {
        const row = retResult._rows[0];
        data.retained_users = Number(row.Retained) || 0;
        data.churned_users = Number(row.Churned) || 0;
        console.log('  retained_users: ' + data.retained_users + ', churned_users: ' + data.churned_users);
        // Also set m365_retention if still missing
        if (data.m365_retention === 'not_available') {
          const pct = Number(row.RetentionPct);
          data.m365_retention = isNaN(pct) ? 'not_available' : Math.round(pct * 1000) / 10;
          console.log('  m365_retention: from combined = ' + data.m365_retention + '%');
        }
      }
    } catch (e) { console.log('  Retention combined fallback failed: ' + e.message.substring(0, 80)); }
  }

  // chat_retention: fallback DAX (per-tier INTERSECT)
  if (data.chat_retention === 'not_available') {
    const chatRetConfig = measureMap['chat_retention'];
    if (chatRetConfig && chatRetConfig.fallback_dax) {
      try {
        const chatRetResult = await runDax(chatRetConfig.fallback_dax);
        if (chatRetResult._rows && chatRetResult._rows.length > 0) {
          const pct = Number(chatRetResult._rows[0].RetPct);
          data.chat_retention = isNaN(pct) ? 'not_available' : Math.round(pct * 1000) / 10;
          console.log('  chat_retention: fallback DAX = ' + data.chat_retention + '%');
        }
      } catch (e) { console.log('  chat_retention fallback failed: ' + e.message.substring(0, 80)); }
    }
  }

  // agent_creators_pct: fallback (DISTINCTCOUNT / total_active_users)
  if (data.agent_creators_pct === 'not_available') {
    const creatorsConfig = measureMap['agent_creators_pct'];
    if (creatorsConfig && creatorsConfig.fallback_dax) {
      try {
        const creatorsResult = await runDax(creatorsConfig.fallback_dax);
        if (creatorsResult._rows && creatorsResult._rows.length > 0) {
          const creators = Number(creatorsResult._rows[0].v || creatorsResult._rows[0][Object.keys(creatorsResult._rows[0])[0]]) || 0;
          if (typeof data.total_active_users === 'number' && data.total_active_users > 0) {
            data.agent_creators_pct = Math.round(creators / data.total_active_users * 1000) / 10;
            console.log('  agent_creators_pct: ' + creators + ' creators / ' + data.total_active_users + ' users = ' + data.agent_creators_pct + '%');
          }
        }
      } catch (e) { console.log('  agent_creators_pct fallback failed: ' + e.message.substring(0, 80)); }
    }
  }

  // complex_sessions: fallback — avg prompts per active day from ActiveDaysSummary
  if (data.complex_sessions === 'not_available') {
    const complexConfig = measureMap['complex_sessions'];
    if (complexConfig && complexConfig.fallback_dax) {
      try {
        const complexResult = await runDax(complexConfig.fallback_dax);
        if (complexResult._rows && complexResult._rows.length > 0) {
          const val = Number(complexResult._rows[0].v || complexResult._rows[0][Object.keys(complexResult._rows[0])[0]]) || 0;
          data.complex_sessions = Math.round(val * 10) / 10;
          console.log('  complex_sessions: fallback = ' + data.complex_sessions + ' prompts/active day');
        }
      } catch (e) { console.log('  complex_sessions fallback failed: ' + e.message.substring(0, 80)); }
    }
  }

  // ============================================================
  // PHASE 8: ROUND ALL FLOATS, VALIDATE & SAVE
  // ============================================================
  console.log('\n=== Phase 8: Round, Validate & Save ===');

  // Store PBIX port in metadata for cross-validation
  data._metadata = { pbix_port: port, extracted_at: new Date().toISOString(), measure_map_version: measureMap['$version'] || '1.0.0' };

  // Round all numeric values to 1 decimal
  for (const key of Object.keys(data)) {
    if (key.startsWith('_') || key === 'customer_name' || key === 'analysis_period') continue;
    if (typeof data[key] === 'number' && !Number.isInteger(data[key])) {
      data[key] = Math.round(data[key] * 10) / 10;
    }
  }

  // Validate against schema
  let extracted = 0, naCount = 0, missing = 0;
  for (const field of schema.required) {
    if (data[field] === 'not_available') naCount++;
    else if (data[field] === undefined || data[field] === null) { missing++; data[field] = 'not_available'; naCount++; }
    else extracted++;
  }

  const targetPath = path.resolve(outputDir, slug + '.json');
  // Don't overwrite existing curated files — use .extracted.json suffix
  const outputPath = fs.existsSync(targetPath)
    ? path.resolve(outputDir, slug + '.extracted.json')
    : targetPath;
  if (outputPath !== targetPath) {
    console.log('  NOTE: Existing ' + path.basename(targetPath) + ' preserved. Writing to ' + path.basename(outputPath));
  }
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log('\n=== Summary ===');
  console.log('  Extracted: ' + extracted + '/' + schema.required.length);
  console.log('  Not available: ' + naCount);
  if (missing > 0) console.log('  Auto-marked not_available: ' + missing);
  console.log('  Output: ' + outputPath);

  // ============================================================
  // PHASE 9: HANDLE UNMATCHED FIELDS — exit code 3 if any still missing
  // ============================================================
  // Filter unmatched scalars to only those still not_available after all fallbacks
  const stillMissing = unmatched.filter(f => data[f] === 'not_available' || data[f] === undefined);
  if (stillMissing.length > 0) {
    const request = {
      customer: pbixName,
      unmatched_fields: stillMissing.map(f => ({
        field: f,
        description: measureMap[f] ? measureMap[f].description : undefined,
        tried: measureMap[f] ? measureMap[f].measures : undefined
      })),
      available_measures: [...measureNames].sort(),
      save_to: overridePath
    };
    const tempDir = path.resolve(__dirname, '..', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.resolve(tempDir, 'measure_mapping_request.json'), JSON.stringify(request, null, 2));
    console.log('\n  MEASURE MAPPING NEEDED — ' + stillMissing.length + ' fields still not_available');
    console.log('  Request written to temp/measure_mapping_request.json');
    proc.kill();
    process.exit(3);
  } else if (unmatched.length > 0) {
    console.log('  ' + unmatched.length + ' scalar measures unmatched but all filled by computed fallbacks');
  }

  console.log('\nEXTRACTION COMPLETE\n');

  proc.kill();
  process.exit(0);
}

main().catch(e => {
  console.error('EXTRACTION FAILED:', e.message);
  if (proc) proc.kill();
  process.exit(1);
});
