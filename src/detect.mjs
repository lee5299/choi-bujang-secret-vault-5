// docs/DETECT_EVENTS.md의 로컬 사건만 읽습니다. 실제 신원 검증은 제공 엔진의 경계입니다.
// 입력이나 추가 필드의 내용을 오류·로그·파일·전역 상태에 남기지 않습니다.
const invalidEvents = () => { throw new TypeError('invalid_detection_events'); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ownValue(record, key) {
  if (!isRecord(record)) invalidEvents();
  const field = Object.getOwnPropertyDescriptor(record, key);
  // JSON 사건의 직접 값만 받으며 접근자나 상속된 필드로 입력을 채우지 않습니다.
  if (!field || !Object.hasOwn(field, 'value')) invalidEvents();
  return field.value;
}

export function readDetectionEvents(events) {
  if (!Array.isArray(events)) invalidEvents();
  const safeEvents = [];
  for (let index = 0; index < events.length; index += 1) {
    const element = Object.getOwnPropertyDescriptor(events, String(index));
    if (!element || !Object.hasOwn(element, 'value')) invalidEvents();
    const event = element.value;
    const at = ownValue(event, 'at');
    const method = ownValue(event, 'method');
    const sub = ownValue(ownValue(event, 'identity'), 'sub');
    const timestamp = typeof at === 'string' ? Date.parse(at) : NaN;
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== at
        || typeof method !== 'string' || method.trim().length === 0
        || typeof sub !== 'string' || sub.trim().length === 0) invalidEvents();
    // 허용 목록만 새 객체로 복사합니다. 입력의 기기·역할·토큰·자료 필드는 읽지 않습니다.
    safeEvents.push({ at, method, identity: { sub } });
  }
  return safeEvents;
}

// 사용자별 어느 10분 창에서든 GET 120건 초과만 찾는 로컬 연습 규칙입니다.
// 기기·네트워크는 이 사건 계약에 없으므로 복합 신호나 기기별 탐지로 간주하지 않습니다.
export function findBurstReadSubject(events) {
  const reads = readDetectionEvents(events)
    .filter(event => event.method === 'GET')
    .map(event => ({ at: Date.parse(event.at), subject: event.identity.sub }))
    .sort((left, right) => left.at - right.at);
  const windows = new Map();
  for (const read of reads) {
    let window = windows.get(read.subject);
    if (!window) {
      window = { times: [], start: 0 };
      windows.set(read.subject, window);
    }
    window.times.push(read.at);
    while (read.at - window.times[window.start] > 10 * 60 * 1000) window.start += 1;
    if (window.times.length - window.start > 120) return read.subject;
  }
  return null;
}

export function detect(events) {
  const subject = findBurstReadSubject(events);
  if (subject === null) return { action: 'observe' };
  // 한 호출에서 최초 초과 대상의 제안 하나만 반환합니다. 권한을 직접 변경하지 않습니다.
  // subject는 로컬 가명 사용자이며 기기 ID가 아닙니다. 실제 집행·시간은 심판의 영역입니다.
  return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
}
