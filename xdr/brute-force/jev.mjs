// 공식 계약: https://docs.typesafe.ai/api
const endpoint = 'https://api.typesafe.ai/v1/systemone';
const patterns = new Set(['password_guessing', 'password_spraying']);

function projectEvidence(input) {
  if (!patterns.has(input?.pattern)) throw new Error('Jev evidence invalid');
  const state = { pattern: input.pattern };
  for (const field of ['level', 'failureCount', 'accountCount', 'windowSeconds']) {
    const value = input[field];
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error('Jev evidence invalid');
    }
    state[field] = value;
  }
  for (const field of ['samePasswordSignal', 'successAfterFailures']) {
    if (typeof input[field] !== 'boolean') throw new Error('Jev evidence invalid');
    state[field] = input[field];
  }
  return state;
}

export function createJevClient({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/u.test(apiKey)) {
    throw new Error('실행 환경의 비밀 설정에 TYPESAFE_API_KEY를 설정하세요. 키 값은 출력하지 마세요.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Jev HTTP client unavailable');
  const stats = { attempted: 0, succeeded: 0, failed: 0 };
  const client = async (input, { signal = AbortSignal.timeout(5000) } = {}) => {
    const state = projectEvidence(input);
    stats.attempted += 1;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'jev-latest', state,
          questions: {
            brute_force: {
              type: 'noul',
              instructions: 'Do the supplied login-failure signals indicate malicious brute force under MITRE ATT&CK T1110.001 (password guessing) or T1110.003 (password spraying)? Use only the supplied evidence; do not invent timing, identities, password contents or other events. Missing windowSeconds means the time window is unknown. Rule level alone does not establish an attack.',
              criteria: {
                true: 'Systematic repeated guessing within a short time, or the same-password signal across multiple accounts, supported by the supplied evidence.',
                false: 'Ordinary login mistakes or benign activity, without evidence of systematic guessing or spraying. Success after failures can support a benign explanation.',
              },
            },
          },
        }),
      });
      if (!response.ok) throw new Error('Jev HTTP failure');
      const answer = (await response.json())?.answers?.brute_force;
      if (answer?.type !== 'noul' || typeof answer.noul !== 'number'
          || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) {
        throw new Error('Jev response invalid');
      }
      stats.succeeded += 1;
      // Noul은 공격이라는 명제의 확률입니다. Choice/Score의 confidence와 구분합니다.
      return { confidence: answer.noul };
    } catch {
      stats.failed += 1;
      // 원본 응답·오류에는 민감값이 있을 수 있으므로 전달하거나 기록하지 않습니다.
      throw new Error('Jev unavailable');
    }
  };
  client.getStats = () => ({ ...stats });
  return client;
}
