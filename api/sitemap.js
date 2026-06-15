// sitemap.xml — 색인 대상 장소 URL 목록. 구글/네이버가 /place/:id 들을 발견하게 한다.
//  · 품질 기준: licensed 있는 행(=공공데이터 소유 베이스)만 → 얄팍한 페이지 색인 회피.
//  · Supabase 기본 1000행 한계 → offset 페이지네이션. CDN/크롤러 캐시(하루).
// rewrite: /sitemap.xml → /api/sitemap
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  const site = process.env.SITE_URL || (req.headers?.host ? `https://${req.headers.host}` : '')
  const ids = []
  if (SB_URL && SB_KEY) {
    for (let off = 0; off < 60000; off += 1000) {
      const r = await fetch(`${SB_URL}/rest/v1/seed?select=id&licensed=not.is.null&limit=1000&offset=${off}`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      })
      if (!r.ok) break
      const rows = await r.json()
      for (const x of rows) ids.push(x.id)
      if (rows.length < 1000) break
    }
  }
  const urls = ids.map((id) => `<url><loc>${site}/place/${encodeURIComponent(id)}</loc></url>`).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.status(200).end(xml)
}
