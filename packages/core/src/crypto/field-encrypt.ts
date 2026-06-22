import { subtle, createSecretKey, randomBytes } from 'node:crypto';

export async function deriveFieldKey(
  masterKey: string,
  context: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(`field-key:${context}`);
  
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode('field-encryption'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptField(
  plaintext: string,
  key: CryptoKey,
  context: string
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = randomBytes(12);
  const aad = encoder.encode(context);
  
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    encoder.encode(plaintext)
  );
  
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return Buffer.from(combined).toString('base64');
}

export async function decryptField(
  encryptedBase64: string,
  key: CryptoKey,
  context: string
): Promise<string> {
  const encoder = new TextEncoder();
  const combined = Buffer.from(encryptedBase64, 'base64');
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const aad = encoder.encode(context);
  
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(plaintext);
}

export async function hashSHA256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await subtle.digest('SHA-256', encoder.encode(input));
  return Buffer.from(hashBuffer).toString('hex');
}