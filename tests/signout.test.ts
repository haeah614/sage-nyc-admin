import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sessionClient: vi.fn() }));
vi.mock('../lib/supabase', () => ({ sessionClient: mocks.sessionClient }));

import { POST } from '../app/auth/signout/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', 'https://sage-nyc-admin.example.com');
  vi.stubEnv('VERCEL_URL', 'commit-abc.vercel.app');
  mocks.sessionClient.mockResolvedValue({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } });
});

afterEach(() => vi.unstubAllEnvs());

function request(host: string, origin = `https://${host}`) {
  return new Request(`https://${host}/auth/signout`, { method: 'POST', headers: { origin } });
}

it('signs out and redirects an approved deployment origin to its login page', async () => {
  const response = await POST(request('commit-abc.vercel.app'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://commit-abc.vercel.app/login');
  expect(mocks.sessionClient).toHaveBeenCalledOnce();
});

it('rejects an untrusted or mismatched origin before clearing the session', async () => {
  for (const candidate of [request('unapproved.example.com'), request('commit-abc.vercel.app', 'https://unapproved.example.com')]) {
    const response = await POST(candidate);
    expect(response.status).toBe(403);
  }
  expect(mocks.sessionClient).not.toHaveBeenCalled();
});
