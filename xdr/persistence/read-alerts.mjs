import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|비밀번호|암호|토큰|개인키)["']?\s*(?:[:=]|은|는)?\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;
const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

export function safeDescription(value) {
  if (typeof value !== 'string' || value.length > 500 || sensitive.test(value)) return '[설명 제외]';
  // 수업용 계정 이름만 남기고 경로·URL·임의 영문 문자열은 출력하지 않습니다.
  const text = value.replace(/[A-Za-z0-9_./:@+\\=-]+/gu,
    word => /^(?:user\d{2,4}|svc-lab|\d{1,6}|\.+)$/u.test(word) ? word : '')
    .replace(/[^가-힣A-Za-z\d\s.,·-]/gu, '').replace(/\s+/gu, ' ').trim();
  return text || '[설명 제외]';
}

export function projectAlert(alert) {
  const at = alert?.timestamp;
  const ip = alert?.data?.srcip;
  const account = alert?.data?.srcuser;
  return {
    timestamp: typeof at === 'string' && isoTime.test(at) && Number.isFinite(Date.parse(at))
      ? new Date(at).toISOString() : null,
    sourceIp: typeof ip === 'string' && isIP(ip) === 4
      && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(ip) ? ip : null,
    account: typeof account === 'string' && /^(?:user\d{2,4}|svc-lab)$/u.test(account) ? account : null,
    level: Number.isInteger(alert?.rule?.level) && alert.rule.level >= 0 && alert.rule.level <= 16
      ? alert.rule.level : 0,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts(path = new URL('../fixtures/persistence.json', import.meta.url)) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'persistence'
      || !Array.isArray(fixture.alerts)) throw new Error('지속성 경보 형식을 확인하세요.');
  // 안전하지 않은 항목도 자리표시자로 남겨 원본 건수를 유지합니다.
  return Array.from(fixture.alerts, projectAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rows = await readAlerts();
    for (const row of rows) console.log(JSON.stringify(row));
    console.error(`경보 ${rows.length}건 · 추출 ${rows.length}줄`);
  } catch {
    // JSON 파싱 오류에도 원문 일부가 들어갈 수 있으므로 오류 객체는 출력하지 않습니다.
    console.error('지속성 가상 경보 읽기 실패: 파일과 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
