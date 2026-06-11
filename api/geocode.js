// 지역(주소) 검색 — 카카오 주소 API. '역삼동', '강남구 논현동', '해운대' 등을 좌표로.
// GET /api/geocode?q=역삼동 → { results: [{ label, lng, lat, zoom }] }
// 동까지면 zoom 15, 구/군이면 13, 시/도면 11.

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  const q = (req.query?.q || '').toString().trim()
  if (!key || q.length < 1) { res.status(200).json({ results: [] }); return }
  try {
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?size=10&query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `KakaoAK ${key}` },
    })
    if (!r.ok) { res.status(200).json({ results: [] }); return }
    const d = await r.json()
    const seen = new Set()
    const results = []
    for (const doc of d.documents || []) {
      const a = doc.address || {}
      const dong = a.region_3depth_name || a.region_3depth_h_name || ''
      const gu = a.region_2depth_name || ''
      const zoom = dong ? 15 : gu ? 13 : 11
      const label = doc.address_name
      const lng = Number(doc.x), lat = Number(doc.y)
      if (!Number.isFinite(lng) || !label || seen.has(label)) continue
      seen.add(label)
      results.push({ label, lng, lat, zoom })
    }
    res.status(200).json({ results })
  } catch (_) {
    res.status(200).json({ results: [] })
  }
}
