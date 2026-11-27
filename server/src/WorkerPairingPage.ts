/** Public, credential-free entrypoint for owner-initiated local authorization. */
export class WorkerPairingPage {
  static readonly path = '/worker-pairing';

  private static readonly html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nuwa Studio — Connect Worker</title></head>
<body><main>
<h1>Connect your assistant to this computer</h1>
<p>Open the installed Nuwa Studio on the Windows computer that will perform the work.</p>
<p><a href="nuwa-studio-worker:pair">Open Nuwa Studio</a></p>
<p>Allow your browser to open Nuwa Studio if prompted. Then enter the one-time pairing code supplied by your assistant and the native webhook URL and key together, and authorize Worker access and automatic notifications yourself. If the Worker is already paired, complete only the missing notification authorization.</p>
<p>If Studio does not open, use Windows Start &gt; Nuwa Studio &gt; Connect Worker, or install the current Studio setup. This page never requests a pairing code or credentials.</p>
<p>Use an OAuth connection dedicated to this assistant. A shared OAuth grant cannot identify individual assistants. Return to your assistant after authorization to verify the connection and notification receiver.</p>
</main></body></html>`;

  static authorizationURL(requestURL: string): string {
    return new URL(this.path, requestURL).href;
  }

  static response(): Response {
    return new Response(this.html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  }
}
