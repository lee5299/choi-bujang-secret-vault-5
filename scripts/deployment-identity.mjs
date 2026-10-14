import { accessAppMetadata } from './access-app-metadata.mjs';

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (config?.step >= 5) {
    let original;
    try { original = new URL(config.originalApiUrl); } catch { throw new Error('5단계 원본 자료 HTTPS 주소를 확인하세요.'); }
    if (original.protocol !== 'https:' || original.username || original.password
        || original.search || original.hash || original.pathname === '/') {
      throw new Error('5단계 원본 자료 주소는 쿼리 없는 HTTPS 경로여야 합니다.');
    }
  }
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step)
      || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 단계 설정을 확인하세요.');
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    ...(config.step >= 5 ? { allowedRoutes: [...(config.allowedRoutes ?? [])], originalApiUrl: config.originalApiUrl } : {}),
    // 10단계부터 학생이 제출한 메모 한 건 복구 경로를 배포 식별 JSON에도 함께 공개합니다.
    ...(config.step >= 10 ? { restoreRoute: config.restoreRoute ?? null } : {}),
    // 학생 서버의 공개 연결 선언입니다. 운영 심판이 추가 필드를 소비하는지는 미확인입니다.
    ...(config.step >= 11 ? { accessApp: accessAppMetadata(config) } : {}),
  };
}
