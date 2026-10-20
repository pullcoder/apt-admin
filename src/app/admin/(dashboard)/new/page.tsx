/*
 * ─────────────────────────────────────────────
 * 새 현장 등록 페이지  (/admin/new)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① connection() 으로 "요청마다 새로 렌더링"을 보장
 *      (안 그러면 빌드 때 만든 UUID 하나를 모두가 공유하게 됨)
 *   ② 새 현장 id(UUID)를 미리 발급 → 파일을 {id}/ 폴더에 올리기 위해
 *   ③ 빈 폼 렌더링
 */
import { connection } from "next/server";
import ComplexForm from "../ComplexForm";

export default async function NewComplexPage() {
  await connection(); // ①
  const id = crypto.randomUUID(); // ②

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">새 현장 등록</h1>
      <ComplexForm id={id} /> {/* ③ */}
    </>
  );
}
