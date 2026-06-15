-- 베이스(공공데이터 p_*) 적재를 위해 prod seed 테이블에 새 컬럼 추가.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 1회 실행. (ADD COLUMN IF NOT EXISTS → 여러 번 실행해도 안전)
-- 기존 컬럼(id,name,region,cat,lat,lng,place_url,icon,tags,blog,kind)은 건드리지 않음.

alter table seed add column if not exists src        text;   -- 출처: 'localdata'(공공데이터) | 'kakao'
alter table seed add column if not exists addr_road  text;   -- 도로명주소
alter table seed add column if not exists addr_jibun text;   -- 지번주소
alter table seed add column if not exists biz_type   text;   -- 업태구분명(한식/카페 등 원문)
alter table seed add column if not exists status     text;   -- 영업상태명(영업/정상 …)
alter table seed add column if not exists licensed   text;   -- 인허가일자(YYYY-MM-DD) = 노포순 정렬키
alter table seed add column if not exists phone      text;   -- 전화번호
alter table seed add column if not exists homepage   text;   -- 홈페이지
alter table seed add column if not exists kakao_id   text;   -- 매칭된 카카오 place id(맵링크용, 이후 배치)
alter table seed add column if not exists gid        text;   -- 매칭된 구글 place id(평점/사진 보강용)
alter table seed add column if not exists nt         int;    -- 네이버 태깅 완료 마킹(1=완료). 재실행 시 스킵용

-- 노포순/인기순 정렬 가속용 인덱스(선택)
create index if not exists seed_licensed_idx on seed (licensed);
create index if not exists seed_blog_idx     on seed (blog desc);
