# CLAUDE.md — 작업 가이드 (for Claude Code)

개인 실험실 아카이브(Personal Lab Archive). 주말마다 작은 웹 실험을 하나씩
번호를 붙여 쌓는 정적 사이트. 모토: **완성도보다 완료 (done over perfect).**

자세한 비전은 [PROJECT_BRIEF.md](PROJECT_BRIEF.md) 참고.

---

## 이 저장소의 구조

```
experiments/<nnn-slug>/     # 실험 1개 = 폴더 1개 (자체 완결 static)
  index.html                #   실험 본체 (URL 직접 접근으로 독립 실행 가능)
  meta.json                 #   카드용 메타데이터 (id, slug, title, date, week, tags, oneliner)
  thumb.svg                 #   썸네일 (없으면 카드에 플레이스홀더)
site/
  build.js                  # 핵심 빌드: experiments/ 스캔 → dist/ 생성. 의존성 0 (Node 내장만)
  templates/                #   index.html 템플릿 + style.css (인덱스 전용 chrome)
site.config.json            # 사이트 제목/모토 (현재 임시값)
data/                       # 소유자 프로필 (실험 #001 결과) — 아래 참고
dist/                       # 빌드 산출물 (gitignore, 배포 대상)
.github/workflows/deploy.yml# push → build → GitHub Pages
```

## 빌드 / 로컬 확인

- 빌드: `npm run build` (= `node site/build.js`) → `dist/` 생성
- 로컬 서버: `npm run serve` → http://localhost:8775 (포트 대장: `D:\AI_WORK\PORT_LIST.json`)
- 개발 머신에 Node v24 설치됨(2026-07-15). 각 실험 `index.html`은 자체 완결이라
  브라우저로 직접 열어도 동작한다. 배포는 GitHub Actions가 Node 20으로 실행.
- `site/templates/index.html`은 빌드 전 템플릿({{PLACEHOLDER}} 포함) — 직접 열어보는
  파일이 아니다. 완성본은 `npm run serve` 후 http://localhost:8775 로 확인.

## 새 실험 추가 흐름 (항상 이 흐름을 유지할 것)

1. `experiments/`에서 기존 폴더 복사 → `<nnn-slug>` 로 이름 변경
2. `index.html` 교체(자체 완결, 모바일 터치 대응), `meta.json` 수정, `thumb.svg` 교체
3. `git push` → Actions가 빌드/배포. **코드 수정 불필요.**

커밋은 실험 단위/기능 단위로 잘게 쪼갠다 (잔디 히트맵의 재료).

---

## ★ 소유자 프로필 — 다음에 뭘 만들지의 근거

실험 **#001「나를 아는 검사」**(`experiments/001-about-you/`)는 소유자의 성향·취향을
파악하는 설문이다. 그 결과를 이후 실험 아이디어의 **1차 참고 자료**로 삼는다.

### 프로필 반영 절차 (소유자가 "프로필 반영해줘"라고 하면)

1. `data/profile.json`을 읽는다 (소유자가 #001 완료 후 저장해둔 파일).
2. 사람이 읽는 요약 `data/profile.summary.md`를 생성/갱신한다.
3. 아래 **소유자 프로필 요약** 블록을 그 내용으로 채운다.
4. 프로필에 근거해 다음 실험 후보 2–3개를 제안한다.

### 소유자 프로필 요약 (2026-07-15 반영 · 상세: `data/profile.summary.md`)

- MBTI 유형: **INFJ** (I -5 / N +1 / F -4 / J +8) — 혼자 깊게, 계획적으로, 공유는 완성 후.
- 만들고 싶어 하는 것: **시각화 · 도구 · 언어/텍스트 · 게임** (+2씩).
  **비선호: 목적 없는 장난감(-3), 오디오(-2)** — toy/사운드 실험은 제안하지 말 것.
- 끌리는 주제: **언어, 게임(명조·메이플 — 게임 주변 도구 제작 경험 있음), 심리**.
- 미학: 다크 모드 기본, 파스텔, 클린/모던, 밀도 균형, 모션 적당히.
- 작업 스타일: 실험당 **여러 주말**, 주기는 내킬 때, 새 기술 배우며 만드는 걸 즐김,
  완성물 공유가 큰 동기. **⚠️ "완성도보다 완료" 모토에 비동의(-2)** — 이 소유자에겐
  "대충 말고, 작게 제대로"가 맞다. 실험 스코프는 작게 자르되 완성도는 챙길 것.
- 자유 서술 씨앗: ① 일상을 편하게 하는 도구를 만들고 싶은데 **뭘 만들지 모르겠음**
  ② **"내가 무엇을 원하는가"**라는 질문 ③ 게임 유틸(스케쥴러/파티서버) 제작 경험
  ④ "매 순간 알찬 삶" — 시간/기록/회고에 관심.

---

## 미확정 사항 (소유자 결정 대기)

- [ ] 사이트 이름·도메인 — 현재 `site.config.json`에 임시값 (`실험실 (임시)`).
- [x] 언어 — **한국어/영어 병기**로 확정.
- [ ] 라이선스 — 미정.
- [x] 실험 주기 목표 — **정해진 주기 없음(내킬 때). 실험 1개 = 1~3주말 허용,
  단 진행 중엔 주말마다 눈에 보이는 진전을 커밋** (#001 결과 반영).

## 코드 스타일 메모

- 실험 본체는 바닐라 HTML/CSS/JS 기본. 라이브러리는 실험별로 자유(CDN 허용).
- UI 텍스트는 병기(한국어 위주 + 영어 보조).
- 다크/라이트 모두 `prefers-color-scheme`로 대응.
