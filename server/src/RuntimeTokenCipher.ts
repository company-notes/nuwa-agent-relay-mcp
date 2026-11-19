import { APIError } from './APIClients';

export class RuntimeTokenCipher {
  private key?: Promise<CryptoKey>;

  constructor(private readonly encodedKey: string) {}

  requireKey(): Promise<CryptoKey> {
    return this.key ??= this.importKey();
  }

  private rawKey(): Uint8Array<ArrayBuffer> {
    const encoded = this.encodedKey;

    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new APIError(503, 'binding_key_missing', 'Session encryption key is not configured.');
    }

    const raw = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));

    if (raw.length !== 32) {
      throw new APIError(503, 'binding_key_invalid', 'Session encryption key must be 256 bits.');
    }

    return raw;
  }

  private async importKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', this.rawKey(), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  // Domain-separated private credentials allow safe retry of an uncertain claim.
  async initialClaim(identityKey: string, organizationID: string) {
    const key = await crypto.subtle.importKey('raw', this.rawKey(), 'HKDF', false, ['deriveBits']);
    const encoder = new TextEncoder();
    const bits = await crypto.subtle.deriveBits({
      name: 'HKDF', hash: 'SHA-256',
      salt: encoder.encode('nuwa-private-session-claim-v1'),
      info: encoder.encode(JSON.stringify([organizationID, identityKey])),
    }, key, 640);
    const bytes = new Uint8Array(bits);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;

    const hex = (value: Uint8Array) =>
      Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const id = hex(bytes.slice(0, 16));

    return {
      sessionID: [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-'),
      resumeToken: 'resume_' + hex(bytes.slice(16, 48)),
      runtimeToken: 'runtime_' + hex(bytes.slice(48)),
    };
  }

  private static binaryEncode(value: Uint8Array): string {
    return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
  }

  private static binaryDecode(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  async encrypt(token: string, identityKey: string, sessionID: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: nonce,
      additionalData: new TextEncoder().encode(identityKey + ':' + sessionID),
    }, await this.requireKey(), new TextEncoder().encode(token));
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);

    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);

    return RuntimeTokenCipher.binaryEncode(combined);
  }

  async decrypt(value: string, identityKey: string, sessionID: string): Promise<string> {
    const combined = RuntimeTokenCipher.binaryDecode(value);

    if (combined.length < 29) {
      throw new APIError(503, 'binding_corrupted', 'Encrypted Session binding is invalid.');
    }

    const plain = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: combined.slice(0, 12),
      additionalData: new TextEncoder().encode(identityKey + ':' + sessionID),
    }, await this.requireKey(), combined.slice(12));

    return new TextDecoder().decode(plain);
  }
}
