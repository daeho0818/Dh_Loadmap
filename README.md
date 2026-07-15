# 개인 실험실 아카이브 · Personal Lab Archive

> 관심이 생길 때마다 작은 웹 실험을 하나씩 만들어 번호를 붙여 쌓는 개인 사이트.
> **작게, 제대로 · small but done right.**

neal.fun 류의 개인 실험 아카이브. 실험 1개 = 독립 실행되는 정적 페이지 1개.
인덱스에 실험 카드가 최신순으로 쌓이고, 활동 잔디(주 단위 히트맵)로 누적이
시각화된다. 빌드는 의존성 없는 Node 스크립트 하나(`site/build.js`).

## 구조

```
experiments/<nnn-slug>/   실험 1개 (index.html + meta.json + thumb.svg)
site/build.js             experiments/ 스캔 → dist/ 생성
site/templates/           인덱스 템플릿 + 공용 CSS
site.config.json          사이트 제목/모토
data/                     소유자 프로필 (실험 #001 결과)
dist/                     빌드 산출물 (배포 대상)
```

## 실행

```bash
npm run build      # dist/ 생성
npm run serve      # 빌드 후 http://localhost:8775 로 미리보기
```

> Node ≥18 필요. 각 실험의 `index.html`은 자체 완결이라 브라우저로 직접 열어도 동작.

## 새 실험 추가

1. `experiments/`의 폴더 하나 복사 → 이름 변경
2. `index.html` / `meta.json` / `thumb.svg` 수정
3. `git push` → GitHub Actions가 빌드·배포 (`.github/workflows/deploy.yml`)

## 배포 (GitHub Pages)

1. 이 폴더를 git 저장소로 만들고 GitHub에 push
   ```bash
   git init && git add -A && git commit -m "init: v0.1 lab archive"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. GitHub 저장소 → **Settings → Pages → Source: GitHub Actions**
3. 이후 `main`에 push할 때마다 자동 빌드·배포.

## 첫 실험

**#001 「나를 아는 검사 · Know Thyself」** — 이 실험실 주인의 성향·취향을 파악하는
10–30분짜리 설문. 결과 JSON이 앞으로 만들 실험의 방향을 정하는 자료가 된다.
자세한 흐름은 [data/README.md](data/README.md) 참고.

## 라이선스

미정 (소유자 결정 대기).
