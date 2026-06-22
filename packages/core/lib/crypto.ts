/**
 * Field-level encryption using PBKDF2 key derivation + AES-256-GCM.
 * Never stores raw keys — derives from environment-injected master key.
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12
const SALT_LENGTH = 16

function getMasterKey(): string {
  const key = process.env['FIELD_ENCRYPTION_KEY']
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is required for field-level encryption')
  return key
}

async function deriveKey(masterKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptField(plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(getMasterKey(), salt)

  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext),
  )

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)

  let binary = ''
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]!)
  }
  return btoa(binary)
}

export async function decryptField(ciphertext: string): Promise<string> {
  const combined = new Uint8Array(
    atob(ciphertext)
      .split('')
      .map((c) => c.charCodeAt(0)),
  )

  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const data = combined.slice(SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(getMasterKey(), salt)

  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data)

  return new TextDecoder().decode(decrypted)
}

export async function hashSHA256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hmacSHA256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const message = encoder.encode(data)

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message)
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
