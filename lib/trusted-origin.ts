import 'server-only';
import { AppError } from './errors';

export function trustedOrigins() {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new AppError(503, 'Authentication is not configured.');
  const origins = new Set([new URL(configured).origin]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.add(new URL(host.startsWith('http') ? host : `https://${host}`).origin);
  }
  return origins;
}

export function trustedRequestOrigin(request: Request, requireOriginHeader = false) {
  const requestOrigin = new URL(request.url).origin;
  if (!trustedOrigins().has(requestOrigin) || (requireOriginHeader && request.headers.get('origin') !== requestOrigin)) {
    throw new AppError(403, 'Request origin is not allowed.');
  }
  return requestOrigin;
}
