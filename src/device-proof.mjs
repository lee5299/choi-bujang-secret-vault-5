import { createHash } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import app from '../access-app.config.json' with { type: 'json' };
import config from '../aleph.config.json' with { type: 'json' };
import { deviceRepository } from './device-repository.mjs';

const origin = new URL(config.publicAppUrl).origin;
const rpID = new URL(origin).hostname;
// 요청 서명을 발급하는 보호 API: 메모·공지와 12단계 작전실 요약(쿼리·하위 경로 없는 정확한 경로만).
export const SIGNED_PATH = /^\/api\/(?:(?:notes|announcements)(?:\/|\?|$)|operations-summary$)/u;
export const digest = value => createHash('sha256').update(value).digest('hex');
const sessionHash = request => digest(request.headers.authorization);
export class DeviceError extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status; }
}
export function canonicalBody(body) {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return `raw:${body}`; }
  }
  const canonical = (value, depth = 0) => {
    if (depth > 24) throw new DeviceError('invalid_request', 400);
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new DeviceError('invalid_request', 400);
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
  };
  const result = canonical(body);
  if (Buffer.byteLength(result) > 65536) throw new DeviceError('invalid_request', 413);
  return result;
}
export function requestIntent(request) {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      || typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//') || request.url.includes('#')) throw new DeviceError('invalid_request', 400);
  const target = new URL(request.url, origin);
  if (target.origin !== origin) throw new DeviceError('invalid_request', 400);
  return { method: request.method, path: target.pathname + target.search, bodyHash: digest(canonicalBody(request.body)) };
}
function decodeProof(proof) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || typeof proof.id !== 'string' || proof.id.length > 1400
      || proof.type !== 'public-key' || typeof proof.response?.clientDataJSON !== 'string' || proof.response.clientDataJSON.length > 4096) throw new DeviceError('app_signature_invalid');
  let client;
  try { client = JSON.parse(Buffer.from(proof.response.clientDataJSON, 'base64url').toString('utf8')); } catch { throw new DeviceError('app_signature_invalid'); }
  if (typeof client.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(client.challenge)) throw new DeviceError('app_signature_invalid');
  return client.challenge;
}
const normalizeError = error => {
  if (error instanceof DeviceError) return error;
  if (error.message === 'device_backend_unavailable') return new DeviceError('device_backend_unavailable', 503);
  return new DeviceError('app_signature_invalid');
};

