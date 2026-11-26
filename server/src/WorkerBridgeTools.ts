import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';

import { APIError } from './APIClients';
import { Logger } from './Logger';
import { MCPToolSet } from './ToolSet';
import { WorkerBridge } from './WorkerBridge';
import { WorkerBridgeProtocol as Protocol, type WorkerTool } from './WorkerBridgeProtocol';

export class WorkerBridgeTools extends MCPToolSet {
  private static readonly bridgeLogger = Logger.forModule('worker.tools');

  constructor(server: McpServer, private readonly bridge: WorkerBridge) {
    super(server);
  }

  async install(request: Request): Promise<void> {
    this.register('worker_provider_pair', 'Create a five-minute one-time Studio pairing code. ' +
      'For a dedicated assistant and Windows test Worker, show the one-time code to the owner. ' +
      'Use authorized local computer access to open the installed nuwa-studio-worker.exe with argument pair only; ' +
      'the Windows Start menu also provides Nuwa Studio > Connect Worker. ' +
      'Use the installed location (default %LOCALAPPDATA%\\Programs\\nuwa-relay-mcp); never pass the code as an argument. ' +
      'Leave code entry and confirmation to the owner. Studio starts its service automatically after authorization. ' +
      'Verify worker_provider_status and refresh tool discovery before dispatch.', {},
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
      WorkerBridgeTools.bridgeLogger.exception('invalid_mcp_request', error);
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

    let tools: WorkerTool[];

    try {
      tools = (await this.bridge.catalog()).tools;
    } catch (error) {
      WorkerBridgeTools.bridgeLogger.exception('worker_catalog_unavailable', error);
      tools = [];
    }

    for (const tool of tools) {
      this.installTool(tool);
    }

    if (workerCall && !tools.some((tool) => tool.name === name)) {
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
        WorkerBridgeTools.bridgeLogger.exception('worker_call_failed', error, { tool: tool.name });

        return Protocol.error(error instanceof APIError ? error.message : 'Worker operation could not be confirmed.');
      }
    });
  }
}
