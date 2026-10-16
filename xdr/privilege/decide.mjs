const PATTERNS = [
  {
    "name": "administrator_group_addition",
    "condition": {
      "signal": "계정이 관리자 그룹에 추가되거나 제거 직후 다시 추가됐다는 명시적 변경 경보",
      "require": "그룹 이름이 administrators이거나 설명에 관리자 그룹 추가가 명시되어야 하며, 단순 소속 값이 아닌 실제 추가·재추가 사건을 확인합니다. 같은 경보에서 같은 계정의 관리자 그룹 추가와 명령 실행이 확인되면 명확한 조합입니다. 규칙 수준 10~16과 실제 관리자 그룹 추가에 원격 주소·여러 계정(2개 이상) 추가·제거 직후 재추가 중 하나가 함께 명시되면 명확한 차단 후보로 봅니다. 수준과 계정 수 기준은 수업용 보조 기준이며 MITRE 지정 기준이나 계정 도용 확정이 아닙니다. 여러 경보를 임의로 합산하거나 같은 IP라는 이유로 다른 계정의 신호를 합치지 않습니다.",
      "exclude": "그룹 조회·설명 변경·일반 수업/과제 그룹 추가·로컬 그룹 생성·실패하거나 취소된 추가·추가가 없었다는 부정문은 성공한 관리자 그룹 악용의 근거로 쓰지 않습니다. 다만 수준 5~8의 이러한 그룹 관련 사건은 프로젝트 확인 정책에 따라 이 패턴의 주변 관찰로 alert에 남기며 관리자 그룹 추가 성공이라고 단정하지 않습니다. 관리자 그룹 추가 하나나 승인 여부 미확인만으로 계정 도용·세션 회수를 확정하지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1078은 탈취한 정상 계정을 권한 상승 등에 악용하는 수법을 설명하므로 관리자 그룹 변경과 후속 권한 사용은 계정 악용을 조사하는 관찰 근거이며 변경 자체가 도용의 증거는 아닙니다.",
    "source": "https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "unfamiliar_administrator_command",
    "condition": {
      "signal": "처음 보는 관리자 명령 실행, 일반 계정의 갑작스러운 관리자 권한 사용, 또는 다른 계정의 권한으로 관리자 명령을 실행했다는 경보",
      "require": "실제 관리자 명령 실행이나 세션 권한 변화를 확인하며 낯선 명령·낯선 출발 주소·직전 권한 변경은 경보의 명시적 관찰 또는 검증된 기준 자료로만 인정합니다. 규칙 수준 5~16에 관리자 명령 실행은 있으나 낯섦·정상 승인이 확인되지 않은 경우는 확인 대상 알림으로 남기며 처음 보는 명령이라고 단정하지 않습니다. 평소 주소는 명령 자체의 정상 승인을 뜻하지 않습니다. 취약점 악용 경보와 낮은 권한에서 높은 권한으로의 변화가 연결된 경우에만 T1068 악용 근거로 해석하고, 그 밖에는 비정상 권한 사용 의심으로 구분합니다.",
      "exclude": "계정 종류 조회·권한 상승 창 취소·실패로 끝난 명령·명령 실행 없음은 성공한 악용 근거가 아닙니다. 다만 수준 5~8의 계정 종류·권한 관련 조회·변경·취소·실패는 프로젝트 확인 정책에 따라 이 패턴의 주변 관찰로 최소 alert에 남깁니다. 승인된 정상 정기 명령도 이 수준의 관련 사건이면 확인 대상이며 정책 범위 밖에서 다른 위험 신호가 없으면 기록합니다. T1068 표식이나 높은 규칙 수준만으로 취약점 악용을 만들어내지 않으며 기준 없이 명령이나 주소의 낯섦을 추정하지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1068은 소프트웨어 취약점을 악용해 더 높은 권한을 얻는 수법을 설명하므로 비정상 관리자 실행과 권한 변화를 살피되 취약점 악용 증거 없는 실행을 T1068 확정으로 분류하지 않습니다.",
    "source": "https://attack.mitre.org/techniques/T1068/"
  },
  {
    "name": "outside_business_hours_privilege_use",
    "condition": {
      "signal": "업무·수업 시간 밖의 관리자 명령 실행 또는 권한 사용이 명시된 경보",
      "require": "관리자 권한 사용과 시간 이상을 함께 확인합니다. 시간 이상은 경보에 명시된 관찰 또는 시간대·업무 일정이 확인된 기준 자료가 있을 때만 인정합니다. 낯선 명령·주소·관리자 그룹 추가가 같은 계정의 사건으로 확인되면 함께 조사합니다.",
      "exclude": "시각 숫자만으로 업무 시간을 정하지 않습니다. 단순 로그인·로그아웃·정상 예약 작업 확인·권한 사용 없는 시간 이상은 이 패턴의 근거가 아닙니다. 시간 밖 사용 하나만으로 계정 도용이나 회수를 확정하지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1078은 정상 계정 탈취와 악용을 설명하며 업무 시간 밖 권한 사용은 이 과제에서 그 악용을 조사하는 이상 신호로 쓰되 시간만으로 도용을 증명하지 않습니다.",
    "source": "https://attack.mitre.org/techniques/T1078/"
  }
];
// 위 목록은 제작 2 패턴의 사본이며 실행 중 외부 자료를 읽지 않습니다.

function result(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

// 순수 동기 판단: 다른 경보의 순서·ID·외부 이력에 의존하지 않습니다.
export function decide(alert) {
  const description = alert?.rule?.description;
  if (typeof description !== 'string' || !description.trim() || description.length > 4000) {
    return result(0.5, 'no_matching_pattern');
  }
  // 한 문장의 실패가 다른 사건의 명확한 근거를 지우지 않도록 나눕니다.
  const events = description.split(/[.!?。](?=\s|$)|[\r\n;]+/u)
    .map(text => text.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  let best = result(0.1, 'no_matching_pattern');
  const rawLevel = alert?.rule?.level;
  const level = Number.isInteger(rawLevel) && rawLevel >= 0 && rawLevel <= 16 ? rawLevel : null;
  for (const event of events) {
    let candidate = inspectEvent(event, level);
    const confirmationName = confirmationPattern(event, level);
    if (candidate.confidence < 0.5 && confirmationName) candidate = result(0.55, confirmationName);
    if (candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}

// Wazuh가 강제하는 판정이 아닌 프로젝트의 확인 정책입니다. 성공한 악용으로 승격하지 않습니다.
function confirmationPattern(text, level) {
  if (level === null || level < 5 || level > 8) return null;
  const observed = /조회|읽|목록|설명.{0,12}(?:변경|바뀌)|추가|생성|만들|변경|바뀌|실행|사용|취소|실패|\b(?:quer(?:y|ied)|read|list|chang(?:e[ds]?|ing)|add(?:ed|ition)?|creat(?:e[ds]?|ion)|execut(?:e[ds]?|ion)|us(?:e|ed)|cancel(?:led|ed)?|fail(?:ed|ure)?)\b/iu.test(text);
  if (!observed) return null;
  if (/그룹|\bgroup\b/iu.test(text)) return PATTERNS[0].name;
  if (/계정\s*(?:종류|유형|권한)|권한|관리자\s*명령|\b(?:account\s+(?:type|privileges?)|privileges?|administrator\s+command)\b/iu.test(text)) return PATTERNS[1].name;
  return null;
}

function inspectEvent(text, level) {
  const groupName = /관리자\s*그룹|\badministrators?\s+group\b/iu.test(text);
  const recentAdmin = /방금\s*관리자가\s*된|\b(?:newly|just)\s+(?:became\s+an?\s+|made\s+an?\s+)?administrator\b/iu.test(text);
  const commandMention = /(?:관리자|권한)\s*명령|\b(?:admin(?:istrator)?|privileged|elevated)\s+commands?\b/iu.test(text);
  const groupChange = groupName && /추가|재추가|들어(?:가|왔)|\b(?:add(?:ed|ition)?|re[- ]?added|join(?:ed)?)\b/iu.test(text)
    || /다시\s*관리자로\s*들어/iu.test(text) || recentAdmin;
  const command = commandMention
    && /실행|사용|\b(?:execut(?:e[ds]?|ion)|run|ran|us(?:ed|e))\b/iu.test(text)
    || groupChange && /명령\s*실행/iu.test(text);
  const elevation = /권한\s*상승|관리자\s*권한으로\s*(?:바뀌|변경|전환)|\b(?:privilege\s+escalation|elevat(?:ed|ion)|became\s+(?:root|system))\b/iu.test(text);
  const outside = /(?:업무|수업|근무)\s*시간\s*(?:밖|외)|업무처럼\s*보이지\s*않는\s*시각|\b(?:outside\s+(?:business|class|working)\s+hours|after[- ]hours)\b/iu.test(text)
    && !/(?:업무|수업|근무)\s*시간\s*(?:밖|외)(?:은|는|이|가)?\s*아[니닙]|\bnot\s+(?:outside\s+(?:business|class|working)\s+hours|after[- ]hours)\b/iu.test(text);
  const unfamiliar = /처음\s*(?:보는|봅니다|본)|낯선|평소\s*목록에\s*없|\b(?:unfamiliar|unknown|first[- ]seen)\b/iu.test(text)
    && !/(?:처음\s*보는|낯선).{0,15}아[니닙]|\bnot\s+(?:unfamiliar|unknown|first[- ]seen)\b/iu.test(text);
  const otherAccount = /다른\s*계정의\s*권한|\banother\s+(?:user|account)(?:'s)?\s+privileges?\b/iu.test(text);
  const exploit = /취약점.{0,24}악용|\bexploit(?:ed|ing|ation)?\b.{0,30}\bvulnerabilit(?:y|ies)\b|\bvulnerabilit(?:y|ies)\b.{0,30}\bexploited\b/iu.test(text)
    && !/악용(?:은|이)?\s*(?:없|아[니닙])|악용하지|\bnot\s+exploited\b/iu.test(text);
  // 성공하지 못한 바로 그 권한 사건은 차단 후보로 만들지 않습니다.
  const stopped = /실패|취소|차단(?:됐|되었|됨)|\b(?:failed|cancelled|canceled|blocked|denied)\b/iu.test(text)
    && !/실패하지|취소되지|차단되지|\bnot\s+(?:failed|cancelled|canceled|blocked|denied)\b/iu.test(text);
  const noChange = /(?:추가|상승|실행|변경)(?:가|이|은|는)?\s*(?:없|아[니닙])|(?:추가|실행|변경|상승)(?:되|하)지\s*않|(?:추가|실행|변경|상승)(?:를|을)?\s*하지\s*않|\b(?:not\s+(?:added|executed|elevated)|no\s+(?:change|execution|addition|escalation))\b/iu.test(text);
  const groupReadOnly = groupName && /조회|읽기만|설명만|\b(?:queried|read[- ]only)\b/iu.test(text) && !command;
  if (stopped && (groupChange || commandMention || elevation)) {
    return result(0.5, groupChange ? PATTERNS[0].name : PATTERNS[1].name);
  }
  if (stopped || noChange && !command || groupReadOnly) {
    const name = groupChange ? PATTERNS[0].name : command || elevation ? PATTERNS[1].name : 'no_matching_pattern';
    return result(0.2, name);
  }
  // 명령 부정은 실제 명령으로 보지 않습니다. 권한 변화 신호 자체는 알림으로 남깁니다.
  const commandAbsent = /명령(?:\s*실행)?(?:은|이|을)?\s*없|명령.{0,12}실행하지|\b(?:command\s+was\s+not\s+executed|no\s+command)\b/iu.test(text);
  const hasCommand = command && !commandAbsent && !noChange;
  const accounts = new Set(text.match(/\b(?:user|admin)\d{2,4}\b/giu) ?? []);
  const sameAccount = accounts.size <= 1;
  // 수준은 아래 실제 권한 신호에만 더합니다. 원격 주소를 낯선 주소로 바꾸어 해석하지 않습니다.
  const high = level !== null && level >= 10;
  const elevated = level !== null && level >= 5;
  const remote = /원격\s*주소|\bremote\s+(?:address|source)\b/iu.test(text)
    && !/원격\s*주소(?:가|는|이)?\s*아[니닙]|\bnot\s+(?:a\s+)?remote\s+(?:address|source)\b/iu.test(text);
  const countMatch = text.match(/계정\s*(\d{1,3})\s*개|\b(\d{1,3})\s+accounts?\b/iu);
  const multipleAccounts = countMatch !== null && Number(countMatch[1] ?? countMatch[2]) >= 2;
  const readdedAfterRemoval = /빠진|제거|탈퇴|\bremoved\b/iu.test(text)
    && /다시\s*관리자로\s*들어|재추가|\bre[- ]?added\b/iu.test(text);
  if (sameAccount && groupChange && hasCommand) return result(0.95, PATTERNS[0].name);
  if (hasCommand && otherAccount) return result(0.95, PATTERNS[1].name);
  if (sameAccount && elevation && exploit) return result(0.95, PATTERNS[1].name);
  if (sameAccount && (hasCommand || elevation) && unfamiliar && outside) return result(0.9, PATTERNS[2].name);
  if (sameAccount && elevation && unfamiliar) return result(0.85, PATTERNS[1].name);
  if (sameAccount && high && groupChange && (remote || multipleAccounts || readdedAfterRemoval)) {
    return result(0.9, PATTERNS[0].name);
  }
  if (groupChange) return result(0.7, PATTERNS[0].name);
  if ((hasCommand || elevation) && outside) return result(0.65, PATTERNS[2].name);
  if ((hasCommand && unfamiliar) || elevation) return result(0.5, PATTERNS[1].name);
  // 평소 주소라는 정보만으로 명령 자체의 정상 여부까지 확정하지 않습니다.
  const routineCommand = /승인된|정상\s*(?:정기\s*)?(?:관리자|권한)\s*명령|\b(?:approved|routine)\s+(?:administrator|admin|privileged)\s+command\b/iu.test(text);
  if (hasCommand && elevated && !routineCommand) return result(0.55, PATTERNS[1].name);
  return result(0.1, 'no_matching_pattern');
}
