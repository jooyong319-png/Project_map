import { useRef } from 'react'
import { COUNTRIES, KEYWORDS } from '../data/countries.js'

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

export default function FilterBar({ country, onCountry, keyword, onKeyword }) {
  const kws = KEYWORDS[country] || []
  return (
    <div className="filterbar">
      <ChipRow>
        {COUNTRIES.map((c) => (
          <button key={c.name} className={`chip ${country === c.name ? 'active' : ''}`} onClick={() => onCountry(c.name)}>
            {c.name}
          </button>
        ))}
      </ChipRow>
      <ChipRow>
        <button className={`chip ${keyword === '' ? 'active' : ''}`} onClick={() => onKeyword('')}>전체</button>
        {kws.map((k) => (
          <button key={k} className={`chip kw-chip ${keyword === k ? 'active' : ''}`} onClick={() => onKeyword(k)}>
            <span className="kw-main">{k}</span>
            {KW_DESC[k] && <span className="kw-sub">{KW_DESC[k]}</span>}
          </button>
        ))}
      </ChipRow>
    </div>
  )
}
