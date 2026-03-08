#!/usr/bin/env node
/**
 * Frontier Firm — Generic PBIX Data Extraction via PBI MCP
 *
 * Usage:
 *   node extract-from-pbix.js --pbix "Customer Name" --output data/
 *   node extract-from-pbix.js --pbix "Network Rail" --output data/ --mcp-exe /path/to/exe
 *
 * Extracts all required fields from an open PBIX file via the PBI MCP subprocess.
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
    // Strip table prefix: "Chat + Agent Org Data[Organization]" → "Organization"
    // Also handle "[Users]" → "Users"
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

// Try multiple measure names in order, returning the first non-null result.
// Handles PBIX version differences (newer 2302 vs older MOJ/NR templates).
async function getScalarWithFallbacks(measures, label) {
  for (const m of measures) {
    const v = await getScalarMeasure(m, label);
    if (v !== null) return v;
  }
  return null;
}

// ============================================================
// MAIN EXTRACTION
// ============================================================
async function main() {
  console.log('\n=== Frontier Firm PBIX Extraction ===');
  console.log('Customer: ' + pbixName);
  console.log('MCP exe: ' + EXE + '\n');

  proc = spawn(EXE, ['--start', '--readonly', '--skipconfirmation'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => { try { const m = JSON.parse(line); if (m.id) responses[m.id] = m; } catch (e) { } });
  proc.stderr.on('data', () => { });

  await new Promise(r => setTimeout(r, 2000));
  send(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'frontier-firm-extract', version: '1.0' } });
  await waitFor(1);
  notify('notifications/initialized');
  await new Promise(r => setTimeout(r, 500));

  // Find and connect to the PBIX
  console.log('Discovering open PBIX files...');
  const instances = await callTool('connection_operations', { operation: 'ListLocalInstances' });

  // Response can be: { data: [...] } (JSON status block) or { _rows: [...] } (CSV parsed)
  const instanceList = instances.data || instances._rows || [];
  console.log('Found ' + instanceList.length + ' open PBIX instances');

  // Log available instances for debugging
  instanceList.forEach(inst => {
    const title = inst.parentWindowTitle || inst.Name || inst.name || '(unknown)';
    const p = inst.port || inst.Port || '?';
    console.log('  - ' + title + ' (port ' + p + ')');
  });

  // Fuzzy match the pbix name against window title, name, or database name
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

  const data = { customer_name: pbixName };
  const notAvailable = [];

  // Helper: convert 0-1 decimal rates to percentages (0.82 → 82.0)
  function toPct(v) { return typeof v === 'number' && v > 0 && v <= 1 ? Math.round(v * 1000) / 10 : v; }

  // Helper: set field, mark not_available if null
  function set(field, value) {
    if (value === null || value === undefined) {
      data[field] = 'not_available';
      notAvailable.push(field);
    } else {
      data[field] = value;
    }
  }

  // ============================================================
  // CORE METRICS
  // ============================================================
  console.log('=== Core Metrics ===');
  set('analysis_period', 'TBD');  // Must be set manually or derived from monthly data

  // Total active users: try Total Active Chat Users Last Month first, then sum Licensed + Unlicensed
  let totalActive = await getScalarMeasure('[Total Active Chat Users Last Month]', 'total_active_users');
  if (totalActive === null) {
    console.log('  Fallback: summing Licensed + Unlicensed for total_active_users');
    const lic = await getScalarMeasure('[NoOfActiveChatUsers (Licensed)]', 'total_active_users_lic');
    const unlic = await getScalarMeasure('[NoOfActiveChatUsers (Unlicensed)]', 'total_active_users_unlic');
    if (typeof lic === 'number' && typeof unlic === 'number') totalActive = lic + unlic;
  }
  set('total_active_users', totalActive);

  set('licensed_users', await getScalarMeasure('[NoOfActiveChatUsers (Licensed)]', 'licensed_users'));
  set('chat_users', await getScalarMeasure('[NoOfActiveChatUsers (Unlicensed)]', 'chat_users'));
  set('agent_users', await getScalarMeasure('[UsersInteractingWithAgents, Last Month]', 'agent_users'));

  // No direct "Copilot Enabled Users" measure — try Unique Users as proxy, else not_available
  let totalSeats = await getScalarMeasure("COUNTROWS('Copilot Licensed')", 'total_licensed_seats');
  set('total_licensed_seats', totalSeats);

  // Derived
  data.inactive_licenses = (typeof data.total_licensed_seats === 'number' && typeof data.licensed_users === 'number')
    ? Math.max(0, data.total_licensed_seats - data.licensed_users) : 0;

  // ============================================================
  // ENGAGEMENT METRICS
  // ============================================================
  console.log('\n=== Engagement ===');
  set('licensed_avg_prompts', await getScalarMeasure('[AverageActionsPerUser (Licensed Copilot Only)]', 'licensed_avg_prompts'));

  // No AveragePromptsPerUser (Unlicensed Chat Only) — use Average Chat Sessions Per Active User (Unlicensed)
  let unlicAvg = await getScalarMeasure('[Average Chat Sessions Per Active User (Unlicensed)]', 'unlicensed_avg_prompts');
  if (unlicAvg === null) unlicAvg = await getScalarMeasure('[Average Chat + Agent Sessions Per Active User (Unlicensed)]', 'unlicensed_avg_prompts_fb');
  set('unlicensed_avg_prompts', unlicAvg);

  // m365_intensity: try Average Sessions Per Active User (Licensed) or (All)
  let m365Int = await getScalarMeasure('[Average Sessions Per Active User (Licensed)]', 'm365_intensity');
  if (m365Int === null) m365Int = await getScalarMeasure('[Average Sessions Per Active User (All)]', 'm365_intensity_fb');
  set('m365_intensity', m365Int);

  // License priority (derived)
  if (typeof data.licensed_avg_prompts === 'number' && typeof data.unlicensed_avg_prompts === 'number' && data.unlicensed_avg_prompts > 0) {
    data.license_priority = Math.round(data.licensed_avg_prompts / data.unlicensed_avg_prompts * 100) / 100;
  } else { set('license_priority', null); }

  // M365 enablement (derived)
  if (typeof data.licensed_users === 'number' && typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
    data.m365_enablement = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
  } else { set('m365_enablement', null); }

  // ============================================================
  // SCORED METRICS — try each measure, fallback to not_available
  // Measures returning 0-1 rates are converted to percentages via toPct()
  // ============================================================
  console.log('\n=== Scored Metrics ===');
  // Reach metrics
  set('m365_adoption', toPct(await getScalarWithFallbacks(['[Engagement Rate]'], 'm365_adoption')));
  set('agent_adoption', toPct(await getScalarWithFallbacks(['[Agent Adoption Rate]', '[% Copilot Users Using Agents (Licensed)]'], 'agent_adoption')));
  set('agent_enablement', await getScalarWithFallbacks(['[Agent Org Spread]'], 'agent_enablement'));

  // Habit metrics (16+ day rates — these are the "habitual" thresholds)
  // Older PBIX uses 20+ bands instead of 16+
  set('m365_frequency', toPct(await getScalarWithFallbacks(['[Licensed Users 16+ Active Day Rate Last Month]', '[Licensed Users 20+ Active Day Rate Last Month]'], 'm365_frequency')));
  set('chat_habit', toPct(await getScalarWithFallbacks(['[16+ Active Day Rate, Last Month (Chat)]', '[>20 Active Day Rate, Last Month (Chat)]'], 'chat_habit')));
  set('agent_frequency', toPct(await getScalarWithFallbacks(['[16+ Active Day Rate, Last Month (Agent)]', '[>20 Active Day Rate, Last Month (Agent)]'], 'agent_frequency')));

  // Retention — use Return Rate as proxy (no dedicated retention measures in this PBIX)
  // Older PBIX uses "Avg Agent Return Rate %" instead of "Agent Return Rate"
  set('m365_retention', toPct(await getScalarWithFallbacks(['[Agent Return Rate]', '[Avg Agent Return Rate %]'], 'm365_retention')));
  set('chat_retention', toPct(await getScalarWithFallbacks(['[Satisfaction Rate]'], 'chat_retention')));
  set('agent_retention', toPct(await getScalarWithFallbacks(['[Agent Return Rate]', '[Avg Agent Return Rate %]'], 'agent_retention')));

  // Intensity (these are absolute counts, not rates)
  set('chat_intensity', await getScalarMeasure('[Average Chat Sessions Per Active User (Unlicensed)]', 'chat_intensity'));
  set('agent_intensity', await getScalarMeasure('[Average Agent Sessions Per Active Agent User]', 'agent_intensity'));

  // Weekly cadence (absolute, not rates)
  set('weekly_m365', await getScalarMeasure('[Average Active Days Per User Per Week (Licensed Copilot)]', 'weekly_m365'));
  let weeklyChatVal = await getScalarMeasure('[Average Chat Sessions Per User Per Week (All Licenses)]', 'weekly_chat');
  if (weeklyChatVal === null) weeklyChatVal = await getScalarMeasure('[Average Chat Sessions Per User Per Week (Unlicensed)]', 'weekly_chat_fb');
  set('weekly_chat', weeklyChatVal);
  set('weekly_agents', await getScalarMeasure('[Average Agent Sessions Per User Per Week (All Licenses)]', 'weekly_agents'));

  // Breadth / depth (absolute)
  set('m365_breadth', await getScalarMeasure('[Average Chat Active Days Per User]', 'm365_breadth'));
  set('agent_breadth', await getScalarMeasure('[Average Agent Active Days Per User]', 'agent_breadth'));

  // Complex sessions / quality
  set('complex_sessions', await getScalarWithFallbacks(['[Avg Turns Per Conversation]'], 'complex_sessions'));
  set('agent_health', toPct(await getScalarWithFallbacks(['[Agent Return Rate]', '[Avg Agent Return Rate %]'], 'agent_health')));
  set('agent_creators_pct', toPct(await getScalarWithFallbacks(['[Credit Utilization Rate]'], 'agent_creators_pct')));
  set('agent_habitual', toPct(await getScalarWithFallbacks(['[16+ Active Day Rate, Last Month (Agent)]', '[>20 Active Day Rate, Last Month (Agent)]'], 'agent_habitual')));

  // License coverage (derived)
  if (typeof data.licensed_users === 'number' && typeof data.total_active_users === 'number' && data.total_active_users > 0) {
    data.license_coverage = Math.round(data.licensed_users / data.total_active_users * 1000) / 10;
  } else { set('license_coverage', null); }

  // ============================================================
  // ACTIVE DAY BANDS
  // ============================================================
  console.log('\n=== Active Day Bands ===');
  // Overall (all users) — use Chat counts as proxy for overall
  // Older PBIX uses 11-19 and >20 bands instead of 11-15 and 16+
  const b15 = await getScalarMeasure('[1-5 Active Days, Last Month (Chat)]', 'band_1_5');
  const b610 = await getScalarMeasure('[6-10 Active Days, Last Month (ChatO)]', 'band_6_10');
  const b1115 = await getScalarWithFallbacks(['[11-15 Active Days, Last Month (Chat)]', '[11-19 Active Days, Last Month (Chat)]'], 'band_11_15');
  const b16p = await getScalarWithFallbacks(['[16+ Active Days, Last Month (Chat)]', '[>20 Active Days, Last Month (Chat)]'], 'band_16_plus');
  set('band_1_5', b15);
  set('band_6_10', b610);
  set('band_11_15', b1115);
  set('band_16_plus', b16p);
  const bandTotal = (b15 || 0) + (b610 || 0) + (b1115 || 0) + (b16p || 0);
  if (bandTotal > 0) {
    data.band_1_5_pct = Math.round((b15 || 0) / bandTotal * 1000) / 10;
    data.band_6_10_pct = Math.round((b610 || 0) / bandTotal * 1000) / 10;
    data.band_11_15_pct = Math.round((b1115 || 0) / bandTotal * 1000) / 10;
    data.band_16_plus_pct = Math.round((b16p || 0) / bandTotal * 1000) / 10;
  } else {
    set('band_1_5_pct', null); set('band_6_10_pct', null);
    set('band_11_15_pct', null); set('band_16_plus_pct', null);
  }

  // Per-tier band rates — PBIX "Rate" measures return decimals (0.82 = 82%)
  // Older PBIX uses 11-19 / >20 bands instead of 11-15 / 16+
  set('chat_band_1_5_pct', toPct(await getScalarMeasure('[1-5 Active Day Rate, Last Month (Chat)]', 'chat_band_1_5_pct')));
  set('chat_band_6_10_pct', toPct(await getScalarMeasure('[6-10 Active Day Rate, Last Month (Chat)]', 'chat_band_6_10_pct')));
  set('chat_band_11_15_pct', toPct(await getScalarWithFallbacks(['[11-15 Active Day Rate, Last Month (Chat)]', '[11-19 Active Day Rate, Last Month (Chat)]'], 'chat_band_11_15_pct')));
  set('chat_band_16_plus_pct', toPct(await getScalarWithFallbacks(['[16+ Active Day Rate, Last Month (Chat)]', '[>20 Active Day Rate, Last Month (Chat)]'], 'chat_band_16_plus_pct')));
  set('agent_band_1_5_pct', toPct(await getScalarMeasure('[1-5 Active Days Rate, Last Month (Agent)]', 'agent_band_1_5_pct')));
  set('agent_band_6_10_pct', toPct(await getScalarMeasure('[6-10 Active Day Rate, Last Month (Agent)]', 'agent_band_6_10_pct')));
  set('agent_band_11_15_pct', toPct(await getScalarWithFallbacks(['[11-15 Active Day Rate, Last Month (Agent)]', '[11-19 Active Day Rate, Last Month (Agent)]'], 'agent_band_11_15_pct')));
  set('agent_band_16_plus_pct', toPct(await getScalarWithFallbacks(['[16+ Active Day Rate, Last Month (Agent)]', '[>20 Active Day Rate, Last Month (Agent)]'], 'agent_band_16_plus_pct')));

  // ============================================================
  // AGENT ECOSYSTEM
  // ============================================================
  console.log('\n=== Agent Ecosystem ===');
  set('total_agents', await getScalarMeasure('[Active Agents]', 'total_agents'));
  // Multi-user agents: try High Impact Agents, then Agents with Credits, then compute from agent table
  let multiUserVal = await getScalarWithFallbacks(['[High Impact Agents]', '[Agents with Credits]'], 'multi_user_agents');
  set('multi_user_agents', multiUserVal);
  set('agents_keep', await getScalarMeasure('[Agents to Keep]', 'agents_keep'));
  set('agents_review', await getScalarMeasure('[Agents to Review]', 'agents_review'));
  set('agents_retire', await getScalarWithFallbacks(['[Dormant Agents]', '[Inactive Agents]'], 'agents_retire'));

  // Org count — try Agent Org Spread, fallback to org scatter data later
  set('org_count', await getScalarWithFallbacks(['[Agent Org Spread]'], 'org_count'));

  // Retention users — no direct count measures available, derive from total if possible
  // These need to be set from supplementary retention cohort data or marked not_available
  set('retained_users', null);
  set('churned_users', null);

  // ============================================================
  // AGENT LEADERBOARD
  // ============================================================
  console.log('\n=== Agent Leaderboard ===');
  try {
    const agentResult = await runDax(`
      EVALUATE
      TOPN(15,
        SUMMARIZECOLUMNS(
          'Chat + Agent Interactions (Audit Logs)'[AgentName],
          "Sessions", COUNTROWS('Chat + Agent Interactions (Audit Logs)')
        ),
        [Sessions], DESC
      )
      ORDER BY [Sessions] DESC
    `);
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
    console.log('  Found ' + data.agent_table.length + ' agents');
  } catch (e) {
    console.log('  Agent leaderboard error: ' + e.message.substring(0, 150));
    set('agent_table', null);
    set('top_agent_names', null);
    set('top_agent_sessions', null);
  }

  // ============================================================
  // RADAR DATA — derive from scored metrics
  // ============================================================
  console.log('\n=== Deriving Radar/Scoring ===');
  // These will be computed by the generator from the metric values
  // For now, set placeholder arrays that the scoring engine will overwrite
  data.radar_reach = [0, 0, 0, 0, 0, 0];
  data.radar_habit = [0, 0, 0, 0, 0, 0, 0];
  data.radar_skill = [0, 0, 0, 0];

  // ============================================================
  // ORG SCATTER DATA
  // ============================================================
  console.log('\n=== Org Scatter Data ===');
  try {
    // Try multiple column name patterns — PBIX versions vary
    let orgResult;
    const orgQueries = [
      // Pattern 1: Use measures that filter to last month per org
      `EVALUATE TOPN(15, SUMMARIZECOLUMNS('Chat + Agent Org Data'[Organization], "ActiveUsers", [Total Active Chat Users Last Month], "Agents", [UsersInteractingWithAgents, Last Month]), [ActiveUsers], DESC)`,
      // Pattern 2: Simple COUNTROWS fallback
      `EVALUATE TOPN(15, SUMMARIZECOLUMNS('Chat + Agent Org Data'[Organization], "ActiveUsers", COUNTROWS('Chat + Agent Org Data')), [ActiveUsers], DESC)`,
    ];
    for (const q of orgQueries) {
      try {
        orgResult = await runDax(q);
        console.log('  Org query rows: ' + (orgResult._rows ? orgResult._rows.length : 'none') + ', csv: ' + (orgResult._csv ? orgResult._csv.substring(0, 80) : 'none'));
        if (orgResult._rows && orgResult._rows.length > 0) break;
      } catch (e) {
        console.log('  Org query attempt failed: ' + e.message.substring(0, 60));
      }
    }
    const orgs = (orgResult._rows || []).filter(r => r.Organization && r.Organization !== '');
    data.org_scatter_data = orgs.slice(0, 15).map(r => ({
      label: r.Organization,
      x: Number(r.ActiveUsers) || 0,
      y: Math.round((Number(r.Agents) || 0) / Math.max(Number(r.ActiveUsers), 1) * 100 * 10) / 10,  // Agent adoption %
      r: Number(r.ActiveUsers) || 0  // bubble size = user count
    }));
    data.org_count = data.org_count || orgs.length;
    console.log('  Found ' + orgs.length + ' orgs, using top 15');
  } catch (e) {
    console.log('  Org scatter error: ' + e.message.substring(0, 150));
    set('org_scatter_data', null);
  }

  // ============================================================
  // SUPPLEMENTARY — Monthly data
  // ============================================================
  console.log('\n=== Monthly Data ===');
  data._supplementary_metrics = {};

  try {
    // Calendar table has [Year-Month] (e.g. "2025-09") and [Date] columns
    // Use Licensed + Unlicensed measures as they work as time series
    const monthlyResult = await runDax(`
      EVALUATE
      SUMMARIZECOLUMNS(
        'Calendar'[Year-Month],
        "Licensed", [NoOfActiveChatUsers (Licensed)],
        "Unlicensed", [NoOfActiveChatUsers (Unlicensed)]
      )
      ORDER BY 'Calendar'[Year-Month] ASC
    `);
    const rows = monthlyResult._rows || [];
    const monthlyData = {};
    const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    rows.forEach(r => {
      // CSV header may be "Year-Month" or "Calendar[Year-Month]" — try all keys
      const ym = r['Year-Month'] || r['Calendar[Year-Month]'] || Object.values(r).find(v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) || '';
      const parts = ym.split('-');
      if (parts.length < 2) return;
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) return;
      const key = monthAbbr[monthIdx] + '_' + year;
      const licensed = Number(r.Licensed) || 0;
      const unlicensed = Number(r.Unlicensed) || 0;
      const users = licensed + unlicensed;
      const prompts = 0;
      monthlyData[key] = {
        users,
        prompts,
        sessions: 0,
        avg_prompts_per_user: users > 0 ? Math.round(prompts / users * 10) / 10 : 0
      };
    });
    data._supplementary_metrics.monthly_data = monthlyData;
    console.log('  Found ' + Object.keys(monthlyData).length + ' months');

    // Derive analysis_period from monthly data
    const months = Object.keys(monthlyData);
    if (months.length > 0) {
      const first = months[0].split('_');
      const last = months[months.length - 1].split('_');
      const mNames = { jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec' };
      data.analysis_period = (mNames[first[0]] || first[0]) + ' ' + first[1] + ' \u2013 ' + (mNames[last[0]] || last[0]) + ' ' + last[1];
    }
  } catch (e) {
    console.log('  Monthly data error: ' + e.message.substring(0, 150));
  }

  // ============================================================
  // SUPPLEMENTARY — Per-tier monthly users
  // ============================================================
  console.log('\n=== Per-Tier Monthly Users ===');
  try {
    const tierResult = await runDax(`
      EVALUATE
      SUMMARIZECOLUMNS(
        'Calendar'[Year-Month],
        "Licensed", [NoOfActiveChatUsers (Licensed)],
        "Unlicensed", [NoOfActiveChatUsers (Unlicensed)],
        "Agents", [UsersInteractingWithAgents]
      )
      ORDER BY 'Calendar'[Year-Month] ASC
    `);
    const rows = tierResult._rows || [];
    const monthFull = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    data._supplementary_metrics.per_tier_monthly_users = rows.map(r => {
      const ym = r['Year-Month'] || r['Calendar[Year-Month]'] || Object.values(r).find(v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) || '';
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
    console.log('  Found ' + rows.length + ' months of tier data');
  } catch (e) {
    console.log('  Per-tier error: ' + e.message.substring(0, 150));
  }

  // Backfill core user counts from per-tier monthly data (most recent complete month)
  if (data._supplementary_metrics.per_tier_monthly_users && data._supplementary_metrics.per_tier_monthly_users.length >= 2) {
    // Use second-to-last month (last may be partial)
    const recentMonths = data._supplementary_metrics.per_tier_monthly_users;
    const fullMonth = recentMonths.length >= 2 ? recentMonths[recentMonths.length - 2] : recentMonths[recentMonths.length - 1];
    console.log('  Backfilling user counts from ' + fullMonth.month);
    data.licensed_users = fullMonth.licensed;
    data.chat_users = fullMonth.unlicensed;
    data.total_active_users = fullMonth.licensed + fullMonth.unlicensed;
    // Recalculate derived values
    if (data.total_active_users > 0 && typeof data.total_licensed_seats === 'number') {
      data.license_coverage = Math.round(data.licensed_users / data.total_active_users * 1000) / 10;
    }
    if (typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
      data.m365_enablement = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
    }
  }

  // ============================================================
  // SUPPLEMENTARY — App interactions
  // ============================================================
  console.log('\n=== App Interactions ===');
  try {
    const appResult = await runDax(`
      EVALUATE
      SUMMARIZECOLUMNS(
        'Copilot Actions'[CopilotApp],
        "Interactions", COUNT('Copilot Actions'[Action]),
        "Users", DISTINCTCOUNT('Copilot Actions'[UserEmail])
      )
      ORDER BY [Interactions] DESC
    `);
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
    // Calculate percentages
    Object.values(appMap).forEach(v => {
      v.pct = totalInteractions > 0 ? Math.round(v.interactions / totalInteractions * 1000) / 10 : 0;
    });
    data._supplementary_metrics.app_interactions = appMap;
    console.log('  Found ' + Object.keys(appMap).length + ' app surfaces');
  } catch (e) {
    console.log('  App interactions error: ' + e.message.substring(0, 150));
  }

  // ============================================================
  // COMPUTED FALLBACKS — derive missing fields from raw tables
  // ============================================================
  console.log('\n=== Computed Fallbacks ===');

  // m365_adoption: derive from licensed/seats if not available
  if (data.m365_adoption === 'not_available' && typeof data.licensed_users === 'number' && typeof data.total_licensed_seats === 'number' && data.total_licensed_seats > 0) {
    data.m365_adoption = Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10;
    console.log('  m365_adoption: derived = ' + data.m365_adoption + '%');
  }

  // Retention: compute from ActiveDaysSummary INTERSECT
  if (data.retained_users === 'not_available' || data.churned_users === 'not_available') {
    try {
      const retResult = await runDax(`
        EVALUATE
        VAR LastMonth = MAXX('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart])
        VAR PrevMonth = MAXX(FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart] < LastMonth), 'ActiveDaysSummary'[MonthStart])
        VAR UsersLast = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = LastMonth)
        VAR UsersPrev = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = PrevMonth)
        VAR Retained = COUNTROWS(INTERSECT(UsersLast, UsersPrev))
        VAR Churned = COUNTROWS(UsersPrev) - Retained
        RETURN ROW("Retained", Retained, "Churned", Churned, "RetentionPct", DIVIDE(Retained, COUNTROWS(UsersPrev), 0))
      `);
      if (retResult._rows && retResult._rows.length > 0) {
        const row = retResult._rows[0];
        data.retained_users = Number(row.Retained) || 0;
        data.churned_users = Number(row.Churned) || 0;
        console.log('  retained_users: ' + data.retained_users + ', churned_users: ' + data.churned_users);
        // Also set m365_retention if missing
        if (data.m365_retention === 'not_available') {
          const pct = Number(row.RetentionPct);
          data.m365_retention = isNaN(pct) ? 'not_available' : Math.round(pct * 1000) / 10;
          console.log('  m365_retention: derived = ' + data.m365_retention + '%');
        }
      }
    } catch (e) { console.log('  Retention computation failed: ' + e.message.substring(0, 80)); }
  }

  // Chat retention: compute per-tier from ActiveDaysSummary
  if (data.chat_retention === 'not_available') {
    try {
      const chatRetResult = await runDax(`
        EVALUATE
        VAR LastMonth = MAXX('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart])
        VAR PrevMonth = MAXX(FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[MonthStart] < LastMonth), 'ActiveDaysSummary'[MonthStart])
        VAR UsersLast = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = LastMonth, 'ActiveDaysSummary'[LicenseStatus] = "Unlicensed")
        VAR UsersPrev = CALCULATETABLE(DISTINCT('ActiveDaysSummary'[Audit_UserId]), 'ActiveDaysSummary'[MonthStart] = PrevMonth, 'ActiveDaysSummary'[LicenseStatus] = "Unlicensed")
        RETURN ROW("RetPct", DIVIDE(COUNTROWS(INTERSECT(UsersLast, UsersPrev)), COUNTROWS(UsersPrev), 0))
      `);
      if (chatRetResult._rows && chatRetResult._rows.length > 0) {
        const pct = Number(chatRetResult._rows[0].RetPct);
        data.chat_retention = isNaN(pct) ? 'not_available' : Math.round(pct * 1000) / 10;
        console.log('  chat_retention: derived = ' + data.chat_retention + '%');
      }
    } catch (e) { console.log('  Chat retention failed: ' + e.message.substring(0, 80)); }
  }

  // Agent creators %
  if (data.agent_creators_pct === 'not_available') {
    try {
      const creatorsResult = await runDax("EVALUATE ROW(\"v\", DISTINCTCOUNT('Agents 365'[Agent Creator]))");
      if (creatorsResult._rows && creatorsResult._rows.length > 0) {
        const creators = Number(creatorsResult._rows[0].v || creatorsResult._rows[0][Object.keys(creatorsResult._rows[0])[0]]) || 0;
        if (typeof data.total_active_users === 'number' && data.total_active_users > 0) {
          data.agent_creators_pct = Math.round(creators / data.total_active_users * 1000) / 10;
          console.log('  agent_creators_pct: ' + creators + ' creators / ' + data.total_active_users + ' users = ' + data.agent_creators_pct + '%');
        }
      }
    } catch (e) { console.log('  Agent creators failed: ' + e.message.substring(0, 80)); }
  }

  // Complex sessions: use avg PromptCount as proxy (>1 prompt = multi-turn)
  if (data.complex_sessions === 'not_available') {
    try {
      const complexResult = await runDax("EVALUATE ROW(\"v\", DIVIDE(COUNTROWS(FILTER('ActiveDaysSummary', 'ActiveDaysSummary'[PromptCount] > 1)), COUNTROWS('ActiveDaysSummary'), 0))");
      if (complexResult._rows && complexResult._rows.length > 0) {
        const pct = Number(complexResult._rows[0].v || complexResult._rows[0][Object.keys(complexResult._rows[0])[0]]) || 0;
        data.complex_sessions = Math.round(pct * 1000) / 10;
        console.log('  complex_sessions: ' + data.complex_sessions + '% of user-months have >1 prompt');
      }
    } catch (e) { console.log('  Complex sessions failed: ' + e.message.substring(0, 80)); }
  }

  // ============================================================
  // ROUND ALL FLOATS — no 15-digit decimals in the output
  // ============================================================
  for (const key of Object.keys(data)) {
    if (key.startsWith('_') || key === 'customer_name' || key === 'analysis_period') continue;
    if (typeof data[key] === 'number' && !Number.isInteger(data[key])) {
      data[key] = Math.round(data[key] * 10) / 10;
    }
  }

  // ============================================================
  // VALIDATE & SAVE
  // ============================================================
  console.log('\n=== Validation ===');
  let extracted = 0, naCount = 0, missing = 0;
  for (const field of schema.required) {
    if (data[field] === 'not_available') naCount++;
    else if (data[field] === undefined || data[field] === null) { missing++; data[field] = 'not_available'; naCount++; }
    else extracted++;
  }

  const slug = pbixName.toLowerCase().replace(/\s+/g, '_');
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
  console.log('\nEXTRACTION COMPLETE\n');

  proc.kill();
  process.exit(0);
}

main().catch(e => {
  console.error('EXTRACTION FAILED:', e.message);
  if (proc) proc.kill();
  process.exit(1);
});
