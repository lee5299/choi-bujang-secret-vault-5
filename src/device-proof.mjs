import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import app from '../access-app.config.json' with { type: 'json' };
import config from '../aleph.config.json' with { type: 'json' };
import { deviceRepository } from './device-repository.mjs';

const origin = new URL(config.publicAppUrl).origin;
const protocol = 'webcrypto-request-v1';
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
function decodeBytes(value, maxLength) {
  if (typeof value !== 'string' || !value.length || value.length > maxLength || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new DeviceError('app_signature_invalid');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new DeviceError('app_signature_invalid');
  return bytes;
}
function decodeProof(proof, purpose) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || !/^wc1_[a-f0-9]{64}$/u.test(proof.id)
      || proof.type !== protocol || Object.keys(proof).some(key => !['id', 'type', 'response', 'publicKey'].includes(key))
      || !proof.response || Object.keys(proof.response).sort().join(',') !== 'clientDataJSON,signature') throw new DeviceError('app_signature_invalid');
  const data = decodeBytes(proof.response.clientDataJSON, 4096);
  const signature = decodeBytes(proof.response.signature, 128);
  if (signature.length !== 64) throw new DeviceError('app_signature_invalid');
  let client;
  try { client = JSON.parse(data.toString('utf8')); } catch { throw new DeviceError('app_signature_invalid'); }
  if (!client || Object.keys(client).sort().join(',') !== 'challenge,id,origin,protocol,type'
      || client.protocol !== protocol || client.type !== purpose || client.origin !== origin || client.id !== proof.id
      || typeof client.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(client.challenge)) throw new DeviceError('app_signature_invalid');
  return { nonce: client.challenge, data, signature };
}
function checkSignature(proof, decoded, encodedKey) {
  const bytes = decodeBytes(encodedKey, 512);
  if (proof.id !== `wc1_${digest(bytes)}`) throw new DeviceError('app_signature_invalid');
  const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
      || !bytes.equals(key.export({ format: 'der', type: 'spki' }))
      || !verifySignature('sha256', decoded.data, { key, dsaEncoding: 'ieee-p1363' }, decoded.signature)) throw new DeviceError('app_signature_invalid');
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
    // 기존 WebAuthn 승인 기록은 보존하지만 새 프로토콜의 승인으로 취급하지 않습니다.
    return rows.filter(row => /^wc1_[a-f0-9]{64}$/u.test(row.credential_id));
  };
  const put = async (challenge, purpose, intent = null) => {
    const ok = await repository('challenge_put', { p_nonce: challenge, p_user_id: user, p_session_hash: session, p_purpose: purpose, p_intent: intent });
    if (ok !== true) throw new DeviceError('device_request_limit', 429);
  };
  const take = async (proof, purpose) => {
    const decoded = decodeProof(proof, purpose);
    const { nonce } = decoded;
    const row = await repository('challenge_take', { p_nonce: nonce, p_user_id: user, p_session_hash: session, p_purpose: purpose });
    if (!row || row.nonce !== nonce || row.user_id !== user || row.session_hash !== session || row.purpose !== purpose
        || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) throw new DeviceError('app_challenge_invalid');
    return { ...row, decoded };
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
      if (Object.hasOwn(proof, 'publicKey')) throw new DeviceError('app_signature_invalid');
      checkSignature(proof, challenge.decoded, credential.public_key);
      if (!Number.isInteger(credential.counter) || credential.counter < 0 || credential.counter >= 4294967295) throw new DeviceError('device_not_registered');
      // 승인 회수와 동시 요청을 비교·갱신으로 재확인합니다. 브라우저 카운터는 신뢰하지 않습니다.
      const advanced = await repository('counter', { p_user_id: user, p_credential_id: credential.credential_id, p_previous: credential.counter, p_next: credential.counter + 1 });
      if (advanced !== true) throw new DeviceError('device_not_registered');
      return { approved: true, status: 'approved', deviceId: credential.device_id };
    } catch (error) { throw normalizeError(error); }
  };
  return {
    async status() {
      const rows = await list();
      return { approved: false, status: rows.some(row => row.status === 'approved') ? 'verification_required'
        : rows.some(row => row.status === 'pending') ? 'pending' : 'approval_required',
        devices: rows.map(row => ({ id: row.credential_id, deviceId: row.device_id, status: row.status })) };
    },
    async registrationOptions() {
      const options = { protocol, origin, challenge: randomBytes(32).toString('base64url') };
      await put(options.challenge, 'registration');
      return options;
    },
    async register(proof) {
      try {
        const challenge = await take(proof, 'registration');
        checkSignature(proof, challenge.decoded, proof.publicKey);
        const previousRegistration = existing => {
          if (existing.public_key !== proof.publicKey || !['approved', 'pending'].includes(existing.status)) throw new DeviceError('device_not_registered');
          return { approved: false, status: existing.status === 'approved' ? 'verification_required' : 'pending', deviceId: existing.device_id };
        };
        const existing = (await list()).find(row => row.credential_id === proof.id);
        if (existing) return previousRegistration(existing);
        const deviceId = digest(proof.id).slice(0, 16);
        const ok = await repository('register', { p_user_id: user, p_credential_id: proof.id,
          p_device_id: deviceId, p_public_key: proof.publicKey, p_counter: 0 });
        if (ok !== true) {
          // 다른 탭이 동일 키를 먼저 등록한 경우에도 승인 상태를 초기화하지 않습니다.
          const concurrent = (await list()).find(row => row.credential_id === proof.id);
          if (concurrent) return previousRegistration(concurrent);
          throw new DeviceError('device_registration_conflict', 409);
        }
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
      const options = { protocol, origin, challenge: randomBytes(32).toString('base64url'), allowedIds: credentials.map(row => row.credential_id) };
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
