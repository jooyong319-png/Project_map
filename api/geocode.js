// 지역·장소 검색 — 카카오 로컬(실시간 호출만, 결과는 저장하지 않음).
// GET /api/geocode?q=역삼동 → { results: [{ label, lng, lat, zoom, kind }] }
//  ① 주소 API: '역삼동', '강남구 논현동', '해운대' → kind:'region' (동 zoom 15, 구/군 13, 시/도 11)
//  ② 키워드 API: '용산역', '종로3가역', '서울숲' 처럼 주소가 아닌 이름 → kind:'station'(지하철역) | 'spot'
//     '…역'으로 끝나면 역을 먼저, 주소 결과가 없으면 키워드로.

const KAKAO = 'https://dapi.kakao.com/v2/local'

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  const q = (req.query?.q || '').toString().trim()
  if (!key || q.length < 1) { res.status(200).json({ results: [] }); return }
  const headers = { Authorization: `KakaoAK ${key}` }
  const get = async (url) => { try { const r = await fetch(url, { headers }); return r.ok ? (await r.json()).documents || [] : [] } catch (_) { return [] } }
  try {
    const wantStation = /역$/.test(q)
    const [addr, subway] = await Promise.all([
      get(`${KAKAO}/search/address.json?size=10&query=${encodeURIComponent(q)}`),
      get(`${KAKAO}/search/keyword.json?size=5&category_group_code=SW8&query=${encodeURIComponent(q)}`),
    ])
    const seen = new Set()
    const regions = []
    for (const doc of addr) {
      const a = doc.address || {}
      const dong = a.region_3depth_name || a.region_3depth_h_name || ''
      const gu = a.region_2depth_name || ''
      const label = doc.address_name
      const lng = Number(doc.x), lat = Number(doc.y)
      if (!Number.isFinite(lng) || !label || seen.has(label)) continue
      seen.add(label)
      regions.push({ label, lng, lat, zoom: dong ? 15 : gu ? 13 : 11, kind: 'region' })
    }
    const stations = subway.map((p) => ({ label: p.place_name, sub: p.address_name, lng: Number(p.x), lat: Number(p.y), zoom: 16, kind: 'station' }))
      .filter((s) => Number.isFinite(s.lng) && !seen.has(s.label) && seen.add(s.label))
    let results = wantStation ? [...stations, ...regions] : [...regions, ...stations]
    // 주소·역 둘 다 없으면 일반 장소 키워드(서울숲, 롯데월드 등)
    if (!results.length) {
      const spots = await get(`${KAKAO}/search/keyword.json?size=5&query=${encodeURIComponent(q)}`)
      results = spots.map((p) => ({ label: p.place_name, sub: p.address_name, lng: Number(p.x), lat: Number(p.y), zoom: 16, kind: 'spot' }))
        .filter((s) => Number.isFinite(s.lng))
    }
    res.status(200).json({ results: results.slice(0, 10) })
  } catch (_) {
    res.status(200).json({ results: [] })
  }
}
