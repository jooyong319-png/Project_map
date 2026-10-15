import { useState, useEffect, useRef } from 'react'

// 첫 화면 — "오늘 어디서 데이트해요?" : 어디서(동네·역) · 언제(낮/저녁) · 분위기 · 🚗 → 코스 짜기
// 시안: 콕콕콕 코스 퍼스트 시안(Artifact) ①/③

// 데이터가 준비된 동네(src/data/places)만 — 역·장소는 spot:true → 그 지점 주변 걸어갈 범위로 좁히고 거기서 출발
export const POPULAR = [
  { label: '성수역', center: [127.0557, 37.5446], spot: true },
  { label: '용산역', center: [126.9648, 37.5298], spot: true },
  { label: '삼각지역', center: [126.9731, 37.5348], spot: true },
  { label: '종로3가역', center: [126.9917, 37.5714], spot: true },
  { label: '익선동', center: [126.9893, 37.5741], spot: true },
  { label: '이태원역', center: [126.9945, 37.5345], spot: true },
  { label: '한강진역', center: [127.0018, 37.5396], spot: true },
  { label: '천안 불당동', center: [127.1095, 36.8125] },
  { label: '천안 신부동', center: [127.1556, 36.8196] },
]
// 분위기 → 코스 엔진에 넘기는 테마 문장
const MOODS = [
  { key: 'cafe', label: '감성 카페', theme: '감성 카페 데이트' },
  { key: 'food', label: '맛집 투어', theme: '맛집 투어' },
  { key: 'walk', label: '산책', theme: '산책하기 좋은 데이트' },
  { key: 'art', label: '전시·구경', theme: '전시·편집숍 구경' },
  { key: 'hanok', label: '한옥·골목', theme: '한옥·골목 감성' },
]

