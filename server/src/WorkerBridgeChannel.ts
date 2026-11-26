import { Logger } from './Logger';
import { WorkerBridgeProtocol as Protocol, type WorkerPrincipal, type WorkerRequest, type WorkerTool } from './WorkerBridgeProtocol';

type PendingPair = { organizationID: string; remoteGrant: string; digest: string; expiresAt: number };
type PairedDevice = { organizationID: string; remoteGrant: string; studioGrant: string };
type PairState = PendingPair | PairedDevice;

interface ChannelTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface ChannelStorage extends ChannelTransaction {
  transaction<T>(operation: (storage: ChannelTransaction) => Promise<T>): Promise<T>;
}

type WaitingStudio = { finish: (response: Response) => void; timer: ReturnType<typeof setTimeout> };
type ActiveCall = {
  request: WorkerRequest;
  finish: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
  dispatched: boolean;
};

/** One isolated OAuth grant's device binding and live, non-replayed request channel. */
export class WorkerBridgeChannel {
  private static readonly logger = Logger.forModule('worker.bridge');
  private catalog: WorkerTool[] = [];
  private lastSeen = 0;
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

  private async prepare(principal: WorkerPrincipal): Promise<Response> {
    const secret = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const digest = await Protocol.digest(secret);

    return this.state.storage.transaction(async (storage) => {
      const binding = await storage.get<PairState>('binding');
      if (WorkerBridgeChannel.paired(binding)) {
        return WorkerBridgeChannel.failure('A device is already paired. Revoke it before pairing another.', 409);
      }

      await storage.put<PairState>('binding', {
        organizationID: principal.organizationID, remoteGrant: principal.grant,
        digest, expiresAt: Date.now() + 300_000,
      });

      return WorkerBridgeChannel.response({ secret });
    });
  }

  private async pair(principal: WorkerPrincipal, secret: unknown): Promise<Response> {
    if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) {
      return WorkerBridgeChannel.failure('Invalid pairing code.', 403);
    }

    const digest = await Protocol.digest(secret);

