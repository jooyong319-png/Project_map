// 매일 도는 크론 — 21일 넘게 안 쓰인 구글 캐시 row 삭제(ToS 30일 하드리밋 방어).
// vercel.json 의 crons 가 매일 호출. Vercel 은 헤더에 'Authorization: Bearer $CRON_SECRET' 를 붙인다.
// CRON_SECRET 을 설정하면 외부 임의 호출을 막는다(미설정 시 누구나 호출 가능 — 운영에선 설정 권장).
import { gcachePurge } from './store.js'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  try {
    const removed = await gcachePurge(21)
    res.status(200).json({ ok: true, removed })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
