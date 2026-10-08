// patterns.json의 패턴 사본. 숫자 기준은 가상 연습용입니다.
const PATTERNS = [
  {
    "name": "sql_injection",
    "condition": {
      "signal": "요청 인자의 SQL 결합·조건 우회 구문 또는 이를 명시한 수업 경보",
      "minAttempts": 8,
      "windowSeconds": 180,
      "minLevel": 10,
      "require": "명확한 SQL 신호와 같은 주소의 반복. select·SQL 단어 하나만으로 차단하지 않음"
    },
    "evidence": "MITRE ATT&CK T1190의 공개 웹 앱 악용 사례에는 SQL 주입이 있으며 OWASP는 입력을 통한 SQL 구문 삽입을 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1190/",
    "detailSource": "https://community.owasp.org/attacks/SQL_Injection"
  },
  {
    "name": "script_injection",
    "condition": {
      "signal": "요청 인자의 script 태그 또는 스크립트 삽입을 명시한 수업 경보",
      "minAttempts": 8,
      "windowSeconds": 180,
      "minLevel": 10,
      "require": "명확한 삽입 표식과 같은 주소의 반복. script 수업 단어만으로 차단하지 않음"
    },
    "evidence": "OWASP XSS는 웹 앱에 악성 스크립트를 주입하는 형태를 설명하며 이 패턴은 T1190 연습의 웹 요청 주입 신호로 사용합니다.",
    "source": "https://attack.mitre.org/techniques/T1190/",
    "detailSource": "https://community.owasp.org/attacks/xss/"
  },
  {
    "name": "path_traversal",
    "condition": {
      "signal": "요청 인자의 ../ 또는 ..\\ 두 단계 이상 또는 경로 이탈을 명시한 수업 경보",
      "minAttempts": 8,
      "windowSeconds": 180,
      "minLevel": 10,
      "require": "명확한 경로 이탈 신호와 같은 주소의 반복. up 단어만으로 차단하지 않음"
    },
    "evidence": "MITRE ATT&CK T1190에는 디렉터리 이탈 악용 사례가 있으며 OWASP는 상위 디렉터리 표식으로 허용 경로 밖을 읽는 형태를 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1190/",
    "detailSource": "https://community.owasp.org/attacks/Path_Traversal"
  },
  {
    "name": "command_injection",
    "condition": {
      "signal": "요청 인자의 명령 구분자와 명령 결합 또는 명령 구분자를 명시한 수업 경보",
      "minAttempts": 8,
      "windowSeconds": 180,
      "minLevel": 10,
      "require": "명확한 명령 삽입 신호와 같은 주소의 반복. 구분 문자 하나만으로 차단하지 않음"
    },
    "evidence": "MITRE ATT&CK T1190에는 명령 주입 악용 사례가 있으며 OWASP는 입력을 통해 시스템 명령을 실행시키는 형태를 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1190/",
    "detailSource": "https://community.owasp.org/attacks/Command_Injection"
  }
];

const history = new Map();
const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|비밀번호|암호|토큰|개인키)\s*[:=]\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;

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

function argumentsFor(url) {
  if (typeof url !== 'string' || url.length > 8192) return [];
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  return query.split('&').map(pair => {
    let value = pair.slice(pair.indexOf('=') + 1).replace(/\+/gu, ' ');
    for (let i = 0; i < 2; i += 1) {
      try { value = decodeURIComponent(value); } catch { return ''; }
    }
    return value;
  });
}

