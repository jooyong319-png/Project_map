import { Link } from 'react-router-dom'

// 상단 바 — 로고 + 검색바 슬롯(Home 이 포털로 채움)
export default function Header() {
  return (
    <header>
      <div className="topbar">
        <Link to="/" className="brand">
          <span className="logo">📍 콕콕콕</span>
          <span className="brand-tag">동네만 콕, 하루 코스는 AI가</span>
        </Link>
        <div className="header-search-slot" id="header-search-slot" />
      </div>
    </header>
  )
}
