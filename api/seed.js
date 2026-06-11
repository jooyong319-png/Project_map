// 태그 필터(맛집/노포/혼밥/핫플) 검색 엔드포인트.
// 1) 저장된 시드(src/data/seed.json: 좌표+태그+블로그수)에서 태그(AND)+지도영역으로 거른다.
// 2) 그 지역을 아직 분석한 적 없으면 → 라이브 스캔(카카오 수집 + 네이버 블로그 태깅) 후
//    결과를 seed.json 에 자동 저장(좌표+태그+블로그수). 다음부턴 즉시.
// 3) 평점·사진은 gcache.json 에 '타임스탬프와 함께' 캐시 → 14일 지난 것만 다시 구글 호출.
//    (구글 ToS: 평점/사진 등은 최대 30일 캐시 허용. 좌표/태그는 우리 판정이라 영구 저장.)
// ⚠️ 파일 쓰기는 로컬(dev)에서만 — Vercel prod 는 읽기전용이라 매번 라이브로 폴백.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enrichWithGoogle, catFromKakao, ICON_BY_CAT } from './kakao.js'
import { naverTags, matjipCutoff, isMatjip } from './naver.js'
import { cachedEnrich } from './gcache.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'src', 'data')
const SEED_PATH = path.join(DATA_DIR, 'seed.json')
const SCAN_PATH = path.join(DATA_DIR, 'seedScanned.json')
const LIVE_MAX = 36 // 라이브 스캔 때 리뷰 태깅할 최대 가게 수(비용 상한)

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return fallback } }
function writeJson(p, v) { try { fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8'); return true } catch (_) { return false } }

// 이미 분석한(스캔한) 지역 근처인지 — 중심 좌표가 ~2km 내면 '커버됨'으로 본다
function scannedNear(center, scans) {
  return scans.some((c) => Math.abs(c.lng - center.lng) < 0.02 && Math.abs(c.lat - center.lat) < 0.02)
}

async function kakaoCategory(rect, kkey) {
  const out = []
  const seen = new Set()
  for (const page of [1, 2, 3]) {
    const qs = new URLSearchParams({ category_group_code: 'FD6', size: '15', page: String(page), rect })
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?${qs}`, { headers: { Authorization: `KakaoAK ${kkey}` } })
    if (!r.ok) break
    const d = await r.json()
    for (const p of d.documents || []) if (p.id && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
    if (d.meta?.is_end) break
  }
  return out
}

// 라이브 스캔: 카카오 수집 → 네이버 블로그로 태깅. 태그 붙은 시드 엔트리 반환.
// 맛집은 지역 내 블로그 상위 30%로 부여(상대순위).
async function liveScan(box, kkey, nid, nsec) {
  const rect = `${box.w},${box.s},${box.e},${box.n}`
  const docs = await kakaoCategory(rect, kkey)
  const scanned = []
  for (const p of docs.slice(0, LIVE_MAX)) {
    const c = catFromKakao(p.category_name)
    const name = p.place_name || '이름 없음'
    const t = await naverTags(name, nid, nsec)
    scanned.push({
      id: 'k_' + p.id, name, region: p.road_address_name || p.address_name || '', cat: c,
      lat: Number(p.y), lng: Number(p.x), icon: ICON_BY_CAT[c], place_url: p.place_url || '',
      tags: t.tags, blog: t.blog,
    })
  }
  const cutoff = matjipCutoff(scanned.map((s) => s.blog))
  for (const s of scanned) if (isMatjip(s.blog, cutoff)) s.tags = [...new Set([...s.tags, '맛집'])]
  return scanned.filter((s) => s.tags.length)
}

export default async function handler(req, res) {
  const kkey = process.env.KAKAO_REST_KEY
  const gkey = process.env.GOOGLE_PLACES_API_KEY
  const nid = process.env.NAVER_CLIENT_ID
  const nsec = process.env.NAVER_CLIENT_SECRET
  const tags = (req.query?.tags || '').toString().split(',').map((s) => s.trim()).filter(Boolean)
  const bbox = (req.query?.bbox || '').toString()
  let box = null
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) box = { w, s, e, n }
  }
  const enrichN = Math.min(Math.max(parseInt(req.query?.enrich, 10) || 0, 0), 50)

  let seed = readJson(SEED_PATH, [])

  // 이 지역을 아직 분석한 적 없으면 라이브 스캔(네이버 태깅) 후 자동 저장
  if (box && kkey && nid && nsec) {
    const center = { lng: (box.w + box.e) / 2, lat: (box.s + box.n) / 2 }
    const scans = readJson(SCAN_PATH, [])
    if (!scannedNear(center, scans)) {
      try {
        const found = await liveScan(box, kkey, nid, nsec)
        const byId = new Map(seed.map((p) => [p.id, p]))
        for (const f of found) {
          const prev = byId.get(f.id)
          byId.set(f.id, prev ? { ...prev, tags: [...new Set([...(prev.tags || []), ...f.tags])], blog: f.blog } : f)
        }
        seed = [...byId.values()]
        writeJson(SEED_PATH, seed)
        writeJson(SCAN_PATH, [...scans, center])
      } catch (_) { /* 라이브 실패 시 기존 시드로 진행 */ }
    }
  }

  let list = seed
  if (tags.length) list = list.filter((p) => tags.every((t) => p.tags?.includes(t)))
  if (box) list = list.filter((p) => p.lng >= box.w && p.lng <= box.e && p.lat >= box.s && p.lat <= box.n)

  let places = list.map((p) => ({
    id: p.id, name: p.name, region: p.region, cat: p.cat, lng: p.lng, lat: p.lat,
    icon: p.icon, place_url: p.place_url, tags: p.tags || [], blog: p.blog || 0, rating: 0, reviews: 0,
    price: '', priceLevel: 0, photo: null, openNow: null, reviews_list: [], phone: '', gid: null, source: 'kakao',
  }))

  // 평점·사진: 캐시에서 즉시. 14일 지났거나 없는 것만 구글 재호출(상위 N개)
  if (gkey && enrichN > 0) places = await cachedEnrich(places, enrichN, (it) => enrichWithGoogle(it, gkey))

  res.status(200).json({ places })
}
