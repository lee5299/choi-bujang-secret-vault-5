import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|비밀번호|암호|토큰|개인키)\s*[:=]\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;

export function isFixtureIp(value) {
  return typeof value === 'string' && isIP(value) === 4
    && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(value);
}

export function safeDescription(value) {
  if (typeof value !== 'string' || value.length > 500 || sensitive.test(value)) return '[설명 제외]';
  // 영문은 분석에 필요한 수업 단어만 남깁니다. URL·요청 인자·로그 원문은 출력하지 않습니다.
  return value.replace(/[A-Za-z_]+/gu, word => /^(?:SQL|select|script|up)$/iu.test(word) ? word : '')
    .replace(/[^가-힣A-Za-z\d\s.,·]/gu, '').replace(/[\r\n\t]+/gu, ' ').trim();
}

export function projectAlert(alert) {
  return {
    timestamp: typeof alert?.timestamp === 'string' && Number.isFinite(Date.parse(alert.timestamp))
      ? new Date(alert.timestamp).toISOString() : null,
    sourceIp: isFixtureIp(alert?.data?.srcip) ? alert.data.srcip : null,
    account: /^user\d{2,4}$/u.test(alert?.data?.srcuser ?? '') ? alert.data.srcuser : null,
    level: Number.isInteger(alert?.rule?.level) && alert.rule.level >= 0 && alert.rule.level <= 16
      ? alert.rule.level : 0,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts(path = new URL('../fixtures/web-injection.json', import.meta.url)) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'web-injection'
      || !Array.isArray(fixture.alerts)) throw new Error('웹 주입 가상 경보 형식을 확인하세요.');
  return fixture.alerts.map(projectAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const row of await readAlerts()) console.log(JSON.stringify(row));
  } catch {
    console.error('웹 주입 가상 경보 읽기 오류');
    process.exitCode = 1;
  }
}
