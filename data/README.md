# data/ — 소유자 프로필

이 폴더는 실험 #001(「나를 아는 검사」)의 결과를 담습니다. 그 결과가 앞으로
Claude가 어떤 실험을 제안·구현할지 정하는 **참고 자료**가 됩니다.

## 흐름

1. `experiments/001-about-you/`를 브라우저로 열어 검사를 끝까지 완료한다.
2. 결과 화면에서 **JSON 다운로드**를 눌러 `profile.json`을 받는다.
3. 그 파일을 이 폴더에 `data/profile.json`으로 저장한다.
4. Claude에게 **"프로필 반영해줘"**라고 말한다. Claude가 `profile.json`을 읽고
   `data/profile.summary.md`(사람이 읽는 요약)를 갱신하고, `CLAUDE.md`의
   소유자 프로필 섹션을 업데이트한다.

## 파일

- `profile.json` — 검사 원본 답변 + 파생 지표. **git에 올리지 않음**(`.gitignore`).
- `profile.summary.md` — Claude가 만든 요약. 커밋 대상. 다음 실험 아이디어의 근거.
- `profile.schema.json` — 결과 JSON의 형태 참고용.

> 개인 답변(자유 서술 포함)은 저장소에 공개되지 않도록 `profile.json`은
> 기본적으로 gitignore 처리되어 있습니다. 공개하고 싶다면 `.gitignore`에서 빼세요.
