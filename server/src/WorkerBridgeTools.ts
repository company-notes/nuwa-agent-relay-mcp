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
      'Only when the Worker is not paired: first obtain your own stable Bot ID or canonical Agent Address and create and verify your native webhook receiver if supported. ' +
      'Give the owner authorizationURL as a clickable link, pairingCode and your actual assistantIdentity JSON separately for copying. ' +
      'The owner enters them and the webhook URL/key on the local Studio page and confirms authorization. Agent Address clients without a webhook leave both webhook fields empty. ' +
      'Do not use Computer Use, open a browser, submit the form, or request a key in chat. After authorization, verify worker_provider_status and worker_notification_status({assistantIdentity}). ' +
      'Shared OAuth connections are supported; every dispatch and continuation must supply your own assistantIdentity.', {},
      async () => ({
        ...await this.bridge.prepare(),
        authorizationURL: WorkerPairingPage.authorizationURL(request.url),
      }));
    this.register('worker_provider_status', 'Read the paired Studio and its current Worker tool availability. ' +
      'During Skill installation check connectivity only. On explicit connection, use worker_notification_status with your own assistantIdentity. ' +
      'If the Worker is already paired but this assistant is not registered, create its receiver if supported and give the owner authorizationURL and assistantIdentity JSON. ' +
      'The owner registers this assistant on the same local page, without another Worker code. Never reuse another assistant identity.', {},
      async () => {
        const state = await this.bridge.catalog();

        return { paired: state.paired, online: state.online, tools: state.tools.map((tool) => tool.name),
          authorizationURL: WorkerPairingPage.authorizationURL(request.url) };
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
