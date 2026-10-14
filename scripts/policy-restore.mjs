import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPolicyRestore, capturePolicyBackup, diffPolicy, PolicyRestoreError, STORE_SCHEMA } from '../src/policy-restore.mjs';
import { inspectResourcePolicy } from '../src/resource-policy.mjs';

// 10단계 시험 정책 복원 도구. 운영 정책(Vercel 환경변수)은 읽거나 바꾸지 않습니다.
//   npm.cmd run policy:restore -- diff --service notes
//   npm.cmd run policy:restore -- apply --service notes --confirm <diff가 보여 준 확인 문구>
//   npm.cmd run policy:restore -- backup --service notes      (침해 전 사전 백업)
//   npm.cmd run policy:restore -- drill                       (임시 폴더의 가상 연습)
const root = resolve(import.meta.dirname, '..');
export const DEFAULT_LAB = join(root, 'local-only', 'policy-lab');

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && typeof args[index + 1] === 'string' ? args[index + 1] : fallback;
}

export function formatPlan(plan) {
  const lines = [
    `서비스: ${plan.service}`,
    `복원할 버전: r${plan.backup.policyRevision} (사본 지문 ${plan.backup.sha256}… · 백업 ${plan.backup.capturedAt})`,
    `현재 버전: ${plan.current.present ? `r${plan.current.policyRevision} (지문 ${plan.current.sha256}… · 검사 ${plan.current.check})` : '없음'}`,
    `변경 범위: 추가 ${plan.counts.add} · 삭제 ${plan.counts.remove} · 수정 ${plan.counts.modify}`,
    ...plan.changes.fields.map(field => `  수정 ${field.name}: ${JSON.stringify(field.from)} → ${JSON.stringify(field.to)}`),
    ...plan.changes.grantsToRemove.map(grant => `  삭제 grant ${grant}`),
    ...plan.changes.grantsToAdd.map(grant => `  추가 grant ${grant}`),
    ...plan.changes.extraKeys.map(key => `  삭제 항목 ${key}`),
    `보존할 다른 서비스: ${plan.preservedServices.length ? plan.preservedServices.join(', ') : '없음'}`,
    plan.changed ? `실행 확인 문구: ${plan.confirmToken}` : '현재 시험 정책이 이미 사본과 같습니다.',
  ];
  return `${lines.join('\n')}\n`;
}

// 가상 연습용 권한표: A(learner_a_fixture)는 자기 메모 한 건만, B는 자기 메모 한 건만 허용합니다.
const NOTE_A = '00000000-0000-4000-8000-00000000a001';
const NOTE_B = '00000000-0000-4000-8000-00000000b001';
const DEVICE_A = 'a'.repeat(16);
const DEVICE_B = 'b'.repeat(16);
const grant = (subjectId, deviceId, method, path) => ({ subjectId, deviceId, method, path });
export function drillPolicy(now = Date.now()) {
  return { schema: 'aleph.resource-policy.v1', classId: 'class_fixture', projectId: 'project_fixture',
    service: 'notes', policyRevision: 3, expiresAt: new Date(now + 3_600_000).toISOString(),
    denyReasonCode: 'resource_forbidden', grants: [
      grant('learner_a_fixture', DEVICE_A, 'GET', `/notes/${NOTE_A}`),
      grant('learner_a_fixture', DEVICE_A, 'PUT', `/notes/${NOTE_A}`),
      grant('learner_b_fixture', DEVICE_B, 'GET', `/notes/${NOTE_B}`),
    ] };
}
export function drillAnnouncementsPolicy(now = Date.now()) {
  return { schema: 'aleph.resource-policy.v1', classId: 'class_fixture', projectId: 'project_fixture',
    service: 'announcements', policyRevision: 2, expiresAt: new Date(now + 3_600_000).toISOString(),
    denyReasonCode: 'resource_forbidden', grants: [
      grant('learner_a_fixture', DEVICE_A, 'GET', '/announcements'),
    ] };
}
export function drillRequest(subjectId, deviceId, noteId) {
  return { schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture', projectId: 'project_fixture',
    subjectId, deviceId, service: 'notes', method: 'GET', path: `/notes/${noteId}`, route: 'GET /notes/:id',
    queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'), at: new Date().toISOString(),
    policyRevision: 3, deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null } };
}
export const drillChecks = {
  aNormal: () => drillRequest('learner_a_fixture', DEVICE_A, NOTE_A),
  bReadsA: () => drillRequest('learner_b_fixture', DEVICE_B, NOTE_A),
};
// 시험 정책 저장소의 한 서비스를 판정기 권한표 형식으로 넣어 판정합니다. process.env는 바꾸지 않습니다.
export const judgeWith = (policy, request) => inspectResourcePolicy(request, JSON.stringify(policy));

