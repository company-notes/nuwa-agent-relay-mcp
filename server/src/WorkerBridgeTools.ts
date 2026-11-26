import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';

import { APIError } from './APIClients';
import { Logger } from './Logger';
import { MCPToolSet } from './ToolSet';
import { WorkerBridge } from './WorkerBridge';
import { WorkerPairingPage } from './WorkerPairingPage';
import { WorkerBridgeProtocol as Protocol, type WorkerTool } from './WorkerBridgeProtocol';

export class WorkerBridgeTools extends MCPToolSet {
  private static readonly bridgeLogger = Logger.forModule('worker.tools');

  constructor(server: McpServer, private readonly bridge: WorkerBridge) {
    super(server);
  }

  async install(request: Request): Promise<void> {
    this.register('worker_provider_pair', 'Create a five-minute one-time Studio pairing code and owner authorization URL. ' +
      'For a dedicated assistant and Windows test Worker, give the owner authorizationURL as a clickable link and ' +
      'show pairingCode separately in a copyable code block. The owner opens the link in their own browser, launches ' +
      'Studio from the page, enters the code and explicitly authorizes access. Do not open a browser, use Computer Use, ' +
      'run local commands, submit the form or pass the code in a URL or command. The owner may use Windows Start > ' +
      'Nuwa Studio > Connect Worker if the link cannot launch Studio. Studio starts its service after authorization. ' +
      'Verify worker_provider_status and refresh tool discovery before dispatch.', {},
      async () => ({
        ...await this.bridge.prepare(),
        authorizationURL: WorkerPairingPage.authorizationURL(request.url),
      }));
    this.register('worker_provider_status', 'Read the paired Studio and its current Worker tool availability. ' +
      'During installation or connection only check Worker pairing and availability. After a successful first new Job, ask once about notifications; do not set them up during onboarding. ' +
      'Follow the Session Router Skill: establish a real native webhook receiver after consent, then obtain the notification form with the private dispatch token.', {},
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
