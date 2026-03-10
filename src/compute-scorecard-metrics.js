#!/usr/bin/env node
/**
 * Scorecard Metric Computations
 * 
 * Computes derived metrics for the Frontier Firm maturity scorecard.
 * Designed to be reusable across customers.
 *
 * Required PBIX queries:
 *   1. Total Employees (from 'Chat + Agent Org Data')
 *   2. Per-agent return rate (users with 2+ sessions)
 *   3. Users interacting with 3+ distinct agents
 *
 * Derived computations:
 *   - %Free Chat active = chat_users / (total_employees - licensed_users)
 *   - %Agents with return rate >50% = agents where repeat_users/total_users > 0.5
 *   - %Users using 3+ agents = users_3plus / total_active_users
 *   - %Agents > 5 users = agents_5plus / total_agents
 *
 * Usage:
 *   node src/compute-scorecard-metrics.js --data data/customer.json [--port 64717]
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
  console.error('Usage: node compute-scorecard-metrics.js --data data/customer.json [--port 64717]');
  process.exit(1);
}

const dataFile = path.resolve(dataPath);
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const port = portArg || (data._metadata && data._metadata.pbix_port) || null;

// ============================================================
// PBI MCP CONNECTION (reused from cross-validate.js)
// ============================================================
function findMcpExe() {
  const mcpConfigPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'mcp.json');
  try {
    const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8').replace(/^\uFEFF/, ''));
    const pbi = config.mcpServers && config.mcpServers['powerbi-modeling-mcp'];
    if (pbi && pbi.command) return pbi.command;
  } catch (e) { /* not found */ }

  const known = path.join(process.env.USERPROFILE || '', '.vscode', 'extensions',
    'analysis-services.powerbi-modeling-mcp-0.4.0-win32-x64', 'server', 'powerbi-modeling-mcp.exe');
  if (fs.existsSync(known)) return known;
  return null;
}

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
// DAX QUERIES
// ============================================================

const DAX_TOTAL_EMPLOYEES = `
EVALUATE
ROW("TotalEmployees", SUM('Chat + Agent Org Data'[Total Employees]))
`;

const DAX_PER_AGENT_RETURN_RATE = `
EVALUATE
ADDCOLUMNS(
  VALUES('Chat + Agent Interactions (Audit Logs)'[AgentName]),
  "TotalUsers", CALCULATE(
    DISTINCTCOUNT('Chat + Agent Interactions (Audit Logs)'[Audit_UserId])
  ),
  "RepeatUsers", CALCULATE(
    COUNTROWS(
      FILTER(
        ADDCOLUMNS(
          VALUES('Chat + Agent Interactions (Audit Logs)'[Audit_UserId]),
          "Sess", CALCULATE(COUNTROWS('Chat + Agent Interactions (Audit Logs)'))
        ),
        [Sess] >= 2
      )
    )
  )
)
ORDER BY [TotalUsers] DESC
`;

const DAX_USERS_3PLUS_AGENTS = `
EVALUATE
ROW(
  "Users3Plus",
  COUNTROWS(
    FILTER(
      ADDCOLUMNS(
        VALUES('Chat + Agent Interactions (Audit Logs)'[Audit_UserId]),
        "AgentCount", CALCULATE(
          DISTINCTCOUNT('Chat + Agent Interactions (Audit Logs)'[AgentName])
        )
      ),
      [AgentCount] >= 3
    )
  )
)
`;

const DAX_AGENT_MOM_RETENTION = `
EVALUATE
VAR AprAgents = CALCULATETABLE(
  DISTINCT('ActiveDaysSummary'[Audit_UserId]),
  'ActiveDaysSummary'[MonthStart] = DATE(2025, 4, 1),
  'ActiveDaysSummary'[IsAgentUser] = 1
)
VAR MayAgents = CALCULATETABLE(
  DISTINCT('ActiveDaysSummary'[Audit_UserId]),
  'ActiveDaysSummary'[MonthStart] = DATE(2025, 5, 1),
  'ActiveDaysSummary'[IsAgentUser] = 1
)
RETURN ROW(
  "AprTotal", COUNTROWS(AprAgents),
  "MayTotal", COUNTROWS(MayAgents),
  "Retained", COUNTROWS(INTERSECT(AprAgents, MayAgents))
)
`;

