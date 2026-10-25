// Helpers that work with both Vercel's req/res and the plain Node dev server.

export async function readBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 50_000) throw new Error('Body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

export function allow(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('allow', method);
  send(res, 405, { error: `Use ${method}` });
  return false;
}
