#!/usr/bin/env node
/**
 * PBI MCP Client — subprocess wrapper for Claude Code
 *
 * Usage:
 *   node pbi-mcp-client.js list-databases
 *   node pbi-mcp-client.js run-dax "EVALUATE ROW(\"test\", 1)"
 *   node pbi-mcp-client.js call <tool_name> <json_args>
 */

const { spawn } = require('child_process');
const readline = require('readline');

const EXE_PATH = String.raw`C:\Users\keithmcgrane\.vscode\extensions\analysis-services.powerbi-modeling-mcp-0.4.0-win32-x64\server\powerbi-modeling-mcp.exe`;

class PbiMcpClient {
  constructor() {
    this.proc = null;
    this.pendingCallbacks = new Map();
    this.nextId = 1;
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn(EXE_PATH, ['--start', '--readonly', '--skipconfirmation'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Read stdout line by line
      const rl = readline.createInterface({ input: this.proc.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pendingCallbacks.has(msg.id)) {
            this.pendingCallbacks.get(msg.id)(msg);
            this.pendingCallbacks.delete(msg.id);
          }
        } catch (e) {
          // ignore non-JSON lines
        }
      });

      this.proc.stderr.on('data', () => {}); // suppress

      // Initialize
      setTimeout(async () => {
        try {
          await this.send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'claude-code-pbi', version: '1.0' }
          });
          this.sendNotification('notifications/initialized');
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 2000);
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.pendingCallbacks.set(id, (response) => {
        if (response.error) reject(new Error(JSON.stringify(response.error)));
        else resolve(response.result);
      });
      this.proc.stdin.write(msg + '\n');
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  }

  sendNotification(method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.proc.stdin.write(msg + '\n');
  }

  async callTool(name, args) {
    return this.send('tools/call', { name, arguments: args });
  }

  async listDatabases() {
    return this.callTool('database_operations', { operation: 'List' });
  }

  async runDax(dax, databaseName) {
    const args = { operation: 'RunDax', dax };
    if (databaseName) args.databaseName = databaseName;
    return this.callTool('database_operations', { operation: 'RunDax', dax, ...(databaseName ? { databaseName } : {}) });
  }

  stop() {
    if (this.proc) this.proc.kill();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const client = new PbiMcpClient();
  await client.start();

  try {
    if (command === 'list-databases') {
      const result = await client.listDatabases();
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'run-dax') {
      const dax = args[1];
      const db = args[2];
      if (!dax) { console.error('Usage: run-dax "<DAX query>" [database]'); process.exit(1); }
      const result = await client.runDax(dax, db);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'call') {
      const toolName = args[1];
      const toolArgs = JSON.parse(args[2] || '{}');
      const result = await client.callTool(toolName, toolArgs);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Commands: list-databases, run-dax "<DAX>", call <tool> <json>');
    }
  } finally {
    client.stop();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
