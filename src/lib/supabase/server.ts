/*
 * ─────────────────────────────────────────────
 * 서버용 Supabase 클라이언트
 * ─────────────────────────────────────────────
 * 서버 컴포넌트 · 서버 액션에서 사용
 *
 * 실행 순서:
 *   ① Next.js의 cookies()로 요청 쿠키를 가져옴
 *   ② Supabase가 쿠키에서 로그인 세션을 읽음 (getAll)
 *   ③ 세션이 갱신되면 새 쿠키를 저장 (setAll)
 *      - 서버 컴포넌트에서는 쿠키 쓰기가 금지라 에러가 나지만,
 *        proxy.ts가 매 요청마다 세션을 갱신해 주므로 무시해도 안전
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies(); // ① Next.js 16부터 cookies()는 비동기

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll(); // ② 세션 쿠키 읽기
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options), // ③ 갱신된 세션 저장
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 → proxy.ts가 대신 처리
          }
        },
      },
    },
  );
}
