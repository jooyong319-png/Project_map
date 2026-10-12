// 동네 데이터 빌더 — 공공데이터만으로 코스 후보용 정적 JSON 을 만든다 (DB 불필요).
//  · 저장·가공·AI 입력이 허용된 데이터만 쓴다 (data.go.kr "이용허락범위 제한 없음", wiki/브리프.md).
//    카카오(장소ID·place_url 외 저장 불가)·네이버(파생물 저장 금지)는 여기서 쓰지 않는다.
//  · 입력
//    - data_raw/식품_일반음식점.csv, 식품_휴게음식점.csv  (행정안전부 인허가, EUC-KR, 좌표 EPSG:5174)
//    - data_raw/백년가게_지정리스트_*.csv                  (소상공인시장진흥공단, 업체명·주소만)
//    - TourAPI KorService2 (TOUR_API_KEY)                  관광지·문화시설·쇼핑·레포츠·음식점 + 이용시간·쉬는 날
//  · 출력: src/data/places/<slug>.json
//
// 실행:  node scripts/buildArea.mjs seongsu
// 동네 추가는 아래 AREAS 에 한 줄.

import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse'
import proj4 from 'proj4'
import { catFromKakao, ICON_BY_CAT, KIND_ICON } from '../api/kakao.js'
import { normName } from '../lib/naver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, 'data_raw')

// 동네 정의: 주소에 들어가는 법정동(dongs) + 좌표 박스(bbox: 서,남,동,북) + TourAPI 지역코드
const AREAS = {
  seongsu: {
    label: '성수', gu: '성동구', dongs: ['성수동1가', '성수동2가'],
    // TourAPI 는 시군구 코드가 빈 항목이 많아(서울숲 본체 등) 지역코드 대신 좌표 반경으로 조회
    bbox: [127.035, 37.535, 127.072, 37.553], tour: { mapX: 127.0535, mapY: 37.5440, radius: 2000 },
    keywords: ['성수', '서울숲', '뚝섬'],
  },
}

// EPSG:5174 (Korea Modified Central Belt, Bessel) → WGS84  (buildPlaces.mjs 와 동일)
const EPSG5174 = '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs'

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

// 코스 후보로 의미 없는 곳 (편의점·약국·드럭스토어·마트, 조리판매업)
const SKIP_NAME = /약국|의원|병원|피부과|치과|올리브영|다이소|편의점|GS25|씨유|CU\b|세븐일레븐|이마트24|미니스톱|마트$/i
const SKIP_BIZ = /편의점|일반조리판매/
// 카페 판정 — 인허가 업태(커피숍·까페 등)·관광공사 대표메뉴·이름에 카페 신호가 있으면 카페
const CAFE = /커피|카페|까페|cafe|coffee|베이커리|제과|디저트|빵|티룸|찻집|브런치/i
const catOf = (name, biz, menu = '') => (CAFE.test(`${biz} ${menu} ${name}`) ? '카페' : catFromKakao(`${biz} ${menu}`))

const inBox = (b, lng, lat) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]
const yearsSince = (d) => { const y = parseInt(String(d || '').slice(0, 4), 10); return y ? new Date().getFullYear() - y : 0 }
const keyOf = (name, addr) => `${normName(name).replace(/\s+/g, '')}|${(addr.match(/[가-힣0-9]+(?:로|길)\s*[0-9-]+/) || [''])[0].replace(/\s+/g, '')}`
const meters = (a, b) => { const dx = (a.lng - b.lng) * 88000, dy = (a.lat - b.lat) * 111000; return Math.sqrt(dx * dx + dy * dy) }