export function createDeviceService(authenticated, request, repository = deviceRepository(authenticated)) {
  const user = authenticated.identity.userId;
  const session = sessionHash(request);
  const list = async () => {
    const rows = await repository('list', { p_user_id: user });
    if (!Array.isArray(rows)) throw new DeviceError('device_backend_unavailable', 503);
    return rows;
  };
  const put = async (challenge, purpose, intent = null) => {
    const ok = await repository('challenge_put', { p_nonce: challenge, p_user_id: user, p_session_hash: session, p_purpose: purpose, p_intent: intent });
    if (ok !== true) throw new DeviceError('device_request_limit', 429);
  };
  const take = async (proof, purpose) => {
    const nonce = decodeProof(proof);
    const row = await repository('challenge_take', { p_nonce: nonce, p_user_id: user, p_session_hash: session, p_purpose: purpose });
    if (!row || row.nonce !== nonce || row.user_id !== user || row.session_hash !== session || row.purpose !== purpose
        || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) throw new DeviceError('app_challenge_invalid');
    return row;
  };
  const verify = async (proof, purpose, intent) => {
    try {
      const challenge = await take(proof, purpose);
      if (purpose === 'request') {
        if (challenge.intent?.method !== intent.method || challenge.intent?.path !== intent.path) throw new DeviceError('app_signature_path_mismatch');
        if (challenge.intent?.bodyHash !== intent.bodyHash) throw new DeviceError('app_signature_body_mismatch');
      }
      const credential = (await list()).find(row => row.credential_id === proof.id);
      if (!credential || credential.status !== 'approved') throw new DeviceError('device_not_registered');
      const { verified, authenticationInfo: info } = await verifyAuthenticationResponse({
        response: proof, expectedChallenge: challenge.nonce, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64url')), counter: credential.counter },
      });
      if (!verified || info.credentialDeviceType !== 'singleDevice' || info.credentialBackedUp) throw new DeviceError('device_not_supported');
      const advanced = await repository('counter', { p_user_id: user, p_credential_id: credential.credential_id, p_previous: credential.counter, p_next: info.newCounter });
      if (advanced !== true) throw new DeviceError('device_not_registered');
      return { approved: true, status: 'approved', deviceId: credential.device_id };
    } catch (error) { throw normalizeError(error); }
  };
  return {
    async status() {
      const rows = await list();
      return { approved: false, status: rows.some(row => row.status === 'approved') ? 'verification_required'
        : rows.some(row => row.status === 'pending') ? 'pending' : 'approval_required' };
    },
    async registrationOptions() {
      const rows = await list();
      const options = await generateRegistrationOptions({ rpName: app.name, rpID,
        userName: `user-${digest(user).slice(0, 12)}`, userDisplayName: '내 자료실 사용자',
        userID: new Uint8Array(Buffer.from(digest(user), 'hex')), attestationType: 'none', supportedAlgorithmIDs: [-7],
        excludeCredentials: rows.map(row => ({ id: row.credential_id })),
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      });
      await put(options.challenge, 'registration');
      return options;
    },
    async register(proof) {
      try {
        const challenge = await take(proof, 'registration');
        const { verified, registrationInfo: info } = await verifyRegistrationResponse({ response: proof,
          expectedChallenge: challenge.nonce, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
          supportedAlgorithmIDs: [-7] });
        if (!verified || info.credentialDeviceType !== 'singleDevice' || info.credentialBackedUp) throw new DeviceError('device_not_supported');
        const deviceId = digest(info.credential.id).slice(0, 16);
        const ok = await repository('register', { p_user_id: user, p_credential_id: info.credential.id,
          p_device_id: deviceId, p_public_key: Buffer.from(info.credential.publicKey).toString('base64url'), p_counter: info.credential.counter });
        if (ok !== true) throw new DeviceError('device_registration_conflict', 409);
        return { approved: false, status: 'pending', deviceId };
      } catch (error) { throw normalizeError(error); }
    },
    async authenticationOptions(purpose, intent = null) {
      if (!['status', 'request'].includes(purpose)) throw new DeviceError('invalid_request', 400);
      if (purpose === 'request' && (!intent || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(intent.method)
          || typeof intent.path !== 'string' || !SIGNED_PATH.test(intent.path)
          || intent.path.length > 1024 || !/^[a-f0-9]{64}$/u.test(intent.bodyHash))) throw new DeviceError('invalid_request', 400);
      const credentials = (await list()).filter(row => row.status === 'approved');
      if (!credentials.length) throw new DeviceError('device_not_registered');
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: credentials.map(row => ({ id: row.credential_id })) });
      await put(options.challenge, purpose, purpose === 'request' ? intent : null);
      return options;
    },
    verifyStatus: proof => verify(proof, 'status', null),
    verifyRequest: (proof, intent) => verify(proof, 'request', intent),
  };
}

export async function requireDeviceProof(request, response, authenticated) {
  const encoded = request.headers?.[app.proofHeader];
  if (!encoded) { response.status(403).json({ error: 'app_signature_required', message: '승인된 기기의 요청 서명이 필요합니다.' }); return false; }
  try {
    if (typeof encoded !== 'string' || encoded.length > 16384 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new DeviceError('app_signature_invalid');
    const proof = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    await createDeviceService(authenticated, request).verifyRequest(proof, requestIntent(request));
    return true;
  } catch (error) {
    const failure = normalizeError(error);
    response.status(failure.status).json({ error: failure.code, message: failure.status === 503
      ? '기기 확인 서버를 사용할 수 없습니다.' : '기기 승인 또는 요청 서명을 확인하지 못했습니다.' });
    return false;
  }
}