// ============================================================
// MAIN
// ============================================================
function computeDerivedOnly(data) {
  console.log('\n=== Scorecard Metric Computation (data-only mode) ===\n');
  console.log('Data file: ' + dataFile);
  console.log('No PBIX connection — computing derivable metrics only\n');
  const scorecard = data._scorecard_metrics || {};

  // Combined Habitual Rate (11+ active days)
  const b11 = typeof data.band_11_15 === 'number' ? data.band_11_15 : 0;
  const b16 = typeof data.band_16_plus === 'number' ? data.band_16_plus : 0;
  const b1 = typeof data.band_1_5 === 'number' ? data.band_1_5 : 0;
  const b6 = typeof data.band_6_10 === 'number' ? data.band_6_10 : 0;
  const totalBandUsers = b1 + b6 + b11 + b16;
  const habitualUsers = b11 + b16;
  if (totalBandUsers > 0) {
    scorecard.combined_habitual_pct = Math.round(habitualUsers / totalBandUsers * 1000) / 10;
    scorecard.habitual_users = habitualUsers;
    scorecard.total_band_users = totalBandUsers;
    console.log('  Combined habitual: ' + habitualUsers + '/' + totalBandUsers + ' = ' + scorecard.combined_habitual_pct + '%');
  }

  // Agent MoM retention from per_tier_retention_cohorts
  const ptrc = data._supplementary_metrics && data._supplementary_metrics.per_tier_retention_cohorts;
  if (!scorecard.agent_mom_retention && ptrc && ptrc.length > 0) {
    scorecard.agent_mom_retention = ptrc[0].agent_retention_pct;
    console.log('  Agent MoM retention (from cohorts): ' + scorecard.agent_mom_retention + '%');
  }

  // Multi-turn estimate from intensity
  if (!scorecard.multi_turn_pct && data.m365_intensity > 2) {
    scorecard.multi_turn_pct = Math.min(Math.round((1 - 1 / data.m365_intensity) * 100), 95);
    console.log('  Multi-turn estimate (from intensity): ' + scorecard.multi_turn_pct + '%');
  }

  // Agents with 5+ users from agent_table
  if (!scorecard.pct_agents_5plus_users && Array.isArray(data.agent_table) && data.total_agents > 0) {
    const agents5plus = data.agent_table.filter(a => a.users >= 5).length;
    scorecard.pct_agents_5plus_users = Math.round(agents5plus / data.total_agents * 1000) / 10;
    console.log('  Agents with 5+ users: ' + agents5plus + '/' + data.total_agents + ' = ' + scorecard.pct_agents_5plus_users + '%');
  }

  // Growth trend from monthly data
  const monthly = data._supplementary_metrics && data._supplementary_metrics.monthly_data;
  if (!scorecard.growth_pct && monthly) {
    const months = Object.keys(monthly);
    if (months.length >= 2) {
      const first = monthly[months[0]].users;
      const last = monthly[months[months.length - 1]].users;
      scorecard.growth_pct = Math.round((last - first) / first * 100);
      scorecard.growth_months = months.length;
      console.log('  Growth: ' + first + ' -> ' + last + ' = ' + scorecard.growth_pct + '% over ' + months.length + ' months');
    }
  }

  // Agent growth metrics from per_tier_monthly_users
  computeAgentGrowthFallback(data, scorecard);

  return scorecard;
}

