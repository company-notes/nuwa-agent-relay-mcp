import { APIError } from './APIClients';

type WorkMode = 'codex' | 'grok-build' | 'claude-code' | 'opencode';

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

    if ((mode !== 'codex' && mode !== 'grok-build' && mode !== 'claude-code' && mode !== 'opencode') ||
        (mode !== 'grok-build' && id !== null)) {
      throw new APIError(400, 'invalid_work_mode', 'Invalid native work connector configuration.');
    }

    return new WorkContext(mode, id);
  }

  static fromInboxHeaders(headers: Headers): WorkContext {
    const id = headers.get('x-nuwa-work-id');
    const connector = new Headers(headers);

    if (connector.get('x-nuwa-work-mode') !== 'grok-build') {
      connector.delete('x-nuwa-work-id');
    }

    const work = WorkContext.fromHeaders(connector);

    if (!work) {
      throw new APIError(400, 'native_work_required', 'Native work context is required.');
    }

    work.bind({ threadId: id, sessionId: id, 'ai.opencode/sessionID': id });

    return work;
  }

  bind(meta: unknown): void {
    const context = meta as { threadId?: unknown; sessionId?: unknown; 'ai.opencode/sessionID'?: unknown } | undefined;
    const id = this.mode === 'grok-build' ? this.headerID
      : this.mode === 'codex' ? context?.threadId
      : this.mode === 'opencode' ? context?.['ai.opencode/sessionID'] : context?.sessionId;

    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(id) ||
        (this.mode === 'opencode' && !/^ses_[a-zA-Z0-9_-]{1,124}$/.test(id)) ||
        (this.mode === 'claude-code' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) ||
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
    switch (this.mode) {
      case 'codex': return 'Codex';
      case 'claude-code': return 'Claude Code';
      case 'grok-build': return 'Grok Build';
      case 'opencode': return 'OpenCode';
    }
  }
}
