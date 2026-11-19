import { APIError } from './APIClients';

type WorkMode = 'codex' | 'grok-build';

// Native work identity is transport context under an authenticated OAuth grant.
export class WorkContext {
  private nativeID?: string;

  private constructor(
    readonly mode: WorkMode, private readonly headerID: string | null,
  ) {}

  static fromHeaders(headers: Headers): WorkContext | undefined {
    const mode = headers.get('x-nuwa-work-mode');
    const id = headers.get('x-nuwa-work-id');

    if (mode === null && id === null) {
      return undefined;
    }

    if ((mode !== 'codex' && mode !== 'grok-build') ||
        (mode === 'codex' && id !== null)) {
      throw new APIError(400, 'invalid_work_mode', 'Invalid native work connector configuration.');
    }

    return new WorkContext(mode, id);
  }

  bind(meta: unknown): void {
    const id = this.mode === 'codex'
      ? (meta as { threadId?: unknown } | undefined)?.threadId
      : this.headerID;

    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(id) ||
        (this.nativeID !== undefined && this.nativeID !== id)) {
      throw new APIError(400, 'native_work_required',
        'This connector requires a stable native work Session ID.');
    }

    this.nativeID = id;
  }

  async key(grant: string): Promise<string> {
    if (!this.nativeID) {
      throw new APIError(400, 'native_work_required', 'Native work context is unavailable.');
    }

    const bytes = new TextEncoder().encode(JSON.stringify(['nuwa-work-v1', grant, this.mode, this.nativeID]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  get agentDisplayName(): string {
    return this.mode === 'codex' ? 'Codex' : 'Grok Build';
  }
}
