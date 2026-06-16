// SEO 통합 함수 — 장소 페이지(/place/:id) + sitemap.xml + robots.txt 를 한 함수에서 처리.
//  · 셋 다 서버 전용(크롤러·링크미리보기용)이라 묶어서 Vercel 함수 개수를 아낀다(무료 12개 한도).
//  · 라우팅(vercel.json): /place/:id → ?type=place&id / /sitemap.xml → ?type=sitemap / /robots.txt → ?type=robots
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ── 장소 1곳 ──
async function getPlace(id) {
  if (!SB_URL || !SB_KEY || !id) return null
  const r = await fetch(`${SB_URL}/rest/v1/seed?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: sbHeaders })
  if (!r.ok) return null
  return (await r.json())[0] || null
}

function placeHtml(p, site, id) {
  const name = p.name || ''
  const cat = p.cat || p.biz_type || ''
  const region = p.region || p.addr_road || p.addr_jibun || ''
  const lyear = p.licensed ? parseInt(String(p.licensed).slice(0, 4), 10) : 0
  const age = lyear ? new Date().getFullYear() - lyear : 0
  const since = age >= 20 ? `${lyear}년부터 ${age}년 전통 노포` : lyear ? `${lyear}년부터 영업` : ''
  const tags = Array.isArray(p.tags) ? p.tags : []
  const title = `${name}${cat ? ` · ${cat}` : ''}${region ? ` | ${region.split(' ').slice(0, 2).join(' ')} 맛집` : ''}`
  const desc = [region, cat, since, tags.length ? `#${tags.join(' #')}` : '', p.blog ? `블로그 ${p.blog}건 언급` : '']
    .filter(Boolean).join(' · ').slice(0, 155) || `${name} 정보`
  const url = `${site}/place/${encodeURIComponent(id)}`
  const img = p.photo ? (String(p.photo).startsWith('http') ? p.photo : `${site}${p.photo}`) : ''
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Restaurant', name, address: region,
    ...(cat ? { servesCuisine: cat } : {}),
    ...(Number.isFinite(p.lat) ? { geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } } : {}),
    ...(img ? { image: img } : {}), url,
  }
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:0 auto;padding:24px;line-height:1.7;color:#222}h1{margin:.1em 0}.meta{color:#777;font-size:15px}.tags span{display:inline-block;background:#f3eee7;border-radius:999px;padding:4px 11px;margin:3px 3px 0 0;font-size:14px}.cta{display:inline-block;margin-top:22px;padding:13px 20px;background:#f0792e;color:#fff;border-radius:11px;text-decoration:none;font-weight:700}a.map{color:#2a6df0}</style>
</head><body>
<h1>${esc(name)}</h1>
<p class="meta">${esc(cat)}${since ? ` · ${esc(since)}` : ''}${p.blog ? ` · 📝 블로그 ${p.blog}건` : ''}</p>
<p>📍 ${esc(region)}</p>
${tags.length ? `<div class="tags">${tags.map((t) => `<span>🏅 ${esc(t)}</span>`).join('')}</div>` : ''}
${p.phone ? `<p>📞 ${esc(p.phone)}</p>` : ''}
${p.place_url ? `<p><a class="map" href="${esc(p.place_url)}" target="_blank" rel="nofollow noopener">카카오맵에서 위치·사진 보기 →</a></p>` : ''}
<a class="cta" href="/">전국맛집 지도에서 둘러보기 →</a>
<!-- AdSense 슬롯 위치(승인 후 광고 코드 삽입) -->
</body></html>`
}

// ── sitemap (licensed 있는 베이스만, 페이지네이션) ──
async function sitemapXml(site) {
  const ids = []
  if (SB_URL && SB_KEY) {
    for (let off = 0; off < 60000; off += 1000) {
      const r = await fetch(`${SB_URL}/rest/v1/seed?select=id&licensed=not.is.null&limit=1000&offset=${off}`, { headers: sbHeaders })
      if (!r.ok) break
      const rows = await r.json()
      for (const x of rows) ids.push(x.id)
      if (rows.length < 1000) break
    }
  }
  const urls = ids.map((id) => `<url><loc>${site}/place/${encodeURIComponent(id)}</loc></url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
}

export default async function handler(req, res) {
  const type = (req.query?.type || 'place').toString()
  const site = process.env.SITE_URL || (req.headers?.host ? `https://${req.headers.host}` : '')

  if (type === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).end(`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
    return
  }
  if (type === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    res.status(200).end(await sitemapXml(site))
    return
  }
  // 기본: 장소 페이지
  const id = (req.query?.id || '').toString()
  const p = await getPlace(id)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!p) {
    res.status(404).end('<!doctype html><html lang=ko><meta charset=utf-8><title>장소를 찾을 수 없습니다</title><body><p>해당 장소를 찾을 수 없습니다.</p><a href="/">전국맛집 지도로</a>')
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.status(200).end(placeHtml(p, site, id))
}
