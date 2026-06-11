import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header>
      <div className="topbar">
        <Link to="/" className="logo">🍴 전국맛집</Link>
        <nav className="nav">
          <span className="btn-login">로그인</span>
        </nav>
      </div>
    </header>
  )
}
