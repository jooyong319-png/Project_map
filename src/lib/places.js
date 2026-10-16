// 프론트 데이터 계층 — 서버 API(/api/*) 호출

// 한국 영역인지(대략) — 장소 데이터는 카카오(국내 전용)만 쓴다. 해외는 '준비 중'.
export function isKorea(lat, lng) {
  return lng >= 124.5 && lng <= 131.5 && lat >= 33 && lat <= 39
}

// AI 코스 짜기 — 지도 영역(bbox)+테마로 하루 동선을 받아온다.
// from = { label, lng, lat } — 역·장소에서 출발할 때(첫 장소를 거기서 가깝게, 도보 시간 표시)
// car = 🚗 차로 가요 → 응답에 주차장(parking) / time = 'day' | 'evening'
// fixed = { label, lng, lat, time } — 정해 둔 일정(그 시각에 그곳). 코스는 그 전을 채운다
// exclude = 직전 코스 장소 id ('다른 코스'에서 같은 가게 반복 방지)
// extra = { start "HH:MM", first 점심|저녁|카페|구경, wish } — 만나는 시각·첫 순서·직접 쓴 요청
export async function getCourse(bbox, theme = '', from = null, car = false, time = 'day', fixed = null, exclude = [], extra = null) {
  try {
    const t = theme ? `&theme=${encodeURIComponent(theme)}` : ''
    const f = from ? `&from=${encodeURIComponent(from.label)}&fx=${from.lng}&fy=${from.lat}` : ''
    const k = fixed ? `&fixed=${encodeURIComponent(fixed.label)}&kx=${fixed.lng}&ky=${fixed.lat}&kt=${fixed.time}` : ''
    const x = exclude?.length ? `&ex=${encodeURIComponent(exclude.join(','))}` : ''
    const e = ['start:st', 'first:first', 'wish:wish'].map((kv) => { const [a, b] = kv.split(':'); return extra?.[a] ? `&${b}=${encodeURIComponent(extra[a])}` : '' }).join('')
    const res = await fetch(`/api/course?bbox=${bbox.join(',')}${t}${f}${k}${x}${e}${car ? '&car=1' : ''}&time=${time}`)
    if (res.status === 429) return { limited: true } // 서버 호출 제한
    if (res.ok) return (await res.json()).course || null
  } catch (_) {}
  return null
}

// 한 문장 → 코스 조건 ({ where, start, first, fixedName, fixedTime, mood, car, wish }). 실패면 null, 제한이면 { limited }
export async function parsePlan(q) {
  try {
    const res = await fetch(`/api/plan?q=${encodeURIComponent(q)}`)
    if (res.status === 429) return { limited: true }
    if (res.ok) return (await res.json()).plan || null
  } catch (_) {}
  return null
}

// 장소 검색 — 카카오 로컬(실시간, 저장 안 함). 한국 영역(또는 영역 없는 전국 검색)만.
//  해외 영역 → 빈 결과 + source:'overseas', 실패 → source:'error'
export async function getRestaurants(query = '', opts = {}) {
  const base = query.trim()
  const bbox = opts.bbox
  const kind = opts.kind || 'food'
  if (Array.isArray(bbox) && !isKorea((bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2)) {
    return { items: [], source: 'overseas' }
  }
  try {
    const params = new URLSearchParams()
    if (base) params.set('q', base)
    if (kind && kind !== 'food') params.set('kind', kind)
    if (bbox) params.set('bbox', bbox.join(','))
    if (opts.limit) params.set('lim', String(opts.limit)) // 격자로 모을 목표 개수(50/100/200)
    const res = await fetch(`/api/kakao?${params.toString()}`)
    if (!res.ok) return { items: [], source: 'error' }
    const data = await res.json()
    if (data.fallback || data.error) return { items: [], source: 'error' }
    let items = Array.isArray(data.places) ? data.places : []
    // 지역 한정: 주소에 그 지역명(예 "개봉")이 든 곳만 (개봉동만 보고 싶을 때). 비면 원래대로.
    if (opts.regionTerm) {
      const f = items.filter((i) => (i.region || '').includes(opts.regionTerm))
      if (f.length) items = f
    }
    return { items, source: 'kakao', center: data.center || null } // center: 지역검색 시 지도 이동용
  } catch (_) {
    return { items: [], source: 'error' } // 네트워크 오류
  }
}
