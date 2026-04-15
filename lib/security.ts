/**
 * Data-protection & security utilities for VCC Insurance.
 *
 * Covers:
 *  - Input sanitisation
 *  - PII field-level encryption at rest (AES-256-GCM)
 *  - Rate-limiting helpers
 *  - Security header constants
 */

import crypto from 'crypto'

// ---------------------------------------------------------------------------
// 1. Input sanitisation
// ---------------------------------------------------------------------------

/** Strip HTML / script tags to prevent stored-XSS. */
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')          // remove HTML tags
    .replace(/javascript:/gi, '')      // remove JS protocol
    .replace(/on\w+\s*=/gi, '')       // remove inline event handlers
    .trim()
}

/** Validate email format. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Limit string length to prevent oversized payloads. */
export function truncate(input: string, maxLen: number): string {
  return input.length > maxLen ? input.slice(0, maxLen) : input
}

// ---------------------------------------------------------------------------
// 2. Field-level encryption (AES-256-GCM)
//    Used for encrypting PII columns (e.g. SSN, EIN) at rest in the DB.
//    The key is sourced from ENCRYPTION_KEY env var (32-byte hex string).
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32'
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plaintext string.
 * Returns base64 string of: IV (12 B) | ciphertext | auth-tag (16 B)
 */
export function encryptField(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, tag]).toString('base64')
}

/**
 * Decrypt a value produced by `encryptField`.
 */
export function decryptField(encoded: string): string {
  const key = getEncryptionKey()
  const buf = Buffer.from(encoded, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

// ---------------------------------------------------------------------------
// 3. File content hashing
// ---------------------------------------------------------------------------

/**
 * Generate a unique hash for a file based on its content.
 * Uses SHA-256 to produce a deterministic, collision-resistant identifier.
 * Returns a hex string truncated to `length` characters (default 12).
 */
export function generateFileHash(buffer: Buffer, length = 12): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, length)
}

// ---------------------------------------------------------------------------
// 4. In-memory rate limiter (per-IP, per endpoint)
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()

/**
 * Simple sliding-window rate limiter.
 * Returns `true` if the request should be ALLOWED, `false` if rate-limited.
 */
export function rateLimit(
  key: string,
  { maxRequests = 10, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {}
): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= maxRequests) return false
  bucket.count++
  return true
}

// ---------------------------------------------------------------------------
// 5. Security headers (applied via middleware / vercel.json)
// ---------------------------------------------------------------------------

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';",
}

// ---------------------------------------------------------------------------
// 6. Audit logging helper
// ---------------------------------------------------------------------------

export interface AuditEntry {
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  ip_address?: string
  details?: string
}

/**
 * Build an audit log row. Callers persist this via Supabase insert.
 */
export function buildAuditEntry(entry: AuditEntry) {
  return {
    ...entry,
    created_at: new Date().toISOString(),
  }
}
