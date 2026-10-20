/*
 * ═════════════════════════════════════════════
 * 현장 등록 · 수정 폼 (클라이언트 컴포넌트)
 * ═════════════════════════════════════════════
 * 신규 등록과 수정이 같은 폼을 쓴다. (initial 이 있으면 수정 모드)
 *
 * 화면 구성:
 *   기본 정보 (단지명·주소·세대수 등 고정 입력칸)
 *   대표 사진 (없으면 공개 페이지에서 첫 사진/PDF 첫 페이지를 대신 사용)
 *   콘텐츠 블록 (글 · 사진 · PDF 를 원하는 순서대로 — 드래그 또는 ▲▼ 로 이동)
 *
 * 전체 실행 순서:
 *   ① 정보 입력 + 블록 추가
 *      → 사진은 브라우저 미리보기만, PDF는 바로 페이지 이미지로 변환해 미리보기
 *        (아직 업로드하지 않음)
 *   ② "저장" 클릭 → 입력값 1차 검증
 *   ③ 새 파일(대표 사진, 사진 블록, PDF 원본, PDF 페이지 이미지) → Storage 업로드
 *   ④ 서버 액션 saveComplex() 로 DB 저장 (파일은 경로만 전달)
 *   ⑤ 성공 → 목록으로 이동
 *      실패 → 방금 올린 파일들을 Storage에서 지우고(쓰레기 파일 방지) 에러 표시
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { buildPath, extOf, publicUrl } from "@/lib/storage";
import { pdfToImages } from "@/lib/pdf";
import {
  BUCKET,
  MAX_IMAGE_MB,
  MAX_PDF_MB,
  type Block,
  type Complex,
  type ComplexInput,
  type ComplexStatus,
} from "@/lib/types";
import { saveComplex } from "../actions";

/* ─────────────────────────────────────────────
 * 폼 내부에서 쓰는 상태
 *   existing : 이미 Storage에 있는 파일 (수정 모드에서 불러온 것)
 *   new      : 이번에 새로 고른 파일 (저장할 때 업로드됨)
 * ───────────────────────────────────────────── */
type ImageSrc = { kind: "existing"; path: string } | { kind: "new"; file: File; preview: string };
type PageItem =
  | { key: string; kind: "existing"; path: string }
  | { key: string; kind: "new"; blob: Blob; preview: string };

type EditBlock =
  | { key: string; type: "text"; title: string; body: string }
  | { key: string; type: "image"; src: ImageSrc; caption: string }
  | {
      key: string;
      type: "pdf";
      name: string;
      src: { kind: "existing"; path: string } | { kind: "new"; file: File };
      pages: PageItem[];
      converting: string; // "페이지 변환 중 (3/20)" — 비어 있으면 변환 완료
    };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UPLOAD_CONCURRENCY = 4; // PDF 페이지는 여러 장을 동시에 올려 시간 단축

const srcUrl = (s: ImageSrc) => (s.kind === "new" ? s.preview : publicUrl(s.path));

/** DB 블록 → 폼 블록 */
function toEditBlock(b: Block): EditBlock {
  if (b.type === "text") return { key: b.id, type: "text", title: b.title, body: b.body };
  if (b.type === "image")
    return { key: b.id, type: "image", src: { kind: "existing", path: b.path }, caption: b.caption };
  return {
    key: b.id,
    type: "pdf",
    name: b.name,
    src: { kind: "existing", path: b.path },
    pages: b.pages.map((path) => ({ key: path, kind: "existing", path })),
    converting: "",
  };
}

type Props = {
  id: string; // 신규면 서버에서 미리 만든 UUID, 수정이면 기존 id
  initial?: Complex; // 있으면 수정 모드
};

