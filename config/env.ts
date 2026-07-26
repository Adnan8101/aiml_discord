import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  return value?.trim() || '';
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

const NODE_ENV = optional('NODE_ENV', 'development');
const rawPort = optional('PORT', '3000');
const PORT = Number.parseInt(rawPort, 10) || 3000;

export const env = {
  NODE_ENV,
  isProduction: NODE_ENV === 'production',
  PORT,
  ENCRYPTION_KEY: required('ENCRYPTION_KEY'),
  LINKEDIN_CLIENT_ID: required('LINKEDIN_CLIENT_ID'),
  LINKEDIN_CLIENT_SECRET: required('LINKEDIN_CLIENT_SECRET'),
  LINKEDIN_REDIRECT_URI: required('LINKEDIN_REDIRECT_URI'),
  TRUST_PROXY: Number.parseInt(optional('TRUST_PROXY', '1'), 10) || 1,
} as const;

// Validate at runtime per-request (not at cold-start module load)
export function validateEnv(): void {
  const missing: string[] = [];
  if (!env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');
  if (!env.LINKEDIN_CLIENT_ID) missing.push('LINKEDIN_CLIENT_ID');
  if (!env.LINKEDIN_CLIENT_SECRET) missing.push('LINKEDIN_CLIENT_SECRET');
  if (!env.LINKEDIN_REDIRECT_URI) missing.push('LINKEDIN_REDIRECT_URI');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
