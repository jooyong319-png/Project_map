import { useState, useEffect } from 'react'

// AI 코스 런처 — 위치(선택) + 테마(텍스트)를 정하고 '코스 짜기'.
const POPULAR = [
  { label: '서울 종로', center: [126.991, 37.572] },
  { label: '서울 강남', center: [127.028, 37.498] },
  { label: '서울 성수', center: [127.056, 37.544] },
  { label: '서울 홍대', center: [126.923, 37.556] },
  { label: '부산 해운대', center: [129.160, 35.163] },
  { label: '경주', center: [129.225, 35.842] },
]
const THEME_CHIPS = ['데이트', '가족 나들이', '혼자 힐링', '맛집 위주', '감성 카페', '액티비티']

export default function CourseLauncher({ onLaunch, onUseCurrent, hasCurrent, onClose }) {
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState([])
  // loc: { type:'current' } | { type:'region', center:[lng,lat], label }
  const [loc, setLoc] = useState(hasCurrent ? { type: 'current', label: '지금 보고 있는 지역' } : null)
  const [theme, setTheme] = useState('')

  useEffect(() => {
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

  const pickRegion = (center, label) => { setLoc({ type: 'region', center, label }); setQ(''); setSugs([]) }
  const submit = () => {
    if (!loc) return
    const th = theme.trim()
    if (loc.type === 'current') onUseCurrent(th)
    else onLaunch(loc.center, loc.label, th)
  }

  return (
    <>
      <div className="course-pop-backdrop" onClick={onClose} />
      <div className="course-pop" role="dialog">
        <div className="cl-field-label">위치</div>
        {hasCurrent && (
          <button
            className={`cl-loc-opt ${loc?.type === 'current' ? 'on' : ''}`}
            onClick={() => setLoc({ type: 'current', label: '지금 보고 있는 지역' })}
          >
            📍 지금 보고 있는 지역
          </button>
        )}
        <input
          className="region-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="동네 검색 (예: 종로, 해운대)"
        />
        {sugs.length > 0 && (
          <div className="region-suggests">
            {sugs.map((s) => (
              <button key={s.label} className="region-suggest" onClick={() => pickRegion([s.lng, s.lat], s.label)}>
                <span className="region-suggest-ic">📍</span>{s.label}
              </button>
            ))}
          </div>
        )}
        <div className="cl-chips">
          {POPULAR.map((p) => (
            <button
              key={p.label}
              className={`cl-chip ${loc?.type === 'region' && loc.label === p.label ? 'on' : ''}`}
              onClick={() => pickRegion(p.center, p.label)}
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

        <button className="cl-submit" onClick={submit} disabled={!loc}>
          🧭 {loc ? `'${loc.label}' 코스 짜기` : '위치를 골라주세요'}
        </button>
      </div>
    </>
  )
}