// Compute agent growth from per_tier_monthly_users when PBIX measures aren't available
function computeAgentGrowthFallback(data, scorecard) {
  const ptm = data._supplementary_metrics && data._supplementary_metrics.per_tier_monthly_users;
  if (!ptm || ptm.length < 2) return;

  // Find last two complete months (skip partial final month)
  let pi = ptm.length - 2, ci = ptm.length - 1;
  const currTotal = ptm[ci].licensed + ptm[ci].unlicensed;
  const prevTotal = ptm[pi].licensed + ptm[pi].unlicensed;
  if (currTotal < prevTotal * 0.5 && ci > 1) { ci = pi; pi = pi - 1; }

  if (!scorecard.agent_user_growth_pct && ptm[pi].agents > 0) {
    scorecard.agent_user_growth_pct = Math.round((ptm[ci].agents - ptm[pi].agents) / ptm[pi].agents * 1000) / 10;
    scorecard.agent_growth_period = ptm[pi].month + ' \u2013 ' + ptm[ci].month;
    console.log('  Agent user growth (fallback): ' + ptm[pi].agents + ' -> ' + ptm[ci].agents + ' = +' + scorecard.agent_user_growth_pct + '% (' + scorecard.agent_growth_period + ')');
  }

  if (!scorecard.agent_sessions_mom_pct) {
    const monthly = data._supplementary_metrics && data._supplementary_metrics.monthly_data;
    if (monthly) {
      const months = Object.keys(monthly);
      let mpi = months.length - 2, mci = months.length - 1;
      if (monthly[months[mci]].users < monthly[months[mpi]].users * 0.5 && mci > 1) { mci = mpi; mpi = mpi - 1; }
      if (mpi >= 0 && monthly[months[mpi]].prompts > 0) {
        scorecard.agent_sessions_mom_pct = Math.round((monthly[months[mci]].prompts - monthly[months[mpi]].prompts) / monthly[months[mpi]].prompts * 1000) / 10;
        console.log('  Session growth (fallback): +' + scorecard.agent_sessions_mom_pct + '%');
      }
    }
  }
}

