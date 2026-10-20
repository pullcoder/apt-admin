/*
 * ─────────────────────────────────────────────
 * 목록 한 줄의 관리 버튼 (클라이언트 컴포넌트)
 * ─────────────────────────────────────────────
 * 실행 순서 (삭제 기준):
 *   ① 삭제 클릭 → 확인창
 *   ② useTransition 으로 서버 액션 실행 (그동안 버튼 비활성화)
 *   ③ 서버 액션이 revalidatePath 를 호출 → 목록이 자동으로 새로 그려짐
 *   ④ 실패하면 alert 로 알림
 */
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteComplex, setStatus } from "../actions";
import type { ComplexStatus } from "@/lib/types";

type Props = { id: string; name: string; slug: string; status: ComplexStatus };

export default function RowActions({ id, name, slug, status }: Props) {
  const [pending, startTransition] = useTransition();

  /** 공개 ↔ 비공개 전환 */
  const toggleStatus = () => {
    const next: ComplexStatus = status === "published" ? "draft" : "published";
    startTransition(async () => {
      const res = await setStatus(id, next);
      if (!res.ok) alert(res.error);
    });
  };

  /** 삭제 */
  const remove = () => {
    if (!confirm(`"${name}" 현장을 삭제할까요?\n사진과 PDF도 함께 지워지며 되돌릴 수 없습니다.`)) return; // ①
    startTransition(async () => {
      const res = await deleteComplex(id); // ②
      if (!res.ok) alert(res.error); // ④
    });
  };

  return (
    <div className="flex shrink-0 gap-2">
      {/* 공개 상태일 때만 공개 페이지 바로가기 (새 탭) */}
      {status === "published" && (
        <a href={`/apt/${slug}`} target="_blank" rel="noreferrer" className="btn-secondary px-3">
          보기
        </a>
      )}
      <Link href={`/admin/${id}/edit`} className="btn-secondary px-3">
        수정
      </Link>
      <button type="button" onClick={toggleStatus} disabled={pending} className="btn-secondary px-3">
        {status === "published" ? "비공개로" : "공개하기"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="btn-secondary px-3 text-red-600 hover:bg-red-50"
      >
        삭제
      </button>
    </div>
  );
}
