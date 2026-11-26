import { createServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import { WorkerChannelScenario } from './WorkerChannelScenario';

/** HTTPS boundary for the real Studio client; external OAuth/D1 use the shared test fixture. */
class WorkerChannelServer extends WorkerChannelScenario {
  private readonly server;
  private origin = '';

  constructor(key: string, cert: string) {
    super();
    this.server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        console.error('Worker channel test request failed', error);
        response.writeHead(500);
        response.end();
      });
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }

    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const result = await this.base.application.handle(new Request(new URL(request.url!, this.origin), {
      method: request.method,
      headers,
      ...(request.method === 'POST' ? { body: Buffer.concat(chunks).toString('utf8') } : {}),
    }));

    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(Buffer.from(await result.arrayBuffer()));
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.origin = 'https://127.0.0.1:' + (this.server.address() as AddressInfo).port;

    process.stdout.write(JSON.stringify({ origin: this.origin }) + '\n');
  }

  async stop() {
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));

    this.close();
  }
}

const scenario = new WorkerChannelServer(process.argv[2], process.argv[3]);

try {
  await scenario.start();

  for await (const chunk of process.stdin) {
    void chunk;
  }
} finally {
  await scenario.stop();
}
