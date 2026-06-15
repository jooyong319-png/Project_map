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

// ===== seed (좌표 + 태그 + 블로그수 + 종류) =====
export async function seedAll(kind = 'food') {
  if (usingSupabase()) {
    const f = kind === 'all' ? '' : `kind=eq.${encodeURIComponent(kind)}&`
    const r = await fetch(`${sbUrl()}/rest/v1/seed?${f}select=*`, { headers: headers() })
    return r.ok ? await r.json() : []
  }
  return fRead(SEED_PATH, []).filter((p) => kind === 'all' || (p.kind || 'food') === kind)
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
  // 한 요청에 같은 id 가 두 번 있으면 upsert 가 통째로 실패 → 중복 제거(뒤엣것 유지)
  const dedup = new Map()
  for (const r of rows) dedup.set(r.id, r)
  rows = [...dedup.values()]
  if (usingSupabase()) {
    // 100개씩 청크 업서트 + 에러 확인(조용한 실패 방지)
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100)
      const r = await fetch(`${sbUrl()}/rest/v1/seed?on_conflict=id`, {
        method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(chunk),
      })
      if (!r.ok) throw new Error(`seedUpsert ${r.status}: ${(await r.text()).slice(0, 200)}`)
    }
    return
  }
  const cur = fRead(SEED_PATH, [])
  const byId = new Map(cur.map((p) => [p.id, p]))
  for (const r of rows) byId.set(r.id, r)
  fWrite(SEED_PATH, [...byId.values()])
}

// ===== seed_scanned (이미 분석한 지역 중심들, 종류별) =====
export async function scannedAll(kind = 'food') {
  if (usingSupabase()) {
    const r = await fetch(`${sbUrl()}/rest/v1/seed_scanned?kind=eq.${encodeURIComponent(kind)}&select=lng,lat`, { headers: headers() })
    return r.ok ? await r.json() : []
  }
  return fRead(SCAN_PATH, []).filter((c) => (c.kind || 'food') === kind)
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

// 구글 ToS 안전장치: 오래(기본 21일) 안 쓰여 갱신 안 된 캐시 row 삭제.
//  · 쓰이는 row 는 14일(REFRESH_DAYS)에 재호출되며 at 이 갱신됨 → 21일 넘은 건 '안 쓰이는' 것.
//  · 30일 하드리밋보다 한참 아래에서 비워, stale 데이터가 DB/파일에 영구히 남지 않게 한다.
//  · 반환: 삭제한 row 수(supabase 는 -1, minimal 응답이라 개수 모름).
export async function gcachePurge(maxAgeDays = 21) {
  const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000
  if (usingSupabase()) {
    const r = await fetch(`${sbUrl()}/rest/v1/gcache?at=lt.${cutoff}`, {
      method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }),
    })
    if (!r.ok) throw new Error(`gcachePurge ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return -1
  }
  const all = fRead(GCACHE_PATH, {})
  let n = 0
  for (const id of Object.keys(all)) if (!all[id]?.at || all[id].at < cutoff) { delete all[id]; n++ }
  fWrite(GCACHE_PATH, all)
  return n
}
