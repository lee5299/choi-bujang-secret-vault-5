const PATTERNS = [
  {
    "name": "unsigned_service_change",
    "condition": {
      "signal": "새 서비스 등록 또는 기존 서비스 실행 파일 변경과 함께 서명이 없다고 명시된 경보, 또는 평소 목록에 없는 서비스가 재부팅 뒤에도 남도록 등록됐다는 경보",
      "require": "서비스 생성·실행 파일 변경이라는 실제 변화를 확인합니다. 명확한 조합은 서명 없음과 임시 폴더 실행·원격 반복 등록·재부팅 뒤 유지·실행 파일 교체 중 하나, 또는 서명 없음이 명시되지 않아도 평소 목록에 없음과 재부팅 뒤 유지가 함께 있는 경우입니다. MITRE T1543은 서명 여부를 요구하지 않습니다.",
      "exclude": "서명 미확인을 서명 없음으로 해석하지 않습니다. 서비스 설명만 변경되거나 같은 파일로 재시작한 사건, 기존 서명된 수업 서비스 실행만으로 이 패턴을 확정하지 않습니다. 실패·차단된 시도, 오탐 확인, 삭제·제거 완료 문구나 '낯선 항목이 아님'처럼 신호를 부정한 경보는 명확한 조합으로 보지 않습니다. 다른 사건의 실패나 삭제되지 않았다는 부정문은 이 사건의 해결 근거가 아닙니다. 승인된 서명 수업 도구의 변경은 별도 위험 신호가 없을 때만 정상입니다."
    },
    "evidence": "MITRE ATT&CK T1543은 새 서비스 설치 또는 기존 서비스 변경을 통해 악성 프로그램을 시작 시점이나 반복 주기에 실행하여 지속성을 확보하는 수법을 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1543/"
  },
  {
    "name": "unfamiliar_scheduled_task",
    "condition": {
      "signal": "처음 보는 예약 작업 생성·변경, 또는 예약 작업이 임시 폴더의 실행 파일을 가리킨다는 경보",
      "require": "예약 작업 생성·변경 또는 실행 대상에 관한 명시적 신호를 확인합니다. 평소 목록에 없음·임시 폴더 실행·평소 시간 밖 실행·다른 자동 시작 항목과 같은 파일 사용은 추가 확인 근거입니다.",
      "exclude": "예약 작업의 존재·낯선 이름 하나만으로 악성이라고 확정하지 않습니다. 기존 업데이트 예약이나 수업 자료 복사 완료, 수업 중 작업 생성과 서명 미확인만으로 격리 근거를 만들지 않습니다. 실패·차단된 시도, 오탐 확인, 삭제·제거 완료 문구나 '낯선 항목이 아님'처럼 신호를 부정한 경보는 명확한 조합으로 보지 않습니다. 다른 사건의 실패나 삭제되지 않았다는 부정문은 이 사건의 해결 근거가 아닙니다. 승인된 서명 수업 도구의 변경은 별도 위험 신호가 없을 때만 정상입니다."
    },
    "evidence": "MITRE ATT&CK T1053은 예약 작업 기능을 악용하여 악성 코드를 처음 실행하거나 반복 실행하는 수법을 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1053/"
  },
  {
    "name": "startup_folder_change",
    "condition": {
      "signal": "시작 폴더에 프로그램이 추가·변경됐거나 시작 프로그램 항목이 임시 실행 파일을 가리킨다는 경보",
      "require": "파일 무결성 경보 또는 설명에서 시작 폴더의 추가·변경이나 시작 항목의 실행 대상을 확인합니다. 평소 목록에 없는 프로그램 추가·임시 파일 사용·같은 파일의 예약 작업 등록은 추가 확인 근거입니다.",
      "exclude": "시작 프로그램 목록 읽기만 한 사건은 제외합니다. 변화의 내용이 없는 변경 건수, 서명 미확인, 임시 폴더에 파일이 생겼다는 사실만으로 자동 시작 등록이나 실행을 추정하지 않습니다. 실패·차단된 시도, 오탐 확인, 삭제·제거 완료 문구나 '낯선 항목이 아님'처럼 신호를 부정한 경보는 명확한 조합으로 보지 않습니다. 다른 사건의 실패나 삭제되지 않았다는 부정문은 이 사건의 해결 근거가 아닙니다. 승인된 서명 수업 도구의 변경은 별도 위험 신호가 없을 때만 정상입니다."
    },
    "evidence": "MITRE ATT&CK T1547.001은 시작 폴더에 프로그램을 추가하여 사용자 로그인 때 실행되도록 지속성을 확보하는 수법을 설명합니다.",
    "source": "https://attack.mitre.org/techniques/T1547/001/"
  }
];
// 패턴 상수는 아래 구현과 함께 단일 파일로 실행됩니다.

