// L2 태깅 배치 — 베이스(p_*) 행에 네이버 블로그수(인기순 재료) + '맛집' 태그(동네 상위 30%)를 부여.
//  · 노포순은 인허가일(licensed)로 이미 커버 → 여기선 blog/맛집(+핫플/혼밥) 만.
//  · '맛집' = 같은 동(洞) 안에서 블로그수 상위 30% & floor 이상 (naver.js matjipCutoff 재사용).
//  · 처리한 행은 nt:1 로 마킹 → 재실행 시 이미 한 동은 건너뜀(이어서 태깅).
//  · 네이버 무료 25,000건/일. 장소당 2~5콜 → --max(이번 실행 장소 상한, 기본 4000≈~16k콜)로 끊고 다음날 이어서.
//  · ⚠️ 로컬 파일(seed.json) 모드로 동작. Supabase(prod)는 일부러 안 켠다(로컬 검증 후 마지막에 푸시).
//
// 실행:  node scripts/buildTags.mjs [최대장소수] [동필터]
//   예:  node scripts/buildTags.mjs 200 역삼동     # 검증: 역삼동 200곳만
//        node scripts/buildTags.mjs 4000           # 하루치(미태깅 동부터 4000곳)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { naverTags, matjipCutoff, isMatjip, dongOf, topTagOf } from '../lib/naver.js'
import { seedAll, seedUpsert } from '../lib/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// .env 로드 — 단 SUPABASE_* 는 제외해서 store.js 가 파일(seed.json) 모드를 유지하게 한다.
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (!m) continue
      if (m[1].startsWith('SUPABASE_')) continue   // prod DB 안 켬(로컬 파일 모드 유지)
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch (_) {}
}

const dongFor = (p) => dongOf(p.addr_jibun || p.region || '')

async function main() {
  loadEnv()
  const nid = process.env.NAVER_CLIENT_ID, nsec = process.env.NAVER_CLIENT_SECRET
  if (!nid || !nsec) { console.error('NAVER_CLIENT_ID/SECRET 없음(.env)'); process.exit(1) }
  const maxPlaces = parseInt(process.argv[2], 10) || 4000
  const dongFilter = process.argv[3] || ''
  const kind = 'food', topTag = topTagOf(kind)   // '맛집'

  // 베이스(p_*) 중 아직 태깅 안 한(nt 없음) 행만, 동별로 묶는다.
  const base = (await seedAll(kind)).filter((p) => String(p.id).startsWith('p_') && !p.nt)
  const byDong = new Map()
  for (const p of base) {
    const d = dongFor(p)
    if (!d || (dongFilter && d !== dongFilter)) continue
    if (!byDong.has(d)) byDong.set(d, [])
    byDong.get(d).push(p)
  }
  console.log(`미태깅 베이스 ${base.length}곳 / 대상 동 ${byDong.size}개. 이번 실행 상한 ${maxPlaces}곳.`)

  let done = 0, matjip = 0
  for (const [dong, places] of byDong) {
    if (done >= maxPlaces) { console.log('상한 도달 — 다음 동은 다음 실행에서 이어서.'); break }
    const tagged = []
    for (const p of places) {
      const t = await naverTags(p.name, dong, kind, nid, nsec)
      tagged.push({ p, tags: t.tags, blog: t.blog, ok: t.ok })
    }
    // 네이버 호출 실패(쿼터 소진/429)한 곳은 nt 를 안 박아 다음 실행에 재시도(영구 미태깅 방지).
    const ok = tagged.filter((s) => s.ok)
    const failed = tagged.length - ok.length
    const stats = matjipCutoff(ok.map((s) => s.blog), kind)   // 그 동의 상위 30% 컷 + 아웃라이어 cap
    const ups = ok.map(({ p, tags, blog }) => {
      const finalTags = (topTag && isMatjip(blog, stats)) ? [...new Set([...tags, topTag])] : tags
      // 일반어 충돌(짧은 이름이 무관한 블로그에 다 매칭, blog>cap)은 인기순 오염 방지로 0 처리.
      const pop = blog <= stats.cap ? blog : 0
      return { ...p, tags: finalTags, blog: pop, nt: 1 }
    })
    if (ups.length) await seedUpsert(ups)
    const m = ups.filter((x) => x.tags.includes('맛집')).length
    done += ok.length; matjip += m
    console.log(`${dong}: ${ok.length}곳 태깅 → 맛집 ${m}곳${failed ? ` (실패 ${failed}곳 재시도 대기)` : ''} (누적 ${done}곳)`)
    if (failed && failed > ok.length) { console.log('네이버 호출 대량 실패 — 일일 쿼터 소진 추정. 중단(다음날 이어서).'); break }
  }
  console.log(`완료: ${done}곳 태깅, 맛집 ${matjip}곳. 남은 미태깅 동은 재실행하면 이어서 처리.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
