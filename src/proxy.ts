/*
 * ─────────────────────────────────────────────
 * Proxy (구 Middleware) — 페이지 요청 전에 실행
 * ─────────────────────────────────────────────
 * /admin 아래 모든 요청에서 로그인 세션을 확인·갱신한다.
 * 실제 로직은 lib/supabase/proxy.ts 의 updateSession 참고
 */
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"], // 관리자 경로에서만 실행 (공개 페이지는 영향 없음)
};
