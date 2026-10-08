// patterns.json의 패턴 사본. 숫자 기준은 가상 연습용이며 MITRE가 지정한 숫자가 아닙니다.
const PATTERNS = [
  {
    name: 'password_guessing',
    condition: {
      signal: '같은 주소·계정의 반복 로그인 실패 또는 계정을 바꾸며 이어지는 대입 실패',
      windowSeconds: 180,
      minFailures: 20,
      minLevel: 10,
      require: '짧은 시간, 명시적인 반복 대입, 성공 없는 대량 실패 중 하나. 단일 실패는 주소·계정별 시간 창으로 합산하고 요약 경보는 중복 합산하지 않음',
    },
    evidence: 'MITRE ATT&CK T1110.001: 알 수 없는 비밀번호를 반복적으로 추측하여 계정 접근을 시도합니다.',
    source: 'https://attack.mitre.org/techniques/T1110/001/',
  },
  {
    name: 'password_spraying',
    condition: {
      signal: '같은 주소에서 여러 계정에 같은 비밀번호를 대입했다는 경보',
      minAccounts: 8,
      minLevel: 10,
      require: '동일 비밀번호 대입이라는 요약 신호와 다계정 수. 비밀번호 값 자체는 읽거나 보관하지 않음',
    },
    evidence: 'MITRE ATT&CK T1110.003: 하나 또는 소수의 비밀번호를 여러 계정에 대입하는 형태입니다.',
    source: 'https://attack.mitre.org/techniques/T1110/003/',
  },
];

const [guessing, spraying] = PATTERNS;
// 순서대로 받은 단일 경보만 메모리에 집계합니다. 파일·외부 서비스는 사용하지 않습니다.
const history = new Map();
const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|비밀번호|암호|토큰|키)\s*[:=]\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;

function positiveCount(value) {
  return /^[1-9]\d{0,5}$/u.test(String(value ?? '')) ? Number(value) : 0;
}

function validIp(value) {
  return typeof value === 'string' && value.split('.').length === 4
    && value.split('.').every(part => /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255);
}

function result(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

// Wazuh 원본 또는 확인용 다섯 항목을 받아 즉시 답합니다. 원문·주소·계정은 반환하지 않습니다.
export function decide(alert) {
  const sourceIp = alert?.data?.srcip ?? alert?.sourceIp;
  const account = alert?.data?.srcuser ?? alert?.account;
  const levelValue = alert?.rule?.level ?? alert?.level;
  const level = Number.isInteger(levelValue) && levelValue >= 0 && levelValue <= 16 ? levelValue : 0;
  const description = alert?.rule?.description ?? alert?.description;
  const text = typeof description === 'string' && description.length <= 500 && !sensitive.test(description)
    ? description.replace(/[\r\n\t]+/gu, ' ').trim() : '';
  const timestamp = typeof alert?.timestamp === 'string' ? Date.parse(alert.timestamp) : NaN;
  const samePassword = /같은 비밀번호/u.test(text);
  const pattern = samePassword ? spraying.name : guessing.name;
  if (!Number.isFinite(timestamp) || !validIp(sourceIp)
      || typeof account !== 'string' || !account.trim() || account.length > 128
      || !text || text === '[설명 제외]') return result(0.5, pattern);

  const count = positiveCount(alert?.data?.count)
    || positiveCount(text.match(/(?:로그인\s*)?실패(?:가)?\s*(\d+)건/u)?.[1]);
  const accountList = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').map(value => value.trim()).filter(value => value && value.length <= 128) : [];
  const accountCount = Math.max(new Set(accountList).size,
    positiveCount(text.match(/계정\s*(\d+)개/u)?.[1]),
    positiveCount(text.match(/계정에?\s*(\d+)개/u)?.[1]));
  const time = text.match(/(\d+)\s*(분|초)\s*(?:안|동안)/u);
  const windowSeconds = time ? Number(time[1]) * (time[2] === '분' ? 60 : 1) : null;
  const shortWindow = windowSeconds !== null && windowSeconds > 0
    && windowSeconds <= guessing.condition.windowSeconds;
  const noSuccess = /성공은? 없/u.test(text);
  const afterSuccess = /성공/u.test(text) && !noSuccess;
  const failure = /실패/u.test(text)
    || samePassword && /여러 계정/u.test(text) && /연속/u.test(text);
  const mitre = Array.isArray(alert?.rule?.mitre)
    && alert.rule.mitre.some(value => /^T1110(?:\.00[1-4])?$/u.test(value));
  const login = /로그인|계정|비밀번호/u.test(text) || mitre;
  const repeated = /이어|연속|한 글자씩|같은 간격|계정 이름을 바꿔/u.test(text);

  // 높은 수준이나 ATT&CK 표식만 붙은 정상 사건도 기록으로 남깁니다.
  if (!failure || !login || !mitre && level <= 3 && count <= 1) return result(0.1, '패턴 없음');

  let accumulated = 0;
  if (count <= 1 && !afterSuccess) {
    const key = JSON.stringify([sourceIp, account]);
    const cutoff = timestamp - guessing.condition.windowSeconds * 1000;
    const previous = history.get(key);
    const latest = Math.max(previous?.latest ?? timestamp, timestamp);
    const entries = (previous?.entries ?? []).filter(item => item.at >= latest - guessing.condition.windowSeconds * 1000);
    const id = typeof alert?.id === 'string' && alert.id.length <= 128 ? alert.id : String(timestamp);
    if (timestamp >= latest - guessing.condition.windowSeconds * 1000 && !entries.some(item => item.id === id)) {
      entries.push({ id, at: timestamp });
    }
    history.set(key, { latest, entries });
    accumulated = entries.filter(item => item.at >= cutoff && item.at <= timestamp).length;
  }

  const clearGuessing = !afterSuccess && level >= guessing.condition.minLevel
    && (accumulated >= guessing.condition.minFailures
      || count >= guessing.condition.minFailures && (windowSeconds !== null ? shortWindow : repeated || noSuccess));
  const clearSpraying = !afterSuccess && samePassword && level >= spraying.condition.minLevel
    && accountCount >= spraying.condition.minAccounts;
  if (clearGuessing || clearSpraying) return result(0.95, pattern);

  // 필수 차단 조건이 부족하면 보조 신호를 더해도 0.85 미만입니다.
  // 모델의 공격 확률이 아니라 위 패턴과의 일치 정도입니다.
  const confidence = 0.5 + (level >= guessing.condition.minLevel ? 0.08 : 0)
    + (count >= 5 || accumulated >= 5 ? 0.08 : 0) + (shortWindow ? 0.08 : 0)
    + (repeated || samePassword ? 0.06 : 0) + (mitre ? 0.03 : 0);
  return result(Number(confidence.toFixed(2)), pattern);
}
