import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readAlerts, projectAlert } from '../xdr/exfiltration/read-alerts.mjs';

const fixtureUrl = new URL('../xdr/fixtures/exfiltration.json', import.meta.url);
const readerUrl = new URL('../xdr/exfiltration/read-alerts.mjs', import.meta.url);

test('X06-R1: CLI outputs one five-field JSON line per original alert without changing fixture', async () => {
  const before = await readFile(fixtureUrl);
  const fixture = JSON.parse(before);
  const output = execFileSync(process.execPath, [fileURLToPath(readerUrl)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = output.trim().split('\n');
  assert.equal(lines.length, fixture.alerts.length);
  assert.equal(lines.length, 30);
  const rows = lines.map(line => JSON.parse(line));
  assert.deepEqual(rows, await readAlerts());
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(Object.keys(row), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
    assert.equal(row.timestamp, new Date(fixture.alerts[index].timestamp).toISOString());
    assert.equal(row.sourceIp, fixture.alerts[index].data.srcip);
    assert.equal(row.account, fixture.alerts[index].data.srcuser);
    assert.equal(row.level, fixture.alerts[index].rule.level);
    assert.equal(row.description, fixture.alerts[index].rule.description);
  }
  assert.deepEqual(await readFile(fixtureUrl), before);
});

test('X06-R2: sensitive fields and descriptions never appear; invalid fields retain a placeholder row', async () => {
  const marker = 'dummy-sensitive-value';
  const dir = await mkdtemp(join(tmpdir(), 'xdr-exfiltration-reader-'));
  try {
    const alerts = ['token=', 'password=', '비밀번호는 ', 'Bearer ', 'secret=', 'api_key=']
      .map(prefix => ({ timestamp: marker, data: { srcip: marker, srcuser: marker, token: marker },
        rule: { level: 17, description: prefix + marker }, extra: marker }));
    alerts.push(null);
    const path = join(dir, 'fixture.json');
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'exfiltration', alerts }));
    const rows = await readAlerts(path);
    assert.equal(rows.length, alerts.length);
    assert.ok(!JSON.stringify(rows).includes(marker));
    for (const row of rows) assert.deepEqual(row,
      { timestamp: null, sourceIp: null, account: null, level: null, description: '[설명 제외]' });
    for (const level of [0, 16]) assert.equal(projectAlert({ rule: { level } }).level, level);
    for (const level of [-1, 17, '12', 1.5]) assert.equal(projectAlert({ rule: { level } }).level, null);
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'privilege', alerts }));
    await assert.rejects(readAlerts(path), /가상 경보 형식/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('X06-R3: every exfiltration pattern has conditions, single-line evidence and the matching official source', async () => {
  const list = JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json', import.meta.url), 'utf8'));
  assert.equal(list.schema, 'aleph.xdr.patterns.v1');
  assert.equal(list.moduleKey, 'exfiltration');
  assert.deepEqual(list.techniques, ['T1041', 'T1048']);
  assert.equal(new Set(list.patterns.map(pattern => pattern.name)).size, list.patterns.length);
  assert.ok(list.patterns.length > 0);
  for (const pattern of list.patterns) {
    assert.match(pattern.name, /^[a-z][a-z0-9_]+$/);
    for (const key of ['signal', 'require', 'exclude']) {
      assert.equal(typeof pattern.condition[key], 'string');
      assert.ok(pattern.condition[key].trim().length > 0);
    }
    assert.ok(pattern.evidence.trim().length > 0);
    assert.doesNotMatch(pattern.evidence, /[\r\n\u2028\u2029]/);
    const technique = /^https:\/\/attack\.mitre\.org\/techniques\/(T1041|T1048)\/$/.exec(pattern.source)?.[1];
    assert.ok(technique);
    assert.ok(pattern.evidence.includes(technique));
  }
});

// 판단 파일을 파일·네트워크 기능이 없는 별도 실행 영역에서 검증합니다.
const judgeSource = await readFile(new URL('../xdr/exfiltration/decide.mjs', import.meta.url), 'utf8');
const { Script } = await import('node:vm');
const isolatedDecide = new Script(judgeSource.replace('export function decide', 'function decide') + '\ndecide;')
  .runInNewContext({}, { timeout: 1000 });
const judgeModule = await import('../xdr/exfiltration/decide.mjs');
const makeAlert = (description, data = {}, level = 12) => ({ rule: { description, level, mitre: ['T1048'] },
  data: { dstip: '203.0.113.50', bytes: '80000000', ...data } });

 test('X06-R4: exports only synchronous decide, embeds exact patterns, works alone and preserves input', async () => {
  assert.deepEqual(Object.keys(judgeModule), ['decide']);
  assert.doesNotMatch(judgeSource, /\b(?:import|require|fetch|process|readFile|writeFile|XMLHttpRequest|WebSocket|eval)\s*(?:\(|\.|\{)|\bimport\s/);
  const embedded = new Script(judgeSource.replace('export function decide', 'function decide') + '\nJSON.stringify(PATTERNS);')
    .runInNewContext({}, { timeout: 1000 });
  const list = JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(embedded), list.patterns);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const alert = freeze(makeAlert('명령 통로로 자료가 전송됐습니다.'));
  const before = JSON.stringify(alert);
  const outcome = isolatedDecide(alert);
  assert.equal(typeof outcome?.then, 'undefined');
  assert.equal(JSON.stringify(alert), before);
  assert.equal(JSON.stringify(outcome), JSON.stringify(judgeModule.decide(alert)));
  const dir = await mkdtemp(join(tmpdir(), 'xdr-exfiltration-alone-'));
  try {
    const path = join(dir, 'decide.mjs');
    await writeFile(path, judgeSource);
    const loaded = execFileSync(process.execPath, ['--input-type=module', '-e',
      'const m=await import("./decide.mjs"); console.log(JSON.stringify(m.decide('+JSON.stringify(alert)+')));'], { cwd: dir, encoding: 'utf8' });
    assert.equal(JSON.parse(loaded).action, 'block');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('X06-R5: fixture contents classify clear, ambiguous and normal events and respect confidence boundaries', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  for (const alert of fixture.alerts) {
    const output = judgeModule.decide(alert);
    const index = Number(alert.id.split('-')[1]);
    assert.equal(output.action, index <= 10 ? 'block' : index <= 20 ? 'alert' : 'record', alert.id);
    assert.deepEqual(Object.keys(output), ['action', 'confidence', 'reason']);
    assert.ok(Number.isFinite(output.confidence) && output.confidence >= 0 && output.confidence <= 1);
    assert.equal(output.action, output.confidence >= 0.85 ? 'block' : output.confidence >= 0.5 ? 'alert' : 'record');
    assert.match(output.reason, /^(?:unfamiliar_destination_bulk_transfer|command_channel_data_transfer|outside_business_hours_archive_transfer|no_matching_pattern)$/);
  }
});

test('X06-R6: paraphrased Korean and English positive signals work without alert IDs or MITRE tags', () => {
  const cases = [
    ['낯선 목적지로 대용량 자료가 전송되었습니다.', {}, 'block'],
    ['Large files were transferred to an unfamiliar destination.', {}, 'block'],
    ['Compressed archives were sent to a new destination outside business hours.', {}, 'block'],
    ['Data was exfiltrated over a C2 channel.', {bytes:'1200'}, 'block'],
    ['명령 채널로 작은 자료가 전송됐습니다.', {bytes:'2000'}, 'block'],
    ['처음 보는 주소로 작은 파일이 나갔습니다.', {bytes:'400'}, 'alert'],
    ['명령 통로에 짧은 자료 이름만 보였습니다.', {bytes:'900'}, 'alert'],
    ['수업 자료 주소로 작은 동기화가 끝났습니다.', {bytes:'900'}, 'record'],
  ];
  for (const [text, data, action] of cases) {
    const alert = makeAlert(text, data); delete alert.rule.mitre;
    assert.equal(judgeModule.decide(alert).action, action, text);
  }
});

test('X06-R6: failed, absent, partial, approved and negated signals never become successful exfiltration', () => {
  for (const text of [
    '처음 보는 목적지로 대용량 전송이 실패했습니다.',
    '업무 시간 밖 압축 파일 전송이 차단됐습니다.',
    '명령 통로로 큰 파일을 전송하지 않았습니다.',
    '압축 파일을 만들었습니다. 외부 전송은 아직 없습니다.',
    'Large files were not transferred to an unfamiliar destination.',
    'No external transfer occurred over the C2 channel.',
    'An archive transfer to a new destination was cancelled.',
    '처음 보는 목적지로 큰 압축 파일 일부만 나갔습니다.',
    '승인된 정상 백업으로 큰 파일이 전송됐습니다.',
    'Approved backup transferred large files to a new destination.',
    '처음 보는 주소가 아닙니다. 작은 파일이 나갔습니다.',
  ]) assert.notEqual(judgeModule.decide(makeAlert(text)).action, 'block', text);
});

test('X06-R6: severity combines with transfer signals without fixed volume or repetition thresholds', () => {
  for (const level of [0, 2, 3, 5, 8, 9, 10, 16, -1, 17, '12', null]) {
    assert.equal(judgeModule.decide(makeAlert('내 메모 한 건을 읽었습니다.', {}, level)).action, 'record');
    assert.equal(judgeModule.decide(makeAlert('명령 통로로 자료가 전송됐습니다.', {bytes:'20'}, level)).action, 'block');
    assert.equal(judgeModule.decide(makeAlert('처음 보는 목적지로 대용량 자료가 전송됐습니다.', {}, level)).action, Number.isInteger(level) && level >= 10 && level <= 16 ? 'block' : 'alert');
  }
  for (const bytes of ['1','49999999','50000000','999999999']) {
    for (const count of ['1','4','5','100']) {
      assert.equal(judgeModule.decide(makeAlert('처음 보는 목적지로 파일이 전송됐습니다.', {bytes,count})).action, 'block');
      assert.equal(judgeModule.decide(makeAlert('명령 통로로 자료가 전송됐습니다.', {bytes,count})).action, 'block');
    }
  }
  for (const value of [-1,'NaN','Infinity','1e9','9007199254740992']) {
    assert.notEqual(judgeModule.decide(makeAlert('명령 통로로 자료가 전송됐습니다.',{bytes:value})).action,'block');
  }
  assert.notEqual(judgeModule.decide(makeAlert('명령 통로로 자료가 전송됐습니다.',{dstip:undefined})).action,'block');
  for(const alert of [null,undefined,[],{}, {rule:{description:'a'.repeat(2001),level:16}}]) assert.equal(judgeModule.decide(alert).action,'record');
});

test('X06-R7: explicit protocol relationships are supported without becoming mandatory block wording', () => {
  for (const description of [
    '기존 명령 통로와 다른 프로토콜로 자료가 전송됐습니다.',
    'Files were transferred using a different protocol than the existing C2 channel.',
    'Archived files were sent over a non-C2 protocol outside business hours.',
  ]) assert.equal(judgeModule.decide(makeAlert(description,{bytes:'20'},2)).action,'block',description);
  for(const description of [
    '평소에 쓰지 않던 포트로 자료가 전송됐습니다.',
    '명령 통로와 같은 프로토콜인지 다른 프로토콜인지 확인되지 않았습니다. 자료 전송은 실패했습니다.',
    '기존 명령 통로와 다른 프로토콜로 자료를 전송하지 않았습니다.',
    '명령 통로가 아닙니다. 작은 자료가 전송됐습니다.',
    'A heartbeat was sent over a C2 channel.',
    '명령 통로와 다른 프로토콜인지 확인되지 않았습니다. 자료가 전송됐습니다.',
    'Files were sent with a different protocol than the existing C2 channel, but the protocol relationship is unconfirmed.',
    '기존 명령 통로와 다른 프로토콜이 아닙니다. 자료가 전송됐습니다.',
  ]) assert.notEqual(judgeModule.decide(makeAlert(description,{},7)).action,'block',description);
});

test('X06-R8: structured files and count survive wording changes while severity alone cannot block', () => {
  for(const data of [{files:'60'},{count:'8'}]) {
    assert.equal(judgeModule.decide(makeAlert('자료가 전송됐습니다.',data,12)).action,'block');
    assert.equal(judgeModule.decide(makeAlert('Data was transferred.',data,7)).action,'alert');
    assert.notEqual(judgeModule.decide(makeAlert('자료가 전송됐습니다.',{...data,bytes:'0'},12)).action,'block');
    assert.notEqual(judgeModule.decide(makeAlert('자료가 전송됐습니다.',{...data,dstip:undefined},12)).action,'block');
  }
  assert.equal(judgeModule.decide(makeAlert('자료가 전송됐습니다.',{files:'1',count:'1'},16)).action,'record');
  assert.equal(judgeModule.decide({rule:{level:16,mitre:['T1048']}}).action,'record');
  for(const text of ['전송 실패입니다. 처음 보는 목적지입니다.','외부 전송은 없습니다. 압축 파일을 만들었습니다.','처음 보는 주소로 작은 파일이 나갔습니다.','승인된 정상 백업으로 자료가 전송됐습니다.']) {
    assert.notEqual(judgeModule.decide(makeAlert(text,{files:'200',count:'15'},16)).action,'block',text);
  }
  const preparation=judgeModule.decide(makeAlert('압축 파일을 만들었습니다. 외부 전송은 아직 없습니다.',{dstip:undefined},5));
  assert.equal(preparation.action,'alert');
  assert.ok(preparation.confidence>0.5 && preparation.confidence<0.85);
});

test('X06-R8: fixture paraphrases and renamed identifiers preserve content-based decisions', async () => {
  const fixture=JSON.parse(await readFile(fixtureUrl,'utf8'));
  const source=JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json',import.meta.url),'utf8'));
  const embedded=new Script(judgeSource.replace('export function decide','function decide')+'\nJSON.stringify(POLICY);').runInNewContext({}, {timeout:1000});
  assert.deepEqual(JSON.parse(embedded),source.decisionPolicy);
  for(const alert of fixture.alerts) {
    const changed=structuredClone(alert);
    changed.id='renamed-event';
    changed.rule.description=changed.rule.description.replaceAll('처음 보는','낯선').replaceAll('업무 시간 밖','수업 시간 밖').replaceAll('나갔습니다','전송되었습니다').replaceAll('전송됐습니다','전송되었습니다');
    assert.equal(judgeModule.decide(changed).action,judgeModule.decide(alert).action,alert.id);
  }
});
