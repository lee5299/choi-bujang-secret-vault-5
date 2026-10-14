import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyPolicyRestore, capturePolicyBackup, diffPolicy, PolicyRestoreError, STORE_SCHEMA } from '../src/policy-restore.mjs';
import { drillAnnouncementsPolicy, drillChecks, drillPolicy, formatPlan, judgeWith, runDrill } from '../scripts/policy-restore.mjs';

// 임시 폴더의 가상 시험 정책만 사용합니다. 운영 정책 환경변수는 읽거나 바꾸지 않습니다.
function lab(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aleph-stage10-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const labDir = join(dir, 'lab');
  const trustPath = join(dir, 'trust', 'anchors.json');
  mkdirSync(labDir, { recursive: true });
  const store = { schema: STORE_SCHEMA, services: { notes: drillPolicy(), announcements: drillAnnouncementsPolicy() } };
  const writeStore = value => writeFileSync(join(labDir, 'test-policy.json'), `${JSON.stringify(value, null, 2)}\n`);
  writeStore(store);
  const files = () => Object.fromEntries(['test-policy.json', 'audit.jsonl'].map(name =>
    [name, existsSync(join(labDir, name)) ? readFileSync(join(labDir, name), 'utf8') : null]));
  const tamper = () => {
    const next = structuredClone(store);
    next.services.notes.grants.push({ subjectId: 'learner_b_fixture', deviceId: 'b'.repeat(16), method: 'GET',
      path: '/notes/00000000-0000-4000-8000-00000000a001' });
    next.services.notes.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    writeStore(next);
    return next;
  };
  return { labDir, trustPath, store, writeStore, files, tamper, opts: { labDir, trustPath, service: 'notes' } };
}
const code = fn => { try { fn(); } catch (error) { assert.ok(error instanceof PolicyRestoreError); return error.code; } return null; };

test('P1: 사본이 없거나 검증에 실패하면 비교·복원을 중단하고 아무것도 바꾸지 않는다', t => {
  const env = lab(t);
  const before = env.files();
  assert.equal(code(() => diffPolicy(env.opts)), 'backup_missing');
  assert.equal(code(() => applyPolicyRestore({ ...env.opts, confirm: 'x' })), 'backup_missing');
  assert.deepEqual(env.files(), before);

  capturePolicyBackup(env.opts);
  const backupFile = join(env.labDir, 'backups', 'notes-r3.json');
  const original = readFileSync(backupFile, 'utf8');
  writeFileSync(backupFile, original.replace('resource_forbidden', 'resource_allowed'));
  const afterBackup = env.files();
  assert.equal(code(() => diffPolicy(env.opts)), 'backup_integrity_failed');
  assert.deepEqual(env.files(), afterBackup);
  rmSync(backupFile);
  assert.equal(code(() => diffPolicy(env.opts)), 'backup_missing');
  writeFileSync(backupFile, original);
  assert.equal(code(() => diffPolicy({ ...env.opts, now: Date.now() + 7_200_000 })), 'backup_invalid');
  // 신뢰 기준이 깨졌으면 사본을 믿지 않습니다.
  writeFileSync(env.trustPath, '{"schema":"aleph.policy-trust.v1","anchors":[{"service":"notes"}]}');
  assert.equal(code(() => diffPolicy(env.opts)), 'trust_invalid');
});

test('P1: 실행 전 비교는 복원 버전·현재 버전·변경 범위를 보여 주고 파일을 바꾸지 않는다', t => {
  const env = lab(t);
  capturePolicyBackup(env.opts);
  env.tamper();
  const before = env.files();
  const plan = diffPolicy(env.opts);
  assert.deepEqual(env.files(), before);
  assert.equal(plan.backup.policyRevision, 3);
  assert.equal(plan.current.policyRevision, 3);
  assert.deepEqual(plan.counts, { add: 0, remove: 1, modify: 1 });
  assert.deepEqual(plan.changes.fields.map(field => field.name), ['expiresAt']);
  assert.deepEqual(plan.preservedServices, ['announcements']);
  assert.match(plan.confirmToken, /^[0-9a-f]{16}$/u);
  const text = formatPlan(plan);
  assert.match(text, /복원할 버전: r3/u);
  assert.match(text, /변경 범위: 추가 0 · 삭제 1 · 수정 1/u);
  // 가명 주체·기기 ID 원문은 표시하지 않습니다.
  assert.doesNotMatch(text, /learner_b_fixture|bbbbbbbbbbbbbbbb/u);
});

