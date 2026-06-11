// 저장 계층 — Supabase 가 설정돼 있으면 DB(공유·영구), 아니면 로컬 파일(개발용).
//  · 서버(api/*)와 빌더(scripts/buildSeed)에서 공용으로 쓴다.
//  · Supabase 는 SERVICE ROLE 키로 접근(서버 전용, RLS 우회). 브라우저엔 절대 노출 X.
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE  (둘 다 있어야 DB 사용)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'src', 'data')
const SEED_PATH = path.join(DATA_DIR, 'seed.json')
const SCAN_PATH = path.join(DATA_DIR, 'seedScanned.json')
const GCACHE_PATH = path.join(DATA_DIR, 'gcache.json')

// 호출 시점에 env 를 읽는다(빌더가 .env 를 나중에 주입해도 동작하도록)
const sbUrl = () => process.env.SUPABASE_URL
const sbKey = () => process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
export const usingSupabase = () => !!(sbUrl() && sbKey())
function headers(extra = {}) {
  const k = sbKey()
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...extra }
}

// ---- 파일 폴백 ----
function fRead(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return fb } }
function fWrite(p, v) { try { fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8') } catch (_) {} }

// ===== seed (좌표 + 태그 + 블로그수) =====
export async function seedAll() {
  if (usingSupabase()) {
    const r = await fetch(`${sbUrl()}/rest/v1/seed?select=*`, { headers: headers() })
    return r.ok ? await r.json() : []
  }
  return fRead(SEED_PATH, [])
}

// 주어진 id 들의 태그·블로그수만 조회(일반 검색 결과에 태그 붙일 때)
export async function seedByIds(ids) {
  if (!ids?.length) return {}
  if (usingSupabase()) {
    const inList = ids.map((id) => `"${id}"`).join(',')
    const r = await fetch(`${sbUrl()}/rest/v1/seed?id=in.(${encodeURIComponent(inList)})&select=id,tags,blog`, { headers: headers() })
    if (!r.ok) return {}
    const m = {}
    for (const x of await r.json()) m[x.id] = { tags: x.tags || [], blog: x.blog || 0 }
    return m
  }
  const set = new Set(ids)
  const m = {}
  for (const p of fRead(SEED_PATH, [])) if (set.has(p.id)) m[p.id] = { tags: p.tags || [], blog: p.blog || 0 }
  return m
}

export async function seedUpsert(rows) {
  if (!rows?.length) return
  if (usingSupabase()) {
    await fetch(`${sbUrl()}/rest/v1/seed?on_conflict=id`, {
      method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows),
    })
    return
  }
  const cur = fRead(SEED_PATH, [])
  const byId = new Map(cur.map((p) => [p.id, p]))
  for (const r of rows) byId.set(r.id, r)
  fWrite(SEED_PATH, [...byId.values()])
}

// ===== seed_scanned (이미 분석한 지역 중심들) =====
export async function scannedAll() {
  if (usingSupabase()) {
    const r = await fetch(`${sbUrl()}/rest/v1/seed_scanned?select=lng,lat`, { headers: headers() })
    return r.ok ? await r.json() : []
  }
  return fRead(SCAN_PATH, [])
}

export async function scannedAdd(center) {
  if (usingSupabase()) {
    await fetch(`${sbUrl()}/rest/v1/seed_scanned`, { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(center) })
    return
  }
  const cur = fRead(SCAN_PATH, [])
  cur.push(center)
  fWrite(SCAN_PATH, cur)
}

// ===== gcache (구글 평점·사진 캐시, 14일) =====
export async function gcacheGet(ids) {
  if (!ids?.length) return {}
  if (usingSupabase()) {
    const inList = ids.map((id) => `"${id}"`).join(',')
    const r = await fetch(`${sbUrl()}/rest/v1/gcache?id=in.(${encodeURIComponent(inList)})&select=*`, { headers: headers() })
    if (!r.ok) return {}
    const rows = await r.json()
    const m = {}
    for (const x of rows) m[x.id] = { rating: x.rating, reviews: x.reviews, price: x.price, priceLevel: x.price_level, photo: x.photo, gid: x.gid, at: Number(x.at) }
    return m
  }
  const all = fRead(GCACHE_PATH, {})
  const m = {}
  for (const id of ids) if (all[id]) m[id] = all[id]
  return m
}

export async function gcacheUpsert(map) {
  const ids = Object.keys(map || {})
  if (!ids.length) return
  if (usingSupabase()) {
    const rows = ids.map((id) => ({ id, rating: map[id].rating, reviews: map[id].reviews, price: map[id].price, price_level: map[id].priceLevel, photo: map[id].photo, gid: map[id].gid, at: map[id].at }))
    await fetch(`${sbUrl()}/rest/v1/gcache?on_conflict=id`, {
      method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows),
    })
    return
  }
  const all = fRead(GCACHE_PATH, {})
  for (const id of ids) all[id] = map[id]
  fWrite(GCACHE_PATH, all)
}
