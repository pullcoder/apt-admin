/*
 * ─────────────────────────────────────────────
 * 요청마다 로그인 세션을 갱신 + 관리자 페이지 보호
 * ─────────────────────────────────────────────
 * src/proxy.ts 에서 호출됨 (Next.js 16에서 middleware → proxy로 이름 변경)
 *
 * 실행 순서:
 *   ① 요청 쿠키로 Supabase 클라이언트 생성
 *   ② getUser() 호출 → 만료된 토큰이면 자동 갱신되어 응답 쿠키에 기록
 *   ③ /admin 경로인데 로그인 안 됨 → /admin/login 으로 보냄
 *   ④ 이미 로그인했는데 /admin/login 접근 → /admin 으로 보냄
 *   ⑤ 그 외에는 그대로 통과 (갱신된 쿠키를 담은 응답 반환)
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // ① 쿠키를 요청·응답 양쪽에 동기화하는 클라이언트
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request }); // 갱신된 쿠키로 응답 다시 생성
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ② 세션 확인 (이 호출 사이에 다른 코드를 넣지 말 것 — 세션 갱신 타이밍 문제)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/admin/login";

  // ③ 비로그인 사용자의 관리자 페이지 접근 차단
  if (!user && path.startsWith("/admin") && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // ④ 로그인한 사용자가 로그인 페이지에 오면 대시보드로
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return response; // ⑤
}
