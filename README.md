# 분양 현장 관리 — 관리자 페이지

사진 · PDF · 설명만 올리면 분양 현장 정보가 저장되는 관리자 페이지입니다.
**Next.js 16 (App Router) + Supabase (DB · 로그인 · 파일 저장)**

## 기능

| 화면 | 주소 | 하는 일 |
|---|---|---|
| 로그인 | `/admin/login` | Supabase 계정으로 로그인 (회원가입 없음) |
| 현장 목록 | `/admin` | 대표 사진·상태·파일 개수 확인, 공개 전환, 삭제 |
| 새 현장 등록 | `/admin/new` | 기본 정보 입력, 사진·PDF 드래그&드롭 업로드 |
| 현장 수정 | `/admin/{id}/edit` | 내용 수정, 사진 추가/삭제/대표 지정, PDF 추가/삭제 |

- 첫 번째 사진이 대표 사진 (아무 사진에서 "대표로" 클릭)
- 수정 중 지운 파일, 삭제한 현장의 파일은 Storage에서도 자동 삭제
- 저장 실패 시 방금 올린 파일을 자동으로 되돌려서 쓰레기 파일이 안 남음

## 처음 실행하기

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 새 프로젝트 생성 (무료)
2. **SQL Editor** → `supabase/schema.sql` 내용 전체 붙여넣고 **Run**
   → 테이블, 파일 버킷, 권한 정책이 한 번에 만들어집니다
3. **Authentication → Users → Add user** 로 관리자 계정 생성
   (이메일·비밀번호 입력, *Auto Confirm User* 체크)

### 2. 환경변수 설정
`.env.example` 을 `.env.local` 로 복사한 뒤,
Supabase **Project Settings → API** 의 값을 넣습니다.

```powershell
copy .env.example .env.local
```

### 3. 실행
```powershell
npm install
npm run dev
```
http://localhost:3000/admin 접속 → 만든 계정으로 로그인

## 폴더 구조

```
src/
├─ proxy.ts                     # 요청마다 로그인 확인 (구 middleware)
├─ lib/
│  ├─ types.ts                  # 타입 · 용량 제한 상수
│  ├─ storage.ts                # 파일 경로 / 공개 URL 헬퍼
│  └─ supabase/
│     ├─ client.ts              # 브라우저용 (파일 업로드)
│     ├─ server.ts              # 서버용 (DB 조회 · 서버 액션)
│     └─ proxy.ts               # 세션 갱신 + /admin 보호
└─ app/admin/
   ├─ actions.ts                # 서버 액션: 로그인/저장/삭제/공개전환
   ├─ (auth)/login/             # 로그인 화면
   └─ (dashboard)/
      ├─ layout.tsx             # 상단 헤더
      ├─ page.tsx               # 현장 목록
      ├─ RowActions.tsx         # 목록의 수정/공개/삭제 버튼
      ├─ ComplexForm.tsx        # 등록·수정 공용 폼 (핵심)
      ├─ new/page.tsx
      └─ [id]/edit/page.tsx
supabase/schema.sql             # DB 초기 설정
```

## 업로드 흐름

```
[사진/PDF 선택] → 브라우저에서 미리보기만 (아직 업로드 X)
      ↓ 저장 클릭
[브라우저 → Supabase Storage 직접 업로드]  ← 큰 PDF도 OK
      ↓ 경로만 전달
[서버 액션 saveComplex → DB 저장]
```

파일을 서버 액션으로 보내지 않고 브라우저에서 바로 올리는 이유:
서버 액션은 기본 요청 크기 제한(1MB)이 있어 분양 공고 PDF 같은 큰 파일을 받기 어렵기 때문입니다.
권한은 Supabase RLS 정책으로 막혀 있어서 로그인한 관리자만 업로드할 수 있습니다.

## 다음 단계 아이디어
- **공개 페이지** `/apt/[slug]` — `status = 'published'` 인 현장만 보여주기 (RLS로 이미 막혀 있음)
- **PDF 자동 분석** — 분양 공고 PDF를 Claude API로 읽어 세대수·분양가·청약 일정 자동 입력
- 사진 순서 드래그로 바꾸기, 이미지 자동 압축
- Vercel 배포 (환경변수 2개만 등록하면 됨)

## 참고
- `next.config.ts` 에서 `cacheComponents` 를 꺼 두었습니다. 관리자 페이지는 매 요청 로그인 쿠키를 읽는
  동적 페이지라 일반 서버 컴포넌트 방식이 더 단순하기 때문입니다.
- Next.js 16부터 `middleware.ts` 는 `proxy.ts` 로 이름이 바뀌었습니다.
