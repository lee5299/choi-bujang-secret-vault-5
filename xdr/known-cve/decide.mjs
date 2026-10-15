// patterns.json의 패턴 사본. 확신도는 수업용 일치 점수입니다.
const PATTERNS = [
  {
    "name": "header_jndi_lookup",
    "condition": {
      "fields": [
        "data.useragent",
        "rule.description"
      ],
      "signal": "수집된 요청 머리글(User-Agent)에 외부 목적지를 지정한 완전한 JNDI 원격 조회 표현식이 있거나 수업 경보가 머리글의 해당 조회 구문을 명시함",
      "require": "조회 표현식과 원격 목적지의 결합을 확인하고, 설명을 보조 근거로 쓸 때는 머리글 위치·원격 조회 존재가 명시되어야 함",
      "exclude": "CVE-2021-44228·jndi 단어만 등장, 중괄호만 존재, 잘린 조회 문자열, 조회 구문이 없다는 설명, 높은 규칙 수준만 존재"
    },
    "evidence": "Apache는 CVE-2021-44228을 공격자가 제어하는 로그 입력의 JNDI 외부 조회 취약점으로 설명하며 MITRE T1190에는 해당 CVE 악용 사례가 있습니다.",
    "source": "https://logging.apache.org/security.html#CVE-2021-44228",
    "detailSource": "https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "parameter_jndi_lookup",
    "condition": {
      "fields": [
        "data.url",
        "rule.description"
      ],
      "signal": "수집된 요청 URL의 인자에 외부 목적지를 지정한 완전한 JNDI 원격 조회 표현식이 있거나 수업 경보가 요청 인자의 해당 조회 구문을 명시함",
      "require": "인자 안의 조회 표현식과 원격 목적지의 결합을 확인하고, 설명을 보조 근거로 쓸 때는 요청 인자 위치·원격 조회 존재가 명시되어야 함",
      "exclude": "취약점 이름 검색·수업 문서 조회·라이브러리 이름만 등장, jndi 단어만 존재, 잘린 조회 문자열, 조회 구문이 없다는 설명"
    },
    "evidence": "Apache는 공격자가 제어하는 로그 메시지·매개변수의 JNDI 조회가 CVE-2021-44228 악용 경로임을 설명하므로 로그에 남을 수 있는 요청 인자의 조회 구문을 확인합니다.",
    "source": "https://logging.apache.org/security.html#CVE-2021-44228",
    "detailSource": "https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "vulnerability_scanner_trace",
    "condition": {
      "fields": [
        "data.useragent",
        "data.url",
        "rule.description"
      ],
      "signal": "수업 경보가 알려진 취약점 점검 흔적을 명시하거나 공식 근거로 확인된 취약점 점검 도구 식별자가 요청 머리글·인자에 존재함",
      "require": "도구 흔적은 보조 신호로만 사용함. T1190 악용 시도와 연결하려면 머리글 또는 인자의 JNDI 원격 조회 근거를 별도로 확인하며 도구 흔적만으로 차단·악용 성공을 확정하지 않음",
      "exclude": "비슷한 수업용 프로그램 이름, 임의 scan 단어, 취약점 목록 문서 열람, 출처가 확인되지 않은 도구명"
    },
    "evidence": "MITRE T1595.002는 취약점 스캔을 악용 후보를 찾는 정찰로 구분하고 Log4j 대상 스캔 사례를 제시하므로 점검 도구 흔적은 악용 확정이 아닌 보조 근거입니다.",
    "source": "https://attack.mitre.org/techniques/T1595/002/",
    "detailSource": "https://attack.mitre.org/techniques/T1190/"
  }
];

function text(value, limit) {
  return typeof value === 'string' && value.length <= limit ? value : '';
}

function result(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

// 문자열로만 비교하며 목적지 접속이나 표현식 실행은 하지 않습니다.
function completeLookup(value) {
  return /\$\{jndi:(?:ldap|ldaps|rmi|dns):\/\/(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?(?:\/[^{}\s]*)?\}/iu.test(value);
}

function argumentValues(value) {
  const url = text(value, 8192).split('#')[0];
  const queryAt = url.indexOf('?');
  if (queryAt < 0) return [];
  return url.slice(queryAt + 1).split('&').flatMap(pair => {
    const equalsAt = pair.indexOf('=');
    if (equalsAt < 0) return [];
    let value = pair.slice(equalsAt + 1).replace(/\+/gu, ' ');
    const versions = [value];
    for (let i = 0; i < 2; i += 1) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        versions.push(decoded);
        value = decoded;
      } catch { break; }
    }
    return versions;
  });
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return result(0, 'no_matching_pattern');
  const header = text(alert.data?.useragent, 8192);
  const args = argumentValues(alert.data?.url);
  const description = text(alert.rule?.description, 500);
  const [headerPattern, parameterPattern, scannerPattern] = PATTERNS;

  // 실제 요청 필드의 명확한 구문을 설명·수준·횟수보다 먼저 검사합니다.
  if (completeLookup(header)) return result(0.95, headerPattern.name);
  if (args.some(completeLookup)) return result(0.95, parameterPattern.name);

  // 원문이 없고 수업 설명만 있을 때는 완전 일치로 승격하지 않습니다.
  const denied = /(?:조회|악용)\s*구문(?:은|이)?\s*없|완전한\s*구문은\s*아|아닙|없습|않습/u.test(description);
  if (!denied && /원격\s*조회\s*구문/u.test(description)) {
    if (/머리글/u.test(description)) return result(0.75, headerPattern.name);
    if (/(?:주소|요청)\s*인자/u.test(description)) return result(0.75, parameterPattern.name);
  }
  if (!/비슷|아닙|없습|않습/u.test(description)
      && /(?:알려진\s*)?취약점\s*점검\s*(?:도구|흔적)/u.test(description)) {
    return result(0.6, scannerPattern.name);
  }

  // 잘린 조회와 검색어만의 일치는 낮은 확신도로 알림만 반환합니다.
  if (/\$\{jndi:|\bjndi:\s*(?:ldap|ldaps|rmi|dns):/iu.test(header)) return result(0.6, headerPattern.name);
  if (args.some(value => /\$\{jndi:|\bjndi:\s*(?:ldap|ldaps|rmi|dns):/iu.test(value))
      || /(?:조회\s*(?:형태|구문).{0,20}잘린|잘린.{0,20}조회\s*구문)/u.test(description)) {
    return result(0.6, parameterPattern.name);
  }
  if (/\b(?:CVE-2021-44228|jndi)\b/iu.test(header)) return result(0.5, headerPattern.name);
  if (args.some(value => /\b(?:CVE-2021-44228|jndi)\b/iu.test(value))) return result(0.5, parameterPattern.name);
  return result(0.1, 'no_matching_pattern');
}
