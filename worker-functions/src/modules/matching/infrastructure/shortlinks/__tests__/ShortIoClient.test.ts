/**
 * ShortIoClient.test.ts
 *
 * Scenarios:
 *   1. createLink — success → returns shortURL + id
 *   2. createLink — non-OK response → throws error with status + body
 *   3. createLink — passes correct headers and body to fetch
 */

import { ShortIoClient } from '../ShortIoClient';

describe('ShortIoClient', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns shortURL and id on success', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ shortURL: 'https://srt.io/abc', id: 42 }),
    } as Response);

    const client = new ShortIoClient({ apiKey: 'test-key', domain: 'srt.io' });
    const result = await client.createLink({
      domain: 'srt.io',
      originalURL: 'https://app.enlite.health/vacantes/caso1-1?utm_source=facebook',
      title: 'Caso 1-1 — facebook',
    });

    expect(result).toEqual({ shortURL: 'https://srt.io/abc', id: '42' });
  });

  it('converts numeric id to string', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ shortURL: 'https://srt.io/xyz', id: 99 }),
    } as Response);

    const client = new ShortIoClient({ apiKey: 'key', domain: 'srt.io' });
    const result = await client.createLink({
      domain: 'srt.io',
      originalURL: 'https://example.com',
      title: 'test',
    });

    expect(typeof result.id).toBe('string');
    expect(result.id).toBe('99');
  });

  it('throws error when response is not ok', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'domain not found',
    } as unknown as Response);

    const client = new ShortIoClient({ apiKey: 'key', domain: 'bad.io' });
    await expect(
      client.createLink({ domain: 'bad.io', originalURL: 'https://example.com', title: 'test' }),
    ).rejects.toThrow('Short.io 422: domain not found');
  });

  it('sends correct headers and body to Short.io API', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ shortURL: 'https://srt.io/ok', id: '1' }),
    } as Response);

    const client = new ShortIoClient({ apiKey: 'my-api-key', domain: 'my.domain' });
    await client.createLink({
      domain: 'my.domain',
      originalURL: 'https://target.com',
      title: 'My Link',
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://api.short.io/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'my-api-key',
      },
      body: JSON.stringify({
        domain: 'my.domain',
        originalURL: 'https://target.com',
        title: 'My Link',
      }),
    });
  });
});
