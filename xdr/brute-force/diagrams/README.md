# XDR-01 문서 그림 원본

2026-10-12 문서 표시를 보완했습니다. 프로그램·설정·결과 데이터는 변경하지 않았습니다.

상위 폴더의 **작업정리.html**을 더블클릭하면 전체 기록을 읽을 수 있습니다.
HTML·IMPLEMENTATION.md·이 diagrams 폴더를 함께 복사하면 다른 PC에서도 본문과 그림을 인터넷 없이 볼 수 있습니다.
본문의 프로그램 파일 링크는 원래 자료실의 절대 경로이므로 다른 PC에서는 열리지 않을 수 있습니다.

| 내용 | 수정 원본 | 내보낸 그림 |
| --- | --- | --- |
| 대표 서비스 구성 | service-overview.drawio | service-overview.svg |
| 로컬 경보 실행 | xdr-sequence.mmd | xdr-sequence.svg |
| 추가 검사 부품 | gate-sequence.mmd | gate-sequence.svg |
| 기존 메모 조회 | notes-sequence.mmd | notes-sequence.svg |
| 판단 분기 | decision-flow.mmd | decision-flow.svg |

구성도는 편집 가능한 draw.io XML입니다. draw.io의 **File → Open from → Device**로 원본을 열어 수정하고 **File → Export as → SVG**로 내보냅니다.
제공한 SVG에도 같은 draw.io 편집 데이터가 포함되어 있습니다. 도형·선·문구를 편집할 수 있으며 단순 이미지 한 장이 아닙니다.

시퀀스 세 개와 판단 흐름 하나는 Mermaid 원본입니다. .mmd를 수정한 뒤 Mermaid 렌더러로 SVG를 다시 생성합니다.
예를 들어 Mermaid CLI가 설치된 PC에서는 다음 명령을 프로젝트 루트에서 실행할 수 있습니다. **이 CLI 명령은 재현 안내이며 이번 문서 작업에서 실행한 명령이 아닙니다.**

```powershell
mmdc -i xdr/brute-force/diagrams/xdr-sequence.mmd -o xdr/brute-force/diagrams/xdr-sequence.svg -c xdr/brute-force/diagrams/mermaid-theme.json
```

이번에는 기존 로컬 Mermaid 11.17.2 렌더러와 Playwright·Chrome을 사용해 SVG를 생성하고 XML 직렬화했습니다.
편집용 렌더러는 문서에 포함하지 않습니다. HTML에는 외부 라이브러리·CDN·웹 폰트가 없으며 로컬 SVG만 사용합니다.
Markdown·Mermaid 원본·SVG·HTML은 정적 파일이므로 원본 수정 후 내보낸 그림과 HTML도 갱신해야 합니다.

맑은 고딕을 우선 사용합니다. 파랑은 화면, 보라는 실행·판단, 초록은 인증·규칙·DB, 회색은 파일·배포, 점선 주황은 실제 연결 미확인 범위입니다.
구성도 실선은 구현 경로를 뜻하며 로컬 가상 실행을 운영 실행으로 바꾸어 표시하지 않습니다. 처리 시간 측정값은 넣지 않았습니다.
