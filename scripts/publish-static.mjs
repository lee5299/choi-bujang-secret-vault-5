import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// A의 원본은 public/에 보존하되 웹에 배포하는 정적 파일에서는 제외합니다.
export async function publishStatic(root) {
  const source = resolve(root, 'public'), target = resolve(root, 'dist');
  const disabled = new Set(['operations-login.html', 'operations-entry.mjs', 'operations-controller.mjs', 'operations-page.mjs']);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, filter: path => !disabled.has(relative(source, path).replaceAll('\\', '/')) });
  for (const name of await readdir(target, { recursive: true })) {
    if (!name.endsWith('.html')) continue;
    const path = resolve(target, name);
    const html = (await readFile(path, 'utf8')).replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/^.*\/\/.*관리자 A 화면 사용 중지.*\r?\n/gmu, '');
    await writeFile(path, html);
  }
}
