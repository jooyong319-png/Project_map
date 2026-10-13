import { useState, useEffect } from 'react'
import { KINDS } from '../data/kinds.js'

const LIMITS = [50, 100, 200]

// 검색 필터 — 카테고리 · 개수 · 지역(동·구·역 검색) · 키워드
export default function FilterBar({ kind = 'food', onKind, limit, onLimit, keyword, onKeyword, onRegionPick, pickedLabel }) {
  const [regionModal, setRegionModal] = useState(false)
  const kws = KINDS.find((k) => k.key === kind)?.keywords || []

  // 지역 검색(카카오) — 동·구·역 입력 시 자동완성
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState([])
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
  const pick = (s) => {
    onRegionPick && onRegionPick(s)
    setQ(''); setSugs([]); setRegionModal(false)
  }

  return (
    <div className="filterbar">
      <div className="filter-sec-label">카테고리</div>
      <div className="filter-cat-seg">
        {KINDS.map((k) => (
          <button key={k.key} className={`cat-btn ${kind === k.key ? 'on' : ''}`} onClick={() => onKind && onKind(k.key)}>
            <span className="kind-ic">{k.icon}</span>{k.label}
          </button>
        ))}
      </div>

      <div className="filter-sec-label">개수</div>
      <div className="chips chips-wrap">
        {LIMITS.map((n) => (
          <button key={n} className={`chip ${limit === n ? 'active' : ''}`} onClick={() => onLimit && onLimit(n)}>{n}개</button>
        ))}
      </div>

      <div className="filter-sec-label">지역</div>
      <div className="chips" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <button className="region-btn" onClick={() => setRegionModal(true)}>
          📍 {pickedLabel || '지역 선택'}<span className="region-arrow">▾</span>
        </button>
      </div>

      {regionModal && (
        <>
          <div className="region-backdrop" onClick={() => setRegionModal(false)} />
          <div className="region-modal" role="dialog">
            <div className="region-modal-head">
              <span>지역 선택</span>
              <button className="region-modal-close" onClick={() => setRegionModal(false)} aria-label="닫기">×</button>
            </div>
            <div className="region-modal-body">
              <div className="region-label">동·구·역 검색</div>
              <input
                className="region-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="예: 역삼동, 강남구 논현동, 용산역"
                autoFocus
              />
              {sugs.length > 0 && (
                <div className="region-suggests">
                  {sugs.map((s) => (
                    <button key={s.label} className="region-suggest" onClick={() => pick(s)}>
                      <span className="region-suggest-ic">{s.kind === 'station' ? '🚉' : '📍'}</span>{s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="region-done" onClick={() => setRegionModal(false)}>완료</button>
          </div>
        </>
      )}

      {kws.length > 0 && <>
        <div className="filter-sec-label">키워드</div>
        <div className="chips chips-wrap">
          <button className={`chip ${keyword === '' ? 'active' : ''}`} onClick={() => onKeyword('')}>전체</button>
          {kws.map((k) => (
            <button key={k} className={`chip kw-chip ${keyword === k ? 'active' : ''}`} onClick={() => onKeyword(k)}>
              <span className="kw-main">{k}</span>
            </button>
          ))}
        </div>
      </>}
    </div>
  )
}
