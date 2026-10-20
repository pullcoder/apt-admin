import type { NextConfig } from "next";

/*
 * ─────────────────────────────────────────────
 * Next.js 설정
 * ─────────────────────────────────────────────
 * 관리자 페이지는 요청마다 로그인 쿠키를 읽는 "동적 페이지"라서
 * Cache Components(정적 셸 + Suspense 스트리밍 모델)는 꺼 둔다.
 * → 일반적인 서버 컴포넌트 방식으로 단순하게 작성할 수 있음
 */
const nextConfig: NextConfig = {
  cacheComponents: false, // 관리자 페이지는 항상 동적으로 렌더링
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
