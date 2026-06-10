import { CATEGORIES } from '../data/mockRestaurants'

const ICON = { 전체: '🍴', 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕' }

export default function CategoryChips({ value, onChange }) {
  return (
    <div className="chips">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          className={`chip ${value === c ? 'active' : ''}`}
          onClick={() => onChange(c)}
        >
          {ICON[c] || ''} {c}
        </button>
      ))}
    </div>
  )
}
