# 5단계 다이어그램 원본과 이미지

| 내용 | 편집 원본 | 로컬 SVG |
| --- | --- | --- |
| 대표 서비스 구성 | service-overview.drawio | service-overview.svg |
| Auth 요청 순서 | login-sequence.mmd | login-sequence.svg |
| 메모 요청·거부 순서 | notes-sequence.mmd | notes-sequence.svg |

draw.io XML은 draw.io 데스크톱 또는 diagrams.net의 File → Open from → Device로 엽니다.
도형·글자를 수정한 후 SVG로 내보냅니다. Mermaid 시퀀스는 .mmd를 수정한 뒤 SVG를 다시 생성합니다.
공통 테마는 mermaid-theme.json입니다. 처리 시간은 실측하지 않았으며 그림에 시간을 표시하지 않습니다.

재생성 참고 명령 (Node·Mermaid CLI 필요):

```powershell
npx --package @mermaid-js/mermaid-cli mmdc -i 5/diagrams/login-sequence.mmd -o 5/diagrams/login-sequence.svg
npx --package @mermaid-js/mermaid-cli mmdc -i 5/diagrams/notes-sequence.mmd -o 5/diagrams/notes-sequence.svg
```

작업정리.html·작업정리.md와 이 폴더를 같은 상대 위치로 복사하면 다른 PC에서 본문·그림을 볼 수 있습니다.
HTML을 읽는 데 Mermaid·draw.io·인터넷은 필요하지 않습니다. 외부 프로젝트·캡처·산출물 링크는 별도 자료이며
프로젝트 구조가 없으면 열리지 않을 수 있습니다. Markdown·HTML·다이어그램은 자동 동기화하지 않습니다.

시점과 출처: 5단계 당시 코드·기록을 기준으로 작성했습니다. XDR와 후속 Git 이력 정리는 별도입니다.
