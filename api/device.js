import { authenticateResource } from '../src/resource-auth.mjs';
import { createDeviceService, DeviceError } from '../src/device-proof.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (status, error) => response.status(status).json({ error, message: '기기 확인 요청을 처리하지 못했습니다.' });
  const authenticated = await authenticateResource(request, response,
    (_response, status) => fail(status, 'device_backend_unavailable'), { deviceProofRequired: false });
  if (!authenticated) return response;
  try {
    const url = new URL(request.url, 'https://local.invalid');
    const route = url.searchParams.get('route');
    if (url.pathname !== '/api/device' || [...url.searchParams.keys()].some(key => key !== 'route')
        || url.searchParams.getAll('route').length !== 1) return fail(404, 'route_not_allowed');
    if (!['status', 'registration-options', 'registration-verify', 'authentication-options'].includes(route)) return fail(404, 'route_not_allowed');
    if (request.method !== 'POST' && !(route === 'status' && request.method === 'GET')) return fail(405, 'method_not_allowed');
    const service = createDeviceService(authenticated, request);
    if (request.method === 'GET') return response.status(200).json(await service.status());
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] ?? '')) return fail(415, 'invalid_request');
    const body = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString()) : request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 65536) return fail(400, 'invalid_request');
    if (route === 'registration-options') {
      if (Object.keys(body).length) return fail(400, 'invalid_request');
      return response.status(200).json(await service.registrationOptions());
    }
    if (route === 'registration-verify') return response.status(202).json(await service.register(body));
    if (route === 'status') return response.status(200).json(await service.verifyStatus(body));
    if (Object.keys(body).some(key => !['purpose', 'intent'].includes(key))) return fail(400, 'invalid_request');
    return response.status(200).json(await service.authenticationOptions(body.purpose, body.intent));
  } catch (error) {
    return fail(error instanceof DeviceError ? error.status : error.message === 'device_backend_unavailable' ? 503 : 400,
      error instanceof DeviceError ? error.code : error.message === 'device_backend_unavailable' ? 'device_backend_unavailable' : 'invalid_request');
  }
}
