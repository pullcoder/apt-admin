/*
 * ─────────────────────────────────────────────
 * 현장 수정 페이지  (/admin/{id}/edit)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① URL에서 id 꺼내기 (Next.js 16부터 params는 Promise라서 await 필요)
 *   ② DB에서 해당 현장 조회
 *   ③ 없으면 404 / 있으면 기존 값이 채워진 폼 렌더링
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Complex } from "@/lib/types";
import ComplexForm from "../../ComplexForm";

export default async function EditComplexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // ①

  const supabase = await createClient();
  const { data } = await supabase.from("complexes").select("*").eq("id", id).maybeSingle(); // ②

  if (!data) notFound(); // ③

  const complex = data as Complex;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">현장 수정</h1>
      <p className="mb-6 text-sm text-neutral-500">{complex.name}</p>
      <ComplexForm id={complex.id} initial={complex} />
    </>
  );
}
