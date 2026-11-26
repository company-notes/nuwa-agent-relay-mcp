import { Logger } from './Logger';
import { WorkerBridgeProtocol as Protocol, type WorkerPrincipal, type WorkerRequest, type WorkerTool } from './WorkerBridgeProtocol';

type PendingPair = { organizationID: string; remoteGrant: string; digest: string; expiresAt: number };
type PairedDevice = { organizationID: string; remoteGrant: string; studioGrant: string };
type PairState = PendingPair | PairedDevice;

interface ChannelStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

type WaitingStudio = { finish: (response: Response) => void; timer: ReturnType<typeof setTimeout> };
type ActiveCall = { request: WorkerRequest; finish: (response: Response) => void; timer: ReturnType<typeof setTimeout> };

/** One isolated OAuth grant's device binding and live, non-replayed request channel. */
export class WorkerBridgeChannel {
  private static readonly logger = Logger.forModule('worker.bridge');
  private catalog: WorkerTool[] = [];
  private waiting?: WaitingStudio;
  private active?: ActiveCall;

  constructor(private readonly state: { storage: ChannelStorage }) {}

  private static response(data: unknown, status = 200): Response {
    return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  }

  private static failure(message: string, status: number): Response {
    return this.response({ error: message }, status);
  }

  private static paired(binding: PairState | undefined): binding is PairedDevice {
    return binding !== undefined && 'studioGrant' in binding;
  }

  private static authorized(binding: PairState | undefined, principal: WorkerPrincipal, studio: boolean): boolean {
    return this.paired(binding) && binding.organizationID === principal.organizationID &&
      (studio ? binding.studioGrant : binding.remoteGrant) === principal.grant;
  }

  private async prepare(binding: PairState | undefined, principal: WorkerPrincipal): Promise<Response> {
    if (WorkerBridgeChannel.paired(binding)) {
      return WorkerBridgeChannel.failure('A device is already paired. Revoke it before pairing another.', 409);
    }

    const secret = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await this.state.storage.put<PairState>('binding', {
      organizationID: principal.organizationID, remoteGrant: principal.grant,
      digest: await Protocol.digest(secret), expiresAt: Date.now() + 300_000,
    });

    return WorkerBridgeChannel.response({ secret });
  }

  private async pair(binding: PairState | undefined, principal: WorkerPrincipal, secret: unknown): Promise<Response> {
    if (!binding || WorkerBridgeChannel.paired(binding) || binding.expiresAt <= Date.now() ||
        binding.organizationID !== principal.organizationID || typeof secret !== 'string' ||
        binding.digest !== await Protocol.digest(secret)) {
      return WorkerBridgeChannel.failure('Pairing is invalid, expired or belongs to another Organization.', 403);
    }

    await this.state.storage.put<PairState>('binding', {
      organizationID: binding.organizationID, remoteGrant: binding.remoteGrant, studioGrant: principal.grant,
    });

    return WorkerBridgeChannel.response({ paired: true });
  }

  private poll(body: Record<string, unknown>): Promise<Response> | Response {
    if (this.waiting || this.active) {
      return WorkerBridgeChannel.failure('Another Studio exchange is active.', 409);
    }

    this.catalog = Protocol.catalog(body.tools);

    return new Promise<Response>((finish) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        this.catalog = [];
        finish(WorkerBridgeChannel.response({ request: null }));
      }, 20_000);

      this.waiting = { finish, timer };
    });
  }

  private call(body: Record<string, unknown>): Promise<Response> | Response {
    if (!this.waiting || this.active) {
      return WorkerBridgeChannel.failure('Studio is offline or busy. Check Worker status before retrying.', 503);
    }

    if (!Protocol.argumentsAllowed(body.name, body.arguments) ||
        !this.catalog.some((tool) => tool.name === body.name)) {
      return WorkerBridgeChannel.failure('This Worker tool is not currently authorized or available.', 403);
    }

    const request: WorkerRequest = {
      requestID: crypto.randomUUID(), name: body.name as string, arguments: body.arguments,
    };
    const studio = this.waiting;
    this.waiting = undefined;
    clearTimeout(studio.timer);

    return new Promise<Response>((finish) => {
      const timer = setTimeout(() => {
        this.active = undefined;
        this.catalog = [];
        finish(WorkerBridgeChannel.failure(
          'Worker response timed out; execution outcome is unknown. Check existing jobs and reuse the original requestId.', 504,
        ));
      }, 45_000);

      this.active = { request, finish, timer };
      studio.finish(WorkerBridgeChannel.response({ request }));
    });
  }

  private result(body: Record<string, unknown>): Response {
    if (!this.active || this.active.request.requestID !== body.requestID) {
      return WorkerBridgeChannel.failure('The request is no longer active; inspect the original job before retrying.', 409);
    }

    if (!Protocol.validResult(body.result)) {
      return WorkerBridgeChannel.failure('Invalid Worker tool result.', 400);
    }

    const active = this.active;
    this.active = undefined;
    this.catalog = [];
    clearTimeout(active.timer);
    active.finish(WorkerBridgeChannel.response(body.result));

    return WorkerBridgeChannel.response({ accepted: true });
  }

  private async revoke(): Promise<Response> {
    await this.state.storage.delete('binding');

    if (this.waiting) {
      clearTimeout(this.waiting.timer);
      this.waiting.finish(WorkerBridgeChannel.failure('Device authorization revoked.', 403));
      this.waiting = undefined;
    }

    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.finish(WorkerBridgeChannel.failure('Device revoked; execution outcome is unknown.', 409));
      this.active = undefined;
    }

    this.catalog = [];

    return WorkerBridgeChannel.response({ revoked: true });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const body = await request.json() as Record<string, unknown>;
      const principal = body.principal as WorkerPrincipal;
      const operation = new URL(request.url).pathname;
      const binding = await this.state.storage.get<PairState>('binding');

      if (operation === '/prepare') {
        return this.prepare(binding, principal);
      }

      if (operation === '/pair') {
        return this.pair(binding, principal, body.secret);
      }

      const studio = ['/poll', '/result', '/studio-revoke'].includes(operation);
      const authorized = WorkerBridgeChannel.authorized(binding, principal, studio);

      if (operation === '/catalog' && !studio) {
        return WorkerBridgeChannel.response({
          paired: authorized, online: authorized && Boolean(this.waiting || this.active),
          tools: authorized ? this.catalog : [],
        });
      }

      if (!authorized) {
        return WorkerBridgeChannel.failure('Worker device is not paired with this authorization.', 403);
      }

      switch (operation) {
        case '/poll': return this.poll(body);
        case '/call': return this.call(body);
        case '/result': return this.result(body);
        case '/revoke':
        case '/studio-revoke': return this.revoke();
        default: return WorkerBridgeChannel.failure('Unknown Worker channel operation.', 404);
      }
    } catch (error) {
      WorkerBridgeChannel.logger.exception('channel_failed', error);

      return WorkerBridgeChannel.failure('Worker channel operation failed.', 502);
    }
  }
}
