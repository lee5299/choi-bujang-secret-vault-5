// 2단계: 공개 API입니다. 로그인/소유자 검사는 다음 단계에서 추가합니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const databaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!databaseUrl || !secretKey) {
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }

  try {
    const endpoint = new URL('/rest/v1/library_notes', databaseUrl);
    if (endpoint.protocol !== 'https:') throw new Error('Invalid configuration');
    endpoint.searchParams.set('select', 'title,content');
    endpoint.searchParams.set('order', 'created_at.asc,id.asc');
    const upstream = await fetch(endpoint, {
      headers: { apikey: secretKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) throw new Error('Database unavailable');
    const rows = await upstream.json();
    if (!Array.isArray(rows) || rows.some(row =>
      typeof row?.title !== 'string' || typeof row?.content !== 'string')) {
      throw new Error('Invalid data');
    }
    return response.status(200).json({
      notes: rows.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    // DB 응답과 예외에 설정 정보가 포함될 수 있으므로 출력하지 않습니다.
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
