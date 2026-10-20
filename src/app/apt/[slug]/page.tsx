/*
 * ═════════════════════════════════════════════
 * 공개 현장 페이지  (/apt/{slug})
 * ═════════════════════════════════════════════
 * 누구나 볼 수 있는 분양 현장 소개 페이지 (로그인 불필요)
 *
 * 실행 순서:
 *   ① URL에서 slug 꺼내기 (예: /apt/raemian-seongnam → "raemian-seongnam")
 *   ② DB에서 slug가 같고 status = 'published' 인 현장 조회
 *      → 비공개(draft)면 관리자가 로그인한 상태여도 404 (공개 화면과 똑같이 보이게)
 *   ③ 없으면 404 페이지
 *   ④ 있으면 대표 사진 → 핵심 정보 → 콘텐츠 블록(관리자가 정한 순서) → 문의 순서로 렌더링
 *      (PDF는 페이지 이미지를 세로로 이어 붙여 바로 보여주고, 원본은 다운로드 버튼으로)
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import type { Block, Complex } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

/** ② 공개된 현장 1건 조회 (페이지 본문과 탭 제목에서 같이 사용) */
async function getComplex(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complexes")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published") // 공개된 것만
    .maybeSingle();
  return data as Complex | null;
}

/** 대표 사진 — 따로 지정 안 했으면 첫 사진 블록, 그것도 없으면 첫 PDF 페이지 */
function coverOf(c: Complex) {
  if (c.cover) return c.cover;
  for (const b of c.blocks) {
    if (b.type === "image") return b.path;
    if (b.type === "pdf" && b.pages[0]) return b.pages[0];
  }
  return null;
}

/** 공유 미리보기 설명 — 첫 번째 글 블록 */
function summaryOf(c: Complex) {
  const text = c.blocks.find((b) => b.type === "text");
  return text?.type === "text" ? (text.body || text.title).slice(0, 120) : null;
}

/** 브라우저 탭 제목 · 카카오톡 공유 미리보기용 정보 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getComplex(slug);
  if (!c) return { title: "현장을 찾을 수 없습니다" };
  const cover = coverOf(c);
  return {
    title: c.name,
    description: summaryOf(c) ?? c.address ?? undefined,
    openGraph: cover ? { images: [publicUrl(cover)] } : undefined,
  };
}

export default async function ComplexPage({ params }: Props) {
  const { slug } = await params; // ①
  const c = await getComplex(slug); // ②
  if (!c) notFound(); // ③

  const cover = coverOf(c);

  // 값이 있는 항목만 핵심 정보 칸에 표시
  const facts = [
    { label: "총 세대수", value: c.total_units ? `${c.total_units.toLocaleString()}세대` : null },
    { label: "입주 예정", value: c.move_in_date },
    { label: "분양 문의", value: c.contact_phone },
  ].filter((f) => f.value);

  // ④ 화면
  return (
    <main className="min-h-screen bg-white pb-28">
      {/* ── 대표 사진 + 단지명 ── */}
      <section className="relative h-[52vh] min-h-80 w-full overflow-hidden bg-neutral-200">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL
          <img src={publicUrl(cover)} alt={c.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-5 pb-8 text-white">
          <span className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
            분양 중
          </span>
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{c.name}</h1>
          {c.address && <p className="mt-2 text-sm text-white/85 sm:text-base">{c.address}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-5">
        {/* ── 핵심 정보 ── */}
        {facts.length > 0 && (
          <dl className="-mt-6 relative grid grid-cols-1 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white shadow-lg sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {facts.map((f) => (
              <div key={f.label} className="px-6 py-5">
                <dt className="text-xs font-medium text-neutral-500">{f.label}</dt>
                <dd className="mt-1 text-lg font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* ── 콘텐츠 블록 (관리자가 정한 순서대로) ── */}
        <div className="mt-12 space-y-12">
          {c.blocks.map((b) => (
            <BlockView key={b.id} block={b} />
          ))}
        </div>
      </div>

      {/* ── 하단 고정 문의 버튼 (전화번호가 있을 때만) ── */}
      {c.contact_phone && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">분양 문의</p>
              <p className="truncate font-bold">{c.contact_phone}</p>
            </div>
            <a
              href={`tel:${c.contact_phone.replace(/[^0-9+]/g, "")}`} // 모바일에서 누르면 바로 전화
              className="btn-primary px-6 py-3 text-base"
            >
              전화 상담
            </a>
          </div>
        </div>
      )}
    </main>
  );
}

/* ─────────────────────────────────────────────
 * 블록 1개 표시
 * ───────────────────────────────────────────── */
function BlockView({ block: b }: { block: Block }) {
  // 글: 소제목 + 본문 (줄바꿈 그대로)
  if (b.type === "text") {
    return (
      <section>
        {b.title && <h2 className="mb-4 text-xl font-bold">{b.title}</h2>}
        {b.body && <p className="whitespace-pre-line leading-8 text-neutral-700">{b.body}</p>}
      </section>
    );
  }

  // 사진: 가로 꽉 차게 (누르면 원본 크게 보기)
  if (b.type === "image") {
    return (
      <figure>
        <a href={publicUrl(b.path)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL */}
          <img src={publicUrl(b.path)} alt={b.caption} loading="lazy" className="w-full rounded-xl" />
        </a>
        {b.caption && <figcaption className="mt-2 text-center text-sm text-neutral-500">{b.caption}</figcaption>}
      </figure>
    );
  }

  // PDF: 페이지 이미지를 이어 붙여 바로 보여줌 + 원본 다운로드
  return (
    <section>
      <div className="-mx-5 sm:mx-0">
        {b.pages.map((path, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL
          <img
            key={path}
            src={publicUrl(path)}
            alt={`${b.name} ${i + 1}쪽`}
            loading={i < 2 ? "eager" : "lazy"}
            className="block w-full border-b border-neutral-100 last:border-b-0"
          />
        ))}
      </div>
      <a
        href={publicUrl(b.path)}
        target="_blank"
        rel="noreferrer"
        download={b.name}
        className="mt-3 flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm transition hover:border-brand hover:bg-brand-soft"
      >
        <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-600">PDF</span>
        <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
        <span className="text-neutral-400">원본 받기 ↓</span>
      </a>
    </section>
  );
}
