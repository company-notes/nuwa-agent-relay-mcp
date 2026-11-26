import type { CallToolResult } from '@modelcontextprotocol/server';
import { AddressAPIClient, APIError } from './APIClients';
import type { WorkerBridgeNamespace } from './Env';
import { WorkerBridgeProtocol as Protocol, type WorkerPrincipal, type WorkerTool } from './WorkerBridgeProtocol';

type WorkerCatalog = { paired: boolean; online: boolean; tools: WorkerTool[] };

/** Authenticated routing between Remote MCP and an explicitly paired Studio. */
export class WorkerBridge {
  private principal?: Promise<WorkerPrincipal>;

  constructor(private readonly channels: WorkerBridgeNamespace, private readonly address: AddressAPIClient) {}

  static handles(path: string): boolean {
    return ['/worker-bridge/pair', '/worker-bridge/poll', '/worker-bridge/result',
      '/worker-bridge/revoke'].includes(path);
  }

  private async identity(): Promise<WorkerPrincipal> {
    this.principal ??= this.address.workerPrincipal();

    return this.principal;
  }

  private static route(principal: WorkerPrincipal): Promise<string> {
    return Protocol.digest(JSON.stringify(['worker-bridge', principal.organizationID, principal.grant]));
  }

  private async exchange(route: string, operation: string, body: Record<string, unknown>): Promise<Response> {
    const principal = await this.identity();
    const channel = this.channels.get(this.channels.idFromName(route));

    return channel.fetch(new Request('https://worker-channel.internal/' + operation, {
      method: 'POST', body: JSON.stringify({ ...body, principal }),
    }));
  }

  private async remote(operation: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const response = await this.exchange(await WorkerBridge.route(await this.identity()), operation, body);
    const value = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      throw new APIError(response.status, 'worker_bridge_failed', String(value.error));
    }

    return value;
  }

  async prepare(): Promise<{ pairingCode: string; expiresInSeconds: number }> {
    const route = await WorkerBridge.route(await this.identity());
    const value = await this.remote('prepare');

    return { pairingCode: route + '.' + String(value.secret), expiresInSeconds: 300 };
  }

  async catalog(): Promise<WorkerCatalog> {
    const data = await this.remote('catalog');

    return { paired: data.paired === true, online: data.online === true, tools: Protocol.catalog(data.tools) };
  }

  async revoke(): Promise<unknown> {
    return this.remote('revoke');
  }

  async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (!Protocol.argumentsAllowed(name, args)) {
      throw new APIError(403, 'worker_scope_denied', 'Tool or arguments are outside the approved Worker scope.');
    }

    const result = await this.remote('call', { name, arguments: args });

    if (!Protocol.validResult(result)) {
      throw new APIError(502, 'worker_result_invalid', 'Worker returned an invalid tool response.');
    }

    return result;
  }

  async handleStudio(request: Request): Promise<Response> {
    if (request.method !== 'POST' || request.headers.has('origin')) {
      throw new APIError(403, 'worker_studio_request_denied', 'Studio requires a private authenticated POST.');
    }

    const raw = await request.text();

    if (raw.length > Protocol.maxSize) {
      throw new APIError(413, 'worker_request_too_large', 'Worker exchange exceeds the supported size.');
    }

    const body: unknown = JSON.parse(raw);
    if (!Protocol.object(body) || typeof body.route !== 'string' || !/^[a-f0-9]{64}$/.test(body.route)) {
      throw new APIError(400, 'worker_route_invalid', 'Invalid Studio pairing route.');
    }

    const operation = new URL(request.url).pathname.split('/').at(-1)!;

    return this.exchange(body.route, operation === 'revoke' ? 'studio-revoke' : operation, body);
  }
}
