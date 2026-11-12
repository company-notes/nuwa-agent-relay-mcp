import { APIError } from './APIClients';

export class RuntimeTokenCipher {
  constructor(private readonly encodedKey: string) {}

  async requireKey(): Promise<CryptoKey> {
    const encoded = this.encodedKey;

    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new APIError(503, 'binding_key_missing', 'Session encryption key is not configured.');
    }

    const raw = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));

    if (raw.length !== 32) {
      throw new APIError(503, 'binding_key_invalid', 'Session encryption key must be 256 bits.');
    }

    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  private static binaryEncode(value: Uint8Array): string {
    return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
  }

  private static binaryDecode(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  private async encrypt(token: string, identityKey: string, sessionID: string): Promise<string> {
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

  private async decrypt(value: string, identityKey: string, sessionID: string): Promise<string> {
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
