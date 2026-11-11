import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { APIError } from './APIClients';
import { Logger } from './Logger';

type ToolArguments = Record<string, unknown>;
type ToolSchema = Record<string, z.ZodType>;

export abstract class MCPToolSet {
  private static readonly logger = Logger.forModule('mcp.tools');
  protected constructor(protected readonly server: McpServer) {}

  protected register(
    name: string,
    description: string,
    inputSchema: ToolSchema,
    action: (argumentsValue: ToolArguments) => Promise<unknown>,
  ): void {
    this.server.registerTool(name, { description, inputSchema }, async (parameters) => {
      try {
        const value = await action(parameters);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
        };
      } catch (error) {
        // APIError contains a known backend failure; never expose arbitrary
        // exception messages from fetch or unrelated runtime code to MCP tools.
        MCPToolSet.logger.exception('tool_execution_failed', error, { tool: name });

        const message = error instanceof APIError
          ? error.message
          : 'Unexpected backend service failure.';

        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    });
  }
}
