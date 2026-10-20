/*
 * ═════════════════════════════════════════════
 * 관리자 서버 액션 (서버에서만 실행되는 함수들)
 * ═════════════════════════════════════════════
 * 클라이언트 컴포넌트에서 일반 함수처럼 호출하지만, 실제로는 서버에서 실행된다.
 * 모든 액션은 먼저 로그인 여부를 확인한다 (requireUser).
 *
 *   login         : 이메일/비밀번호 로그인
 *   logout        : 로그아웃
 *   saveComplex   : 현장 등록·수정 (+ 수정 시 빠진 파일 Storage에서 삭제)
 *   deleteComplex : 현장 삭제 (+ 해당 현장 파일 전부 삭제)
 *   setStatus     : 공개/비공개 전환
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET,
  filePaths,
  type ActionResult,
  type Block,
  type Complex,
  type ComplexInput,
  type ComplexStatus,
} from "@/lib/types";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/; // 영문 소문자·숫자·하이픈 (schema.sql 과 동일)

/** 로그인 확인 — 안 되어 있으면 로그인 페이지로 보냄 */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  return supabase;
}

/* ─────────────────────────────────────────────
 * 로그인 / 로그아웃
 * ───────────────────────────────────────────── */

export type LoginState = { error?: string };

/**
 * useActionState 와 함께 쓰는 로그인 액션
 * 실행 순서: ① 입력값 꺼내기 → ② Supabase 로그인 → ③ 실패 시 메시지 반환 / 성공 시 대시보드로 이동
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim(); // ①
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password }); // ②

  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." }; // ③
  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/* ─────────────────────────────────────────────
 * 현장 등록 · 수정
 * ─────────────────────────────────────────────
 * 파일은 브라우저가 Storage에 먼저 올리고, 여기에는 "경로"만 넘어온다.
 * (서버 액션은 요청 크기 제한이 있어서 큰 PDF를 직접 받기 어렵기 때문)
 *
 * 실행 순서:
 *   ① 로그인 확인
 *   ② 입력값 검증 (필수값, 주소 형식, 블록 형식, 파일 경로가 이 현장 폴더인지)
 *   ③ 수정이면 기존 데이터를 읽어 둠 (빠진 파일 찾기용)
 *   ④ DB에 insert(신규) 또는 update(수정)
 *   ⑤ 수정 중 삭제된 사진·PDF·페이지를 Storage에서도 삭제
 *   ⑥ 목록 페이지 캐시 갱신
 */
export async function saveComplex(input: ComplexInput, isNew: boolean): Promise<ActionResult> {
  const supabase = await requireUser(); // ①

  // ② 검증 ------------------------------------------------------------
  const name = input.name.trim();
  const slug = input.slug.trim();
  if (!name) return { ok: false, error: "단지명을 입력해 주세요." };
  if (!SLUG_RE.test(slug))
    return { ok: false, error: "주소(slug)는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요." };
  if (input.total_units !== null && (!Number.isInteger(input.total_units) || input.total_units < 0))
    return { ok: false, error: "총 세대수는 0 이상의 정수여야 합니다." };

  const blocks = cleanBlocks(input.blocks);
  if (!blocks) return { ok: false, error: "콘텐츠 블록 형식이 올바르지 않습니다." };

  const ownFolder = `${input.id}/`; // 다른 현장 파일 경로를 끼워 넣지 못하게 막음
  const allPaths = filePaths({ cover: input.cover, blocks });
  if (allPaths.some((p) => !p.startsWith(ownFolder) || p.includes("..")))
    return { ok: false, error: "잘못된 파일 경로가 포함되어 있습니다." };

  const row = {
    id: input.id,
    slug,
    name,
    address: input.address?.trim() || null, // 빈 문자열은 null로 저장
    total_units: input.total_units,
    move_in_date: input.move_in_date?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    status: input.status,
    cover: input.cover,
    blocks,
  };

  // ③ 기존 파일 목록 -------------------------------------------------
  let oldPaths: string[] = [];
  if (!isNew) {
    const { data: old } = await supabase
      .from("complexes")
      .select("cover, blocks")
      .eq("id", input.id)
      .single();
    if (old) oldPaths = filePaths(old as Pick<Complex, "cover" | "blocks">);
  }

  // ④ 저장 -----------------------------------------------------------
  const { error } = isNew
    ? await supabase.from("complexes").insert(row)
    : await supabase.from("complexes").update(row).eq("id", input.id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `이미 사용 중인 주소예요: ${slug}` }; // unique 위반
    return { ok: false, error: `저장 실패: ${error.message}` };
  }

  // ⑤ 빠진 파일 정리 (실패해도 저장 자체는 성공이므로 무시) -------------
  const keep = new Set(allPaths);
  const removed = oldPaths.filter((p) => !keep.has(p));
  if (removed.length > 0) {
    await supabase.storage.from(BUCKET).remove(removed);
  }

  revalidatePath("/admin");
  revalidatePath(`/apt/${slug}`); // ⑥
  return { ok: true };
}

/**
 * 블록 형식 검사 + 필요한 필드만 골라 담기
 * (클라이언트가 보낸 값을 그대로 저장하지 않도록) — 형식이 틀리면 null
 */
function cleanBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const out: Block[] = [];

  for (const b of raw) {
    const id = str(b?.id);
    if (!id) return null;
    if (b.type === "text") {
      const title = str(b.title) ?? "";
      const body = str(b.body) ?? "";
      if (!title.trim() && !body.trim()) continue; // 빈 글 블록은 저장하지 않음
      out.push({ id, type: "text", title: title.trim(), body: body.trim() });
    } else if (b.type === "image") {
      const path = str(b.path);
      if (!path) return null;
      out.push({ id, type: "image", path, caption: (str(b.caption) ?? "").trim() });
    } else if (b.type === "pdf") {
      const path = str(b.path);
      const name = str(b.name);
      if (!path || !name || !Array.isArray(b.pages) || b.pages.some((p: unknown) => !str(p)))
        return null;
      out.push({ id, type: "pdf", path, name, pages: b.pages });
    } else {
      return null;
    }
  }
  return out;
}

/* ─────────────────────────────────────────────
 * 현장 삭제
 * 실행 순서: ① 로그인 확인 → ② 파일 목록 조회 → ③ DB 행 삭제 → ④ Storage 파일 삭제
 * ───────────────────────────────────────────── */
export async function deleteComplex(id: string): Promise<ActionResult> {
  const supabase = await requireUser(); // ①

  const { data: row } = await supabase // ②
    .from("complexes")
    .select("cover, blocks")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("complexes").delete().eq("id", id); // ③
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };

  if (row) {
    const paths = filePaths(row as Pick<Complex, "cover" | "blocks">);
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths); // ④
  }

  revalidatePath("/admin");
  return { ok: true };
}

/* ─────────────────────────────────────────────
 * 공개 / 비공개 전환
 * ───────────────────────────────────────────── */
export async function setStatus(id: string, status: ComplexStatus): Promise<ActionResult> {
  const supabase = await requireUser();

  const { error } = await supabase.from("complexes").update({ status }).eq("id", id);
  if (error) return { ok: false, error: `상태 변경 실패: ${error.message}` };

  revalidatePath("/admin");
  return { ok: true };
}
