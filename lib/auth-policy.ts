import { AppError } from './errors';
export type VerifiedIdentity = { id: string; app_metadata: { provider?: string }; identities?: { provider: string }[] };
export async function authorize(
  getIdentity: () => Promise<VerifiedIdentity | null>,
  getFlag: (id: string) => Promise<boolean>,
) {
  const user = await getIdentity();
  if (!user) throw new AppError(401, 'Sign in with Google to continue.');
  if (user.app_metadata.provider !== 'google' || !user.identities?.some(i => i.provider === 'google')) {
    throw new AppError(403, 'Access denied. A Google account authorized for administration is required.');
  }
  if (await getFlag(user.id) !== true) throw new AppError(403, 'Access denied. This account is not a superadmin.');
  return { id: user.id };
}
export function assertMutation(request: Request, origin: string | undefined, enabled: boolean) {
  if (!origin || request.headers.get('origin') !== origin) throw new AppError(403, 'Request origin is not allowed.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError(415, 'Use application/json.');
  if (!enabled) throw new AppError(403, 'Writes are disabled pending database review and approval.');
}
