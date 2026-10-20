/*
 * ─────────────────────────────────────────────
 * 관리자 대시보드 공통 레이아웃 (상단 헤더 + 본문)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① proxy.ts 가 이미 로그인 여부를 걸러줬지만, 화면에 이메일을 표시하려고 한 번 더 조회
 *   ② 헤더(로고 · 로그인 계정 · 로그아웃) 렌더링
 *   ③ 각 페이지 내용(children) 렌더링
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // ①

  return (
    <div className="min-h-screen">
      {/* ② 헤더 */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm text-white">
              분
            </span>
            분양 현장 관리
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-neutral-500 sm:inline">{user?.email}</span>
            <form action={logout}>
              <button type="submit" className="text-neutral-600 hover:text-neutral-900">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ③ 본문 */}
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
