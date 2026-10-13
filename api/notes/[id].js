import { handleNotes } from '../notes.js';
import { requestPath } from '../../src/resource-id.mjs';

// Vercel의 /api/notes/:id 동적 경로를 같은 인증·CRUD 처리에 연결합니다.
export default function handler(request, response) {
  const path = requestPath(request.url);
  return handleNotes(request, response, /^\/api\/notes\/([^/]+)$/u.exec(path ?? '')?.[1] ?? '');
}