// ── 인허가 CSV (스트리밍, EUC-KR) ──
async function readLicense(file, area, defaultCat) {
  const dec = new TextDecoder('euc-kr')
  const decode = new Transform({
    transform(chunk, _e, cb) { cb(null, dec.decode(chunk, { stream: true })) },
    flush(cb) { cb(null, dec.decode()) },
  })
  const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true })
  const out = []
  let total = 0
  for await (const r of fs.createReadStream(file).pipe(decode).pipe(parser)) {
    total++
    const jibun = r['지번주소'] || '', road = r['도로명주소'] || ''
    if (!area.dongs.some((d) => jibun.includes(d) || road.includes(`(${d}`) || road.includes(` ${d}`))) continue
    if (!/영업|정상/.test(r['영업상태명'] || '') || (r['폐업일자'] || '').trim()) continue
    const x = parseFloat(r['좌표정보(X)']), y = parseFloat(r['좌표정보(Y)'])
    if (!(x > 0 && y > 0)) continue
    let lng, lat
    try { [lng, lat] = proj4(EPSG5174, 'WGS84', [x, y]) } catch (_) { continue }
    if (!inBox(area.bbox, lng, lat)) continue
    const biz = (r['업태구분명'] || '').trim()
    const name = (r['사업장명'] || '').trim()
    if (SKIP_BIZ.test(biz) || SKIP_NAME.test(name)) continue
    const cat = defaultCat || catOf(name, biz)
    out.push({
      id: `p_${(r['개방자치단체코드'] || '').trim()}_${(r['관리번호'] || '').trim()}`,
      name, kind: 'food', cat, biz,
      icon: ICON_BY_CAT[cat] || '🍽️',
      addr: (road || jibun).trim(), lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      phone: (r['전화번호'] || '').trim(), licensed: (r['인허가일자'] || '').trim(),
      tags: [], src: 'localdata',
    })
  }
  return { rows: out, total }
}

// ── 백년가게 (업체명·주소 → 인허가 행과 매칭) ──
async function readBaeknyeon() {
  const f = fs.readdirSync(RAW).find((n) => n.startsWith('백년가게'))
  if (!f) return []
  const txt = new TextDecoder('euc-kr').decode(fs.readFileSync(path.join(RAW, f)))
  const rows = []
  for await (const r of parse(txt, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true })) {
    rows.push({ name: r['업체명'] || '', addr: r['업체주소'] || '' })
  }
  return rows
}

