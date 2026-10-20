/*
 * ─────────────────────────────────────────────
 * 공통 타입 & 상수
 * ─────────────────────────────────────────────
 * supabase/schema.sql 의 complexes 테이블과 1:1로 맞춰 둔 타입
 */

export const BUCKET = "complex-files"; // Storage 버킷 이름 (schema.sql ④와 동일해야 함)

export const MAX_IMAGE_MB = 10; // 사진 1장 최대 용량
export const MAX_PDF_MB = 50; // PDF 1개 최대 용량 (Supabase 무료 플랜 한도)

export type ComplexStatus = "draft" | "published";

/* ─────────────────────────────────────────────
 * 콘텐츠 블록 — 공개 페이지에 위에서부터 순서대로 표시됨
 *   text  : 제목(선택) + 본문
 *   image : 사진 1장 + 설명(선택)
 *   pdf   : 원본 PDF + 페이지별로 변환한 이미지 (공개 페이지에서는 이미지로 바로 보여줌)
 * ───────────────────────────────────────────── */
export type TextBlock = { id: string; type: "text"; title: string; body: string };
export type ImageBlock = { id: string; type: "image"; path: string; caption: string };
export type PdfBlock = {
  id: string;
  type: "pdf";
  path: string; // 원본 PDF (다운로드용)
  name: string; // 원래 파일명 (화면 표시용)
  pages: string[]; // 페이지 이미지 경로 (관리자가 뺀 페이지는 없음)
};
export type Block = TextBlock | ImageBlock | PdfBlock;

/** DB에 저장된 분양 현장 1건 */
export type Complex = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  total_units: number | null;
  move_in_date: string | null;
  contact_phone: string | null;
  status: ComplexStatus;
  cover: string | null; // 대표 사진 경로
  blocks: Block[];
  created_at: string;
  updated_at: string;
};

/** 등록/수정 폼에서 서버 액션으로 보내는 데이터 */
export type ComplexInput = Omit<Complex, "created_at" | "updated_at">;

/** 서버 액션 결과 — 성공 또는 에러 메시지 */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** 현장 1건이 Storage에 가진 모든 파일 경로 (삭제·정리용) */
export function filePaths(c: Pick<Complex, "cover" | "blocks">): string[] {
  const paths: string[] = c.cover ? [c.cover] : [];
  for (const b of c.blocks) {
    if (b.type === "image") paths.push(b.path);
    if (b.type === "pdf") paths.push(b.path, ...b.pages);
  }
  return paths;
}