export default function StartPanel({ onSubmit, onBrowse, remaining, initial }) {
  const [q, setQ] = useState(initial?.label || '')
  const [sugs, setSugs] = useState([])
  const pickedRef = useRef(false) // 고른 직후엔 재검색 안 함
  const [loc, setLoc] = useState(initial?.loc || null) // { center, label, spot }
  const [time, setTime] = useState(initial?.time || 'day') // 'day' | 'evening'
  const [mood, setMood] = useState(initial?.mood || '')
  const [car, setCar] = useState(!!initial?.car)
  // 정해 둔 일정 — "8시에 갈 곳은 정했는데 그 전이 없어" (그 시각·그곳 전을 채우는 코스)
  const [hasFixed, setHasFixed] = useState(!!initial?.fixed)
  const [fixed, setFixed] = useState(initial?.fixed || null) // { label, lng, lat, time }
  const [fq, setFq] = useState(initial?.fixed?.label || '')
  const [fsugs, setFsugs] = useState([])
  const fPickedRef = useRef(false)
  const [ftime, setFtime] = useState(initial?.fixed?.time || '20:00')
  useEffect(() => {
    if (fPickedRef.current) { fPickedRef.current = false; setFsugs([]); return }
    const term = fq.trim()
    if (term.length < 1) { setFsugs([]); return }
    const t = setTimeout(async () => {
      try {
        // 가게 이름 → 카카오 자동완성(실시간, 저장 안 함). 지금 고른 동네가 있으면 그 근처 우선
        const bb = loc ? `&bbox=${loc.center[0] - 0.03},${loc.center[1] - 0.03},${loc.center[0] + 0.03},${loc.center[1] + 0.03}` : ''
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(term)}&kind=all${bb}`)
        const d = await r.json()
        setFsugs(Array.isArray(d.results) ? d.results.slice(0, 6) : [])
      } catch (_) { setFsugs([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [fq])
  const pickFixed = (s) => { fPickedRef.current = true; setFixed({ label: s.name, lng: s.lng, lat: s.lat }); setFq(s.name); setFsugs([]) }
  const TIMES = []
  for (let h = 11; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; setSugs([]); return }
    const term = q.trim()
    if (term.length < 1) { setSugs([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`)
        const d = await r.json()
        setSugs(Array.isArray(d.results) ? d.results : [])
      } catch (_) { setSugs([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const pick = (center, label, spot) => { pickedRef.current = true; setLoc({ center, label, spot }); setQ(label); setSugs([]) }
  const fx = hasFixed && fixed ? { ...fixed, time: ftime } : null
  const ready = !!loc || !!fx // 정해 둔 곳만 있어도 그 근처로 짤 수 있다
  const submit = () => {
    if (!ready) return
    const m = MOODS.find((x) => x.key === mood)
    const where = loc || { center: [fx.lng, fx.lat], label: fx.label, spot: false, nearFixed: true }
    onSubmit({ ...where, time, mood, theme: m?.theme || '', car, fixed: fx })
  }
  const submitLabel = fx ? `${fx.time} ${fx.label} 가기 전 코스 짜기` : loc ? `${loc.label}에서 코스 짜기` : '동네나 역을 골라 주세요'

  return (
    <div className="cf-start">
      <div className="cf-start-top">
        <h1 className="cf-h1">오늘 어디서<br />데이트해요?</h1>
        <p className="cf-lead">동네나 역만 고르면, 지금 영업 중인 곳으로 하루 코스를 짜 드려요.</p>
      </div>

      <label className="cf-label" htmlFor="cf-where">어디서</label>
      <div className="cf-search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8079" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
        <input
          id="cf-where" type="text" value={q} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setLoc(null) }}
          placeholder="동네·역 (예: 용산역, 익선동)"
        />
      </div>
      {sugs.length > 0 && (
        <div className="cf-sugs">
          {sugs.map((s) => (
            <button key={s.label} type="button" className="cf-sug" onClick={() => pick([s.lng, s.lat], s.label, s.kind === 'station' || s.kind === 'spot')}>
              <span>{s.kind === 'station' ? '🚉' : '📍'}</span>{s.label}
              {s.sub && <span className="cf-sug-sub">{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="cf-chips">
        {POPULAR.map((p) => (
          <button key={p.label} type="button" className={`cf-chip ${loc?.label === p.label ? 'on' : ''}`} aria-pressed={loc?.label === p.label} onClick={() => pick(p.center, p.label, !!p.spot)}>{p.label}</button>
        ))}
      </div>

      <div className="cf-label">언제</div>
      {!hasFixed && (
        <div className="cf-seg" role="group" aria-label="언제">
          <button type="button" className={time === 'day' ? 'on' : ''} aria-pressed={time === 'day'} onClick={() => setTime('day')}>낮 · 점심부터</button>
          <button type="button" className={time === 'evening' ? 'on' : ''} aria-pressed={time === 'evening'} onClick={() => setTime('evening')}>저녁 · 퇴근 후</button>
        </div>
      )}
      <label className="cf-car cf-fixed-toggle">
        <span>정해 둔 일정이 있어요 <small>그 전을 채워 드려요</small></span>
        <input type="checkbox" checked={hasFixed} onChange={(e) => setHasFixed(e.target.checked)} />
      </label>
      {hasFixed && (
        <div className="cf-fixed">
          <label className="cf-fixed-row">
            <span>어디</span>
            <input type="text" value={fq} autoComplete="off" onChange={(e) => { setFq(e.target.value); setFixed(null) }} placeholder="가게 이름 (예: 예약한 식당)" />
          </label>
          {fsugs.length > 0 && (
            <div className="cf-sugs">
              {fsugs.map((s) => (
                <button key={s.id} type="button" className="cf-sug" onClick={() => pickFixed(s)}>
                  <span>{s.icon || '📍'}</span>{s.name}<span className="cf-sug-sub">{s.region}</span>
                </button>
              ))}
            </div>
          )}
          <label className="cf-fixed-row">
            <span>몇 시</span>
            <select value={ftime} onChange={(e) => setFtime(e.target.value)}>
              {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {!fixed && fq.trim() && <div className="cf-fixed-hint">목록에서 가게를 골라 주세요</div>}
        </div>
      )}

      <div className="cf-label">어떤 분위기 <span>선택</span></div>
      <div className="cf-chips">
        {MOODS.map((m) => (
          <button key={m.key} type="button" className={`cf-chip ${mood === m.key ? 'on' : ''}`} aria-pressed={mood === m.key} onClick={() => setMood(mood === m.key ? '' : m.key)}>{m.label}</button>
        ))}
      </div>

      <label className="cf-car">
        <span>차로 가요 <small>주차장도 알려 드려요</small></span>
        <input type="checkbox" checked={car} onChange={(e) => setCar(e.target.checked)} />
      </label>

      <div className="cf-grow" />
      <button type="button" className="cf-submit" onClick={submit} disabled={!ready}>{submitLabel}</button>
      <p className="cf-foot">
        오늘 {remaining}번 남았어요 · <button type="button" className="cf-link" onClick={onBrowse}>주변 맛집 둘러보기</button>
      </p>
    </div>
  )
}
