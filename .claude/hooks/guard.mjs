// Claude Code PreToolUse 훅: 위험한 Git 명령과 비밀값이 섞인 커밋을 막습니다.
// 종료 코드 2 = 실행 차단(이유는 stderr로 Claude에게 전달), 0 = 통과.
import { execFileSync } from 'node:child_process';

const block = (message) => {
  process.stderr.write(`[방어전 안전장치] ${message}\n막힌 이유를 사용자에게 보여 주고 우회하지 마세요.\n`);
  process.exit(2);
};

let input = '';
for await (const chunk of process.stdin) input += chunk;
let command = '';
try {
  command = String(JSON.parse(input)?.tool_input?.command ?? '');
} catch {
  process.exit(0);
}
if (!/\bgit\b/u.test(command)) process.exit(0);

// 여러 명령을 이어 쓴 경우 각각 검사합니다.
const parts = command.split(/&&|\|\||;|\r?\n|\|/u).map((part) => part.trim()).filter(Boolean);
const gitArgs = (part) => {
  const match = /(?:^|\s)git(?:\.exe)?\s+(?:-C\s+\S+\s+)?(.*)$/u.exec(part);
  return match ? match[1] : null;
};

let commitRequested = false;
for (const part of parts) {
  const args = gitArgs(part);
  if (args === null) continue;
  if (/^reset\b.*--hard/u.test(args)) block('git reset --hard는 쓰지 않습니다 (AGENTS.md). 되돌릴 내용은 git status·git diff로 먼저 보여 주세요.');
  if (/^clean\b/u.test(args)) block('git clean은 미추적 작업과 local-only 자료를 지울 수 있어 막았습니다.');
  if (/^add\b/u.test(args) && /(^|\s)(-A|--all|\.|\*|:\/)(\s|$)/u.test(args.slice(3))) {
    block('git add -A / git add . 는 다른 미커밋 작업을 함께 담습니다. 대상 파일을 하나씩 지정하세요.');
  }
  if (/^push\b/u.test(args) && /(^|\s)(-f|--force|--force-with-lease)(=|\s|$)|\s\+\S/u.test(args)) block('강제 push는 막았습니다.');
  if (/^commit\b/u.test(args)) {
    if (/(^|\s)(-a|--all|-[a-zA-Z]*a[a-zA-Z]*)(\s|$)/u.test(args.slice(6)) && !/(^|\s)--amend(\s|$)/u.test(args)) {
      block('git commit -a 는 수정된 다른 작업까지 커밋합니다. 파일을 git add로 지정한 뒤 커밋하세요.');
    }
    commitRequested = true;
  }
}
if (!commitRequested) process.exit(0);

// 커밋 직전 스테이징 검사
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
});

let names;
let diff;
try {
  names = git('diff', '--cached', '--name-only', '--no-renames').split(/\r?\n/u).filter(Boolean);
  diff = git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff');
} catch (error) {
  block(`스테이징 검사를 실행하지 못했습니다: ${error.message.split('\n')[0]}. git status를 확인하세요.`);
}

const forbidden = names.filter((name) => /(^|\/)bundle-notes\.json$|^artifacts\/|(^|\/)\.env(\.|$)|^local-only\/|(^|\/)data\.json$/u.test(name));
if (forbidden.length) block(`커밋하면 안 되는 파일이 스테이징되었습니다: ${forbidden.join(', ')}`);

// scripts/bundle.mjs와 같은 비밀값 패턴 + 연락처(예시 도메인 제외)
const secretPatterns = [
  ['개인키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
  ['Bearer 토큰', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/u],
  ['Supabase 서버 키', /\bsb_secret_[A-Za-z0-9_-]{12,}/u],
  ['API 키', /\bsk-[A-Za-z0-9_-]{20,}/u],
  ['JWT', /\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/u],
];
const email = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/giu;
const exampleDomain = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|anthropic\.com)$/iu;

const findings = [];
let file = '';
for (const line of diff.split(/\r?\n/u)) {
  if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/u, ''); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  for (const [label, pattern] of secretPatterns) if (pattern.test(line)) findings.push(`${file}: ${label}`);
  for (const match of line.matchAll(email)) if (!exampleDomain.test(match[1])) findings.push(`${file}: 연락처(메일)`);
}
if (findings.length) {
  block(`스테이징된 변경에서 비밀값·연락처 패턴 ${findings.length}건을 찾았습니다 (값은 출력하지 않음):\n- ${[...new Set(findings)].join('\n- ')}`);
}
process.stderr.write(`[방어전 안전장치] 커밋 전 검사 통과: 파일 ${names.length}개, 비밀값·연락처 패턴 0건\n`);
process.exit(0);
