import express, { ErrorRequestHandler } from 'express';
import path from 'path';
import { prisma } from './database';
import { env, validateEnv } from './config/env';
import authRoutes from './routes/auth';
import pageRoutes from './routes/pages';
import { sendError } from './lib/http';
import { rateLimit, securityHeaders } from './lib/security';

const app = express();
app.disable('x-powered-by');

if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.set('view engine', 'ejs');
// Use __dirname (works in CommonJS) — points to the root of the project in @vercel/node
app.set('views', path.join(__dirname, 'views'));

app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());


// Validate env on first real request so cold-start doesn't crash
app.use((_req, _res, next) => {
  try {
    validateEnv();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/auth', authRoutes);
app.use('/', pageRoutes);

app.use((_req, res) => {
  sendError(res, 404, 'Page not found', 'The page you were looking for does not exist.');
});

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? 400 : 500;
  console.error('Unhandled request error:', err);
  sendError(
    res,
    status,
    status === 400 ? 'Bad request' : 'Something went wrong',
    status === 400
      ? 'The request could not be understood.'
      : 'An unexpected error occurred. Please try again shortly.'
  );
};
app.use(errorHandler);

// For local development — Vercel doesn't call listen()
if (process.env.VERCEL !== '1') {
  const server = app.listen(env.PORT, () => {
    console.log(`Website running on http://localhost:${env.PORT}`);
  });
  server.on('error', (err: any) => {
    console.error('Failed to start HTTP server:', err);
    process.exit(1);
  });
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => {
      void prisma
        .$disconnect()
        .catch((err: any) => console.error('Error disconnecting Prisma:', err))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

export default app;