// 같은 모듈 인스턴스의 단일 경보만 집계하며 원문·계정·비밀값을 메모리에 보관하지 않습니다.
export function decide(alert) {
  const sourceIp = alert?.data?.srcip ?? alert?.sourceIp;
  const at = typeof alert?.timestamp === 'string' ? Date.parse(alert.timestamp) : NaN;
  const rawText = alert?.rule?.description ?? alert?.description;
  const text = typeof rawText === 'string' && rawText.length <= 500 && !sensitive.test(rawText)
    ? rawText.replace(/[\r\n\t]+/gu, ' ').trim() : '';
  const levelValue = alert?.rule?.level ?? alert?.level;
  const level = Number.isInteger(levelValue) && levelValue >= 0 && levelValue <= 16 ? levelValue : 0;
  if (!validIp(sourceIp) || !Number.isFinite(at) || !text || text === '[설명 제외]') {
    return result(0.5, '패턴 없음');
  }

  const args = argumentsFor(alert?.data?.url);
  const has = regex => args.some(value => regex.test(value));
  // 수업용 doc-* 표식은 설명과 함께 일치할 때만 명확한 신호입니다.
  const sql = has(/\bunion\s+(?:all\s+)?select\b|(?:['"]\s*|\b)or\s+['"]?\d+['"]?\s*=\s*['"]?\d+|;\s*(?:select|insert|update|delete|drop)\b/iu)
    || has(/^doc-sql-(?:chain|or|select-chain)$/u) && /SQL\s*구문|데이터베이스\s*조회.*이어/u.test(text)
    || has(/^doc-mixed-marker$/u) && /SQL\s*표식/u.test(text);
  const script = has(/<\s*script(?:\s|>|\/)/iu)
    || has(/^doc-script-marker$/u) && /스크립트\s*(?:삽입|표)/u.test(text)
    || has(/^doc-mixed-marker$/u) && /스크립트\s*표식/u.test(text);
  const traversal = has(/(?:\.\.[/\\]){2,}/u)
    || has(/^doc-up-repeat$/u) && /경로.*(?:거슬러|이탈)/u.test(text);
  const command = has(/(?:;|&&|\|\|)\s*(?:id|whoami|cat|curl|wget)\b/iu)
    || has(/^doc-cmd-separator$/u) && /명령\s*구분자/u.test(text);
  const signals = [sql, script, traversal, command];
  const index = signals.findIndex(Boolean);
  const pattern = index >= 0 ? PATTERNS[index] : null;
  const count = positiveCount(alert?.data?.count)
    || positiveCount(text.match(/(\d+)\s*(?:번|건)/u)?.[1]);
  const repeated = /반복|연속|한 주소|같은 주소/u.test(text) && !/반복(?:은)?\s*없|반복되지/u.test(text);
  const time = text.match(/(\d+)\s*(분|초)\s*(?:안|동안)/u);
  const span = time ? Number(time[1]) * (time[2] === '분' ? 60 : 1) : null;

  if (!pattern) {
    // T1190·높은 수준만으로 공격을 만들지 않습니다. 한 번의 이상도 차단하지 않습니다.
    const suspicious = /따옴표|구분\s*문자|이상한\s*검색|주입처럼|공격\s*표기.*없|평소보다\s*길/u.test(text)
      || /수업|공지\s*제목|반복은\s*없/u.test(text)
      || has(/^doc-one-(?:fragment|marker)$/u)
      || has(/['"]|\.\.[/\\]|<|;/u);
    return result(suspicious ? 0.5 : 0.1, '패턴 없음');
  }

  let accumulated = 0;
  if (count <= 1 && level >= pattern.condition.minLevel) {
    const key = `${sourceIp}:${pattern.name}`;
    const previous = history.get(key);
    const latest = Math.max(previous?.latest ?? at, at);
    const cutoff = latest - pattern.condition.windowSeconds * 1000;
    const entries = (previous?.entries ?? []).filter(entry => entry.at >= cutoff);
    const id = typeof alert?.id === 'string' && alert.id.length <= 128 ? alert.id : String(at);
    if (at >= cutoff && !entries.some(entry => entry.id === id)) entries.push({ id, at });
    history.set(key, { latest, entries });
    accumulated = entries.filter(entry => entry.at <= at).length;
  }
  const clearSummary = count >= pattern.condition.minAttempts && repeated
    && (span === null || span > 0 && span <= pattern.condition.windowSeconds);
  if (level >= pattern.condition.minLevel && (clearSummary || accumulated >= pattern.condition.minAttempts)) {
    return result(0.95, pattern.name);
  }
  return result(Number((0.6 + (level >= 10 ? 0.08 : 0)
    + (count >= 2 || accumulated >= 2 ? 0.08 : 0) + (repeated ? 0.06 : 0)).toFixed(2)), pattern.name);
}
