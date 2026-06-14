import { useState, useEffect, useRef } from 'react'

// AI 코스 런처 — 위치 모드 3가지 중 하나 + 테마(선택) 정하고 '코스 짜기'.
//   ① 지금 보고 있는 지역  ② ⭐ 즐겨찾기로  ③ 기본(동네 검색/인기칩)
const POPULAR = [
  { label: '서울 종로', center: [126.991, 37.572] },
  { label: '서울 강남', center: [127.028, 37.498] },
  { label: '서울 성수', center: [127.056, 37.544] },
  { label: '서울 홍대', center: [126.923, 37.556] },
  { label: '부산 해운대', center: [129.160, 35.163] },
  { label: '경주', center: [129.225, 35.842] },
]
const THEME_CHIPS = ['데이트', '가족 나들이', '혼자 힐링', '맛집 위주', '감성 카페', '액티비티']

export default function CourseLauncher({ onLaunch, onUseCurrent, onUseFav, hasCurrent, favCount = 0, onClose }) {
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState([])
  const pickedRef = useRef(false) // 선택 직후엔 재검색 안 함(고른 값 유지)
  // loc: null | {type:'current'} | {type:'fav'} | {type:'region', center, label}
  const [loc, setLoc] = useState(null)
  const [theme, setTheme] = useState('')

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

  const pickRegion = (center, label) => { pickedRef.current = true; setLoc({ type: 'region', center, label }); setQ(label); setSugs([]) }
  const submit = () => {
    if (!loc) return
    const th = theme.trim()
    if (loc.type === 'current') onUseCurrent(th)
    else if (loc.type === 'fav') onUseFav(th)
    else onLaunch(loc.center, loc.label, th)
  }
  const btnLabel = loc?.type === 'fav' ? '즐겨찾기로 코스 짜기'
    : loc ? `'${loc.label}' 코스 짜기`
    : '위치를 골라주세요'

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
        <button
          className={`cl-loc-opt ${loc?.type === 'fav' ? 'on' : ''}`}
          onClick={() => favCount >= 2 && setLoc((l) => (l?.type === 'fav' ? null : { type: 'fav', label: '내 즐겨찾기' }))}
          disabled={favCount < 2}
        >
          <span className="cl-loc-main">⭐ 즐겨찾기로</span>
          <span className="cl-loc-hint">{favCount >= 2 ? `저장한 ${favCount}곳에서 가까운 곳끼리 묶어 코스` : '저장한 곳이 2곳 이상이면 사용할 수 있어요'}</span>
        </button>

        <div className="cl-or">또는 동네 선택</div>
        <input
          className="region-search"
          value={q}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim() && (loc?.type === 'current' || loc?.type === 'fav')) setLoc(null) }}
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

        <button className="cl-submit" onClick={submit} disabled={!loc}>🧭 {btnLabel}</button>
      </div>
    </>
  )
}
