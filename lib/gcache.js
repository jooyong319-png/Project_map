// 구글 평점·사진 캐시 (공통). 저장은 store.js(파일 또는 Supabase)에 위임.
// 리스트의 평점·사진을 한 번 읽으면 캐시에 '타임스탬프와 함께' 저장하고,
// REFRESH_DAYS(14일) 지난 것만 다시 구글을 호출한다.
// 구글 ToS: 평점/사진 등은 최대 30일 캐시 허용 → 14일은 안전 범위.

import { gcacheGet, gcacheUpsert } from './store.js'

const REFRESH_DAYS = 14
const TTL = REFRESH_DAYS * 24 * 3600 * 1000

// 표시용 구글 필드만 추림(좌표/리뷰본문은 저장 안 함)
export function gFields(e) { return { rating: e.rating || 0, reviews: e.reviews || 0, price: e.price || '', priceLevel: e.priceLevel || 0, photo: e.photo || null, gid: e.gid || null } }

// 라이브 스캔 등에서 이미 받은 구글값을 캐시에 미리 채워둠(재호출 방지). pairs: [[id, gFields], ...]
export async function primeGCache(pairs) {
  if (!pairs?.length) return
  const now = Date.now()
  const map = {}
  for (const [id, g] of pairs) map[id] = { ...g, at: now }
  await gcacheUpsert(map)
}

// items 상위 n개의 평점·사진을 캐시에서 채운다. 없거나 14일 지난 것만 enrichFn 으로 구글 재호출.
export async function cachedEnrich(items, n, enrichFn) {
  if (!items.length || n <= 0) return items
  const now = Date.now()
  const head = items.slice(0, n)
  const cache = await gcacheGet(head.map((it) => it.id))
  const stale = head.filter((it) => { const c = cache[it.id]; return !c || now - c.at >= TTL })
  if (stale.length) {
    const fetched = await Promise.all(stale.map((it) => enrichFn(it).then((e) => [it.id, gFields(e)])))
    const fresh = {}
    for (const [id, g] of fetched) { cache[id] = { ...g, at: now }; fresh[id] = cache[id] }
    await gcacheUpsert(fresh)
  }
  const out = head.map((it) => { const c = cache[it.id]; return c ? { ...it, ...gFields(c) } : it })
  return [...out, ...items.slice(n)]
}
