import { RemoteMCPScenario } from './BindingScenario';
import { WorkerBridgeChannel } from '../src/WorkerBridgeChannel';

/** Reuse the production Worker channel with isolated test OAuth and durable storage. */
export class WorkerChannelScenario {
  readonly base = new RemoteMCPScenario();
  private readonly channels = new Map<unknown, WorkerBridgeChannel>();

  constructor() {
    this.base.env.WORKER_BRIDGE = {
      idFromName: (name) => name,
      get: (id) => {
        let channel = this.channels.get(id);

        if (!channel) {
          const storage = new Map<string, unknown>();
          const transaction = {
            get: async <T>(key: string) => storage.get(key) as T | undefined,
            put: async <T>(key: string, value: T) => { storage.set(key, value); },
            delete: async (key: string) => storage.delete(key),
          };
          channel = new WorkerBridgeChannel({ storage: {
            ...transaction, transaction: (operation) => operation(transaction),
          } });
          this.channels.set(id, channel);
        }

        return channel;
      },
    };
    this.base.install();
  }

  close() {
    this.base.restore();
  }
}
