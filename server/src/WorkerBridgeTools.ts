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

  private static readonly ownerHandoff = 'Never use Computer Use, your own browser, remote desktop, xdg-open or form submission for Worker authorization. ' +
    'The owner opens the clickable authorizationURL on their actual Windows Worker computer. ' +
    'On an explicit connection request, prepare your own stable assistant identity and native receiver before handing off. ' +
    'Rakazo: use schedule_list and schedule_create (webhook-only, on: { webhook: true }) to create or verify your own Routine even if the Worker is paired but offline. ' +
    'OpenMausBot and GrokBot likewise use their own native webhook receiver. A Bot identity requires type, platform, botId. Never use Agent Address manual mode for these Bots. ' +
    'In chat give the owner the clickable authorizationURL, complete actual assistantIdentity JSON, exact Webhook URL and the key header and location in the native management UI; never ask for the key in chat. ' +
    'If receiver creation is blocked, report the actual blocker instead of giving an incomplete handoff. ' +
    'Only clients without a Bot ID and without webhook capability use Agent Address manual mode.';

  async install(request: Request): Promise<void> {
    this.register('worker_provider_pair', WorkerBridgeTools.ownerHandoff + ' Only when the Worker is unpaired, create a five-minute code after preparing the receiver. ' +
      'Give pairingCode separately in chat, not in the URL. Verify Worker online and this assistant registered, and for Bots enabled, after owner authorization.', {},
      async () => ({
        ...await this.bridge.prepare(),
        authorizationURL: WorkerPairingPage.authorizationURL(request.url),
        authorizationInstructions: WorkerBridgeTools.ownerHandoff + ' Provide pairingCode separately to the owner.',
      }));
    this.register('worker_provider_status', WorkerBridgeTools.ownerHandoff +
      ' Read paired Studio and current Worker tools. During Skill installation check connectivity only. On explicit connection, check your own registration if online. ' +
      'If paired but offline, registration is unknown; prepare the receiver and give the owner the complete handoff without re-pairing. If already known registered, restore the service. ' +
      'If paired, do not request another pairing code.', {},
      async () => {
        const state = await this.bridge.catalog();
        const pairingGuidance = state.paired
          ? ' Worker already paired: do not request another pairing code.'
          : ' Worker unpaired: after preparing the receiver, call worker_provider_pair.';
        const onlineGuidance = state.online
          ? ' Check worker_notification_status({assistantIdentity}) before deciding whether owner authorization is needed.'
          : ' Worker offline: registration cannot be checked. Native receiver preparation is independent of Worker availability.';

        return { paired: state.paired, online: state.online, tools: state.tools.map((tool) => tool.name),
          authorizationURL: WorkerPairingPage.authorizationURL(request.url),
          authorizationInstructions: WorkerBridgeTools.ownerHandoff + pairingGuidance + onlineGuidance };
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
