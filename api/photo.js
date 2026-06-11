// Vercel 서버리스 함수 - Google Place Photos 프록시
// 브라우저에서 GET /api/photo?ref=<photoName>&w=200 로 호출.
// 키를 서버에서만 사용해 노출을 막고, 받은 이미지를 그대로 전달한다.

export default async function handler(req, res) {
  let ref = (req.query?.ref || '').toString()
  const place = (req.query?.place || '').toString()
  const w = Math.min(Math.max(parseInt(req.query?.w, 10) || 200, 40), 1600)
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    res.status(404).end()
    return
  }
  try {
    // place id 가 오면 그 가게의 첫 사진 ref 를 실시간 조회 (ref 만료 걱정 없음)
    if (!ref && place) {
      const dr = await fetch(`https://places.googleapis.com/v1/places/${place}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'photos' },
      })
      const dj = await dr.json()
      ref = dj.photos?.[0]?.name || ''
    }
    if (!ref) {
      res.status(404).end()
      return
    }
    const url = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${w}&key=${key}`
    const r = await fetch(url) // fetch 가 리다이렉트를 따라가 이미지 바이트를 받음
    if (!r.ok) {
      res.status(r.status).end()
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800') // 브라우저/CDN 캐시로 재호출 최소화
    res.status(200).end(buf)
  } catch (e) {
    res.status(500).end()
  }
}
