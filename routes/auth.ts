import { Router } from 'express';
import { encrypt } from '../lib/crypto';
import { Prisma, prisma } from '../database';
import { env } from '../config/env';
import { verifyState } from '../lib/state';
import { asyncHandler, sendError } from '../lib/http';
import { noStore, rateLimit } from '../lib/security';
const router = Router();
router.use(noStore);
router.use(rateLimit({ windowMs: 60_000, max: 30 }));
const LINKEDIN_TIMEOUT_MS = 10_000;
const INVALID_LINK_MESSAGE =
  'This connection link is not valid or has expired. Run /connect-linkedin in Discord to generate a fresh one.';
router.get('/linkedin', (req, res) => {
  const state = verifyState(req.query.state);
  if (!state) {
    return sendError(res, 400, 'Invalid or expired link', INVALID_LINK_MESSAGE);
  }
  const linkedInUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  linkedInUrl.searchParams.set('response_type', 'code');
  linkedInUrl.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID);
  linkedInUrl.searchParams.set('redirect_uri', env.LINKEDIN_REDIRECT_URI);
  linkedInUrl.searchParams.set('state', state.raw);
  linkedInUrl.searchParams.set('scope', 'openid profile email');
  res.redirect(linkedInUrl.toString());
});
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, error, error_description } = req.query;
    if (error) {
      console.warn('LinkedIn returned an OAuth error:', String(error).slice(0, 200));
      console.warn('Error description:', error_description);
      return sendError(
        res,
        400,
        'LinkedIn sign-in was not completed',
        'LinkedIn did not authorise the request. Run /connect-linkedin in Discord to try again.'
      );
    }
    const state = verifyState(req.query.state);
    if (!state) {
      return sendError(res, 400, 'Invalid or expired link', INVALID_LINK_MESSAGE);
    }
    if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
      return sendError(res, 400, 'Missing authorisation code', INVALID_LINK_MESSAGE);
    }
    const { discord_id } = state;
    try {
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.LINKEDIN_REDIRECT_URI,
          client_id: env.LINKEDIN_CLIENT_ID,
          client_secret: env.LINKEDIN_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(LINKEDIN_TIMEOUT_MS),
      });
      const tokenData = await readJson(tokenResponse, 'token endpoint');
      if (tokenData.error) {
        throw new Error(`token error: ${tokenData.error_description || tokenData.error}`);
      }
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      if (typeof accessToken !== 'string' || accessToken.length === 0) {
        throw new Error('token response did not include an access_token');
      }
      const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(LINKEDIN_TIMEOUT_MS),
      });
      const profileData = await readJson(profileResponse, 'userinfo endpoint');
      if (typeof profileData.sub !== 'string' || profileData.sub.length === 0) {
        throw new Error('userinfo response did not include a subject identifier');
      }
      const expiresIn = Number(tokenData.expires_in);
      const token_expires_at =
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null;
      const profile = {
        linkedin_sub: profileData.sub,
        linkedin_access_token: encrypt(accessToken),
        token_expires_at,
        full_name: asOptionalString(profileData.name),
        email: asOptionalString(profileData.email),
        profile_photo_url: asOptionalString(profileData.picture),
      };
      await prisma.user.upsert({
        where: { discord_id },
        update: {
          ...profile,
          ...(typeof refreshToken === 'string' && refreshToken.length > 0
            ? { linkedin_refresh_token: encrypt(refreshToken) }
            : {}),
        },
        create: {
          discord_id,
          ...profile,
          linkedin_refresh_token:
            typeof refreshToken === 'string' && refreshToken.length > 0
              ? encrypt(refreshToken)
              : null,
        },
      });
      res.redirect(`/consent?state=${encodeURIComponent(state.raw)}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return sendError(
          res,
          409,
          'LinkedIn account already connected',
          'This LinkedIn account is already connected to another Discord account. Run /disconnect-linkedin in that Discord account before trying again.'
        );
      }
      console.error('LinkedIn authentication failed for discord_id=%s:', discord_id, err);
      return sendError(
        res,
        502,
        'Could not complete LinkedIn sign-in',
        'Something went wrong while talking to LinkedIn. Please run /connect-linkedin in Discord and try again.'
      );
    }
  })
);
async function readJson(response: Response, label: string): Promise<Record<string, any>> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned a non-JSON response (HTTP ${response.status})`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${label} returned an unexpected payload (HTTP ${response.status})`);
  }
  const data = parsed as Record<string, any>;
  if (!response.ok && !data.error) {
    throw new Error(`${label} responded with HTTP ${response.status}`);
  }
  return data;
}
function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
export default router;
