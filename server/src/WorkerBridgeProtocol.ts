import type { CallToolResult } from '@modelcontextprotocol/server';
import provider from '../../worker-provider.json';

export type WorkerPrincipal = { organizationID: string; grant: string };
export type WorkerTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type WorkerRequest = { requestID: string; name: string; arguments: Record<string, unknown> };

export class WorkerBridgeProtocol {
  static readonly allowed = new Set(provider.tools);
  static readonly maxSize = 1_048_576;

  static object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  static catalog(value: unknown): WorkerTool[] {
    if (!Array.isArray(value)) {
      throw new Error('Invalid Worker catalog.');
    }

    const names = new Set<string>();
    const tools: WorkerTool[] = [];

    for (const item of value) {
      if (!this.object(item) || typeof item.name !== 'string' || !this.allowed.has(item.name) ||
          names.has(item.name) || typeof item.description !== 'string' ||
          !this.object(item.inputSchema) || item.inputSchema.type !== 'object') {
        throw new Error('Invalid or unauthorized Worker tool.');
      }

      names.add(item.name);
      tools.push({ name: item.name, description: item.description, inputSchema: item.inputSchema });
    }

    return tools;
  }

  static argumentsAllowed(name: unknown, args: unknown): args is Record<string, unknown> {
    return typeof name === 'string' && this.allowed.has(name) && this.object(args) &&
      !Object.hasOwn(args, 'notificationRouteId');
  }

  static error(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
  }

  static validResult(value: unknown): value is CallToolResult {
    return this.object(value) && Array.isArray(value.content) &&
      (value.isError === undefined || typeof value.isError === 'boolean');
  }

  static async digest(value: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
