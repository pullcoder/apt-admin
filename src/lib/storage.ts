/*
 * ─────────────────────────────────────────────
 * Storage 경로 · URL 헬퍼
 * ─────────────────────────────────────────────
 * 파일 저장 구조:
 *   complex-files/
 *     └─ {현장 id}/
 *          ├─ images/{랜덤id}.jpg   (대표 사진 · 이미지 블록)
 *          ├─ pdfs/{랜덤id}.pdf     (PDF 원본)
 *          └─ pages/{랜덤id}.jpg    (PDF 페이지를 변환한 이미지)
 * → 현장을 지우면 {현장 id}/ 폴더만 통째로 지우면 됨
 */
import { BUCKET } from "./types";

/** 업로드할 파일의 저장 경로 생성 (파일명은 한글 깨짐 방지를 위해 랜덤 id 사용) */
export function buildPath(complexId: string, kind: "images" | "pdfs" | "pages", ext: string) {
  return `${complexId}/${kind}/${crypto.randomUUID()}.${ext}`;
}

/** 파일명에서 확장자만 꺼내기 (없으면 bin) */
export function extOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "bin";
}

/** Storage 경로 → 브라우저에서 바로 열 수 있는 공개 URL */
export function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
