// 로컬에서 만든 베이스(seed.json 의 p_*)를 prod Supabase seed 테이블로 올린다.
//  · 선행: docs/supabase-migration.sql 을 Supabase SQL Editor 에서 1회 실행(새 컬럼 추가).
//  · dedup: 기존 비(非)p_ 행(k_* 등)과 '정규화이름 + 좌표(약100m)' 가 겹치는 p_ 는 제외(중복 노출 방지).
//  · 안전장치: 기본 DRY-RUN(무엇을 올릴지 출력만). 실제 적재는 --commit 플래그.
//
// 실행:  node scripts/pushToSupabase.mjs            # dry-run(미리보기)
//        node scripts/pushToSupabase.mjs --commit   # 실제 prod 적재
// ⚠️ prod DB 에 쓴다. 태깅이 끝난 뒤 마지막에 1회 실행하는 용도.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normName } from '../api/naver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SEED_PATH = path.join(ROOT, 'src', 'data', 'seed.json')

// .env 전체 로드 (이 스크립트는 SUPABASE_* 도 켜서 prod 에 쓴다)
function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const { seedAll, seedUpsert, usingSupabase } = await import('../api/store.js')

const dedupKey = (p) => `${normName(p.name || '')}@${Number(p.lat).toFixed(3)},${Number(p.lng).toFixed(3)}`

// PostgREST 배치는 모든 객체의 키가 동일해야 함(PGRST102). 모든 행을 같은 컬럼 집합으로 정규화.
const COLS = ['id', 'name', 'region', 'addr_road', 'addr_jibun', 'biz_type', 'status', 'src', 'kind', 'cat', 'icon', 'lat', 'lng', 'phone', 'homepage', 'licensed', 'tags', 'blog', 'kakao_id', 'gid', 'nt']
const normRow = (p) => Object.fromEntries(COLS.map((c) => [c, p[c] ?? (c === 'tags' ? [] : c === 'blog' ? 0 : null)]))

async function main() {
  const commit = process.argv.includes('--commit')
  if (!usingSupabase()) { console.error('Supabase env(.env SUPABASE_URL/SERVICE_ROLE) 없음 — 중단'); process.exit(1) }

  // 1) 소스: 로컬 seed.json 의 p_*(좌표 있는 것만)
  const local = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
  const base = local.filter((p) => String(p.id).startsWith('p_') && Number.isFinite(p.lat) && Number.isFinite(p.lng))

  // 2) 기존 prod 행 중 비-p_(k_* 등) → dedup 키 집합
  const existing = await seedAll('all')
  const seen = new Set(existing.filter((p) => !String(p.id).startsWith('p_') && p.lat && p.lng).map(dedupKey))
  if (existing.length >= 1000) console.warn('⚠️ 기존 행이 1000+ — Supabase 기본 페이지 한계로 dedup 이 불완전할 수 있음(필요시 페이지네이션 보강).')

  // 3) dedup
  const toPush = base.filter((p) => !seen.has(dedupKey(p)))
  const tagged = toPush.filter((p) => p.nt).length
  console.log(`로컬 베이스 ${base.length}곳 / 기존과 중복 ${base.length - toPush.length}곳 제외 / 푸시 대상 ${toPush.length}곳(태깅됨 ${tagged}).`)

  if (!commit) { console.log('DRY-RUN — 실제 적재하려면 --commit 붙여 다시 실행.'); return }
  await seedUpsert(toPush.map(normRow))   // 키 통일(PGRST102 방지)
  console.log(`✅ prod 적재 완료: ${toPush.length}곳.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
