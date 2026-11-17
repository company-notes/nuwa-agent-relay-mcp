export interface BackgroundTasks {
  waitUntil(promise: Promise<unknown>): void;
}

export interface WorkerService {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface BindingStatement {
  bind(...values: string[]): BindingStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface BindingDatabase {
  prepare(sql: string): BindingStatement;
}

export interface Env {
  ADDRESS_WORKER: WorkerService;
  RELAY_WORKER: WorkerService;
  RELAY_API_URL: string;
  ADDRESS_API_URL: string;
  BINDINGS_DB: BindingDatabase;
  SESSION_BINDING_KEY: string;
}
