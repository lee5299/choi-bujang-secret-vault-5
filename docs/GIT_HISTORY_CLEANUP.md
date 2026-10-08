# data.json Git 기록 정리 (2026-10-08)

## 문제와 변경

과거 커밋에 `data.json`과 `public/data.json`이 남아 있어 GitHub 변경 기록으로 본문을 볼 수 있었습니다.
현재 공개 빌드에서 `/data.json`을 제외하는 것만으로는 Git의 이전 내용을 지울 수 없습니다.

원래 작업 폴더를 보존한 별도 사본에서 git-filter-repo v2.47.0을 사용하여 두 경로만 전체 이력에서 제거했습니다.
원본의 미커밋 파일·요청 원문·학습 DB에는 쓰기 작업을 하지 않았습니다. 로컬 원본 data.json도 보존합니다.
이 저장점에는 두 파일이 없으며 `.gitignore`에 `/data.json`, `/public/data.json`을 추가했습니다.
파일 이름을 언급한 코드·문서는 유지합니다. 공개 가능한 가상 시험과 기존 메모 API 기능도 유지합니다.

변경 대상: 두 파일의 과거 이력, `.gitignore`의 재추적 방지, README 안내와 이 기록입니다.
삭제된 본문·비밀값·실제 개인정보는 이 문서·명령 출력·새 제출물에 기록하지 않습니다.

## 검토와 적용

전체 이력에 두 경로가 남지 않았는지 `git log --all -- data.json public/data.json`으로 확인합니다.
정상 예상은 출력 없음입니다. `git ls-files -- data.json public/data.json`도 출력이 없어야 합니다.
기존 Git에서 두 경로가 사용한 blob 객체가 정리본의 도달 가능한 객체에 남아 있는지도 확인합니다.
두 파일 외에는 원래 저장점과 파일 객체를 대조하여 동일함을 확인하고, 코드 시험을 실행합니다.

검토용 사본에서 실제 확인한 결과: 두 경로의 전체 이력 조회·현재 추적 목록은 출력 없음,
과거 데이터 blob 3개의 도달 가능한 잔존 객체는 0개, 다른 프로그램 파일 객체 차이는 0개입니다.
기존 18개 커밋은 개수를 유지하며 ID가 바뀌었습니다.
`node --test test/*.test.mjs` 57개 통과, `npm.cmd run build -- --local` 성공.
이 사본은 기존에 커밋한 코드만 포함하므로 원래 작업 폴더의 다른 미커밋 시험 4개는 포함하지 않았습니다.
XDR-02의 저장된 결과는 block 8·alert 9·record 9, 정상 오차단 0건을 유지합니다.

GitHub 반영은 기존 main의 이력을 교체하는 작업입니다. main의 원격 커밋을 다시 조회하고,
확인한 원격 커밋이 바뀌지 않은 경우에만 `--force-with-lease`로 정리된 main 하나를 올립니다.
다른 브랜치·태그를 무조건 지우는 mirror push는 사용하지 않습니다. 원격이 바뀌었으면 교체를 멈추고 새 변경을 먼저 보존합니다.
Vercel이 GitHub main과 연결되어 있으면 이 push도 새 배포를 시작할 수 있습니다.
배포 화면의 새 커밋·Ready 상태와 기존 로그인·메모 CRUD·무로그인 거부는 별도 확인합니다.

Git 이력을 고치면 기존 커밋 ID가 달라지므로, XDR-02 제출에는 정리 후 새 저장점의 ID를 사용합니다.
기존 배포를 확인했던 당시의 커밋 ID는 과거 확인 기록으로 유지합니다.
예전 사본을 다시 merge/push하면 제거한 이력이 되살아날 수 있어 새 이력 기준으로 동기화해야 합니다.
원래 폴더를 동기화할 때에도 다른 미커밋 파일과 로컬 메모 파일은 보존해야 합니다.

GitHub의 옛 커밋 URL·PR 참조·포크·이미 내려받은 사본은 이력 교체만으로 전부 없어졌다고 확인할 수 없습니다.
민감한 본문이 GitHub의 옛 커밋 URL에서 계속 보이면 [GitHub Support](https://support.github.com/)에
캐시·관련 참조 정리를 요청해야 합니다. 공개 가능한 비민감 자료는 지원 제거 대상이 아닐 수 있습니다.
[GitHub 공식 제거 안내](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)를 참고합니다.

## 다시 확인하기

명령: `git log --all -- data.json public/data.json`.
GitHub에서 **Code → 파일 목록**, 이어 **Commits → 최신 저장점**을 누릅니다.
정상 결과: 두 데이터 파일과 본문이 새 이력·파일 목록에 없고 기존 프로그램 파일은 유지됩니다.
거부되어야 할 결과: 두 파일의 재추적·원격 변경을 덮어쓰는 push·기존 원본 파일이나 DB 자료의 삭제입니다.
XDR 가상 판단은 `npm.cmd run xdr:run -- web-injection`으로 재확인하며 정상 record·애매한 alert·명확한 반복 공격 block 후보를 예상합니다.
