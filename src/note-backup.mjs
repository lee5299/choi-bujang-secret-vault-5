import { createHash } from 'node:crypto';

// 10단계 메모 봉인 사본의 내용 지문입니다. docs/sql/stage10-note-restore-apply.sql의
// library_note_content_sha256(제목, 본문)과 같은 바이트를 해시합니다: UTF-8(제목바이트수 + ':' + 제목 + 본문).
// 제목 길이를 앞에 붙여 제목·본문 경계를 옮긴 다른 내용이 같은 지문이 되지 않게 합니다.
// 지문은 서버 안에서만 대조하고 응답·로그·기록에는 일치 여부만 남깁니다.
export function noteContentSha256(title, content) {
  if (typeof title !== 'string' || typeof content !== 'string') throw new TypeError('invalid_note_content');
  return createHash('sha256')
    .update(`${Buffer.byteLength(title, 'utf8')}:${title}${content}`, 'utf8')
    .digest('hex');
}

export const SHA256_HEX = /^[0-9a-f]{64}$/u;
