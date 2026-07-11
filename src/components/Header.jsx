import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth, userInfo } from '../lib/auth.jsx'
import LoginModal from './LoginModal.jsx'

export default function Header() {
  const { user, loading, signOut } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const info = user ? userInfo(user) : null

  return (
    <header>
      <div className="topbar">
        <Link to="/" className="brand">
          <span className="logo">📍 콕콕콕</span>
          <span className="brand-tag">맛집 콕, 여행지 콕, 숙소 콕</span>
        </Link>
        <div className="header-search-slot" id="header-search-slot" />
        <nav className="nav">
          {loading ? null : user ? (
            <div className="user-menu">
              <button className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
                {info.avatar
                  ? <img className="user-avatar" src={info.avatar} alt="" referrerPolicy="no-referrer" />
                  : <span className="user-avatar ph">{info.name[0]}</span>}
                <span className="user-name">{info.name}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="user-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="user-dropdown">
                    <Link to="/saved" className="user-dd-item" onClick={() => setMenuOpen(false)}>⭐ 저장한 곳</Link>
                    <button className="user-dd-item" onClick={() => { setMenuOpen(false); signOut() }}>로그아웃</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button className="btn-login" onClick={() => setLoginOpen(true)}>로그인</button>
          )}
        </nav>
      </div>
      {/* 헤더 backdrop-filter 영향을 피해 body 로 포털(fixed 가 뷰포트 기준이 되게) */}
      {loginOpen && createPortal(<LoginModal onClose={() => setLoginOpen(false)} />, document.body)}
    </header>
  )
}
