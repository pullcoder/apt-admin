/*
 * ═════════════════════════════════════════════
 * 블록 구조로 변경 (기존 DB에 한 번만 실행)
 * ═════════════════════════════════════════════
 * description / images / pdfs  →  cover + blocks
 *
 * 실행 순서:
 *   ① cover, blocks 컬럼 추가
 *   ② 기존 데이터 옮기기
 *      - images[0]      → cover (대표 사진)
 *      - description    → 글 블록
 *      - images[1..]    → 사진 블록 (순서 유지)
 *      - pdfs           → 옮기지 않음 (페이지 이미지가 없어서 — 수정 화면에서 PDF를 다시 올려 주세요)
 *   ③ 예전 컬럼 삭제
 *
 * 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣고 Run
 * (처음 설치하는 경우엔 schema.sql 만 실행하면 되고 이 파일은 필요 없음)
 */

-- ① ---------------------------------------------------------------
alter table public.complexes
  add column if not exists cover  text,
  add column if not exists blocks jsonb not null default '[]';

-- ② (예전 컬럼이 남아 있을 때만 실행) --------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'complexes' and column_name = 'images'
  ) then
    update public.complexes c
    set
      cover = c.images[1], -- Postgres 배열은 1부터 시작
      blocks =
        case
          when coalesce(trim(c.description), '') <> '' then
            jsonb_build_array(jsonb_build_object(
              'id', gen_random_uuid(), 'type', 'text', 'title', '', 'body', trim(c.description)))
          else '[]'::jsonb
        end
        || coalesce((
          select jsonb_agg(
                   jsonb_build_object('id', gen_random_uuid(), 'type', 'image', 'path', p, 'caption', '')
                   order by n)
          from unnest(c.images) with ordinality as t(p, n)
          where n > 1
        ), '[]'::jsonb)
    where c.blocks = '[]'::jsonb;
  end if;
end $$;

-- ③ ---------------------------------------------------------------
alter table public.complexes
  drop column if exists description,
  drop column if exists images,
  drop column if exists pdfs;
