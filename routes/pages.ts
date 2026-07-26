import { Router } from 'express';
import { Prisma, prisma } from '../database';
import { verifyState } from '../lib/state';
import { asyncHandler, sendError } from '../lib/http';
import { noStore, rateLimit } from '../lib/security';
const router = Router();
const INVALID_LINK_MESSAGE =
  'This connection link is not valid or has expired. Run /connect-linkedin in Discord to generate a fresh one.';
function isChecked(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['on', 'true', 'yes', '1'].includes(value.toLowerCase());
}
router.get('/', (_req, res) => {
  res.render('index');
});
router.get('/privacy', (_req, res) => {
  res.render('privacy');
});
router.get('/success', (_req, res) => {
  res.render('success');
});
router.get('/consent', noStore, (req, res) => {
  const state = verifyState(req.query.state);
  if (!state) return res.redirect('/');
  res.render('consent', { state: state.raw });
});
router.post(
  '/consent',
  noStore,
  rateLimit({ windowMs: 60_000, max: 20 }),
  asyncHandler(async (req, res) => {
    const state = verifyState(req.body?.state);
    if (!state) {
      return sendError(res, 400, 'Invalid or expired link', INVALID_LINK_MESSAGE);
    }
    try {
      await prisma.user.update({
        where: { discord_id: state.discord_id },
        data: {
          directory_visible: isChecked(req.body?.directory_visible),
          open_to_connect: isChecked(req.body?.open_to_connect),
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return sendError(
          res,
          404,
          'Account not found',
          'We could not find your linked account. Run /connect-linkedin in Discord to start again.'
        );
      }
      throw err;
    }
    res.redirect('/success');
  })
);
export default router;
