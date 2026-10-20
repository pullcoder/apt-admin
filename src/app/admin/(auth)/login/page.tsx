/*
 * ─────────────────────────────────────────────
 * 관리자 로그인 페이지  (/admin/login)
 * ─────────────────────────────────────────────
 * (auth) 폴더는 "라우트 그룹" → URL에는 안 나타나고,
 * 대시보드 레이아웃(헤더·로그아웃 버튼)을 적용받지 않기 위해 분리했다.
 *
 * 계정은 Supabase 대시보드 → Authentication → Users → Add user 에서 만든다.
 * (회원가입 기능은 일부러 없음 — 아무나 관리자가 되면 안 되므로)
 */
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-white">
            분
          </div>
          <h1 className="text-2xl font-bold">분양 현장 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">관리자 계정으로 로그인하세요</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
