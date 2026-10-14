import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkResourcePolicy } from './resource-policy.mjs';

// 10단계 제작 1·2: 침해 전에 검증한 안전 정책(권한표) 사본으로 "시험 정책"의 한 서비스만 되돌립니다.
// 대상은 로컬 시험 정책 저장소(기본 local-only/policy-lab, Git 제외)입니다.
// 운영 정책(Vercel의 ALEPH_RESOURCE_POLICY_JSON)은 읽지도 쓰지도 않습니다.
//
// 저장소 구성
//   <lab>/test-policy.json          현재 시험 정책: { schema, services: { <service>: aleph.resource-policy.v1 } }
//   <lab>/backups/<service>-r<n>.json  사전 백업 사본(원문 바이트)
//   <trust>                         신뢰 기준: 사본의 서비스·버전·SHA-256 지문. 사본과 다른 위치에 둡니다.
//   <lab>/audit.jsonl               감사 기록: 한 줄씩 추가만 합니다.

export const STORE_SCHEMA = 'aleph.test-policy-store.v1';
export const TRUST_SCHEMA = 'aleph.policy-trust.v1';
const SERVICE = /^[A-Za-z0-9_.:-]{1,200}$/u;
const HEADER_FIELDS = ['schema', 'classId', 'projectId', 'service', 'policyRevision', 'expiresAt', 'denyReasonCode'];

export class PolicyRestoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new PolicyRestoreError(code, message); };

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const serializePolicy = policy => `${JSON.stringify(policy, null, 2)}\n`;
// 가명 ID도 화면·기록에는 원문 대신 짧은 지문만 표시합니다.
const tag = value => sha256(String(value)).slice(0, 8);
const grantKey = grant => [grant.subjectId, grant.deviceId, grant.method, grant.path].join('\u0000');
const grantView = grant => `${grant.method} ${grant.path} · 주체#${tag(grant.subjectId)} · 기기#${tag(grant.deviceId)}`;

export function labPaths(labDir, trustPath) {
  const lab = resolve(labDir);
  return { lab, store: join(lab, 'test-policy.json'), backups: join(lab, 'backups'),
    audit: join(lab, 'audit.jsonl'), trust: resolve(trustPath ?? join(lab, '..', 'policy-trust', 'anchors.json')) };
}

function readJson(path, code, message) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { fail(code, message); }
  try { return { text, value: JSON.parse(text) }; } catch { fail(code, message); }
}

function readStore(paths) {
  const { text, value } = readJson(paths.store, 'store_missing', '시험 정책 파일이 없거나 읽을 수 없습니다.');
  if (!value || value.schema !== STORE_SCHEMA || !value.services || typeof value.services !== 'object'
      || Array.isArray(value.services)) fail('store_invalid', '시험 정책 파일 형식이 올바르지 않습니다.');
  return { text, store: value };
}

function readTrust(paths) {
  if (!existsSync(paths.trust)) return { schema: TRUST_SCHEMA, anchors: [] };
  const { value } = readJson(paths.trust, 'trust_invalid', '신뢰 기준 파일을 읽을 수 없습니다.');
  if (value?.schema !== TRUST_SCHEMA || !Array.isArray(value.anchors)
      || !value.anchors.every(anchor => anchor && SERVICE.test(anchor.service ?? '')
        && Number.isSafeInteger(anchor.policyRevision) && /^[0-9a-f]{64}$/u.test(anchor.sha256 ?? '')
        && typeof anchor.file === 'string' && /^[A-Za-z0-9_.:-]+-r\d+\.json$/u.test(anchor.file)
        && Number.isFinite(Date.parse(anchor.capturedAt)))) {
    fail('trust_invalid', '신뢰 기준 파일 형식이 올바르지 않습니다.');
  }
  return value;
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, { encoding: 'utf8', flag: 'w' });
  renameSync(temp, path);
}

// 기존 감사 줄은 다시 쓰지 않고 끝에 한 줄만 추가한 뒤, 앞부분이 그대로인지 확인합니다.
function appendAudit(paths, entry) {
  const before = existsSync(paths.audit) ? readFileSync(paths.audit, 'utf8') : '';
  mkdirSync(dirname(paths.audit), { recursive: true });
  appendFileSync(paths.audit, `${JSON.stringify(entry)}\n`, 'utf8');
  if (!readFileSync(paths.audit, 'utf8').startsWith(before)) fail('audit_changed', '기존 감사 기록이 바뀌어 중단합니다.');
}

