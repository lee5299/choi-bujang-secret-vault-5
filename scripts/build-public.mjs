import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';
import { accessAppMetadata } from './access-app-metadata.mjs';
import { buildPublicRegression } from './public-regression.mjs';
import { publishStatic } from './publish-static.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
await mkdir(resolve(root, 'public'), { recursive: true });
await buildPublicRegression();
await writeFile(resolve(root, 'public', 'access-app.json'), `${JSON.stringify(accessAppMetadata(config), null, 2)}\n`, 'utf8');
await rm(output, { force: true });
console.log('공개 data.json을 제외했습니다. 이전 빌드 파일도 제거합니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
await publishStatic(root);
console.log('배포 정적 파일을 dist/에 생성했습니다. 관리자 A 화면·주석 원본은 배포하지 않습니다.');