async function main() {
  console.log('\n=== Scorecard Metric Computation ===\n');
  console.log('Data file: ' + dataFile);

  const EXE = findMcpExe();
  const hasPbix = EXE && port;

  if (!hasPbix) {
    // Data-only mode: compute what we can without PBIX
    const scorecard = computeDerivedOnly(data);
    if (!data._scorecard_metrics) data._scorecard_metrics = {};
    Object.assign(data._scorecard_metrics, scorecard);
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    console.log('\nSaved derived scorecard metrics to ' + dataFile);
    process.exit(0);
  }

  // Connect
  proc = spawn(EXE, ['--start', '--readonly', '--skipconfirmation'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => { try { const m = JSON.parse(line); if (m.id) responses[m.id] = m; } catch (e) { } });
  proc.stderr.on('data', () => { });

  await new Promise(r => setTimeout(r, 2000));
  send(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'scorecard-compute', version: '1.0' }
  });
  await waitFor(1);
  notify('notifications/initialized');
  await new Promise(r => setTimeout(r, 500));
  await callTool('connection_operations', { operation: 'Connect', dataSource: 'localhost:' + port });
  console.log('Connected to PBIX on port ' + port + '\n');

  const scorecard = {};

  // ── Query 1: Total Employees ──
  console.log('Query 1: Total Employees...');
  try {
    const r = await runDax(DAX_TOTAL_EMPLOYEES);
    const totalEmployees = getScalar(r);
    console.log('  Total employees: ' + totalEmployees);
    scorecard.total_employees = totalEmployees;

    // Compute %Free Chat active
    const unlicensedEmployees = totalEmployees - data.licensed_users;
    const freeChatActivePct = Math.round(data.chat_users / unlicensedEmployees * 1000) / 10;
    console.log('  Unlicensed employees: ' + unlicensedEmployees);
    console.log('  %Free Chat active: ' + freeChatActivePct + '%');
    scorecard.free_chat_active_pct = freeChatActivePct;
  } catch (e) {
    console.log('  ERROR: ' + e.message.substring(0, 120));
    // Fallback: try COUNTROWS
    try {
      console.log('  Trying fallback: COUNTROWS...');
      const r2 = await runDax("EVALUATE ROW(\"v\", COUNTROWS('Chat + Agent Org Data'))");
      const totalEmployees = getScalar(r2);
      console.log('  Total employees (countrows): ' + totalEmployees);
      scorecard.total_employees = totalEmployees;
      const unlicensedEmployees = totalEmployees - data.licensed_users;
      scorecard.free_chat_active_pct = Math.round(data.chat_users / unlicensedEmployees * 1000) / 10;
      console.log('  %Free Chat active: ' + scorecard.free_chat_active_pct + '%');
    } catch (e2) {
      console.log('  FALLBACK ERROR: ' + e2.message.substring(0, 120));
    }
  }

  // ── Query 2: Per-agent return rate ──
  console.log('\nQuery 2: Per-agent return rate...');
  try {
    const r = await runDax(DAX_PER_AGENT_RETURN_RATE);
    const rows = (r._rows || []).filter(row => {
      const name = row.AgentName || '';
      return name.trim() !== '' && name !== 'Total';
    });
    console.log('  Agents found: ' + rows.length);

    let agentsAbove50 = 0;
    let agentsAbove5Users = 0;
    const agentDetails = [];

    for (const row of rows) {
      const total = Number(row.TotalUsers) || 0;
      const repeat = Number(row.RepeatUsers) || 0;
      const returnRate = total > 0 ? Math.round(repeat / total * 100) : 0;
      agentDetails.push({
        name: row.AgentName,
        totalUsers: total,
        repeatUsers: repeat,
        returnRate: returnRate
      });
      if (returnRate > 50) agentsAbove50++;
      if (total > 5) agentsAbove5Users++;
      console.log('  ' + (row.AgentName || '').padEnd(30) + ' users=' + total + ', repeat=' + repeat + ', return=' + returnRate + '%');
    }

    const totalAgents = rows.length;
    const pctAgentsReturn50 = Math.round(agentsAbove50 / totalAgents * 1000) / 10;
    const pctAgents5Users = Math.round(agentsAbove5Users / totalAgents * 1000) / 10;

    console.log('\n  Agents with return rate >50%: ' + agentsAbove50 + '/' + totalAgents + ' = ' + pctAgentsReturn50 + '%');
    console.log('  Agents with >5 users: ' + agentsAbove5Users + '/' + totalAgents + ' = ' + pctAgents5Users + '%');

    scorecard.pct_agents_return_50 = pctAgentsReturn50;
    scorecard.pct_agents_5plus_users = pctAgents5Users;
    scorecard.agent_return_details = agentDetails;
  } catch (e) {
    console.log('  ERROR: ' + e.message.substring(0, 200));
  }

  // ── Query 3: Users using 3+ agents ──
  console.log('\nQuery 3: Users using 3+ agents...');
  try {
    const r = await runDax(DAX_USERS_3PLUS_AGENTS);
    const users3Plus = getScalar(r);
    const pct = Math.round(users3Plus / data.total_active_users * 1000) / 10;
    console.log('  Users with 3+ agents: ' + users3Plus + ' / ' + data.total_active_users + ' = ' + pct + '%');
    scorecard.users_3plus_agents = users3Plus;
    scorecard.pct_users_3plus_agents = pct;
  } catch (e) {
    console.log('  ERROR: ' + e.message.substring(0, 200));
  }

  // ── Query 4: Agent MoM retention (Apr->May) ──
  console.log('\nQuery 4: Agent MoM retention (Apr->May)...');
  try {
    const r = await runDax(DAX_AGENT_MOM_RETENTION);
    const row = r._rows && r._rows[0];
    if (row) {
      const aprTotal = Number(row.AprTotal) || 0;
      const mayTotal = Number(row.MayTotal) || 0;
      const retained = Number(row.Retained) || 0;
      const retentionPct = aprTotal > 0 ? Math.round(retained / aprTotal * 1000) / 10 : 0;
      console.log('  Apr agent users: ' + aprTotal);
      console.log('  May agent users: ' + mayTotal);
      console.log('  Retained: ' + retained);
      console.log('  Agent MoM retention: ' + retentionPct + '%');
      scorecard.agent_mom_retention = retentionPct;
      scorecard.agent_mom_retained = retained;
      scorecard.agent_mom_prev = aprTotal;
    }
  } catch (e) {
    console.log('  ERROR: ' + e.message.substring(0, 200));
    console.log('  Using per_tier_retention_cohorts fallback...');
    const ptrc = data._supplementary_metrics && data._supplementary_metrics.per_tier_retention_cohorts;
    if (ptrc && ptrc.length > 0) {
      scorecard.agent_mom_retention = ptrc[0].agent_retention_pct;
      console.log('  Fallback agent retention: ' + scorecard.agent_mom_retention + '%');
    }
  }

  // ── Derived: Combined Copilot Reach ──
  console.log('\nDerived: Combined Copilot Reach...');
  const totalEmployees = scorecard.total_employees || data._scorecard_metrics && data._scorecard_metrics.total_employees;
  if (totalEmployees && data.total_active_users) {
    scorecard.combined_reach_pct = Math.round(data.total_active_users / totalEmployees * 1000) / 10;
    console.log('  ' + data.total_active_users + ' / ' + totalEmployees + ' = ' + scorecard.combined_reach_pct + '%');
  }

  // ── Derived: Combined Habitual Rate (11+ active days) ──
  console.log('\nDerived: Combined Habitual Rate...');
  const b11 = typeof data.band_11_15 === 'number' ? data.band_11_15 : 0;
  const b16 = typeof data.band_16_plus === 'number' ? data.band_16_plus : 0;
  const b1 = typeof data.band_1_5 === 'number' ? data.band_1_5 : 0;
  const b6 = typeof data.band_6_10 === 'number' ? data.band_6_10 : 0;
  const totalBandUsers = b1 + b6 + b11 + b16;
  const habitualUsers = b11 + b16;
  if (totalBandUsers > 0) {
    scorecard.combined_habitual_pct = Math.round(habitualUsers / totalBandUsers * 1000) / 10;
    scorecard.habitual_users = habitualUsers;
    scorecard.total_band_users = totalBandUsers;
    console.log('  Habitual (11+ days): ' + habitualUsers + ' / ' + totalBandUsers + ' = ' + scorecard.combined_habitual_pct + '%');
  }

  // ── Derived: Growth trend ──
  console.log('\nDerived: Growth trend...');
  const monthly = data._supplementary_metrics && data._supplementary_metrics.monthly_data;
  if (monthly) {
    const months = Object.keys(monthly);
    if (months.length >= 2) {
      const first = monthly[months[0]].users;
      const last = monthly[months[months.length - 1]].users;
      const growthPct = Math.round((last - first) / first * 100);
      scorecard.growth_pct = growthPct;
      scorecard.growth_months = months.length;
      console.log('  ' + first + ' -> ' + last + ' over ' + months.length + ' months = +' + growthPct + '%');
    }
  }

  // ── Query 5: Multi-turn conversation % ──
  // Definition: % of ThreadIds where Message_IsPrompt=TRUE and DISTINCTCOUNT(Audit_MessageId) >= 5
  console.log('\nQuery 5: Multi-turn conversations...');
  try {
    const r = await runDax(`
EVALUATE
VAR Sessions =
  ADDCOLUMNS(
    VALUES('Chat + Agent Interactions (Audit Logs)'[ThreadId]),
    "PromptMsgs", CALCULATE(
      DISTINCTCOUNT('Chat + Agent Interactions (Audit Logs)'[Message_Id]),
      'Chat + Agent Interactions (Audit Logs)'[Message_IsPrompt] = "True"
    )
  )
RETURN ROW(
  "TotalSessions", COUNTROWS(Sessions),
  "MultiTurn", COUNTROWS(FILTER(Sessions, [PromptMsgs] >= 5))
)
`);
    const row = r._rows && r._rows[0];
    if (row) {
      const total = Number(row.TotalSessions) || 0;
      const multi = Number(row.MultiTurn) || 0;
      const pct = total > 0 ? Math.round(multi / total * 1000) / 10 : 0;
      scorecard.multi_turn_pct = pct;
      scorecard.multi_turn_total = total;
      scorecard.multi_turn_count = multi;
      console.log('  Multi-turn sessions (5+ prompts): ' + multi + ' / ' + total + ' = ' + pct + '%');
    }
  } catch (e) {
    console.log('  Multi-turn query error: ' + e.message.substring(0, 200));
    // Fallback from intensity
    if (data.m365_intensity > 2) {
      scorecard.multi_turn_pct = Math.min(Math.round((1 - 1/data.m365_intensity) * 100), 95);
      console.log('  Fallback estimate from intensity: ' + scorecard.multi_turn_pct + '%');
    }
  }

  // ── Derived: pct_1_5_agents (complement of pct_users_3plus_agents) ──
  if (scorecard.pct_users_3plus_agents != null) {
    scorecard.pct_1_5_agents = Math.round((100 - scorecard.pct_users_3plus_agents) * 10) / 10;
    console.log('\nDerived: Users with 1-5 agents: ' + scorecard.pct_1_5_agents + '%');
  }

  // ── Query 6: Agent user growth & session growth from PBIX measures ──
  console.log('\nQuery 6: Agent growth metrics...');
  try {
    const r = await runDax("EVALUATE ROW(\"v\", [Agent Sessions MoM %])");
    const val = getScalar(r);
    if (val !== null) {
      // PBIX returns fraction (e.g. 0.094 for 9.4%) — convert to percentage
      const pct = Math.abs(val) < 1 ? Math.round(val * 1000) / 10 : Math.round(val * 10) / 10;
      scorecard.agent_sessions_mom_pct = pct;
      console.log('  Agent Sessions MoM %: ' + scorecard.agent_sessions_mom_pct + '%');
    }
  } catch (e) {
    console.log('  Agent Sessions MoM % error: ' + e.message.substring(0, 100));
  }

  try {
    const r = await runDax("EVALUATE ROW(\"Current\", [UsersInteractingWithAgents], \"Prev\", [UsersInteractingWithAgents, Last Month])");
    const row = r._rows && r._rows[0];
    if (row) {
      const curr = Number(row.Current) || 0;
      const prev = Number(row.Prev) || 0;
      if (prev > 0) {
        scorecard.agent_user_growth_pct = Math.round((curr - prev) / prev * 1000) / 10;
        scorecard.agent_growth_period = 'last two months';
        console.log('  Agent user growth: ' + prev + ' -> ' + curr + ' = +' + scorecard.agent_user_growth_pct + '%');
      }
    }
  } catch (e) {
    console.log('  Agent user growth error: ' + e.message.substring(0, 100));
  }

  // Fallback: compute from per_tier_monthly_users if PBIX queries failed
  computeAgentGrowthFallback(data, scorecard);

  // ── Save results ──
  console.log('\n=== Scorecard Metrics Summary ===');
  console.log(JSON.stringify(scorecard, null, 2));

  // Merge into data file
  if (!data._scorecard_metrics) data._scorecard_metrics = {};
  Object.assign(data._scorecard_metrics, scorecard);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  console.log('\nSaved to ' + dataFile + ' under _scorecard_metrics');

  // Cleanup
  if (proc) { try { proc.kill(); } catch (_) { } }
  process.exit(0);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  if (proc) { try { proc.kill(); } catch (_) { } }
  process.exit(1);
});
