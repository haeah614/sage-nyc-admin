import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  sessionClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('../lib/supabase', () => ({ sessionClient: mocks.sessionClient }));
vi.mock('../lib/admin', () => ({ requireAdmin: mocks.requireAdmin }));

import { POST } from '../app/auth/callback/route';
import { AppError } from '../lib/errors';

const csrf = 'csrf-fixture-token';
const credential = 'google-id-token-fixture';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', 'https://sage-nyc-admin.example.com');
  vi.stubEnv('VERCEL_URL', 'commit-abc.vercel.app');
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: csrf })) });
  mocks.sessionClient.mockResolvedValue({ auth: { signInWithIdToken: vi.fn().mockResolvedValue({ error: null }) } });
  mocks.requireAdmin.mockResolvedValue({ id: 'authorized-admin' });
});

afterEach(() => vi.unstubAllEnvs());

function request(host: string) {
  const body = new FormData();
  body.set('g_csrf_token', csrf);
  body.set('credential', credential);
  return new Request(`https://${host}/auth/callback`, { method: 'POST', body });
}

it('redirects an authorized login back to the origin that owns its session cookie', async () => {
  const response = await POST(request('commit-abc.vercel.app'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://commit-abc.vercel.app/');
  expect(mocks.requireAdmin).toHaveBeenCalledOnce();
});

it('keeps unauthorized redirects on the same deployment origin', async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new AppError(403, 'Denied'));
  const response = await POST(request('commit-abc.vercel.app'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://commit-abc.vercel.app/denied');
});

it('rejects callback requests from an unapproved host before exchanging the credential', async () => {
  const response = await POST(request('unapproved.example.com'));
  expect(response.status).toBe(403);
  expect(mocks.sessionClient).not.toHaveBeenCalled();
});
