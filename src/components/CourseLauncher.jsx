import { useState, useEffect, useRef } from 'react'

// AI 코스 런처 — 위치(지금 보는 지역 / 동네·역 검색·추천칩) + 테마(선택) + 🚗 정하고 '코스 짜기'.
// 데이터가 준비된 동네(src/data/places)만 — 역은 spot:true → 역 주변 걸어갈 범위로 좁히고 역에서 출발
const POPULAR = [
  { label: '성수역', center: [127.0557, 37.5446], spot: true },
  { label: '용산역', center: [126.9648, 37.5298], spot: true },
  { label: '삼각지역', center: [126.9731, 37.5348], spot: true },
  { label: '종로3가역', center: [126.9917, 37.5714], spot: true },
  { label: '익선동', center: [126.9893, 37.5741], spot: true },
  { label: '천안 불당동', center: [127.1095, 36.8125] },
  { label: '천안 신부동', center: [127.1556, 36.8196] },
]
const THEME_CHIPS = ['데이트', '저녁 데이트', '가족 나들이', '혼자 힐링', '맛집 위주', '감성 카페', '액티비티']

export default function CourseLauncher({ onLaunch, onUseCurrent, hasCurrent, onClose }) {
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState([])
  const pickedRef = useRef(false) // 선택 직후엔 재검색 안 함(고른 값 유지)
  // loc: null | {type:'current'} | {type:'region', center, label, spot}
  const [loc, setLoc] = useState(null)
  const [theme, setTheme] = useState('')
  const [car, setCar] = useState(false) // 🚗 차로 가요 → 주차장(공영·민영) 함께

  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; setSugs([]); return } // 고른 직후엔 스킵
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

  const pickRegion = (center, label, spot = false) => { pickedRef.current = true; setLoc({ type: 'region', center, label, spot }); setQ(label); setSugs([]) }
  const submit = () => {
    if (!loc) return
    const th = theme.trim()
    if (loc.type === 'current') onUseCurrent(th, car)
    else onLaunch(loc.center, loc.label, th, loc.spot, car)
  }
  const btnLabel = loc ? `'${loc.label}' 코스 짜기` : '위치를 골라주세요'

  return (
    <>
      <div className="course-pop-backdrop" onClick={onClose} />
      <div className="course-pop" role="dialog" aria-label="AI 코스 짜기">
        <div className="cl-head">
          <span>🧭 AI 코스 짜기</span>
          <button className="region-modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="cl-field-label">위치</div>
        <button
          className={`cl-loc-opt ${loc?.type === 'current' ? 'on' : ''}`}
          onClick={() => hasCurrent && setLoc((l) => (l?.type === 'current' ? null : { type: 'current', label: '지금 보고 있는 지역' }))}
          disabled={!hasCurrent}
        >
          <span className="cl-loc-main">📍 지금 보고 있는 지역</span>
          {!hasCurrent && <span className="cl-loc-hint">지도를 동네까지 확대하면 사용할 수 있어요</span>}
        </button>

        <div className="cl-or">또는 동네·역 선택</div>
        <input
          className="region-search"
          value={q}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim() && loc?.type === 'current') setLoc(null) }}
          placeholder="동네·역 검색 (예: 용산역, 익선동)"
        />
        {sugs.length > 0 && (
          <div className="region-suggests">
            {sugs.map((s) => (
              <button key={s.label} className="region-suggest" onClick={() => pickRegion([s.lng, s.lat], s.label, s.kind === 'station' || s.kind === 'spot')}>
                <span className="region-suggest-ic">{s.kind === 'station' ? '🚉' : '📍'}</span>{s.label}
                {s.sub && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>{s.sub}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="cl-chips">
          {POPULAR.map((p) => (
            <button
              key={p.label}
              className={`cl-chip ${loc?.type === 'region' && loc.label === p.label ? 'on' : ''}`}
              onClick={() => pickRegion(p.center, p.label, !!p.spot)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="cl-field-label">테마 <span>선택</span></div>
        <input
          className="region-search"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="예: 데이트 코스, 혼자 힐링, 맛집 위주"
        />
        <div className="cl-chips">
          {THEME_CHIPS.map((t) => (
            <button key={t} className={`cl-chip ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>

        <button className={`cl-chip ${car ? 'on' : ''}`} style={{ marginTop: 10 }} onClick={() => setCar((c) => !c)} aria-pressed={car}>
          🚗 차로 가요 {car ? '· 주차장도 알려드려요' : ''}
        </button>

        <button className="cl-submit" onClick={submit} disabled={!loc}>🧭 {btnLabel}</button>
      </div>
    </>
  )
}
