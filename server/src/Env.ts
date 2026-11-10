export interface WorkerService {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface Env {
  ADDRESS_WORKER: WorkerService;
  RELAY_WORKER: WorkerService;
  RELAY_API_URL: string;
  ADDRESS_API_URL: string;
}
