import { APIError } from './APIClients';
import { SessionBindings } from './SessionBindings';

export class SessionBindingController {
  constructor(private readonly bindings: SessionBindings) {}

  private static response(data: unknown, status = 200): Response {
    return Response.json({ ok: true, data }, {
      status,
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  static error(error: unknown): Response {
    const expected = error instanceof APIError;
    const status = expected && error.status >= 400 && error.status < 500
      ? error.status : 502;
    const code = expected ? error.code : 'binding_unavailable';
    const message = expected ? error.message : 'Session binding service is unavailable.';

    return Response.json({ ok: false, error: { code, message } }, {
      status,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');

    if (origin && origin !== url.origin) {
      throw new APIError(403, 'cross_origin_denied',
        'Session binding requires the authenticated first-party origin.');
    }

    if (request.method === 'GET') {
      return SessionBindingController.response(await this.bindings.status());
    }

    if (request.method === 'DELETE') {
      return SessionBindingController.response(await this.bindings.revoke());
    }

    if (request.method !== 'POST') {
      throw new APIError(405, 'method_not_allowed', 'Unsupported Session binding operation.');
    }

    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      throw new APIError(415, 'json_required', 'Session binding requires a JSON request.');
    }

    if (Number(request.headers.get('content-length') ?? 0) > 2048) {
      throw new APIError(413, 'binding_too_large', 'Session binding request is too large.');
    }

    const raw = await request.text();

    if (raw.length > 2048) {
      throw new APIError(413, 'binding_too_large', 'Session binding request is too large.');
    }

    let data: unknown;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new APIError(400, 'invalid_json', 'Session binding requires valid JSON.');
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new APIError(400, 'invalid_binding_request', 'Session binding requires a JSON object.');
    }

    const body = data as Record<string, unknown>;

    if (typeof body.sessionID !== 'string' || typeof body.resumeToken !== 'string') {
      throw new APIError(400, 'invalid_binding_request',
        'Session ID and private Resume capability are required.');
    }

    return SessionBindingController.response(
      await this.bindings.resume(body.sessionID, body.resumeToken), 201,
    );
  }
}
