import { handleNotes } from '../notes.js';

// Vercel의 /api/notes/:id 동적 경로를 같은 인증·CRUD 처리에 연결합니다.
export default function handler(request, response) {
  return handleNotes(request, response, request.query?.id ?? '');
}