function checkService(service) {
  if (typeof service !== 'string' || !SERVICE.test(service)) fail('service_invalid', '서비스 이름을 확인하세요.');
}

// 사전 백업: 현재 시험 정책이 유효할 때만 사본과 신뢰 기준을 만듭니다. 침해 뒤에 만들지 마세요.
export function capturePolicyBackup({ labDir, trustPath, service, now = Date.now() }) {
  checkService(service);
  const paths = labPaths(labDir, trustPath);
  const { store } = readStore(paths);
  const policy = store.services[service];
  if (checkResourcePolicy(policy, now) !== 'valid' || policy.service !== service) {
    fail('policy_invalid', '현재 시험 정책이 유효하지 않아 사전 백업을 만들지 않습니다.');
  }
  const text = serializePolicy(policy);
  const digest = sha256(text);
  const file = `${service}-r${policy.policyRevision}.json`;
  const target = join(paths.backups, file);
  const trust = readTrust(paths);
  const existing = trust.anchors.find(anchor => anchor.service === service && anchor.policyRevision === policy.policyRevision);
  if (existing) {
    if (existing.sha256 !== digest) fail('backup_exists', '같은 버전의 다른 사본이 이미 있습니다. 정책 버전을 올린 뒤 백업하세요.');
    return { service, policyRevision: policy.policyRevision, sha256: digest, created: false };
  }
  if (existsSync(target)) fail('backup_exists', '신뢰 기준 없이 같은 이름의 사본 파일이 있습니다. 확인 후 다시 시도하세요.');
  mkdirSync(paths.backups, { recursive: true });
  writeFileSync(target, text, { encoding: 'utf8', flag: 'wx' });
  if (sha256(readFileSync(target)) !== digest) fail('backup_write_failed', '사본을 다시 읽은 결과가 다릅니다.');
  const capturedAt = new Date(now).toISOString();
  writeAtomic(paths.trust, `${JSON.stringify({ schema: TRUST_SCHEMA, anchors: [...trust.anchors,
    { service, policyRevision: policy.policyRevision, sha256: digest, file, capturedAt }] }, null, 2)}\n`);
  appendAudit(paths, { at: capturedAt, action: 'policy_backup', service, policyRevision: policy.policyRevision,
    outcome: 'captured' });
  return { service, policyRevision: policy.policyRevision, sha256: digest, created: true };
}

// 사본을 다시 읽어 신뢰 기준과 대조합니다. 없거나 다르거나 만료됐으면 중단합니다.
export function loadVerifiedBackup({ labDir, trustPath, service, now = Date.now() }) {
  checkService(service);
  const paths = labPaths(labDir, trustPath);
  const anchors = readTrust(paths).anchors.filter(anchor => anchor.service === service)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.policyRevision - a.policyRevision);
  if (!anchors.length) fail('backup_missing', '이 서비스의 검증된 사전 백업이 없습니다. 복원을 중단합니다.');
  const anchor = anchors[0];
  let bytes;
  try { bytes = readFileSync(join(paths.backups, anchor.file)); } catch {
    fail('backup_missing', '사전 백업 파일이 없습니다. 복원을 중단합니다.');
  }
  if (sha256(bytes) !== anchor.sha256) fail('backup_integrity_failed', '사전 백업이 신뢰 기준 지문과 다릅니다. 복원을 중단합니다.');
  let policy;
  try { policy = JSON.parse(bytes.toString('utf8')); } catch { fail('backup_integrity_failed', '사전 백업을 읽을 수 없습니다.'); }
  if (policy?.service !== service || policy.policyRevision !== anchor.policyRevision) {
    fail('backup_target_mismatch', '사전 백업의 서비스·버전이 신뢰 기준과 다릅니다. 복원을 중단합니다.');
  }
  const status = checkResourcePolicy(policy, now);
  if (status !== 'valid') {
    fail('backup_invalid', Date.parse(policy.expiresAt) <= now ? '사전 백업 정책이 만료되어 복원하면 정상 요청까지 거부됩니다. 중단합니다.'
      : '사전 백업 정책 형식이 올바르지 않습니다. 복원을 중단합니다.');
  }
  return { anchor, policy, text: bytes.toString('utf8') };
}

