/*
 * ═════════════════════════════════════════════
 * 분양 현장 관리 — Supabase 초기 설정 SQL
 * ═════════════════════════════════════════════
 * 실행 순서:
 *   ① complexes 테이블 생성 (현장 정보)
 *   ② updated_at 자동 갱신 트리거
 *   ③ 테이블 RLS 정책 (공개: 게시된 것만 읽기 / 로그인 관리자: 전부)
 *   ④ 파일 저장용 Storage 버킷 생성 (사진·PDF)
 *   ⑤ Storage RLS 정책 (누구나 읽기 / 로그인 관리자만 업로드·삭제)
 *
 * 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣고 Run
 */

-- ① 분양 현장 테이블 ----------------------------------------------
create table if not exists public.complexes (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique                  -- 공개 주소용 (예: raemian-seongnam → /apt/raemian-seongnam)
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,                        -- 단지명
  address       text,                                 -- 현장 주소
  total_units   integer check (total_units >= 0),     -- 총 세대수
  move_in_date  text,                                 -- 입주 예정 (예: 2028년 3월) — 자유 형식이라 text
  contact_phone text,                                 -- 분양 문의 전화
  status        text not null default 'draft'         -- draft: 비공개 / published: 공개
                check (status in ('draft', 'published')),
  cover         text,                                 -- 대표 사진 Storage 경로 (없으면 첫 사진/PDF 첫 페이지 사용)
  blocks        jsonb  not null default '[]',         -- 콘텐츠 블록 배열 (순서대로 표시, src/lib/types.ts 의 Block 참고)
                                                      --   { "type": "text",  "title", "body" }
                                                      --   { "type": "image", "path", "caption" }
                                                      --   { "type": "pdf",   "path", "name", "pages": [...] }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ② 수정할 때마다 updated_at 자동 갱신 -----------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists complexes_set_updated_at on public.complexes;
create trigger complexes_set_updated_at
  before update on public.complexes
  for each row execute function public.set_updated_at();

-- ③ 테이블 접근 정책 -----------------------------------------------
alter table public.complexes enable row level security;

drop policy if exists "공개 현장은 누구나 조회" on public.complexes;
create policy "공개 현장은 누구나 조회"
  on public.complexes for select
  to anon
  using (status = 'published');

drop policy if exists "관리자는 전체 관리" on public.complexes;
create policy "관리자는 전체 관리"
  on public.complexes for all
  to authenticated
  using (true)
  with check (true);

-- ④ Storage 버킷 (공개 읽기, 파일당 최대 50MB, 이미지·PDF만 허용) ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complex-files',
  'complex-files',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ⑤ Storage 접근 정책 ----------------------------------------------
drop policy if exists "현장 파일 누구나 읽기" on storage.objects;
create policy "현장 파일 누구나 읽기"
  on storage.objects for select
  using (bucket_id = 'complex-files');

drop policy if exists "관리자 업로드" on storage.objects;
create policy "관리자 업로드"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'complex-files');

drop policy if exists "관리자 수정" on storage.objects;
create policy "관리자 수정"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'complex-files');

drop policy if exists "관리자 삭제" on storage.objects;
create policy "관리자 삭제"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'complex-files');
