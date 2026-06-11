// 시드 빌더 — 동네별로 카카오에서 음식점을 모아 네이버 블로그로 태그(맛집/노포/혼밥/핫플)를 판정하고,
// 태그가 1개 이상 붙은 가게의 '좌표 + 태그 + 블로그수'만 src/data/seed.json 에 누적 저장한다.
// ⚠️ 구글은 안 쓴다(태그=네이버). 저장하는 건 좌표·카카오ID·우리가 판정한 태그·블로그수.
//
// 실행:  node scripts/buildSeed.mjs                # 기본 동네 세트
//        node scripts/buildSeed.mjs 강남 종로 홍대   # 원하는 동네만
//        node scripts/buildSeed.mjs --all           # 전체 동네

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catFromKakao, ICON_BY_CAT } from '../api/kakao.js'
import { naverTags, matjipCutoff, isMatjip, dongOf } from '../api/naver.js'
import { seedAll, seedUpsert, scannedAll, scannedAdd, usingSupabase } from '../api/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// .env 직접 로드
function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  const env = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

// 동네 → 중심 좌표 [lng, lat]. 검색은 중심 ±1.4km rect 로.
const AREAS = {
  강남: [127.028, 37.498], 종로: [126.991, 37.572], 홍대: [126.923, 37.556], 성수: [127.056, 37.544],
  이태원: [126.994, 37.534], 명동: [126.985, 37.563], 을지로: [126.991, 37.566], 망원: [126.905, 37.556],
  연남: [126.925, 37.561], 여의도: [126.924, 37.521], 잠실: [127.100, 37.513],
  서면: [129.060, 35.158], 해운대: [129.160, 35.163], 광안리: [129.118, 35.153],
  전주: [127.148, 35.824], 대구중구: [128.594, 35.869], 경주: [129.225, 35.842], 강릉: [128.896, 37.756],
}
const DEFAULT_AREAS = ['강남', '종로', '홍대', '성수']

function rectOf([lng, lat]) {
  const d = 0.014 // ≈1.4km
  return `${lng - d},${lat - d},${lng + d},${lat + d}`
}

async function kakaoCategory(rect, kkey) {
  const out = []
  const seen = new Set()
  for (const page of [1, 2, 3]) {
    const qs = new URLSearchParams({ category_group_code: 'FD6', size: '15', page: String(page), rect })
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?${qs}`, {
      headers: { Authorization: `KakaoAK ${kkey}` },
    })
    if (!r.ok) break
    const d = await r.json()
    for (const p of d.documents || []) {
      if (p.id && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
    }
    if (d.meta?.is_end) break
  }
  return out
}

function toItem(p) {
  const c = catFromKakao(p.category_name)
  return {
    id: 'k_' + p.id,
    name: p.place_name || '이름 없음',
    region: p.road_address_name || p.address_name || '',
    dong: dongOf(p.address_name || p.road_address_name),
    cat: c,
    lng: Number(p.x),
    lat: Number(p.y),
    icon: ICON_BY_CAT[c],
    place_url: p.place_url || '',
    source: 'kakao',
  }
}

async function main() {
  const env = loadEnv()
  Object.assign(process.env, env) // store.js 가 SUPABASE_* 등을 읽도록 주입
  const kkey = env.KAKAO_REST_KEY
  const nid = env.NAVER_CLIENT_ID
  const nsec = env.NAVER_CLIENT_SECRET
  if (!kkey || !nid || !nsec) { console.error('KAKAO_REST_KEY / NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요'); process.exit(1) }
  console.log(usingSupabase() ? '저장소: Supabase (공유·영구)' : '저장소: 로컬 파일')

  const args = process.argv.slice(2)
  const areaNames = args.includes('--all') ? Object.keys(AREAS) : (args.length ? args : DEFAULT_AREAS)

  // 기존 seed/스캔 로드(누적)
  const seed = {}
  for (const s of await seedAll()) seed[s.id] = s
  const scans = await scannedAll()
  const allUpserts = []

  let totalNew = 0
  for (const name of areaNames) {
    const center = AREAS[name]
    if (!center) { console.warn(`스킵: 모르는 동네 "${name}"`); continue }
    if (!scans.some((c) => Math.abs(c.lng - center[0]) < 0.02 && Math.abs(c.lat - center[1]) < 0.02)) {
      scans.push({ lng: center[0], lat: center[1] })
      await scannedAdd({ lng: center[0], lat: center[1] })
    }
    process.stdout.write(`\n[${name}] 카카오 수집...`)
    const docs = await kakaoCategory(rectOf(center), kkey)
    process.stdout.write(` ${docs.length}곳 → 네이버 블로그 태깅...`)
    const items = docs.map(toItem)
    const scanned = []
    for (const it of items) {
      const t = await naverTags(it.name, it.dong, nid, nsec)
      scanned.push({ it, tags: t.tags, blog: t.blog })
    }
    const stats = matjipCutoff(scanned.map((s) => s.blog))
    let tagged = 0
    for (const s of scanned) {
      const tags = isMatjip(s.blog, stats) ? [...new Set([...s.tags, '맛집'])] : s.tags
      if (!tags.length) continue
      tagged++
      const it = s.it
      const row = {
        id: it.id, name: it.name, region: it.region, cat: it.cat,
        lat: it.lat, lng: it.lng, place_url: it.place_url, icon: it.icon,
        tags: [...new Set(tags)], blog: s.blog, // 방식 변경 반영 위해 누적 아닌 '교체'
      }
      seed[it.id] = row
      allUpserts.push(row)
    }
    totalNew += tagged
    process.stdout.write(` 태그 ${tagged}곳`)
  }

  await seedUpsert(allUpserts)
  const list = Object.values(seed)
  // 태그 통계
  const stat = {}
  for (const s of list) for (const t of s.tags) stat[t] = (stat[t] || 0) + 1
  console.log(`\n\n✅ 저장 완료: 총 ${list.length}곳 (이번 태깅 ${totalNew}곳)`)
  console.log('   태그별:', Object.entries(stat).map(([k, v]) => `${k} ${v}`).join(' · '))
}

main()
