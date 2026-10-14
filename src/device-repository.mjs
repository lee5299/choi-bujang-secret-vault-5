import config from '../aleph.config.json' with { type: 'json' };

export function deviceRepository({ databaseUrl, secretKey }) {
  const base = new URL(databaseUrl);
  if (base.protocol !== 'https:' || base.origin !== new URL(config.identityProvider.issuer).origin
      || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('device_backend_unavailable');
  return async (operation, input) => {
    const reply = await fetch(new URL(`/rest/v1/rpc/library_device_${operation}`, base), {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    if (!reply.ok) throw new Error('device_backend_unavailable');
    return reply.json();
  };
}