export function runDrill(write = text => process.stdout.write(text)) {
  const lab = mkdtempSync(join(tmpdir(), 'aleph-stage10-policy-'));
  const trustPath = join(lab, 'trust-separate', 'anchors.json');
  const operational = process.env.ALEPH_RESOURCE_POLICY_JSON;
  try {
    const original = { schema: STORE_SCHEMA, services: { notes: drillPolicy(), announcements: drillAnnouncementsPolicy() } };
    mkdirSync(lab, { recursive: true });
    writeFileSync(join(lab, 'test-policy.json'), `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    capturePolicyBackup({ labDir: lab, trustPath, service: 'notes' });
    write('[1] 침해 전 사전 백업: notes r3 사본과 신뢰 기준 저장\n');
    // 가상 침해: 같은 버전(r3)의 notes 시험 정책에 B의 A 메모 읽기 grant를 넣고 만료를 늘립니다.
    const tampered = structuredClone(original);
    tampered.services.notes.grants.push(grant('learner_b_fixture', DEVICE_B, 'GET', `/notes/${NOTE_A}`));
    tampered.services.notes.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    writeFileSync(join(lab, 'test-policy.json'), `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    const before = judgeWith(tampered.services.notes, drillChecks.bReadsA());
    write(`[2] 가상 침해 뒤 B의 A 메모 요청: ${before.allowed ? '허용(침해 상태)' : '거부'}\n`);
    const plan = diffPolicy({ labDir: lab, trustPath, service: 'notes' });
    write(`[3] 실행 전 비교 (아직 아무것도 바꾸지 않음)\n${formatPlan(plan)}`);
    let refused = false;
    try { applyPolicyRestore({ labDir: lab, trustPath, service: 'notes', confirm: 'wrong' }); }
    catch (error) { refused = error instanceof PolicyRestoreError && error.code === 'confirmation_mismatch'; }
    write(`[4] 확인 문구 없이 실행: ${refused ? '거부(변경 0건)' : '예상과 다름'}\n`);
    const result = applyPolicyRestore({ labDir: lab, trustPath, service: 'notes', confirm: plan.confirmToken });
    // 복원된 파일을 다시 읽어 판정합니다.
    const restored = JSON.parse(readFileSync(join(lab, 'test-policy.json'), 'utf8')).services.notes;
    const aNormal = judgeWith(restored, drillChecks.aNormal());
    const bReadsA = judgeWith(restored, drillChecks.bReadsA());
    write(`[5] 복원 결과: ${result.outcome} · 대상 일치 ${result.verified.targetMatches} · 다른 서비스 보존 ${result.verified.othersPreserved}\n`);
    write(`[6] 복원 뒤 A 정상 요청: ${aNormal.allowed ? 'allow' : 'deny'} · B의 A 메모 요청: ${bReadsA.allowed ? 'allow' : `deny(${bReadsA.reasonCode})`}\n`);
    const ok = before.allowed && refused && result.outcome === 'restored' && aNormal.allowed && !bReadsA.allowed
      && process.env.ALEPH_RESOURCE_POLICY_JSON === operational;
    write(`[7] 운영 정책 환경변수: ${process.env.ALEPH_RESOURCE_POLICY_JSON === operational ? '변경 없음' : '바뀜(오류)'}\n`);
    write(ok ? '가상 연습 통과. 심판 판정이나 운영 정책 복원 결과가 아닙니다.\n' : '가상 연습 실패\n');
    return ok;
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const labDir = option(args, 'lab', DEFAULT_LAB);
  const trustPath = option(args, 'trust', undefined);
  const service = option(args, 'service', 'notes');
  try {
    if (command === 'diff') process.stdout.write(formatPlan(diffPolicy({ labDir, trustPath, service })));
    else if (command === 'apply') {
      const result = applyPolicyRestore({ labDir, trustPath, service, confirm: option(args, 'confirm', '') });
      process.stdout.write(`${formatPlan(result)}결과: ${result.outcome}\n`);
    } else if (command === 'backup') {
      const result = capturePolicyBackup({ labDir, trustPath, service });
      process.stdout.write(`사전 백업 ${result.created ? '저장' : '이미 있음'}: ${result.service} r${result.policyRevision} · 지문 ${result.sha256.slice(0, 12)}…\n`);
    } else if (command === 'drill') {
      if (!runDrill()) process.exitCode = 1;
    } else {
      process.stdout.write('사용법: policy:restore -- <diff|apply|backup|drill> [--service notes] [--lab 폴더] [--trust 파일] [--confirm 문구]\n');
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`중단(${error.code ?? 'error'}): ${error.message}\n변경 없음. 실제 운영 정책은 건드리지 않았습니다.\n`);
    process.exitCode = 1;
  }
}
