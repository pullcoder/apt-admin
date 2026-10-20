/*
 * ─────────────────────────────────────────────
 * 브라우저용 Supabase 클라이언트
 * ─────────────────────────────────────────────
 * 'use client' 컴포넌트에서 사용 (파일 업로드처럼 브라우저에서 직접 하는 작업)
 * 로그인 세션은 쿠키에서 자동으로 읽어오므로 별도 토큰 처리가 필요 없다.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, // 프로젝트 주소
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // 공개 키 (RLS 정책으로 권한 제어)
  );
}
