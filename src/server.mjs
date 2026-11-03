import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { RelayClient } from './relay-client.mjs';
import { registerRelayTools } from './tools.mjs';

export function createMcpServer(client = new RelayClient()) {
  const server = new McpServer({
    name: 'nuwa-agent-relay-mcp',
    version: '0.1.0',
  });

  registerRelayTools(server, client);
  return server;
}

// stdout belongs exclusively to MCP JSON-RPC; all status goes to stderr.
if (process.argv[1] && import.meta.url === new URL('file://' +
    process.argv[1].replace(/\\/g, '/')).href) {
  void serveStdio(() => createMcpServer()).catch((error) => {
    process.stderr.write('Nuwa MCP server failed to start: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
