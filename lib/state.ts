import crypto from 'node:crypto';
import { env } from '../config/env';
export interface StateData {
  discord_id: string;
  nonce?: string;
  iat?: number;
  raw: string;
}
const MAX_STATE_LENGTH = 4096;
const MAX_STATE_AGE_MS = 15 * 60 * 1000;
const DISCORD_ID_PATTERN = /^\d{5,32}$/;
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
export function signPayload(payload: string): string {
  return crypto.createHmac('sha256', env.ENCRYPTION_KEY).update(payload).digest('hex');
}
export function verifyState(raw: unknown): StateData | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_STATE_LENGTH) return null;
  const state = raw.includes(' ') ? raw.replace(/ /g, '+') : raw;
  const separator = state.indexOf('.');
  if (separator <= 0 || separator === state.length - 1) return null;
  if (state.indexOf('.', separator + 1) !== -1) return null;
  const payload = state.slice(0, separator);
  const hmac = state.slice(separator + 1);
  if (!safeEqual(hmac, signPayload(payload))) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return null;
  const { discord_id, nonce, iat } = decoded as Record<string, unknown>;
  if (typeof discord_id !== 'string' || !DISCORD_ID_PATTERN.test(discord_id)) return null;
  if (typeof iat === 'number') {
    if (!Number.isFinite(iat)) return null;
    if (Date.now() - iat > MAX_STATE_AGE_MS) return null;
  }
  return {
    discord_id,
    nonce: typeof nonce === 'string' ? nonce : undefined,
    iat: typeof iat === 'number' ? iat : undefined,
    raw: state,
  };
}