// ── TourAPI ──
const TOUR = 'https://apis.data.go.kr/B551011/KorService2'
// contentTypeId → 우리 kind/cat + 이용시간·쉬는 날 필드명(detailIntro2 응답)
const TYPES = {
  12: { kind: 'travel', cat: '관광지', use: 'usetime', rest: 'restdate' },
  14: { kind: 'travel', cat: '문화시설', use: 'usetime', rest: 'restdateculture' },
  28: { kind: 'travel', cat: '레포츠', use: 'usetimeleports', rest: 'restdateleports' },
  38: { kind: 'travel', cat: '쇼핑', use: 'opentime', rest: 'restdateshopping' },
  39: { kind: 'food', cat: null, use: 'opentimefood', rest: 'restdatefood' },
}
async function tourGet(op, params, key) {
  const qs = new URLSearchParams({ serviceKey: key, MobileOS: 'ETC', MobileApp: 'kokkokkok', _type: 'json', ...params })
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${TOUR}/${op}?${qs}`)
      if (r.ok) {
        const d = await r.json()
        if (d?.response?.header?.resultCode === '0000') return d.response.body
      }
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 500 * (i + 1)))
  }
  return null
}
const clean = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function readTour(area, key) {
  const out = []
  const seen = new Set()
  const take = (it, type) => {
    const t = TYPES[type]
    const lng = +it.mapx, lat = +it.mapy
    if (!t || seen.has(it.contentid) || !inBox(area.bbox, lng, lat) || SKIP_NAME.test(it.title || '')) return
    seen.add(it.contentid)
    out.push({ type: +type, t, it, lng, lat })
  }
  // ① 좌표 반경 — 종류별
  for (const type of Object.keys(TYPES)) {
    for (let page = 1; page <= 10; page++) {
      const body = await tourGet('locationBasedList2', { ...area.tour, contentTypeId: type, numOfRows: 100, pageNo: page, arrange: 'E' }, key)
      for (const it of body?.items?.item || []) take(it, type)
      if (!body || page * 100 >= (body.totalCount || 0)) break
    }
  }
  // ② 키워드 — 지역코드가 빈 항목(서울숲 본체 등)은 ①에 안 잡혀서 동네 이름으로 보충
  for (const kw of area.keywords || []) {
    for (let page = 1; page <= 5; page++) {
      const body = await tourGet('searchKeyword2', { keyword: kw, numOfRows: 100, pageNo: page }, key)
      for (const it of body?.items?.item || []) take(it, it.contenttypeid)
      if (!body || page * 100 >= (body.totalCount || 0)) break
    }
  }
  // 이용시간·쉬는 날 (항목당 1회 호출)
  const rows = []
  for (const { type, t, it, lng, lat } of out) {
    const intro = (await tourGet('detailIntro2', { contentId: it.contentid, contentTypeId: type }, key))?.items?.item?.[0] || {}
    const cat = t.cat || catOf(clean(it.title), '', clean(intro.firstmenu) + ' ' + clean(intro.treatmenu))
    rows.push({
      id: `t_${it.contentid}`, name: clean(it.title), kind: t.kind, cat,
      icon: t.kind === 'food' ? (ICON_BY_CAT[cat] || '🍽️') : KIND_ICON.travel,
      addr: clean(it.addr1), lat: +lat.toFixed(6), lng: +lng.toFixed(6), phone: clean(it.tel),
      hours: { use: clean(intro[t.use]), rest: clean(intro[t.rest]) },
      menu: t.kind === 'food' ? clean(intro.firstmenu) : undefined,
      // 사진: 저작권 유형(Type1=출처표시, Type3=출처표시+변경금지) 그대로 보관 → 표시할 때 출처·원본 유지
      img: it.firstimage ? { url: it.firstimage.replace(/^http:/, 'https:'), cpyrht: it.cpyrhtDivCd || '' } : undefined,
      tags: ['관광공사 소개'], src: 'tourapi',
    })
  }
  return rows
}

async function main() {
  const slug = process.argv[2] || 'seongsu'
  const area = AREAS[slug]
  if (!area) { console.error(`모르는 동네: ${slug} (scripts/buildArea.mjs 의 AREAS 에 추가)`); process.exit(1) }
  const env = loadEnv()
  const t0 = Date.now()

  const general = await readLicense(path.join(RAW, '식품_일반음식점.csv'), area, null)
  const rest = await readLicense(path.join(RAW, '식품_휴게음식점.csv'), area, '카페')
  console.log(`인허가: 일반 ${general.rows.length}곳(전체 ${general.total}행 중), 휴게 ${rest.rows.length}곳(전체 ${rest.total}행 중)`)

  const places = [...general.rows, ...rest.rows]
  // 노포: 같은 자리에서 20년 이상
  for (const p of places) if (yearsSince(p.licensed) >= 20) p.tags.push('노포')

  // 백년가게 매칭 (정규화 이름 + 도로명 번지)
  const bn = await readBaeknyeon()
  const byKey = new Map(places.map((p) => [keyOf(p.name, p.addr), p]))
  let bnHit = 0
  for (const b of bn) {
    const p = byKey.get(keyOf(b.name, b.addr))
    if (p) { p.tags.push('백년가게'); bnHit++ }
  }
  console.log(`백년가게: 전국 ${bn.length}곳 중 이 동네 매칭 ${bnHit}곳`)

  // TourAPI — 관광공사 소개 음식점은 인허가 행과 합친다(이름 같고 100m 이내), 나머지는 새 행
  let tour = []
  if (env.TOUR_API_KEY) {
    tour = await readTour(area, env.TOUR_API_KEY)
    let merged = 0
    for (const t of tour) {
      if (t.kind !== 'food') { places.push(t); continue }
      const twin = places.find((p) => p.src === 'localdata' && normName(p.name).replace(/\s+/g, '') === normName(t.name).replace(/\s+/g, '') && meters(p, t) < 100)
      if (twin) { Object.assign(twin, { hours: t.hours, menu: t.menu, img: t.img, tour_id: t.id }); twin.tags.push('관광공사 소개'); merged++ }
      else places.push(t)
    }
    console.log(`TourAPI: ${tour.length}곳 (음식점 중 인허가와 합침 ${merged}곳), 이용시간 있음 ${tour.filter((t) => t.hours.use).length}곳`)
  } else console.warn('⚠️ TOUR_API_KEY 없음 → 관광지 없이 빌드')

  const outDir = path.join(ROOT, 'src', 'data', 'places')
  fs.mkdirSync(outDir, { recursive: true })
  const data = {
    slug, label: area.label, bbox: area.bbox, built: new Date().toISOString().slice(0, 10),
    sources: ['행정안전부 식품 인허가(일반·휴게음식점)', '소상공인시장진흥공단 백년가게', '한국관광공사 TourAPI'],
    places,
  }
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(data) + '\n', 'utf8')
  const kinds = places.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {})
  console.log(`→ src/data/places/${slug}.json: ${places.length}곳`, kinds, `(${((Date.now() - t0) / 1000).toFixed(0)}초)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
