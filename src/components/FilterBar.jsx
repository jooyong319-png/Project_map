import { useRef, useState, useEffect } from 'react'
import { COUNTRIES, KEYWORDS, CITIES } from '../data/countries.js'
import { KINDS } from '../data/kinds.js'

// 키워드 뜻(작게 표시)
const KW_DESC = {
  '맛집': '인기 맛집', '줄서는 맛집': '웨이팅 핫플', '노포': '오래된 가게', '내돈내산': '솔직 후기', '혼밥': '1인 식사',
  'グルメ': '맛집', 'レストラン': '레스토랑', '居酒屋': '이자카야', 'おすすめ': '추천',
  '美食': '맛집', '餐厅': '식당', '必吃': '꼭 먹을 곳', '探店': '맛집 탐방',
  'must eat': '꼭 먹을 곳', 'top rated': '평점 높은', 'Eater': '미식 매거진', 'best restaurant': '베스트',
  'bistro': '비스트로', 'michelin bib gourmand': '빕구르망', 'traditional french': '프랑스 전통',
  'trattoria': '트라토리아', 'osteria': '오스테리아', 'ristorante': '레스토랑',
  'traditional british food': '영국 전통', 'pub food': '펍 음식', 'restaurant': '레스토랑',
  'tapas': '타파스', 'restaurante': '레스토랑',
  'street food': '길거리 음식', 'local food': '현지 음식', 'brunch': '브런치', 'cafe': '카페',
}

// 가로 1줄 + 마우스 드래그 스와이프 (드래그 후엔 칩 클릭 무시)
function ChipRow({ children }) {
  const ref = useRef(null)
  const drag = useRef({ down: false, x: 0, left: 0, moved: false })
  const down = (e) => { const el = ref.current; if (!el) return; drag.current = { down: true, x: e.clientX, left: el.scrollLeft, moved: false } }
  const move = (e) => { if (!drag.current.down || !ref.current) return; const dx = e.clientX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; ref.current.scrollLeft = drag.current.left - dx }
  const up = () => { drag.current.down = false }
  const clickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); drag.current.moved = false } }
  return (
    <div
      className="chips chips-scroll"
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={clickCapture}
    >
      {children}
    </div>
  )
}

// 구글 priceLevel(1~4) → 1인 기준 대략 금액대 라벨(근사치)
const PRICES = [[1, '~1만원'], [2, '1~3만원'], [3, '3~5만원'], [4, '5만원+']]

// 태그 설명(블로그 분석 기반). 종류별 태그는 kinds.js 에서 옴.
const TAG_DESC = {
  맛집: '블로그에서 인기', 인기: '블로그에서 인기', 노포: '오래된 가게', 혼밥: '혼밥 친화', 핫플: 'SNS에서 핫한',
  // 관광지
  저렴한: '무료·저렴', 인생샷: '포토존', 'SNS 핫플': 'SNS에서 핫한', 랜드마크: '대표 명소', 박물관: '전시·박물관', 공원: '공원·산책',
  // 숙소
  휴양지: '쉬기 좋은', 가성비: '가성비', 애견동반: '반려견 OK', 호캉스: '호캉스', 럭셔리: '고급',
}

// 전국 라이브(카카오)에서 항상 작동하는 구글 신호 기준만 노출. (인기/노포는 베이스 깐 지역만 데이터가 있어 제외)
const SORTS = [['reviews', '리뷰 많은순'], ['rating', '평점 높은순']]
const LIMITS = [50, 100, 200]

export default function FilterBar({ kind = 'food', onKind, sort, onSort, limit, onLimit, country, onCountry, city, onCity, area, onArea, keyword, onKeyword, price, onPrice, tags = [], onToggleTag, tagOptions = [], onRegionPick, pickedLabel }) {
  const [regionModal, setRegionModal] = useState(false)
  const isKorea = !country || country === '대한민국' // 태그 필터는 카카오(한국) 한정
  // 키워드: 한국이면 카테고리별(음식종류/궁궐·박물관/호텔·펜션…), 해외면 그 나라 키워드
  const kws = isKorea ? (KINDS.find((k) => k.key === kind)?.keywords || []) : (KEYWORDS[country] || [])
  const cities = CITIES[country] || []
  const cityObj = cities.find((c) => c.name === city)
  const areas = cityObj?.areas || []
  const regionLabel = pickedLabel || [country, city, area].filter(Boolean).join(' › ') || '지역 선택'

  // 주소 검색(카카오) — 동·구 입력 시 자동완성
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

      <div className="filter-sec-label">정렬</div>
      <div className="chips chips-wrap">
        {SORTS.map(([v, label]) => (
          <button key={v} className={`chip ${sort === v ? 'active' : ''}`} onClick={() => onSort && onSort(v)}>{label}</button>
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
          📍 {regionLabel}<span className="region-arrow">▾</span>
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
              <div className="region-label">동·구 검색</div>
              <input
                className="region-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="예: 역삼동, 강남구 논현동, 해운대"
                autoFocus
              />
              {sugs.length > 0 && (
                <div className="region-suggests">
                  {sugs.map((s) => (
                    <button key={s.label} className="region-suggest" onClick={() => pick(s)}>
                      <span className="region-suggest-ic">📍</span>{s.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="region-label">나라</div>
              <div className="region-wrap">
                {COUNTRIES.map((c) => (
                  <button key={c.name} className={`chip ${country === c.name ? 'active' : ''}`} onClick={() => onCountry(c.name)}>{c.name}</button>
                ))}
              </div>
              {cities.length > 0 && <>
                <div className="region-label">도시</div>
                <div className="region-wrap">
                  {cities.map((c) => (
                    <button key={c.name} className={`chip sub ${city === c.name ? 'active' : ''}`} onClick={() => onCity(c)}>{c.name}</button>
                  ))}
                </div>
              </>}
              {areas.length > 0 && <>
                <div className="region-label">동네</div>
                <div className="region-wrap">
                  {areas.map((a) => (
                    <button key={a.name} className={`chip sub2 ${area === a.name ? 'active' : ''}`} onClick={() => onArea(a)}>{a.name}</button>
                  ))}
                </div>
              </>}
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
              {KW_DESC[k] && <span className="kw-sub">{KW_DESC[k]}</span>}
            </button>
          ))}
        </div>
      </>}

      {kind === 'food' && <>
        <div className="filter-sec-label">가격 <span>1인 기준</span></div>
        <div className="chips chips-wrap">
          <button className={`chip ${!price ? 'active' : ''}`} onClick={() => onPrice(0)}>가격 전체</button>
          {PRICES.map(([lv, label]) => (
            <button key={lv} className={`chip ${price === lv ? 'active' : ''}`} onClick={() => onPrice(price === lv ? 0 : lv)}>{label}</button>
          ))}
        </div>
      </>}

      {isKorea && tagOptions.length > 0 && (
        <>
          <div className="filter-sec-label">태그 <span>블로그 분석 · 저장된 곳에서</span></div>
          <div className="chips chips-wrap">
            {tagOptions.map((t) => (
              <button key={t} className={`chip nopo-chip ${tags.includes(t) ? 'active' : ''}`} onClick={() => onToggleTag(t)}>
                {t} {TAG_DESC[t] && <span className="nopo-sub">{TAG_DESC[t]}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
