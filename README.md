# 멍사주 (saju-me-cho)

한복을 입은 골든 리트리버 사주가 **멍사주**가 사실대로 말해주는 AI 사주 해석 웹앱입니다.  
이름·생년월일·출생 시간·성별·양력/음력을 바탕으로 Gemini가 해석하고, Supabase에 저장·공유할 수 있습니다.

배포: [https://saju-me-cho.vercel.app/](https://saju-me-cho.vercel.app/)

## 주요 기능

- Google 로그인 (Supabase Auth)
- 게스트도 먼저 해석 가능 → 로그인 후 저장
- 프로필 온보딩 / 수정, **내 사주 보기**, **새 사주 보기**
- 멍사주 톤 해석 + 한 줄 요약 카드 + Markdown 표
- 로딩 중 생년월일·시간을 한 줄씩 확인하는 UX
- 결과 공유 링크 (`/result/:shareToken`) — 로그인 없이 열람
- 사이드바 기록 목록 / 삭제
- SEO (OG, sitemap, robots) + Google Search Console 인증 파일

## 기술 스택

- React 19 + Vite 8
- React Router
- Supabase (Auth, Postgres, RLS)
- Gemini API (`fetch`, 모델 폴백)
- react-markdown + remark-gfm

## 시작하기

### 1. 클론 & 설치

```bash
git clone https://github.com/wjdbin/saju-me-cho.git
cd saju-me-cho
npm install
```

### 2. 환경 변수

`.env.example`을 복사해 `.env`를 만듭니다.

```bash
cp .env.example .env
```

```env
VITE_GEMINI_API_KEY=your_api_key_here
# optional
# VITE_GEMINI_MODEL=gemini-2.5-flash-lite

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_or_publishable_key_here
```

- Gemini 키: [Google AI Studio](https://aistudio.google.com/apikey)
- 기본 모델: `gemini-3.6-flash` (할당량 초과 시 `2.5-flash-lite` → `2.0-flash` 등 자동 시도)

### 3. Supabase / Google OAuth

Supabase Dashboard에서:

1. **Auth → Providers → Google** 에 Client ID / Secret 설정
2. **Auth → URL Configuration**
   - Site URL: `http://localhost:5173` (로컬) / 프로덕션 URL
   - Redirect URLs: `http://localhost:5173/**`, `https://saju-me-cho.vercel.app/**`
3. Google Cloud OAuth Web client
   - Authorized JavaScript origins: 로컬/프로덕션 origin
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

DB에는 `users` 프로필과 `saju_readings`(해석·`share_token`·`is_shared`)가 필요합니다.  
공유 결과는 `is_shared = true` 인 row만 anon이 SELECT 할 수 있게 RLS가 걸려 있어야 합니다.

### 4. 개발 서버

```bash
npm run dev
```

`http://localhost:5173` 으로 접속합니다.

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 미리보기 |
| `npm run lint` | Oxlint |

## 라우트

| 경로 | 설명 |
|------|------|
| `/` | 메인 앱 (게스트/로그인) |
| `/result/:shareToken` | 공유된 사주 결과 (로그인 불필요) |

Vercel SPA rewrite는 `vercel.json`에 있습니다.

## 프로젝트 구조

```text
src/
  App.jsx
  main.jsx
  pages/                  HomePage, ResultPage
  components/
    brand/                마스코트·히어로
    navigation/           헤더·사이드바
    profile/              프로필 카드·모달·입력 필드
    saju/                 입력·로딩·결과·공유 결과
  hooks/useSajuApp.js
  lib/
  styles/
```

## License

TBD
