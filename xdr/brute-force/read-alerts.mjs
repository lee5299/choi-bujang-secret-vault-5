import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);
const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|비밀번호|암호|토큰|키)\s*[:=]\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;

// 이번 모듈의 입력은 문서용 IP와 가상 계정으로 구성된 수업 경보입니다.
// 실제 개인정보가 들어온 경우 원문을 반환하지 않습니다.
export function isFixtureIp(value) {
  return typeof value === 'string' && isIP(value) === 4
    && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(value);
}

export function safeDescription(value) {
  if (typeof value !== 'string' || value.length > 500 || sensitive.test(value)) return '[설명 제외]';
  // 임의 로그 원문 대신 로그인 분석에 필요한 한국어 신호와 숫자만 남깁니다.
  return value.replace(/[^가-힣\d\s.,·]/gu, '').replace(/[\r\n\t]+/gu, ' ').trim();
}

export function projectAlert(alert) {
  const timestamp = typeof alert?.timestamp === 'string' && Number.isFinite(Date.parse(alert.timestamp))
    ? new Date(alert.timestamp).toISOString() : null;
  return {
    timestamp,
    sourceIp: isFixtureIp(alert?.data?.srcip) ? alert.data.srcip : null,
    account: /^user\d{2,4}$/u.test(alert?.data?.srcuser ?? '') ? alert.data.srcuser : null,
    level: Number.isInteger(alert?.rule?.level) && alert.rule.level >= 0 && alert.rule.level <= 16
      ? alert.rule.level : 0,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts(path = fixtureUrl) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts)) throw new Error('무차별 로그인 가상 경보 형식을 확인하세요.');
  return fixture.alerts.map(projectAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rows = await readAlerts();
    for (const row of rows) console.log(JSON.stringify(row));
    console.error(`경보 ${rows.length}건 · 추출 ${rows.length}줄`);
  } catch {
    console.error('경보 읽기 실패: 가상 경보 파일과 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
