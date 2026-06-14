import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header>
      <div className="topbar">
        <Link to="/" className="brand">
          <span className="logo">📍 콕콕콕</span>
          <span className="brand-tag">맛집 콕, 여행지 콕, 숙소 콕</span>
        </Link>
        <div className="header-search-slot" id="header-search-slot" />
        <nav className="nav">
          <span className="btn-login">로그인</span>
        </nav>
      </div>
    </header>
  )
}
