import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import { canonicalBody, digest, requestIntent } from '../../src/device-proof.mjs';
import config from '../../aleph.config.json' with { type: 'json' };

// 시험 전용의 일회성 가상 인증기·메모리 저장소입니다. 운영 환경에 적용하거나 키를 출력하지 않습니다.
export function virtualDevices() {
  const challenges = new Map();
  const devices = new Map();
  const issued = [];
  const keys = new Map();
  const keyFor = user => {
    if (!keys.has(user)) {
      const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = pair.publicKey.export({ format: 'jwk' });
      const publicKey = Buffer.from(encodeCBOR(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]))).toString('base64url');
      const id = randomBytes(32).toString('base64url');
      const record = { credential_id: id, device_id: digest(id).slice(0, 16), user_id: user, public_key: publicKey, counter: 0, status: 'approved' };
      devices.set(id, record); keys.set(user, { ...pair, record });
    }
    return keys.get(user);
  };
  const repository = async (operation, p) => {
    if (operation === 'list') return [...devices.values()].filter(row => row.user_id === p.p_user_id).map(row => ({ ...row }));
    if (operation === 'challenge_put') {
      const time = Date.now();
      if (issued.filter(row => row.user === p.p_user_id && row.time > time - 60000).length >= 30) return false;
      issued.push({ user: p.p_user_id, time });
      challenges.set(p.p_nonce, { nonce: p.p_nonce, user_id: p.p_user_id, session_hash: p.p_session_hash,
        purpose: p.p_purpose, intent: p.p_intent, expires_at: new Date(time + 120000).toISOString() });
      return true;
    }
    if (operation === 'challenge_take') {
      const row = challenges.get(p.p_nonce);
      if (!row || row.user_id !== p.p_user_id || row.session_hash !== p.p_session_hash || row.purpose !== p.p_purpose || Date.parse(row.expires_at) <= Date.now()) return null;
      challenges.delete(p.p_nonce); return row;
    }
    if (operation === 'register') {
      if (devices.has(p.p_credential_id)) return false;
      devices.set(p.p_credential_id, { credential_id: p.p_credential_id, device_id: p.p_device_id, user_id: p.p_user_id,
        public_key: p.p_public_key, counter: p.p_counter, status: 'pending' }); return true;
    }
    if (operation === 'counter') {
      const row = devices.get(p.p_credential_id);
      if (!row || row.user_id !== p.p_user_id || row.status !== 'approved' || row.counter !== p.p_previous || p.p_next < p.p_previous) return false;
      row.counter = p.p_next; return true;
    }
    throw new Error('Unknown virtual device operation');
  };
  const assertion = (user, challenge, { flags = 5, origin = config.publicAppUrl, challengeOverride } = {}) => {
    const { privateKey, record } = keyFor(user);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: challengeOverride ?? challenge, origin, crossOrigin: false }));
    const authData = Buffer.concat([Buffer.from(digest(new URL(config.publicAppUrl).hostname), 'hex'), Buffer.from([flags]), Buffer.alloc(4)]);
    const signature = sign('sha256', Buffer.concat([authData, Buffer.from(digest(clientData), 'hex')]), privateKey);
    return { id: record.credential_id, rawId: record.credential_id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
      response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url'), userHandle: null } };
  };
  const wrapFetch = fallback => async (input, options) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    const match = /^\/rest\/v1\/rpc\/library_device_(.+)$/u.exec(path);
    if (match) return Response.json(await repository(match[1], JSON.parse(options.body)));
    return fallback(input, options);
  };
  const signRequest = async request => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token?.includes('.')) return request;
    let claims;
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return request; }
    if (!claims.sub) return request;
    keyFor(claims.sub);
    const nonce = randomBytes(32).toString('base64url');
    // 회귀의 정상 기기마다 유효한 서명·일회용 확인값을 생성합니다. 발급 한도 시험과 분리합니다.
    challenges.set(nonce, { nonce, user_id: claims.sub, session_hash: digest(request.headers.authorization),
      purpose: 'request', intent: requestIntent(request), expires_at: new Date(Date.now() + 120000).toISOString() });
    const proof = assertion(claims.sub, nonce);
    request.headers['x-vault-device-proof'] = Buffer.from(JSON.stringify(proof)).toString('base64url');
    return request;
  };
  const registration = (user, challenge, { flags = 0x45 } = {}) => {
    const { record } = keyFor(user);
    const id = Buffer.from(record.credential_id, 'base64url');
    const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
    const authData = Buffer.concat([Buffer.from(digest(new URL(config.publicAppUrl).hostname), 'hex'), Buffer.from([flags]), Buffer.alloc(4), Buffer.alloc(16), length, id, Buffer.from(record.public_key, 'base64url')]);
    const attestation = encodeCBOR(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return { id: record.credential_id, rawId: record.credential_id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
      response: { attestationObject: Buffer.from(attestation).toString('base64url'), clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: config.publicAppUrl, crossOrigin: false })).toString('base64url'), transports: ['internal'] } };
  };
  return { repository, keyFor, assertion, registration, wrapFetch, signRequest, challenges, devices, canonicalBody };
}
