// patterns.json의 패턴 사본. 외부 파일 없이 판단합니다.
const PATTERNS = [
  {
    "name": "unfamiliar_destination_bulk_transfer",
    "condition": {
      "signal": "처음 보는 목적지로 대용량·다량 자료 전송, 평소보다 큰 전송량·파일 수, 같은 목적지 반복 전송 또는 평소 쓰지 않던 통로의 외부 자료 전송",
      "require": "목적지와 양수 bytes 및 실제 전송 관찰을 확인하고 낯섦·전송량 이상·반복·다수 파일·비정상 통로 신호를 함께 대조합니다. 유효 규칙 수준 10~16과 이 조합은 자료 유출 의심의 차단 후보입니다. 수준 5~8의 관련 관찰은 alert입니다. T1048 수법의 확정 여부와 방어 차단 후보 여부를 구분하며 포트·주소만으로 다른 프로토콜이라고 단정하지 않습니다.",
      "exclude": "새 목적지 하나·큰 bytes 하나·수준 하나만으로 차단하지 않습니다. 승인된 정상 동기화·백업을 공격으로 단정하지 않으며 백업처럼 보인다는 표현만으로 정상 승인도 추정하지 않습니다. 읽은 자료 수를 전송된 파일 수로 취급하지 않습니다. 작은·중간 파일이라는 명시적 관찰은 명확한 명령 통로/다른 프로토콜 반출 근거가 없으면 높은 수준만으로 대량 반출로 올리지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1048은 기존 명령 통로와 다른 프로토콜의 자료 유출을 설명하고 탐지 전략에 비정상적으로 큰 외부 전송량을 포함하므로 낯선 목적지·대량·반복 전송을 조사하되 목적지만으로 수법을 확정하지 않습니다.",
    "source": "https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "command_channel_data_transfer",
    "condition": {
      "signal": "명령 통로로 자료·파일 또는 자료 이름이 외부 목적지에 전송되었다는 경보",
      "require": "명령 통로와 자료의 실제 전송이 함께 관찰되었는지 확인합니다. 큰 파일·낯선 목적지·반복은 추가 근거이며 T1041의 필수 조건은 아닙니다. 짧은 자료 이름 관찰만 있고 내용 반출이 불명확하면 유출 확정 대신 조사 대상으로 남깁니다.",
      "exclude": "MITRE 표식만 있는 경보, 명령 실행만 있고 전송이 없는 사건, 실패하거나 차단된 전송은 성공한 명령 통로 유출 근거가 아닙니다. 대용량이 아니라는 이유만으로 실제 명령 통로 유출 가능성을 배제하지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1041은 기존 명령·제어 통로와 같은 프로토콜의 통신에 훔친 자료를 실어 반출하는 수법을 설명하므로 명령 통로와 자료 전송의 결합을 확인합니다.",
    "source": "https://attack.mitre.org/techniques/T1041/"
  },
  {
    "name": "outside_business_hours_archive_transfer",
    "condition": {
      "signal": "업무·수업 시간 밖 압축 파일 외부 반출 또는 압축 자료의 낯선 목적지 전송",
      "require": "압축 파일과 실제 전송 및 시간 밖/목적지 이상을 함께 확인합니다. 시간 밖은 설명에 명시되거나 검증된 일정으로 확인해야 합니다. 목적지·양수 bytes·전송 관찰에 유효 수준 10~16과 패턴 신호가 결합되면 차단 후보입니다. 준비·부분·실패 또는 수준 5~8의 관련 관찰은 alert입니다. 프로토콜 관계가 없다고 해서 경보의 유출 신호를 모두 알림으로 낮추지 않으며 T1048 확정과 방어 조치를 구분합니다.",
      "exclude": "압축 파일 생성·열람만 있고 전송이 없는 사건, 전송 실패·취소·차단은 성공한 반출이 아닙니다. 시간 밖이라는 이유나 압축 파일이라는 이유 하나만으로 차단하지 않습니다. 명시적으로 승인된 정상 백업은 위험 조합 없이 공격으로 단정하지 않습니다."
    },
    "evidence": "MITRE ATT&CK T1048은 압축 자료를 URL로 반출한 사례와 업무 시간 밖 외부 전송의 탐지 전략을 제공하므로 압축 파일의 실제 전송과 시간·목적지 이상을 함께 조사합니다.",
    "source": "https://attack.mitre.org/techniques/T1048/"
  }
];

const POLICY = {
  "validLevelMin": 0,
  "validLevelMax": 16,
  "highSeverityMin": 10,
  "confirmationLevelMin": 5,
  "confirmationLevelMax": 8,
  "blockMin": 0.85,
  "alertMin": 0.5,
  "note": "사용자 과제와 전달한 검토의 수준·내용 결합 정책입니다. MITRE의 수법 정의와 탐지 관찰 신호를 근거로 삼되 명령 통로/다른 프로토콜이라는 특정 문구를 모든 차단의 필수 조건으로 요구하지 않습니다. 50,000,000바이트·5회 같은 임의 크기/횟수 기준은 두지 않습니다. 수준만으로 차단하지 않고 목적지·양수 전송량·전송 관찰·패턴 신호를 함께 확인합니다."
};

function result(confidence, reason) {
  return { action: confidence >= POLICY.blockMin ? 'block' : confidence >= POLICY.alertMin ? 'alert' : 'record', confidence, reason };
}

function nonnegativeNumber(value) {
  if (typeof value === 'string' && /^\d{1,16}$/u.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return result(0, 'no_matching_pattern');
  const description = alert.rule?.description;
  const text = typeof description === 'string' && description.length <= 2000 ? description : '';
  const level = Number.isInteger(alert.rule?.level) && alert.rule.level >= POLICY.validLevelMin && alert.rule.level <= POLICY.validLevelMax ? alert.rule.level : null;
  const bytes = nonnegativeNumber(alert.data?.bytes);
  const files = nonnegativeNumber(alert.data?.files);
  const count = nonnegativeNumber(alert.data?.count);
  const destination = alert.data?.dstip;
  const hasDestination = typeof destination === 'string' && destination.length <= 253 && destination.trim().length > 0;
  // 원문 설명을 출력하지 않고 패턴 이름만 반환합니다.
  const unfamiliar = /처음\s*(?:보는|본|봅니다)|낯선|평소와\s*다른|평소(?:에)?\s*쓰지\s*않던|\b(?:unfamiliar|unseen|new)\s+(?:destination|address|endpoint)\b/iu.test(text)
    && !/처음\s*보는.{0,12}(?:아닙|아니)|낯선.{0,12}(?:아닙|아니)|\bnot\s+(?:an?\s+)?(?:unfamiliar|unseen|new)\b/iu.test(text);
  const outside = /(?:업무|수업)\s*시간\s*(?:밖|외)|\b(?:outside\s+(?:business|working|class)\s+hours|off[- ]hours)\b/iu.test(text)
    && !/시간\s*밖.{0,8}(?:아닙|아니)|\bnot\s+outside\b/iu.test(text);
  const archive = /압축\s*(?:파일|자료)|\b(?:archive|archived|compressed)\b/iu.test(text);
  const channelMention = /명령\s*(?:통로|채널)|\b(?:c2|command[- ]and[- ]control)\s+(?:channel|traffic)\b/iu.test(text);
  const transferMention = /전송|반출|나갔|올라갔|복사|유출|\b(?:transfer|transferred|sent|uploaded|copied|exfiltrat\w*)\b/iu.test(text);
  const completed = /전송(?:됐|되었|했|하였|이\s*\d+\s*번)|나갔|올라갔|복사(?:됐|되었)|반출(?:됐|되었|했)|유출(?:됐|되었)|\b(?:transferred|sent|uploaded|copied|exfiltrated)\b/iu.test(text);
  const stopped = /실패|취소|차단|오탐|\b(?:failed|cancelled|canceled|blocked|denied|false\s+positive)\b/iu.test(text)
    && !/실패하지|취소되지|차단되지|\bnot\s+(?:failed|cancelled|canceled|blocked|denied)\b/iu.test(text);
  const absent = /(?:외부\s*)?(?:전송|반출|유출)(?:은|는|이|가)?\s*(?:아직\s*)?없|(?:전송|반출|유출)(?:되|하)지\s*않|(?:전송|반출|유출)(?:을|를)\s*하지\s*않|\b(?:no\s+(?:(?:external|outbound|data)\s+)*(?:transfer|exfiltration)|not\s+(?:transferred|sent|uploaded|exfiltrated))\b/iu.test(text);
  const approved = /승인된\s*(?:정상\s*)?(?:백업|전송|동기화)|정상\s*(?:정기\s*)?(?:백업|동기화)|\b(?:approved|authorized)\s+(?:backup|transfer|sync\w*)\b/iu.test(text)
    && !/미승인|승인되지|\b(?:not\s+(?:approved|authorized)|unapproved|unauthorized)\b/iu.test(text);
  const bulkText = /대용량|큰\s*파일|다량|자료실\s*전체|메모\s*묶음|\b(?:large|bulk|entire\s+vault)\b/iu.test(text)
    && !/큰\s*파일(?:은|이)?\s*아|대용량(?:은|이)?\s*아|\bnot\s+(?:a\s+)?(?:large|bulk)\b/iu.test(text);
  const limitedTransfer = /작은\s*파일|중간\s*크기|\b(?:small|medium[- ]sized)\s+files?\b/iu.test(text);
  const increased = /평소보다|파일\s*수가.{0,12}늘|\b(?:above\s+baseline|unusual\s+volume|increased)\b/iu.test(text);
  const repeated = (count !== null && count > 1) || /반복|연속|\b(?:repeated|repeatedly)\b/iu.test(text);
  const relationshipUnclear = /(?:명령\s*(?:통로|채널)|프로토콜).{0,45}(?:미확인|불명|확인되지|확인할\s*수\s*없)|\b(?:unknown|unconfirmed|uncertain)\s+(?:protocol|c2\s+channel)|(?:protocol|c2\s+channel).{0,30}\b(?:unknown|unconfirmed|uncertain)\b/iu.test(text);
  const alternativeProtocol = /(?:기존\s*)?명령\s*(?:통로|채널).{0,30}(?:다른|별도|상이한)\s*프로토콜|비명령\s*(?:통로|채널)\s*프로토콜|\b(?:different|alternative)\s+protocol.{0,40}(?:c2|command[- ]and[- ]control)|\bnon[- ]c2\s+protocol\b/iu.test(text)
    && !relationshipUnclear
    && !/다른\s*프로토콜(?:은|이)?\s*(?:아닙|아니)|\bnot\s+(?:a\s+)?(?:different|alternative|non[- ]c2)\s+protocol\b/iu.test(text);
  const channelTransfer = /명령\s*(?:통로|채널)(?:로|를\s*통해|를\s*사용(?:해|하여))|\b(?:over|via|through|using)\s+(?:(?:an?|the)\s+)?(?:existing\s+)?(?:c2|command[- ]and[- ]control)\s+(?:channel|traffic)\b/iu.test(text);
  const channel = channelMention && channelTransfer && !alternativeProtocol && !relationshipUnclear
    && !/명령\s*(?:통로|채널)(?:은|이|가)?\s*(?:아닙|아니|없)|명령\s*(?:통로|채널).{0,10}사용하지|\b(?:not\s+(?:over|via)|no)\s+(?:an?\s+)?c2\s+channel\b/iu.test(text);
  const dataMention = /자료|파일|메모|정보|기밀|\b(?:data|files?|archives?|exfiltrat\w*)\b/iu.test(text);
  const partial = /일부만|짧은\s*자료\s*이름|자료\s*이름.{0,12}보였|\b(?:partial|file\s*names?\s+only)\b/iu.test(text);
  const multipleFiles = files !== null && files > 1;
  const suspicious = unfamiliar || outside || channelMention || alternativeProtocol || increased || bulkText || repeated || multipleFiles || /백업처럼|일부만|평소에\s*쓰지\s*않던\s*포트/iu.test(text);
  const preparation = /자료\s*\d+\s*건.{0,20}읽힌\s*뒤|\bmass\s+read\b/iu.test(text);
  const related = ((transferMention || archive || channelMention || alternativeProtocol) && (suspicious || archive)) || increased || preparation;
  const name = alternativeProtocol ? (archive ? PATTERNS[2].name : PATTERNS[0].name) : channel ? PATTERNS[1].name : archive ? PATTERNS[2].name : PATTERNS[0].name;
  const confirmationLevel = level !== null && level >= POLICY.confirmationLevelMin && level <= POLICY.confirmationLevelMax;
  if (approved) return result(0.1, 'no_matching_pattern');
  // 실패·미전송은 성공 근거에서 제외하고 확인 알림으로 남깁니다.
  if (stopped || absent) return result(related ? 0.6 : 0.1, related ? name : 'no_matching_pattern');
  const actualTransfer = hasDestination && bytes !== null && bytes > 0
    && (completed || transferMention || ((multipleFiles || repeated) && dataMention));
  // 부분·준비 관찰은 높은 수준이어도 명확한 전체 반출로 승격하지 않습니다.
  if (partial || preparation) return result(related ? 0.6 : 0.1, related ? name : 'no_matching_pattern');
  if (actualTransfer && dataMention && (alternativeProtocol || channel)) return result(0.95, name);
  const highSeverity = level !== null && level >= POLICY.highSeverityMin;
  const patternSignal = unfamiliar || outside || archive || bulkText || increased || repeated || multipleFiles;
  if (highSeverity && actualTransfer && related && patternSignal && !limitedTransfer) return result(0.9, name);
  if (confirmationLevel && related) return result(0.65, name);
  if (related) return result(0.6, name);
  return result(0.1, 'no_matching_pattern');
}
