#!/usr/bin/env node
/**
 * Network Rail — Frontier Firm Data Extraction via PBI MCP
 */

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');

const EXE = String.raw`C:\Users\keithmcgrane\.vscode\extensions\analysis-services.powerbi-modeling-mcp-0.4.0-win32-x64\server\powerbi-modeling-mcp.exe`;
const NR_PORT = 61548;
const OUTPUT = 'C:/tmp/nr_frontier_firm_data.json';

let proc, responses = {}, nextId = 100;

function send(id, method, params) {
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params}) + '\n');
}
function notify(method) {
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0',method}) + '\n');
}
function waitFor(id, timeout=60000) {
  return new Promise((resolve,reject) => {
    const t = setInterval(() => { if (responses[id]) { clearInterval(t); resolve(responses[id]); } }, 100);
    setTimeout(() => { clearInterval(t); reject(new Error(`timeout waiting for id ${id}`)); }, timeout);
  });
}

async function callTool(name, args) {
  const id = nextId++;
  send(id, 'tools/call', { name, arguments: { request: args } });
  const r = await waitFor(id);
  if (r.result.isError) throw new Error(r.result.content[0].text);
  // First content block is JSON status, second (if present) is CSV resource
  const text = r.result.content[0].text;
  const status = (() => { try { return JSON.parse(text); } catch(e) { return { raw: text }; } })();
  // Check for CSV resource in content blocks
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
  const headers = lines[0].replace(/^\[/, '').replace(/\]$/, '').split(/\],\s*\[|\]\[/).map(h => h.replace(/[\[\]]/g, '').trim());
  return lines.slice(1).map(line => {
    // Handle quoted CSV values
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

async function runDax(query) {
  return callTool('dax_query_operations', { operation: 'Execute', query, maxRows: 1000 });
}

// Helper to extract single scalar from DAX ROW result
function getScalarFromResult(result) {
  if (result._rows && result._rows.length > 0) {
    const row = result._rows[0];
    const keys = Object.keys(row);
    const v = row[keys[0]];
    if (v === '' || v === undefined || v === null) return null;
    const num = Number(v);
    return isNaN(num) ? v : num;
  }
  return null;
}

async function main() {
  proc = spawn(EXE, ['--start', '--readonly', '--skipconfirmation'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => { try { const m = JSON.parse(line); if (m.id) responses[m.id] = m; } catch(e){} });
  proc.stderr.on('data', () => {});

  await new Promise(r => setTimeout(r, 2000));
  send(1, 'initialize', {protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'extract',version:'1.0'}});
  await waitFor(1);
  notify('notifications/initialized');
  await new Promise(r => setTimeout(r, 500));

  console.log(`Connecting to Network Rail on port ${NR_PORT}...`);
  await callTool('connection_operations', { operation: 'Connect', dataSource: `localhost:${NR_PORT}` });
  console.log('Connected.\n');

  const data = { customer_name: 'Network Rail' };

  // Helper for running a EVALUATE ROW query and getting a single value
  async function getScalar(measureExpr, label) {
    label = label || 'V';
    try {
      const r = await runDax(`EVALUATE ROW("${label}", ${measureExpr})`);
      const v = getScalarFromResult(r);
      console.log(`  ${label}: ${v}`);
      return v;
    } catch(e) {
      console.log(`  ${label}: ERROR - ${e.message.substring(0, 100)}`);
      return null;
    }
  }

  // ============================================================
  // CORE METRICS
  // ============================================================
  console.log('=== Core Metrics ===');

  data.total_active_users = await getScalar('[NoOfActiveChatUsers]', 'total_active_users');
  data.licensed_users = await getScalar('[NoOfActiveChatUsers (Licensed)]', 'licensed_users');
  data.chat_users = await getScalar('[NoOfActiveChatUsers (Unlicensed)]', 'chat_users');
  data.agent_users = await getScalar('[UsersInteractingWithAgents]', 'agent_users');
  data.total_licensed_seats = await getScalar('[Copilot Enabled Users (Licensed)]', 'total_licensed_seats');
  data.total_employees = await getScalar('[Total Employees Count]', 'total_employees');
  data.licensed_employees = await getScalar('[LicensedEmployees]', 'licensed_employees');

  // Derived
  data.inactive_licenses = (data.total_licensed_seats || 0) - (data.licensed_users || 0);
  data.m365_enablement = data.total_licensed_seats > 0
    ? Math.round(data.licensed_users / data.total_licensed_seats * 1000) / 10 : null;

  console.log('\n=== Engagement Metrics ===');
  data.licensed_avg_prompts = await getScalar('[AverageActionsPerUser (Licensed Copilot Only)]', 'licensed_avg_prompts');
  data.unlicensed_avg_prompts = await getScalar('[AveragePromptsPerUser (Unlicensed Chat Only)]', 'unlicensed_avg_prompts');
  data.license_priority = data.licensed_avg_prompts && data.unlicensed_avg_prompts
    ? Math.round(data.licensed_avg_prompts / data.unlicensed_avg_prompts * 100) / 100 : null;

  data.avg_prompts_per_user_per_week = await getScalar('[AveragePromptsPerUserPerWeek]', 'avg_prompts_per_user_per_week');
  data.m365_intensity = await getScalar('[AverageChatPromptsPerUser]', 'm365_intensity');
  data.avg_chat_prompts_last_month = await getScalar('[AverageChatPromptsPerUser, Last Month]', 'avg_chat_prompts_last_month');
  data.agent_prompts_per_user = await getScalar('[AgentPromptsPerUser]', 'agent_prompts_per_user');

  console.log('\n=== Active Day Bands (All users, last month) ===');
  data.users_1_5_last_month = await getScalar('[Users 1-5 Active Days Last Month]', 'users_1_5');
  data.users_6_10_last_month = await getScalar('[Users 6-10 Active Days Last Month]', 'users_6_10');
  data.users_11_19_last_month = await getScalar('[Users 11-19 Active Days Last Month]', 'users_11_19');
  data.users_20_plus_last_month = await getScalar('[Users 20+ Active Days Last Month]', 'users_20_plus');

  console.log('\n=== Licensed Active Day Bands (last month) ===');
  data.licensed_1_5_rate = await getScalar('[Licensed Users 1-5 Active Day Rate Last Month]', 'lic_1_5_rate');
  data.licensed_6_10_rate = await getScalar('[Licensed Users 6-10 Active Day Rate Last Month]', 'lic_6_10_rate');
  data.licensed_11_19_rate = await getScalar('[Licensed Users 11-19 Active Day Rate Last Month]', 'lic_11_19_rate');
  data.licensed_20_plus_rate = await getScalar('[Licensed Users 20+ Active Day Rate Last Month]', 'lic_20_plus_rate');

  console.log('\n=== Chat (Unlicensed) Active Day Bands (last month) ===');
  data.chat_1_5_rate = await getScalar('[1-5 Active Day Rate, Last Month (Chat)]', 'chat_1_5_rate');
  data.chat_6_10_rate = await getScalar('[6-10 Active Day Rate, Last Month (Chat)]', 'chat_6_10_rate');
  data.chat_11_19_rate = await getScalar('[11-19 Active Day Rate, Last Month (Chat)]', 'chat_11_19_rate');
  data.chat_20_plus_rate = await getScalar('[>20 Active Day Rate, Last Month (Chat)]', 'chat_20_plus_rate');

  console.log('\n=== Agent Active Day Bands (last month) ===');
  data.agent_1_5_rate = await getScalar('[1-5 Active Days Rate, Last Month (Agent)]', 'agent_1_5_rate');
  data.agent_6_10_rate = await getScalar('[6-10 Active Day Rate, Last Month (Agent)]', 'agent_6_10_rate');
  data.agent_11_19_rate = await getScalar('[11-19 Active Day Rate, Last Month (Agent)]', 'agent_11_19_rate');
  data.agent_20_plus_rate = await getScalar('[>20 Active Day Rate, Last Month (Agent)]', 'agent_20_plus_rate');
  data.agent_users_last_month = await getScalar('[UsersInteractingWithAgents, Last Month]', 'agent_users_last_month');

  console.log('\n=== Agent Ecosystem ===');
  data.agent_return_rate = await getScalar('[Avg Agent Return Rate %]', 'agent_return_rate');
  data.users_multiple_agent_sessions = await getScalar('[Users with Multiple Agent Sessions]', 'multi_agent_users');
  data.most_popular_agent = await getScalar('[Most Popular Agent]', 'most_popular_agent');
  data.most_versatile_agent = await getScalar('[Most Versatile Agent]', 'most_versatile_agent');
  data.agent_unique_users = await getScalar('[Agent Unique Users]', 'agent_unique_users');
  data.agent_resource_count = await getScalar('[Agent Resource Count]', 'agent_resource_count');

  console.log('\n=== Averages & Rates ===');
  data.avg_active_days_licensed = await getScalar('[Average Active Days Per Licensed User]', 'avg_active_days_lic');
  data.avg_chat_active_days = await getScalar('[Average Chat Active Days Per User]', 'avg_chat_days');
  data.avg_agent_active_days = await getScalar('[Average Agent Active Days Per User]', 'avg_agent_days');
  data.active_user_rate_last_month = await getScalar('[Active User Rate Last Month]', 'active_user_rate');
  data.unlicensed_chat_proportion = await getScalar('[Unlicensed Chat User Proportion]', 'unlicensed_proportion');

  // ============================================================
  // TABULAR DATA — Org breakdown
  // ============================================================
  console.log('\n=== Org Data ===');
  try {
    const orgResult = await runDax(`
      EVALUATE
      SELECTCOLUMNS(
        'Chat + Agent Org Data',
        "Organization", 'Chat + Agent Org Data'[Organization],
        "ActiveUsers", 'Chat + Agent Org Data'[Active Users],
        "TotalActions", 'Chat + Agent Org Data'[Total Actions],
        "ActionsPerUser", 'Chat + Agent Org Data'[Actions per User]
      )
      ORDER BY [ActiveUsers] DESC
    `);
    data.org_data = orgResult._rows || [];
    console.log(`  Found ${data.org_data.length} orgs`);
  } catch(e) {
    console.log(`  Org data error: ${e.message.substring(0, 100)}`);
    // Try SUMMARIZE as fallback
    try {
      const orgResult2 = await runDax(`
        EVALUATE
        SUMMARIZECOLUMNS(
          'Chat + Agent Org Data'[Organization],
          "ActiveUsers", SUM('Chat + Agent Org Data'[Active Users]),
          "TotalActions", SUM('Chat + Agent Org Data'[Total Actions])
        )
        ORDER BY [ActiveUsers] DESC
      `);
      data.org_data = orgResult2._rows || [];
      console.log(`  Found ${data.org_data.length} orgs (fallback)`);
    } catch(e2) {
      console.log(`  Org fallback also failed: ${e2.message.substring(0, 100)}`);
    }
  }

  // ============================================================
  // TABULAR DATA — Agent leaderboard
  // ============================================================
  console.log('\n=== Agent Leaderboard ===');
  try {
    const agentResult = await runDax(`
      EVALUATE
      SELECTCOLUMNS(
        'Agent User Rankings',
        "Agent", 'Agent User Rankings'[CopilotAgentDisplayName],
        "Users", 'Agent User Rankings'[UserCount],
        "Sessions", 'Agent User Rankings'[SessionCount]
      )
      ORDER BY [Users] DESC
    `);
    data.agent_leaderboard = agentResult._rows || [];
    console.log(`  Found ${data.agent_leaderboard.length} agents`);
  } catch(e) {
    console.log(`  Agent leaderboard error: ${e.message.substring(0, 150)}`);
    // List columns to discover schema
    try {
      const cols = await callTool('column_operations', { operation: 'List', tableName: 'Agent User Rankings' });
      const colNames = (cols._rows || []).map(c => c.name || c.Name);
      if (colNames.length === 0 && cols._csv) console.log('  Columns CSV:', cols._csv.substring(0, 500));
      else console.log('  Agent User Rankings columns:', colNames.join(', '));
    } catch(e2) {
      console.log('  Could not list columns:', e2.message.substring(0, 100));
    }
  }

  // ============================================================
  // Monthly data from ActiveDaysSummary
  // ============================================================
  console.log('\n=== ActiveDaysSummary ===');
  try {
    const cols = await callTool('column_operations', { operation: 'List', tableName: 'ActiveDaysSummary' });
    if (cols._csv) console.log('  Columns CSV:', cols._csv.substring(0, 500));
  } catch(e) {
    console.log('  Could not list ActiveDaysSummary columns');
  }

  // ============================================================
  // WRITE OUTPUT
  // ============================================================
  console.log('\n=== Writing output ===');
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
  console.log(`Data written to ${OUTPUT}`);

  proc.kill();
}

main().catch(e => { console.error('ERROR:', e.message); if (proc) proc.kill(); process.exit(1); });
