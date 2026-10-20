/*
 * ─────────────────────────────────────────────
 * 현장 목록 페이지  (/admin)
 * ─────────────────────────────────────────────
 * 실행 순서:
 *   ① DB에서 전체 현장을 최근 수정순으로 조회
 *   ② 없으면 "첫 현장 등록" 안내 표시
 *   ③ 있으면 카드 목록 표시 (대표 사진 · 상태 · 블록 개수 · 관리 버튼)
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import type { Complex } from "@/lib/types";
import RowActions from "./RowActions";
import PublicLink from "./PublicLink";

export default async function AdminHome() {
  const supabase = await createClient();
  const { data, error } = await supabase // ①
    .from("complexes")
    .select("*")
    .order("updated_at", { ascending: false });

  const complexes = (data ?? []) as Complex[];

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">분양 현장</h1>
          <p className="mt-1 text-sm text-neutral-500">총 {complexes.length}곳</p>
        </div>
        <Link href="/admin/new" className="btn-primary">
          + 새 현장 등록
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          목록을 불러오지 못했어요: {error.message}
        </p>
      )}

      {/* ② 빈 상태 */}
      {complexes.length === 0 && !error ? (
        <div className="card py-16 text-center">
          <p className="text-lg font-semibold">아직 등록된 현장이 없어요</p>
          <p className="mt-1 text-sm text-neutral-500">
            PDF·사진·글을 올리면 바로 현장 페이지가 만들어집니다.
          </p>
          <Link href="/admin/new" className="btn-primary mt-6">
            첫 현장 등록하기
          </Link>
        </div>
      ) : (
        /* ③ 목록 */
        <ul className="space-y-3">
          {complexes.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
            >
              {/* 대표 사진 */}
              <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-neutral-100 sm:h-20 sm:w-28">
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL을 그대로 사용
                  <img src={publicUrl(c.cover)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                    사진 없음
                  </div>
                )}
              </div>

              {/* 기본 정보 */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  {/* 단지명 클릭 → 수정 화면 */}
                  <Link
                    href={`/admin/${c.id}/edit`}
                    className="truncate font-semibold underline-offset-2 hover:text-brand hover:underline"
                  >
                    {c.name}
                  </Link>
                </div>
                <p className="mt-1 truncate text-sm text-neutral-500">
                  {c.address || "주소 미입력"}
                </p>
                {/* 공개 페이지 링크 + 복사 버튼 */}
                <div className="mt-1.5">
                  <PublicLink slug={c.slug} published={c.status === "published"} />
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {blockSummary(c)} · 수정{" "}
                  {new Date(c.updated_at).toLocaleDateString("ko-KR")}
                </p>
              </div>

              {/* 관리 버튼 (수정 · 공개전환 · 삭제) */}
              <RowActions id={c.id} name={c.name} slug={c.slug} status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** "글 2 · 사진 5 · PDF 1" 같은 블록 개수 요약 */
function blockSummary(c: Complex) {
  const count = (t: string) => c.blocks.filter((b) => b.type === t).length;
  const parts = [
    ["글", count("text")],
    ["사진", count("image")],
    ["PDF", count("pdf")],
  ].filter(([, n]) => n);
  return parts.length ? parts.map(([l, n]) => `${l} ${n}`).join(" · ") : "콘텐츠 없음";
}

/** 공개 / 비공개 표시 뱃지 */
function StatusBadge({ status }: { status: Complex["status"] }) {
  return status === "published" ? (
    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
      공개
    </span>
  ) : (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
      비공개
    </span>
  );
}
