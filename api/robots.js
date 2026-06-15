// robots.txt — 크롤 허용 + 사이트맵 위치 안내. 도메인은 요청 호스트에서 자동.
// rewrite: /robots.txt → /api/robots
export default function handler(req, res) {
  const site = process.env.SITE_URL || (req.headers?.host ? `https://${req.headers.host}` : '')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.status(200).end(`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
}
