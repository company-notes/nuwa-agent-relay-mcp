/** Public MCP resource path and its exact protected-resource metadata path. */
export class MCPResource {
  static readonly root = '/mcp';
  static readonly metadataPrefix = '/.well-known/oauth-protected-resource';
  private static readonly addressPath = /^\/mcp\/[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9_-]{0,63}$/;

  static path(value: string): string | undefined {
    return value === this.root || this.addressPath.test(value) ? value : undefined;
  }

  static metadataPath(value: string): string | undefined {
    return value.startsWith(this.metadataPrefix) ? this.path(value.slice(this.metadataPrefix.length)) : undefined;
  }
}
