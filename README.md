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

## Google Drive 동기화

모든 실험 데이터는 기본적으로 기존처럼 브라우저 `localStorage`에 저장된다. Google 계정을
연결한 경우에만 Google Drive의 숨김 `appDataFolder`에 `personal-lab-sync-v1.json` 파일로
동기화한다. 최초 연결 때 양쪽에 서로 다른 값이 있으면 자동으로 덮어쓰지 않고 선택을
요청하며, 선택하지 않은 쪽은 해당 브라우저에 백업한다.

정적 GitHub Pages용 설정:

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 선택한다.
2. **APIs & Services → Library**에서 **Google Drive API**를 사용 설정한다.
3. **Google Auth Platform**(구 OAuth consent screen)의 Branding/Audience를 설정한다.
   외부 앱을 `Testing`으로 둘 경우 사용할 Google 계정을 Test users에 추가한다.
4. **Data Access**에 `https://www.googleapis.com/auth/drive.appdata` scope만 추가한다.
5. **Clients → Create client → Web application**을 만들고 Authorized JavaScript origins에
   `https://daeho0818.github.io`를 추가한다. 로컬 확인이 필요하면
   `http://localhost:8775`도 추가한다(Origin에는 `/Dh_Loadmap/` 같은 경로를 넣지 않는다).
6. 생성된 공개 **Client ID**를 [`shared/lab-config.js`](shared/lab-config.js)의
   `LAB_GOOGLE_CLIENT_ID`에 넣는다. Client secret은 생성하거나 저장소에 넣지 않는다.
7. 소유자만 쓸 때는 `Testing` + Test user로 둘 수 있다. 장기 사용 시 Testing 상태의 토큰
   정책을 피하려면 Audience에서 `In production`으로 게시하되, 요청 scope는 위 하나로 유지한다.

OAuth를 설정하지 않았거나 로그아웃한 상태, Drive API 오류 상태에서는 원격 데이터로
로컬 값을 지우지 않고 계속 브라우저 저장만 사용한다. `file://` 직접 열기에서는 OAuth 대신
로컬 저장을 사용하고, 로그인 검증은 등록한 HTTP(S) origin에서 한다.

Google OAuth 액세스 토큰의 만료(일반적으로 약 1시간)는 비활성화할 수 없다. 연결된 탭은
만료 전에 `prompt: ""`로 기존 승인을 이용한 갱신을 시도하고, API가 401을 반환해도 한 번만
갱신 후 재시도한다. Google 세션 만료·동의 철회·브라우저의 팝업 제한 등으로 무인 갱신이
불가능하면 반복 팝업을 띄우지 않고 **Google 계정 연결** 버튼을 통한 사용자 재연결을
요청한다. 이 경우에도 로컬 데이터와 Drive 충돌 보호 상태는 유지된다.

## 라이선스

미정 (소유자 결정 대기).
