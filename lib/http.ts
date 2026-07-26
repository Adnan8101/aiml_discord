import type { NextFunction, Request, RequestHandler, Response } from 'express';
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] as string);
}
export function sendError(res: Response, status: number, title: string, detail?: string): void {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body{background:#0f111a;color:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
         min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:1rem}
    .card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:1.5rem;
          padding:2.5rem;max-width:28rem;width:100%;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
    h1{font-size:1.25rem;margin:0 0 .75rem}
    p{color:#9ca3af;font-size:.875rem;line-height:1.6;margin:0 0 1.5rem}
    a{color:#5865F2;font-size:.875rem;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail ?? 'Please return to Discord and run /connect-linkedin to start again.')}</p>
    <a href="/">&larr; Back home</a>
  </div>
</body>
</html>`;
  res.status(status).type('html').send(body);
}
