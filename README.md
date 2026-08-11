# saju-me-cho

이름·생년월일·출생 시간·성별·양력/음력을 입력하면 Gemini API로 **사주 기본 차트 해석**을 보여주는 React 웹앱입니다.

## 주요 기능

- 사주 입력 폼 (이름, 생년월일, 시간, 성별, 양력/음력)
- Gemini API(`gemini-3.6-flash`)로 성격·기질·재능 해석
- 해석 결과 마크다운 렌더링
- 모노톤·가운데 정렬 UI

## 기술 스택

- React + Vite
- Gemini API (`fetch`)
- react-markdown

## 시작하기

### 1. 저장소 클론

```bash
git clone https://github.com/wjdbin/saju-me-cho.git
cd saju-me-cho
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env.example`을 참고해 프로젝트 루트에 `.env` 파일을 만듭니다.

```bash
cp .env.example .env
```

`.env` 내용:

```env
VITE_GEMINI_API_KEY=your_api_key_here
```

API 키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받을 수 있습니다.

> `.env`는 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 으로 접속합니다.

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | Oxlint 실행 |

## 프로젝트 구조

```text
src/
  App.jsx        # 입력 폼 + 해석 UI
  gemini.js      # Gemini API 호출 (fetch)
  sajuPrompt.js  # 사주 해석 프롬프트
  App.css        # 스타일
```

## License

TBD
