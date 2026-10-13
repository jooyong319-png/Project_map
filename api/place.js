// 장소 상세 보강 — 상세 패널 열 때 호출.
//  GET /api/place?blog=1&name=..&addr=..  → 네이버 블로그 글 수 실시간 조회(저장·CDN 캐시 없음, lib/naver.js 주석 참고)
import { blogQuery, blogCount } from '../lib/naver.js'

export default async function handler(req, res) {
  const name = (req.query?.name || '').toString().slice(0, 60)
  const addr = (req.query?.addr || '').toString().slice(0, 120)
  if (req.query?.blog !== '1' || !name) { res.status(200).json({ error: 'no name' }); return }
  const query = blogQuery(name, addr)
  const total = await blogCount(query, process.env.NAVER_CLIENT_ID, process.env.NAVER_CLIENT_SECRET)
  // 특약: 서버 측 보관 금지 → CDN(s-maxage) 캐시 없이 사용자 기기에만 짧게
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.status(200).json({
    total: total >= 0 ? total : null,
    query,
    url: `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`,
  })
}
