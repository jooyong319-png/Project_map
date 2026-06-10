import { CATEGORIES } from '../data/mockRestaurants'

const ICON = { 전체: '🍴', 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕' }

export default function FilterBar({ category, onCategory, openNowOnly, onOpenNow, bookmarkOnly, onBookmarkOnly }) {
  return (
    <div className="chips">
      {CATEGORIES.map((c) => (
        <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => onCategory(c)}>
          {ICON[c] || ''} {c}
        </button>
      ))}
      <span className="chip-div" />
      <button className={`chip ${openNowOnly ? 'active' : ''}`} onClick={() => onOpenNow(!openNowOnly)}>
        🟢 영업 중
      </button>
      <button className={`chip ${bookmarkOnly ? 'active' : ''}`} onClick={() => onBookmarkOnly(!bookmarkOnly)}>
        🔖 저장
      </button>
    </div>
  )
}
