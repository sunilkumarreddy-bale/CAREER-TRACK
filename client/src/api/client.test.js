import { api, ApiError, apiUrl, onUnauthorized } from './client.js';

const respond = (status, body) =>
  vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('builds URLs and drops empty query params', () => {
    expect(apiUrl('/applications', { q: 'goo', status: '', page: 2, x: null })).toBe('/api/applications?q=goo&page=2');
  });

  it('sends JSON with credentials and the CSRF header', async () => {
    global.fetch = respond(200, { ok: true });
    await api('/applications', { method: 'POST', body: { company: 'A' } });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/applications');
    expect(opts.credentials).toBe('include');
    expect(opts.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe('{"company":"A"}');
  });

  it('does not set a JSON content type for FormData', async () => {
    global.fetch = respond(201, {});
    await api('/resumes', { method: 'POST', body: new FormData() });
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it('throws ApiError with field errors', async () => {
    global.fetch = respond(400, { error: 'Validation failed', details: [{ field: 'company', message: 'Company is required' }] });
    const err = await api('/applications', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.fieldErrors).toEqual({ company: 'Company is required' });
  });

  it('notifies listeners on 401 outside of auth routes', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    global.fetch = respond(401, { error: 'Authentication required' });
    await expect(api('/auth/me')).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
    await expect(api('/dashboard')).rejects.toThrow('Authentication required');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('returns null for 204 and maps network failures', async () => {
    global.fetch = respond(204);
    expect(await api('/x', { method: 'DELETE' })).toBeNull();
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/x')).rejects.toMatchObject({ status: 0 });
  });
});