// 제작 1: 복원할 버전과 바뀔 범위만 계산합니다. 어떤 파일도 바꾸지 않습니다.
export function diffPolicy({ labDir, trustPath, service, now = Date.now() }) {
  const paths = labPaths(labDir, trustPath);
  const { anchor, policy: backup } = loadVerifiedBackup({ labDir, trustPath, service, now });
  const { text: storeText, store } = readStore(paths);
  const current = Object.hasOwn(store.services, service) ? store.services[service] : null;
  const fields = HEADER_FIELDS.filter(name => JSON.stringify(current?.[name]) !== JSON.stringify(backup[name]))
    .map(name => ({ name, from: current?.[name] ?? null, to: backup[name] }));
  const currentGrants = Array.isArray(current?.grants) ? current.grants.filter(grant => grant && typeof grant === 'object') : [];
  const backupKeys = new Set(backup.grants.map(grantKey));
  const currentKeys = new Set(currentGrants.map(grantKey));
  const grantsToRemove = currentGrants.filter(grant => !backupKeys.has(grantKey(grant))).map(grantView);
  const grantsToAdd = backup.grants.filter(grant => !currentKeys.has(grantKey(grant))).map(grantView);
  const extraKeys = current && typeof current === 'object'
    ? Object.keys(current).filter(key => ![...HEADER_FIELDS, 'grants'].includes(key)) : [];
  const counts = { add: grantsToAdd.length, remove: grantsToRemove.length + extraKeys.length, modify: fields.length };
  const changed = counts.add + counts.remove + counts.modify > 0
    || serializePolicy(current) !== serializePolicy(backup);
  return {
    service,
    backup: { policyRevision: anchor.policyRevision, sha256: anchor.sha256.slice(0, 12), capturedAt: anchor.capturedAt },
    current: { present: current !== null, policyRevision: current?.policyRevision ?? null,
      sha256: current === null ? null : sha256(serializePolicy(current)).slice(0, 12),
      check: current === null ? 'missing' : checkResourcePolicy(current, now) },
    changes: { fields, grantsToAdd, grantsToRemove, extraKeys },
    counts, changed,
    preservedServices: Object.keys(store.services).filter(name => name !== service).sort(),
    // 확인 문구는 사본 지문과 현재 저장소 전체 지문에 묶입니다. 확인 뒤 무엇이든 바뀌면 다시 비교해야 합니다.
    confirmToken: sha256(`${anchor.sha256}:${sha256(storeText)}:${service}`).slice(0, 16),
  };
}

// 제작 2: 제작 1에서 확인한 버전·범위만 적용합니다. 다른 서비스 규칙과 감사 기록은 보존합니다.
export function applyPolicyRestore({ labDir, trustPath, service, confirm, now = Date.now() }) {
  const paths = labPaths(labDir, trustPath);
  const plan = diffPolicy({ labDir, trustPath, service, now });
  if (typeof confirm !== 'string' || confirm !== plan.confirmToken) {
    fail('confirmation_mismatch', '실행 확인 문구가 없거나 비교 이후 시험 정책이 바뀌었습니다. diff를 다시 실행해 확인하세요.');
  }
  const at = new Date(now).toISOString();
  if (!plan.changed) {
    appendAudit(paths, { at, action: 'policy_restore', service, toRevision: plan.backup.policyRevision,
      outcome: 'already_matching', counts: plan.counts });
    return { ...plan, outcome: 'already_matching' };
  }
  const { policy: backup, text: backupText } = loadVerifiedBackup({ labDir, trustPath, service, now });
  const { text: beforeText, store } = readStore(paths);
  const others = Object.fromEntries(Object.entries(store.services).filter(([name]) => name !== service));
  const next = { ...store, services: { ...store.services, [service]: backup } };
  writeAtomic(paths.store, `${JSON.stringify(next, null, 2)}\n`);
  // 적용 뒤 다시 읽어 대상은 사본과 같고 다른 서비스는 그대로인지 대조합니다. 다르면 이전 파일로 되돌립니다.
  const { store: after } = readStore(paths);
  const targetMatches = serializePolicy(after.services[service]) === backupText;
  const othersPreserved = JSON.stringify(Object.fromEntries(Object.entries(after.services)
    .filter(([name]) => name !== service))) === JSON.stringify(others);
  if (!targetMatches || !othersPreserved) {
    writeAtomic(paths.store, beforeText);
    fail('restore_verification_failed', '적용 결과가 사본과 다르거나 다른 서비스가 바뀌어 되돌렸습니다.');
  }
  appendAudit(paths, { at, action: 'policy_restore', service, fromRevision: plan.current.policyRevision,
    toRevision: plan.backup.policyRevision, outcome: 'restored', counts: plan.counts });
  return { ...plan, outcome: 'restored', verified: { targetMatches, othersPreserved } };
}
