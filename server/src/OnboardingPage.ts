import { ONBOARDING_HTML } from './OnboardingContent';
import { ONBOARDING_SCRIPT } from './OnboardingInteractions';
import { ONBOARDING_CSS } from './OnboardingStyle';

/** Read-only onboarding, kept independent from OAuth and MCP runtime state. */
export class OnboardingPage {
  private static readonly security = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'content-security-policy': [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'none'",
      "img-src 'self'",
      "font-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  };

  static response(path: string, method: string): Response | null {
    if (method !== 'GET') {
      return null;
    }

    if (path === '/' || path === '/start') {
      return new Response(ONBOARDING_HTML, {
        headers: {
          ...this.security,
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    if (path === '/start.css') {
      return new Response(ONBOARDING_CSS, {
        headers: {
          ...this.security,
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    if (path === '/start.js') {
      return new Response(ONBOARDING_SCRIPT, {
        headers: {
          ...this.security,
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    return null;
  }
}
