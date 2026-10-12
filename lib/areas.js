// 동네 데이터(정적 JSON) 로더 — scripts/buildArea.mjs 가 만든 src/data/places/<slug>.json.
//  · 공공데이터(인허가·백년가게·TourAPI)만 담겨 있어 저장·AI 입력이 허용된다 (wiki/브리프.md).
//  · DB(Supabase) 없이 코스 후보를 뽑는 기본 소스. 동네를 추가하면 FILES 에 한 줄.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const FILES = {
  seongsu: () => require('../src/data/places/seongsu.json'),
}

const cache = {}
export function area(slug) {
  if (!cache[slug] && FILES[slug]) cache[slug] = FILES[slug]()
  return cache[slug] || null
}
export const areaSlugs = () => Object.keys(FILES)

const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

// bbox(서,남,동,북) 안의 장소. kind 지정 시 그 종류만.
export function placesIn(bbox, kind) {
  const out = []
  for (const slug of areaSlugs()) {
    const a = area(slug)
    if (!a || !overlaps(a.bbox, bbox)) continue
    for (const p of a.places) {
      if (kind && p.kind !== kind) continue
      if (p.lng >= bbox[0] && p.lng <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3]) out.push(p)
    }
  }
  return out
}

// 준비된 동네 목록 (빈 상태 화면용)
export function areaList() {
  return areaSlugs().map((s) => { const a = area(s); return { slug: s, label: a.label, bbox: a.bbox, count: a.places.length } })
}
