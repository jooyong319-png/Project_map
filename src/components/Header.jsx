import { Link, useLocation } from 'react-router-dom'

export default function Header() {
  const { pathname } = useLocation()
  return (
    <header>
      <div className="topbar">
        <Link to="/" className="logo">🍴 전국맛집</Link>
        <nav className="nav">
          <Link to="/" className={pathname === '/' ? 'active' : ''}>📍 탐색</Link>
          <Link to="/saved" className={pathname === '/saved' ? 'active' : ''}>🔖 저장</Link>
          <span className="btn-login">로그인</span>
        </nav>
      </div>
    </header>
  )
}
