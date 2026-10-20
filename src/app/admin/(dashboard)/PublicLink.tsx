/*
 * ─────────────────────────────────────────────
 * 공개 페이지 링크 + 링크 복사 버튼 (클라이언트 컴포넌트)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① 공개 상태 → 클릭 가능한 링크(새 탭) + "링크 복사" 버튼 표시
 *      비공개 상태 → 링크 대신 회색 안내 문구
 *   ② "링크 복사" 클릭 → 현재 사이트 주소(origin) + /apt/{slug} 를 클립보드에 복사
 *   ③ 버튼 글자가 2초간 "복사됨 ✓" 으로 바뀌었다가 원래대로
 */
"use client";

import { useState } from "react";

type Props = { slug: string; published: boolean };

export default function PublicLink({ slug, published }: Props) {
  const [copied, setCopied] = useState(false);
  const path = `/apt/${slug}`;

  // ① 비공개면 링크를 막아 둠 (눌러도 404라서)
  if (!published) {
    return (
      <span className="text-xs text-neutral-400">
        {path} <span className="text-neutral-300">· 공개하면 링크가 열려요</span>
      </span>
    );
  }

  // ② 전체 주소 복사 — 배포하면 자동으로 실제 도메인 주소가 복사됨
  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // ③
  };

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-brand underline-offset-2 hover:underline"
      >
        {path} ↗
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-neutral-500 transition hover:border-brand hover:text-brand"
      >
        {copied ? "복사됨 ✓" : "링크 복사"}
      </button>
    </span>
  );
}
