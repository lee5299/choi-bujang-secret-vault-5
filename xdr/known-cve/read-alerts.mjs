import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sensitive = /password|passwd|\bpwd\b|token|secret|api[_-]?key|authorization|cookie|비밀번호|암호|토큰|개인키|Bearer|-----BEGIN|\b(?:sb_secret_|sk-)|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_+/=-]{32,}/iu;

export function safeDescription(value) {
  if (typeof value !== 'string' || value.length > 500 || sensitive.test(value)) return '[설명 제외]';
  // 알려진 수업 단어 외의 영문·URL·요청 구문은 설명 전체를 제외합니다.
  const remaining = value.replace(/\bCVE-\d{4}-\d{4,7}\b|\bjndi\b/gu, '');
  if (!/^[가-힣\d\s.,·]*$/u.test(remaining)) return '[설명 제외]';
  return value.replace(/\s+/gu, ' ').trim();
}

export function projectAlert(alert) {
  const timestamp = alert?.timestamp;
  const sourceIp = alert?.data?.srcip;
  const account = alert?.data?.srcuser;
  const level = alert?.rule?.level;
  return {
    timestamp: typeof timestamp === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp)
      && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null,
    sourceIp: typeof sourceIp === 'string' && isIP(sourceIp) === 4
      && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(sourceIp) ? sourceIp : null,
    account: typeof account === 'string' && /^user\d{2,4}$/u.test(account) ? account : null,
    level: Number.isInteger(level) && level >= 0 && level <= 16 ? level : null,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts(path = new URL('../fixtures/known-cve.json', import.meta.url)) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'known-cve'
      || !Array.isArray(fixture.alerts)) throw new Error('알려진 취약점 가상 경보 형식을 확인하세요.');
  return fixture.alerts.map(projectAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const row of await readAlerts()) console.log(JSON.stringify(row));
  } catch {
    console.error('알려진 취약점 가상 경보 읽기 오류');
    process.exitCode = 1;
  }
}
