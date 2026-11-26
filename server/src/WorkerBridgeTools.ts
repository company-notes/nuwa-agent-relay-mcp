import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';

import { APIError } from './APIClients';
import { Logger } from './Logger';
import { MCPToolSet } from './ToolSet';
import { WorkerBridge } from './WorkerBridge';
import { WorkerBridgeProtocol as Protocol, type WorkerTool } from './WorkerBridgeProtocol';

export class WorkerBridgeTools extends MCPToolSet {
  private static readonly logger = Logger.forModule('worker.tools');

  constructor(server: McpServer, private readonly bridge: WorkerBridge) {
    super(server);
  }

  async install(request: Request): Promise<void> {
    this.register('worker_provider_pair', 'Create a five-minute one-time Studio pairing code. ' +
      'Only the device owner may enter this code locally to authorize the selected OAuth connection. ' +
      'For the pilot dedicate this MCP connection and Windows Worker to one assistant.', {},
      () => this.bridge.prepare());
    this.register('worker_provider_status', 'Read the paired Studio and its current Worker tool availability.', {},
      async () => {
        const state = await this.bridge.catalog();

        return { paired: state.paired, online: state.online, tools: state.tools.map((tool) => tool.name) };
      });
    this.register('worker_provider_revoke', 'Revoke this OAuth connection\'s paired Studio. Requires owner approval.', {},
      () => this.bridge.revoke());

    if (request.method !== 'POST') {
      return;
    }

    let message: unknown;

    try {
      message = await request.json();
    } catch (error) {
      WorkerBridgeTools.logger.exception('invalid_mcp_request', error);
      return; // The MCP transport owns malformed request handling.
    }

    if (!Protocol.object(message)) {
      return;
    }

    const name = Protocol.object(message.params) ? message.params.name : undefined;
    const workerCall = message.method === 'tools/call' && typeof name === 'string' && Protocol.allowed.has(name);

    if (message.method !== 'tools/list' && !workerCall) {
      return;
    }

    const catalog = await this.bridge.catalog();

    for (const tool of catalog.tools) {
      this.installTool(tool);
    }

    if (workerCall && !catalog.tools.some((tool) => tool.name === name)) {
      this.installTool({
        name: name as string, description: 'Paired Worker tool currently unavailable.',
        inputSchema: { type: 'object', additionalProperties: true },
      });
    }
  }

  private installTool(tool: WorkerTool): void {
    this.server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
    }, async (args) => {
      try {
        return await this.bridge.call(tool.name, args);
      } catch (error) {
        WorkerBridgeTools.logger.exception('worker_call_failed', error, { tool: tool.name });

        return Protocol.error(error instanceof APIError ? error.message : 'Worker operation could not be confirmed.');
      }
    });
  }
}