test('P2: 확인 문구가 맞을 때만 대상 서비스를 사본으로 되돌리고 다른 서비스·감사 기록은 보존한다', t => {
  const env = lab(t);
  const operational = process.env.ALEPH_RESOURCE_POLICY_JSON;
  capturePolicyBackup(env.opts);
  const tampered = env.tamper();
  assert.equal(judgeWith(tampered.services.notes, drillChecks.bReadsA()).allowed, true);
  const plan = diffPolicy(env.opts);
  const before = env.files();
  assert.equal(code(() => applyPolicyRestore({ ...env.opts, confirm: 'wrong' })), 'confirmation_mismatch');
  assert.equal(code(() => applyPolicyRestore(env.opts)), 'confirmation_mismatch');
  assert.deepEqual(env.files(), before);

  const auditBefore = readFileSync(join(env.labDir, 'audit.jsonl'), 'utf8');
  const result = applyPolicyRestore({ ...env.opts, confirm: plan.confirmToken });
  assert.equal(result.outcome, 'restored');
  assert.deepEqual(result.verified, { targetMatches: true, othersPreserved: true });
  const after = JSON.parse(readFileSync(join(env.labDir, 'test-policy.json'), 'utf8'));
  assert.deepEqual(after.services.notes, env.store.services.notes);
  assert.deepEqual(after.services.announcements, tampered.services.announcements);
  const auditAfter = readFileSync(join(env.labDir, 'audit.jsonl'), 'utf8');
  assert.ok(auditAfter.startsWith(auditBefore));
  const added = auditAfter.slice(auditBefore.length).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(added.length, 1);
  assert.equal(added[0].outcome, 'restored');
  // 확인: B의 A 자료 요청은 다시 거부, A 정상 요청은 유지.
  assert.equal(judgeWith(after.services.notes, drillChecks.aNormal()).allowed, true);
  const denied = judgeWith(after.services.notes, drillChecks.bReadsA());
  assert.equal(denied.allowed, false);
  assert.equal(denied.reasonCode, 'resource_forbidden');
  assert.equal(process.env.ALEPH_RESOURCE_POLICY_JSON, operational);

  const again = diffPolicy(env.opts);
  assert.equal(again.changed, false);
  assert.equal(applyPolicyRestore({ ...env.opts, confirm: again.confirmToken }).outcome, 'already_matching');
});

test('P2: 비교 뒤 시험 정책이 바뀌면 이전 확인 문구로 적용하지 않는다', t => {
  const env = lab(t);
  capturePolicyBackup(env.opts);
  env.tamper();
  const plan = diffPolicy(env.opts);
  const changed = JSON.parse(readFileSync(join(env.labDir, 'test-policy.json'), 'utf8'));
  changed.services.announcements.grants = [];
  env.writeStore(changed);
  const before = env.files();
  assert.equal(code(() => applyPolicyRestore({ ...env.opts, confirm: plan.confirmToken })), 'confirmation_mismatch');
  assert.deepEqual(env.files(), before);
});

test('사전 백업은 유효한 시험 정책에서만 만들고 같은 버전의 다른 사본으로 덮어쓰지 않는다', t => {
  const env = lab(t);
  assert.equal(capturePolicyBackup(env.opts).created, true);
  assert.equal(capturePolicyBackup(env.opts).created, false);
  env.tamper();
  assert.equal(code(() => capturePolicyBackup(env.opts)), 'backup_exists');
  const broken = { schema: STORE_SCHEMA, services: { notes: { schema: 'wrong' } } };
  env.writeStore(broken);
  assert.equal(code(() => capturePolicyBackup(env.opts)), 'policy_invalid');
});

test('policy:restore drill 가상 연습이 통과한다', () => {
  const lines = [];
  assert.equal(runDrill(text => lines.push(text)), true);
  const output = lines.join('');
  assert.match(output, /복원 뒤 A 정상 요청: allow · B의 A 메모 요청: deny\(resource_forbidden\)/u);
  assert.match(output, /운영 정책 환경변수: 변경 없음/u);
});
