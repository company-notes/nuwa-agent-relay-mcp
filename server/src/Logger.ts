/** Prevent request credentials and callback paths from reaching operational logs. */
export class Logger {
  private constructor(private readonly moduleName: string) {}

  static forModule(moduleName: string): Logger {
    return new Logger(moduleName);
  }

  error(event: string, details: Record<string, string | number | boolean>): void {
    console.error(this.moduleName + '.' + event, details);
  }

  exception(
    event: string, error: unknown,
    details: Record<string, string | number | boolean> = {},
  ): void {
    this.error(event, {
      ...details,
      // Errors from networking and MCP arguments may contain private URLs or tokens.
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}