    return this.state.storage.transaction(async (storage) => {
      const binding = await storage.get<PairState>('binding');

      if (!binding || WorkerBridgeChannel.paired(binding) || binding.expiresAt <= Date.now() ||
          binding.organizationID !== principal.organizationID || binding.digest !== digest) {
        return WorkerBridgeChannel.failure('Pairing is invalid, expired or belongs to another Organization.', 403);
      }

      await storage.put<PairState>('binding', {
        organizationID: binding.organizationID, remoteGrant: binding.remoteGrant, studioGrant: principal.grant,
      });

      return WorkerBridgeChannel.response({ paired: true });
    });
  }

  private online(): boolean {
    return Date.now() - this.lastSeen < 30_000;
  }

  private finishCall(response: Response): void {
    const active = this.active;

    if (!active) {
      return;
    }

    this.active = undefined;
    clearTimeout(active.timer);
    active.finish(response);
  }

  private dispatch(active: ActiveCall): Response {
    if (!this.catalog.some((tool) => tool.name === active.request.name)) {
      this.finishCall(WorkerBridgeChannel.failure('Worker capability changed before dispatch.', 503));

      return WorkerBridgeChannel.response({ request: null });
    }

    active.dispatched = true;
    clearTimeout(active.timer);
    active.timer = setTimeout(() => {
      this.lastSeen = 0;
      this.catalog = [];
      this.finishCall(WorkerBridgeChannel.failure(
        'Worker response timed out; execution outcome is unknown. Check existing jobs and reuse the original requestId.', 504,
      ));
    }, 45_000);

    return WorkerBridgeChannel.response({ request: active.request });
  }

  private poll(body: Record<string, unknown>): Promise<Response> | Response {
    if (this.waiting || this.active?.dispatched) {
      return WorkerBridgeChannel.failure('Another Studio exchange is active.', 409);
    }

    this.catalog = Protocol.catalog(body.tools);
    this.lastSeen = Date.now();

    if (this.active) {
      return this.dispatch(this.active);
    }

    return new Promise<Response>((finish) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        finish(WorkerBridgeChannel.response({ request: null }));
      }, 20_000);

      this.waiting = { finish, timer };
    });
  }

  private call(body: Record<string, unknown>): Promise<Response> | Response {
    if (!this.online() || this.active) {
      return WorkerBridgeChannel.failure('Studio is offline or busy. Check Worker status before retrying.', 503);
    }

    if (!Protocol.argumentsAllowed(body.name, body.arguments) ||
        !this.catalog.some((tool) => tool.name === body.name)) {
      return WorkerBridgeChannel.failure('This Worker tool is not currently authorized or available.', 403);
    }

    const request: WorkerRequest = {
      requestID: crypto.randomUUID(), name: body.name as string, arguments: body.arguments,
    };

    return new Promise<Response>((finish) => {
      // Allow the next Studio poll to arrive after a completed result.
      const timer = setTimeout(() => {
        this.lastSeen = 0;
        this.catalog = [];
        this.finishCall(WorkerBridgeChannel.failure('Studio did not reconnect; request was not dispatched.', 503));
      }, 5_000);
      const active = { request, finish, timer, dispatched: false };
      this.active = active;

      if (this.waiting) {
        const studio = this.waiting;
        this.waiting = undefined;
        clearTimeout(studio.timer);
        studio.finish(this.dispatch(active));
      }
    });
  }

  private result(body: Record<string, unknown>): Response {
    if (!this.active?.dispatched || this.active.request.requestID !== body.requestID) {
      return WorkerBridgeChannel.failure('The request is no longer active; inspect the original job before retrying.', 409);
    }

    if (!Protocol.validResult(body.result)) {
      return WorkerBridgeChannel.failure('Invalid Worker tool result.', 400);
    }

    this.lastSeen = Date.now();
    this.finishCall(WorkerBridgeChannel.response(body.result));

    return WorkerBridgeChannel.response({ accepted: true });
  }

  private async revoke(principal: WorkerPrincipal, studio: boolean): Promise<Response> {
    const revoked = await this.state.storage.transaction(async (storage) => {
      const binding = await storage.get<PairState>('binding');

      if (!binding) {
        return true;
      }

      if (studio ? !WorkerBridgeChannel.authorized(binding, principal, true) :
          binding.organizationID !== principal.organizationID || binding.remoteGrant !== principal.grant) {
        return false;
      }

      await storage.delete('binding');

      return true;
    });

    if (!revoked) {
      return WorkerBridgeChannel.failure('Worker device is not paired with this authorization.', 403);
    }

    if (this.waiting) {
      clearTimeout(this.waiting.timer);
      this.waiting.finish(WorkerBridgeChannel.failure('Device authorization revoked.', 403));
      this.waiting = undefined;
    }

    if (this.active) {
      const message = this.active.dispatched
        ? 'Device revoked; execution outcome is unknown.'
        : 'Device revoked before dispatch.';
      this.finishCall(WorkerBridgeChannel.failure(message, 409));
    }

    this.lastSeen = 0;
    this.catalog = [];

    return WorkerBridgeChannel.response({ revoked: true });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const body = await request.json() as Record<string, unknown>;
      const principal = body.principal as WorkerPrincipal;
      const operation = new URL(request.url).pathname;
      if (operation === '/prepare') {
        return await this.prepare(principal);
      }

      if (operation === '/pair') {
        return await this.pair(principal, body.secret);
      }

      const studio = ['/poll', '/result', '/studio-revoke'].includes(operation);

      if (operation === '/revoke' || operation === '/studio-revoke') {
        return await this.revoke(principal, studio);
      }

      const binding = await this.state.storage.get<PairState>('binding');
      const authorized = WorkerBridgeChannel.authorized(binding, principal, studio);

      if (operation === '/catalog' && !studio) {
        return WorkerBridgeChannel.response({
          paired: authorized, online: authorized && this.online(),
          tools: authorized && this.online() ? this.catalog : [],
        });
      }

      if (!authorized) {
        return WorkerBridgeChannel.failure('Worker device is not paired with this authorization.', 403);
      }

      switch (operation) {
        case '/poll': return this.poll(body);
        case '/call': return this.call(body);
        case '/result': return this.result(body);
        default: return WorkerBridgeChannel.failure('Unknown Worker channel operation.', 404);
      }
    } catch (error) {
      WorkerBridgeChannel.logger.exception('channel_failed', error);

      return WorkerBridgeChannel.failure('Worker channel operation failed.', 502);
    }
  }
}
