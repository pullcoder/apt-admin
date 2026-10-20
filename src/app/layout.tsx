/*
 * 루트 레이아웃 — 모든 페이지 공통 HTML 뼈대
 * 한글 가독성을 위해 Pretendard 폰트를 CDN으로 불러온다.
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "분양 현장 관리",
  description: "분양 현장 등록 및 관리",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