const sensitive = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|비밀번호|암호|토큰|개인키)["']?\s*(?:[:=]|은|는)?\s*\S+|\bBearer\s+\S+|-----BEGIN|\b(?:sb_secret_|sk-)[\w-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_+/=-]{32,}/iu;

function result(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

// 동기 함수이며 입력을 수정하거나 외부 상태를 읽지 않습니다.
export function decide(alert) {
  const description = alert?.rule?.description ?? alert?.description;
  if (typeof description !== 'string' || !description.trim() || description.length > 500
      || description === '[설명 제외]' || sensitive.test(description)) return result(0.5, '패턴 없음');
  const level = alert?.rule?.level ?? alert?.level;
  const high = Number.isInteger(level) && level >= 10 && level <= 16;
  const path = typeof alert?.data?.path === 'string' && alert.data.path.length <= 1024
    && !sensitive.test(alert.data.path) ? alert.data.path : '';
  // 문장별 사건을 분리합니다. 앞 사건을 가리키는 서명·삭제·승인 후속 문장만 이어 붙입니다.
  const events = [];
  for (const part of description.split(/[.!?。](?=\s|$)|[\r\n;]+/u).map(text => text.trim()).filter(Boolean)) {
    const continuation = /^(?:서명(?:은|이|\s*(?:상태|확인))|삭제|제거|해당\s|이\s항목|관리자가\s|its\s(?:signature|registration)|it\s|the\s(?:service|scheduled\s+task|task|program)\s|administrator\s+approved)/iu.test(part);
    if (events.length && continuation) events[events.length - 1] += '. ' + part;
    else events.push(part);
  }
  const candidates = events.map(text => inspectEvent(text.replace(/\s+/gu, ' '), path, high));
  return candidates.sort((a, b) => b.confidence - a.confidence)[0] ?? result(0.1, '패턴 없음');
}

function inspectEvent(text, path, high) {
  const temp = /임시\s*(?:폴더|파일|디렉터리)|\btemp(?:orary)?\s+(?:folder|directory|file)\b/iu.test(text)
    || /(?:^|[/\\])Temp[/\\].+\.(?:exe|cmd|bat|ps1)$/iu.test(path);
  const notUnfamiliar = !/\bnot\s+(?:in|on)\s+(?:the\s+)?baseline\b/iu.test(text) && /(?:낯선|처음\s*보는)\s*(?:[가-힣]+\s*)?(?:은|는|이|가)?\s*아[니닙]|(?:평소|정상|기준)\s*목록에\s*있|\bnot\s+(?:unfamiliar|unknown|new)\b|\b(?:in|on)\s+the\s+(?:approved\s+)?baseline\b/iu.test(text);
  const unfamiliar = !notUnfamiliar && /처음\s*보는|낯선|(?:평소|정상|기준)\s*목록에\s*없|임의\s*문자열|\b(?:unfamiliar|unknown|random(?:ly named)?)\b|\bnot\s+(?:in|on)\s+(?:the\s+)?baseline\b/iu.test(text);
  const unsigned = /서명\s*없는|서명이?\s*없(?:습니다|음|는)|\bunsigned\b/iu.test(text)
    && !/\bnot\s+unsigned\b/u.test(text);
  const signed = /서명된|서명이\s*(?:유효|확인)|\bsigned\b/iu.test(text) && !unsigned;
  const unknownSignature = /서명.*(?:미확인|확인되지|모릅|알\s*수\s*없)|\bsignature\s+(?:is\s+)?(?:unknown|unverified)|\bsignature\s+(?:was\s+)?not\s+(?:verified|checked)/iu.test(text);
  const shared = /같은\s*임시\s*파일.*함께\s*가리|\bsame\s+(?:temporary|temp)\s+file\b/iu.test(text);
  const outside = /(?:수업|평소)\s*시간\s*밖|\boutside\s+(?:class|normal|usual)\s+hours\b/iu.test(text);
  const service = /서비스|\bservice\b/iu.test(text);
  const task = /예약\s*작업|\bscheduled\s+task\b/iu.test(text);
  const startup = /시작\s*(?:폴더|프로그램|항목)|\bstartup\s+(?:folder|program|entry)\b/iu.test(text);
  const noServiceChange = /서비스\s*(?:등록|생성)(?:은|이|이란)?\s*없|서비스.*(?:등록|생성)(?:되지|하지)\s*않|서비스\s*설명만|\bservice\b.*\b(?:not|never)\s+(?:registered|created|installed)\b/iu.test(text);
  const serviceChange = service && !noServiceChange && /새\s*(?:서명\s*없는\s*)?서비스|서비스.*(?:등록|생성)|서비스\s*실행\s*파일.*(?:바뀌|변경)|\bnew\s+(?:unsigned\s+)?service\b|\bservice\b.*\b(?:registered|created|installed|changed|modified)\b|\b(?:registration|creation|installation)\s+of\b.*\bservice\b/iu.test(text);
  const fileChanged = /서비스\s*실행\s*파일.*(?:바뀌|변경)|\bservice\s+(?:executable|binary)\b.*\b(?:changed|replaced|modified)\b/iu.test(text);
  const repeatedRemote = /원격|\bremote\b/iu.test(text) && /연속|반복|\brepeated/iu.test(text) && /등록|\bregist/iu.test(text);
  const persists = /다시\s*켜도\s*남|재부팅.*(?:유지|남)|\b(?:persist|remain|survive)\w*\b.*\b(?:reboot|restart)\b/iu.test(text)
    && !/남지\s*않|유지되지|\b(?:not|never)\s+(?:persist|remain|survive)/iu.test(text);
  const noTaskChange = /예약\s*작업.*(?:생성|등록)(?:은|이)?\s*없|예약\s*작업.*(?:생성|등록)(?:되지|하지)\s*않|\btask\b.*\bnot\s+(?:created|registered)\b/iu.test(text);
  const noStartupChange = /읽기만|조회만|추가되지|변경되지|추가.*없|변경.*없|\bread.only\b|\bnot\s+(?:added|changed)\b/iu.test(text);
  const startupChange = startup && !noStartupChange && /추가|변경|가리|\b(?:added|changed|modified|points?)\b/iu.test(text);

  // 다른 사건의 실패와 삭제 부정문은 해당 등록/변경이 해결됐다는 근거가 아닙니다.
  const resolutionText = text
    .replace(/(?:이전|과거|별도)?\s*로그인[^,.;]*실패[가-힣\s]*|\b(?:previous|earlier)?\s*login\s+(?:failure|failed)\b[^,.;]*/giu, '')
    .replace(/(?:삭제|제거)(?:되지|하지)\s*않[가-힣]*|(?:삭제|제거)가?\s*실패[가-힣]*|\b(?:not|never)\s+(?:deleted|removed|blocked)\b|\b(?:deletion|removal)\s+failed\b/giu, '');
  const resolved = /(?:등록|생성|설치|추가|변경|시도).{0,35}(?:실패|차단(?:되|됐|했))|모두\s*실패|오탐|(?:삭제|제거)(?:했|됐|되었|됨|\s*완료)|\b(?:was\s+|were\s+)?(?:deleted|removed|blocked)\b|\bfailed\s+to\s+(?:register|create|install)\b|\b(?:registration|creation)\b.*\bfailed\b|\bfalse\s+positive\b/iu.test(resolutionText);
  const approved = /관리자가\s*(?:해당\s*항목을\s*)?승인했|\badministrator(?:-|\s+)approved\b/iu.test(text)
    && !/승인하지|미승인|승인\s*취소|\bnot\s+approved\b/iu.test(text);
  const classroom = /수업\s*도구|\bclassroom\s+tool\b/iu.test(text);
  const benignChange = approved && signed && classroom && !unsigned && !unknownSignature
    && !temp && !outside && !shared && !persists && !resolved;
  const normal = /로그인했습니다|로그아웃했습니다|자료실\s*화면이\s*열|정의\s*업데이트.*끝|\blog(?:ged)?\s+(?:in|out)\b/iu.test(text)
    || /업데이트\s*예약.*평소.*그대로|기존\s*예약\s*작업.*복사.*마쳤/iu.test(text)
    || startup && /목록.*(?:읽기만|조회만)|\bread.only\b/iu.test(text)
    || service && signed && /기존.*(?:실행|다시\s*시작|재시작)|\bexisting\b.*\b(?:running|restarted)\b/iu.test(text);
  if (benignChange || normal && !unsigned && !unfamiliar && !serviceChange && !startupChange && !shared && !outside && !temp) {
    return result(0.1, '패턴 없음');
  }
  const candidates = [];
  if (service) {
    const clear = !resolved && serviceChange && !unknownSignature
      && (unsigned && (temp || repeatedRemote || persists || fileChanged) || unfamiliar && persists);
    candidates.push(result(clear && high ? 0.95 : serviceChange && unsigned ? 0.78 : 0.55, PATTERNS[0].name));
  }
  if (task) {
    const clear = !resolved && !noTaskChange && temp && (unfamiliar || shared || outside);
    candidates.push(result(clear && high ? 0.95 : temp && !noTaskChange ? 0.72 : 0.55, PATTERNS[1].name));
  }
  if (startup) {
    const clear = !resolved && startupChange && (unfamiliar || temp && shared);
    candidates.push(result(clear && high ? 0.95 : startupChange ? 0.68 : 0.55, PATTERNS[2].name));
  }
  return candidates.sort((a, b) => b.confidence - a.confidence)[0] ?? result(0.1, '패턴 없음');
}
