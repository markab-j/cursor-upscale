# Cursor Upscale

한국어 | [English](README.en.md) | [Demo](https://markab-j.github.io/cursor-upscale/)

픽셀 모양을 유지하면서 `.cur`, `.ani` 커서를 확대합니다.

## 웹 데모

배율을 입력하고 파일이나 폴더를 선택하거나 끌어다 놓으세요. 파일 수와 생성 가능 여부를 확인한 뒤 변환 버튼을 누르세요. 처리가 끝나면 다운로드할 수 있습니다. 단일 파일은 CUR/ANI로, 폴더나 여러 파일은 ZIP으로 저장합니다. 파일은 브라우저 안에서만 처리합니다.

로컬에서 열려면 아래 명령을 실행한 뒤 <http://localhost:8000>에 접속하세요.

```sh
python3 -m http.server 8000 --directory docs
```

GitHub Pages에서는 게시 대상을 `main` 브랜치의 `/docs` 폴더로 지정하면 됩니다.

## 설치

Python 3.10 이상과 [uv](https://docs.astral.sh/uv/getting-started/installation/)를 설치한 뒤, 프로젝트 폴더에서 실행하세요.

```sh
uv sync
```

## 사용법

폴더를 지정하면 하위 폴더의 커서까지 찾아 2배로 확대합니다.

```sh
uv run python cursor_upscale.py ./cursors
```

`--scale`로 2 이상의 정수 배율을 지정할 수 있습니다.
`--all`을 쓰면 2배·5배·10배 중 만들 수 있는 크기를 한 번에 추가합니다.

```sh
uv run python cursor_upscale.py ./pointer.cur --scale 4
uv run python cursor_upscale.py ./cursors --all
```

기본 화면에는 결과 요약만 나옵니다. 파일별 처리 내역도 보려면 명령 끝에 `-v` 또는 `--verbose`를 붙이세요.

## 결과

- 폴더를 넣으면 `cursors_upscaled/`에 저장합니다.
- 파일을 넣으면 `pointer_upscaled.cur`처럼 이름 뒤에 `_upscaled`를 붙여 저장합니다.

여러 배율은 각각의 커서 파일 안에 함께 담습니다. 폴더를 처리할 때는 파일명과 하위 폴더 구조를 유지하고, `.inf` 파일도 함께 복사합니다.

원본과 기존 출력 파일은 덮어쓰지 않습니다. 다시 실행하려면 이전 출력을 옮기거나 이름을 바꿔 주세요.

최대 크기는 **256×256px**입니다. 이를 넘는 배율은 건너뛰며, 2배 확대도 불가능한 파일은 오류로 처리합니다.