export default function ComplexForm({ id, initial }: Props) {
  const router = useRouter();
  const isNew = !initial;

  /* ── 기본 정보 ── */
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [totalUnits, setTotalUnits] = useState(initial?.total_units?.toString() ?? "");
  const [moveInDate, setMoveInDate] = useState(initial?.move_in_date ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? "");
  const [status, setStatus] = useState<ComplexStatus>(initial?.status ?? "draft");

  /* ── 대표 사진 · 블록 ── */
  const [cover, setCover] = useState<ImageSrc | null>(
    initial?.cover ? { kind: "existing", path: initial.cover } : null,
  );
  const [blocks, setBlocks] = useState<EditBlock[]>(() => initial?.blocks.map(toEditBlock) ?? []);

  /* ── 진행 상태 ── */
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(""); // "파일 업로드 중 (2/5)" 같은 메시지
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]); // 거부된 파일 안내

  const converting = blocks.some((b) => b.type === "pdf" && b.converting);

  /* ── 미리보기용 blob URL 정리 (메모리 누수 방지) ──
   * 화면을 떠날 때, 아직 남아있는 미리보기 URL을 모두 해제한다. */
  const stateRef = useRef({ cover, blocks });
  useEffect(() => {
    stateRef.current = { cover, blocks };
  }, [cover, blocks]);
  useEffect(() => {
    return () => {
      const { cover, blocks } = stateRef.current;
      if (cover?.kind === "new") URL.revokeObjectURL(cover.preview);
      blocks.forEach(revokeBlock);
    };
  }, []);

  /* ─────────────────────────────────────────────
   * ① 블록 추가 · 수정 · 삭제 · 이동
   * ───────────────────────────────────────────── */
  const updateBlock = (key: string, patch: Partial<EditBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.key === key ? ({ ...b, ...patch } as EditBlock) : b)));

  const removeBlock = (key: string) =>
    setBlocks((prev) => {
      const target = prev.find((b) => b.key === key);
      if (target) revokeBlock(target);
      return prev.filter((b) => b.key !== key);
    });

  const moveBlock = (key: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.key === key);
      const j = i + dir;
      return j < 0 || j >= prev.length ? prev : arrayMove(prev, i, j);
    });

  const addText = () =>
    setBlocks((prev) => [...prev, { key: crypto.randomUUID(), type: "text", title: "", body: "" }]);

  /** 사진·PDF 파일을 받아서 종류별로 블록 추가 (여러 개를 한 번에 넣어도 고른 순서대로) */
  const addFiles = (files: FileList | File[]) => {
    const rejected: string[] = [];
    const added: EditBlock[] = [];

    for (const file of Array.from(files)) {
      if (IMAGE_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
          rejected.push(`${file.name}: ${MAX_IMAGE_MB}MB를 넘어요`);
          continue;
        }
        added.push({
          key: crypto.randomUUID(),
          type: "image",
          src: { kind: "new", file, preview: URL.createObjectURL(file) },
          caption: "",
        });
      } else if (file.type === "application/pdf") {
        if (file.size > MAX_PDF_MB * 1024 * 1024) {
          rejected.push(`${file.name}: ${MAX_PDF_MB}MB를 넘어요`);
          continue;
        }
        const key = crypto.randomUUID();
        added.push({
          key,
          type: "pdf",
          name: file.name,
          src: { kind: "new", file },
          pages: [],
          converting: "PDF 여는 중…",
        });
        convertPdf(key, file);
      } else {
        rejected.push(`${file.name}: 사진(JPG, PNG, WEBP, GIF) 또는 PDF만 올릴 수 있어요`);
      }
    }

    setBlocks((prev) => [...prev, ...added]);
    setWarnings(rejected);
  };

  /** PDF → 페이지 이미지 변환 (끝나면 해당 블록에 페이지 미리보기 채움) */
  const convertPdf = async (key: string, file: File) => {
    try {
      const blobs = await pdfToImages(file, (done, total) =>
        updateBlock(key, { converting: `페이지 변환 중 (${done}/${total})` }),
      );
      const pages: PageItem[] = blobs.map((blob) => ({
        key: crypto.randomUUID(),
        kind: "new",
        blob,
        preview: URL.createObjectURL(blob),
      }));
      // 변환 중에 블록이 삭제됐으면 미리보기만 정리
      setBlocks((prev) => {
        if (!prev.some((b) => b.key === key)) {
          pages.forEach((p) => p.kind === "new" && URL.revokeObjectURL(p.preview));
          return prev;
        }
        return prev.map((b) => (b.key === key ? { ...b, pages, converting: "" } : b));
      });
    } catch (err) {
      console.error(err);
      setBlocks((prev) => prev.filter((b) => b.key !== key));
      setWarnings((w) => [...w, `${file.name}: PDF를 읽지 못했어요 (암호가 걸렸거나 손상된 파일일 수 있어요)`]);
    }
  };

  const removePage = (blockKey: string, pageKey: string) =>
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey || b.type !== "pdf") return b;
        const target = b.pages.find((p) => p.key === pageKey);
        if (target?.kind === "new") URL.revokeObjectURL(target.preview);
        return { ...b, pages: b.pages.filter((p) => p.key !== pageKey) };
      }),
    );

  const pickCover = (files: FileList) => {
    const file = files[0];
    if (!IMAGE_TYPES.includes(file.type)) return setWarnings([`${file.name}: 이미지 파일이 아니에요`]);
    if (file.size > MAX_IMAGE_MB * 1024 * 1024)
      return setWarnings([`${file.name}: ${MAX_IMAGE_MB}MB를 넘어요`]);
    if (cover?.kind === "new") URL.revokeObjectURL(cover.preview);
    setCover({ kind: "new", file, preview: URL.createObjectURL(file) });
    setWarnings([]);
  };

  const clearCover = () => {
    if (cover?.kind === "new") URL.revokeObjectURL(cover.preview);
    setCover(null);
  };

  /* ── 드래그로 순서 바꾸기 ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // 살짝 움직여야 드래그 시작
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setBlocks((prev) =>
      arrayMove(
        prev,
        prev.findIndex((b) => b.key === active.id),
        prev.findIndex((b) => b.key === over.id),
      ),
    );
  };

  /* ─────────────────────────────────────────────
   * ②~⑤ 저장
   * ───────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // ② 1차 검증 (서버에서도 한 번 더 검사함)
    if (!name.trim()) return setError("단지명을 입력해 주세요.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.trim()))
      return setError("주소(slug)는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요. 예: raemian-seongnam");
    const units = totalUnits.trim() === "" ? null : Number(totalUnits);
    if (units !== null && (!Number.isInteger(units) || units < 0))
      return setError("총 세대수는 0 이상의 정수로 입력해 주세요.");
    if (converting) return setError("PDF 변환이 끝난 뒤에 저장해 주세요.");
    const emptyPdf = blocks.find((b) => b.type === "pdf" && b.pages.length === 0);
    if (emptyPdf?.type === "pdf")
      return setError(`"${emptyPdf.name}" 에 남은 페이지가 없어요. 블록을 삭제하거나 페이지를 남겨 주세요.`);

    setSaving(true);
    const supabase = createClient();
    const uploaded: string[] = []; // 실패 시 되돌리기 위해 이번에 올린 경로 기록

    // 진행 표시용 — 새로 올릴 파일 총 개수
    const total =
      (cover?.kind === "new" ? 1 : 0) +
      blocks.reduce((n, b) => {
        if (b.type === "image") return n + (b.src.kind === "new" ? 1 : 0);
        if (b.type === "pdf")
          return n + (b.src.kind === "new" ? 1 : 0) + b.pages.filter((p) => p.kind === "new").length;
        return n;
      }, 0);
    let done = 0;

    const upload = async (path: string, body: Blob, label: string) => {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType: body.type || undefined, upsert: false });
      if (upErr) throw new Error(`업로드 실패 (${label}): ${upErr.message}`);
      uploaded.push(path);
      setProgress(`파일 업로드 중 (${++done}/${total})`);
      return path;
    };

    try {
      // ③ 대표 사진
      let coverPath: string | null = null;
      if (cover?.kind === "existing") coverPath = cover.path;
      if (cover?.kind === "new")
        coverPath = await upload(buildPath(id, "images", extOf(cover.file)), cover.file, cover.file.name);

      // ③ 블록 (순서 유지)
      const saved: Block[] = [];
      for (const b of blocks) {
        if (b.type === "text") {
          saved.push({ id: b.key, type: "text", title: b.title, body: b.body });
        } else if (b.type === "image") {
          const path =
            b.src.kind === "existing"
              ? b.src.path
              : await upload(buildPath(id, "images", extOf(b.src.file)), b.src.file, b.src.file.name);
          saved.push({ id: b.key, type: "image", path, caption: b.caption });
        } else {
          const pdfPath =
            b.src.kind === "existing"
              ? b.src.path
              : await upload(buildPath(id, "pdfs", "pdf"), b.src.file, b.name);
          // 페이지는 여러 장 동시에 올리되, 결과는 원래 순서대로
          const pages = await mapLimit(b.pages, UPLOAD_CONCURRENCY, (p, i) =>
            p.kind === "existing"
              ? Promise.resolve(p.path)
              : upload(buildPath(id, "pages", "jpg"), p.blob, `${b.name} ${i + 1}쪽`),
          );
          saved.push({ id: b.key, type: "pdf", path: pdfPath, name: b.name, pages });
        }
      }

      // ④ DB 저장
      setProgress("저장 중…");
      const input: ComplexInput = {
        id,
        slug: slug.trim(),
        name,
        address,
        total_units: units,
        move_in_date: moveInDate,
        contact_phone: contactPhone,
        status,
        cover: coverPath,
        blocks: saved,
      };
      const res = await saveComplex(input, isNew);
      if (!res.ok) throw new Error(res.error);

      // ⑤ 성공 → 목록으로
      router.push("/admin");
      router.refresh();
    } catch (err) {
      // ⑤ 실패 → 이번에 올린 파일 정리 후 에러 표시
      if (uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
      setSaving(false);
      setProgress("");
    }
  };

  /* ─────────────────────────────────────────────
   * 화면
   * ───────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── 기본 정보 ── */}
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">기본 정보</h2>

        <Field label="단지명" required>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 래미안 성남 리버파크"
          />
        </Field>

        <Field label="페이지 주소" required hint="영문 소문자, 숫자, 하이픈(-)만 가능">
          <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <span className="border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              /apt/
            </span>
            <input
              className="w-full px-3 py-2 text-sm outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} // 공백은 자동으로 하이픈
              placeholder="raemian-seongnam"
            />
          </div>
        </Field>

        <Field label="현장 주소">
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 경기도 성남시 수정구 ○○동 123"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="총 세대수">
            <input
              className="input"
              inputMode="numeric"
              value={totalUnits}
              onChange={(e) => setTotalUnits(e.target.value.replace(/[^0-9]/g, ""))} // 숫자만
              placeholder="예: 1240"
            />
          </Field>
          <Field label="입주 예정">
            <input
              className="input"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              placeholder="예: 2028년 3월"
            />
          </Field>
          <Field label="분양 문의">
            <input
              className="input"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="예: 1588-0000"
            />
          </Field>
        </div>
      </section>

      {/* ── 대표 사진 ── */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">대표 사진</h2>
          <p className="text-sm text-neutral-500">
            공개 페이지 맨 위에 크게 나옵니다 · 비워 두면 첫 번째 사진(또는 PDF 첫 페이지)을 사용
          </p>
        </div>
        {cover ? (
          <div className="relative aspect-[16/9] max-w-md overflow-hidden rounded-xl bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob 미리보기·Storage URL 모두 표시 */}
            <img src={srcUrl(cover)} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={clearCover}
              className="absolute top-2 right-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-red-600 hover:bg-white"
            >
              삭제
            </button>
          </div>
        ) : (
          <DropZone accept={IMAGE_TYPES.join(",")} multiple={false} onFiles={pickCover} label="대표 사진 선택" />
        )}
      </section>

      {/* ── 콘텐츠 블록 ── */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">콘텐츠</h2>
          <p className="text-sm text-neutral-500">
            위에서부터 순서대로 공개 페이지에 표시됩니다 · ⠿ 를 끌거나 ▲▼ 로 순서 변경
          </p>
        </div>

        {blocks.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map((b) => b.key)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {blocks.map((b, idx) => (
                  <SortableBlock
                    key={b.key}
                    block={b}
                    isFirst={idx === 0}
                    isLast={idx === blocks.length - 1}
                    onMove={(dir) => moveBlock(b.key, dir)}
                    onRemove={() => removeBlock(b.key)}
                    onChange={(patch) => updateBlock(b.key, patch)}
                    onRemovePage={(pageKey) => removePage(b.key, pageKey)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {/* 블록 추가 */}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <button type="button" onClick={addText} className="btn-secondary h-full min-h-14 px-6">
            ＋ 글 추가
          </button>
          <DropZone
            accept={[...IMAGE_TYPES, "application/pdf"].join(",")}
            onFiles={addFiles}
            label={`사진·PDF를 끌어다 놓거나 클릭해서 추가 (여러 개 가능 · 사진 ${MAX_IMAGE_MB}MB · PDF ${MAX_PDF_MB}MB)`}
            compact
          />
        </div>
      </section>

      {/* ── 공개 설정 ── */}
      <section className="card">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">공개 페이지에 게시</h2>
            <p className="text-sm text-neutral-500">끄면 관리자만 볼 수 있어요</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-brand)]"
            checked={status === "published"}
            onChange={(e) => setStatus(e.target.checked ? "published" : "draft")}
          />
        </label>
      </section>

      {/* ── 안내 · 에러 ── */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">추가하지 못한 파일</p>
          <ul className="mt-1 list-inside list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* ── 하단 버튼 (스크롤해도 항상 보이게) ── */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-neutral-200 bg-[#f6f7f5]/95 px-4 py-4 backdrop-blur">
        {(progress || converting) && (
          <span className="mr-auto text-sm text-neutral-500">{progress || "PDF 변환 중…"}</span>
        )}
        <Link href="/admin" className="btn-secondary">
          취소
        </Link>
        <button type="submit" disabled={saving || converting} className="btn-primary min-w-24">
          {saving ? "저장 중…" : isNew ? "등록하기" : "저장하기"}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────
 * 블록 1개 (드래그 가능한 카드)
 * ───────────────────────────────────────────── */
const TYPE_LABEL = { text: "글", image: "사진", pdf: "PDF" } as const;

function SortableBlock({
  block: b,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onChange,
  onRemovePage,
}: {
  block: EditBlock;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: Partial<EditBlock>) => void;
  onRemovePage: (pageKey: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: b.key });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl border bg-white ${
        isDragging ? "relative z-20 border-brand shadow-lg" : "border-neutral-200"
      }`}
    >
      {/* 머리줄: 드래그 손잡이 · 종류 · 이동/삭제 버튼 */}
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded px-1 text-lg leading-none text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
          aria-label="끌어서 순서 변경"
        >
          ⠿
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
            b.type === "pdf"
              ? "bg-red-50 text-red-600"
              : b.type === "image"
                ? "bg-sky-50 text-sky-700"
                : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {TYPE_LABEL[b.type]}
        </span>
        {b.type === "pdf" && (
          <span className="min-w-0 flex-1 truncate text-sm">
            {b.src.kind === "existing" ? (
              <a href={publicUrl(b.src.path)} target="_blank" rel="noreferrer" className="hover:underline">
                {b.name}
              </a>
            ) : (
              b.name
            )}
            <span className="ml-1 text-xs text-neutral-400">
              {b.converting || `· ${b.pages.length}쪽`}
            </span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton label="위로" disabled={isFirst} onClick={() => onMove(-1)}>
            ▲
          </IconButton>
          <IconButton label="아래로" disabled={isLast} onClick={() => onMove(1)}>
            ▼
          </IconButton>
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="p-3">
        {b.type === "text" && (
          <div className="space-y-2">
            <input
              className="input font-semibold"
              value={b.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="소제목 (선택) 예: 입지 환경"
            />
            <textarea
              className="input min-h-32 resize-y leading-relaxed"
              value={b.body}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder="내용을 입력하세요. 줄바꿈은 그대로 표시됩니다."
            />
          </div>
        )}

        {b.type === "image" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob 미리보기·Storage URL 모두 표시 */}
            <img
              src={srcUrl(b.src)}
              alt=""
              className="max-h-56 w-full rounded-lg bg-neutral-100 object-contain sm:w-64"
            />
            <input
              className="input"
              value={b.caption}
              onChange={(e) => onChange({ caption: e.target.value })}
              placeholder="사진 설명 (선택)"
            />
          </div>
        )}

        {b.type === "pdf" &&
          (b.converting ? (
            <p className="py-6 text-center text-sm text-neutral-500">{b.converting}</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-neutral-500">
                공개 페이지에 이미지로 바로 보입니다 · 필요 없는 페이지는 × 로 빼세요
              </p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {b.pages.map((p, i) => (
                  <li key={p.key} className="group relative overflow-hidden rounded border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob 미리보기·Storage URL 모두 표시 */}
                    <img
                      src={p.kind === "new" ? p.preview : publicUrl(p.path)}
                      alt={`${i + 1}쪽`}
                      loading="lazy"
                      className="w-full bg-neutral-50"
                    />
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemovePage(p.key)}
                      aria-label={`${i + 1}쪽 빼기`}
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded bg-white/90 text-xs leading-none text-red-600 shadow sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ))}
      </div>
    </li>
  );
}

/* ─────────────────────────────────────────────
 * 작은 보조 함수 · 컴포넌트들
 * ───────────────────────────────────────────── */

/** 블록이 가진 미리보기 blob URL 해제 */
function revokeBlock(b: EditBlock) {
  if (b.type === "image" && b.src.kind === "new") URL.revokeObjectURL(b.src.preview);
  if (b.type === "pdf") b.pages.forEach((p) => p.kind === "new" && URL.revokeObjectURL(p.preview));
}

/** 최대 limit 개씩 동시에 실행하고, 결과는 입력 순서대로 반환 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** 라벨 + 입력칸 묶음 */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * 파일 드래그&드롭 영역
 * 실행 순서: 파일을 끌어 올림 → 테두리 강조 → 놓으면 onFiles 호출
 *           (클릭하면 숨겨진 <input type="file"> 이 열림)
 */
function DropZone({
  accept,
  onFiles,
  label,
  multiple = true,
  compact,
}: {
  accept: string;
  onFiles: (files: FileList) => void;
  label: string;
  multiple?: boolean;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault(); // 기본 동작(파일 열기) 막기
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center text-sm transition ${
        compact ? "py-4" : "py-8"
      } ${
        over
          ? "border-brand bg-brand-soft text-brand"
          : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
      }`}
    >
      {!compact && <span className="mb-1 text-2xl">＋</span>}
      {label}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // 같은 파일을 다시 고를 수 있도록 초기화
        }}
      />
    </div>
  );
}
