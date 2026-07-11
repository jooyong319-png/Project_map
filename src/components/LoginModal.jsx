import { useAuth } from '../lib/auth.jsx'

// 소셜 로그인 모달 — 구글 / 카카오 / 네이버
const PROVIDERS = [
  { key: 'kakao', label: '카카오로 시작하기', bg: '#FEE500', color: '#191600', icon: '💬' },
  { key: 'google', label: 'Google로 시작하기', bg: '#fff', color: '#222', icon: 'G', border: true },
  { key: 'naver', label: '네이버로 시작하기', bg: '#03C75A', color: '#fff', icon: 'N' },
]

export default function LoginModal({ onClose }) {
  const { signIn } = useAuth()
  return (
    <>
      <div className="login-backdrop" onClick={onClose} />
      <div className="login-modal" role="dialog" aria-label="로그인">
        <button className="login-close" onClick={onClose} aria-label="닫기">×</button>
        <div className="login-head">
          <div className="login-logo">📍 콕콕콕</div>
          <div className="login-sub">로그인하고 AI 코스·즐겨찾기를 내 계정에</div>
        </div>
        <div className="login-btns">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={`login-btn ${p.border ? 'bordered' : ''}`}
              style={{ background: p.bg, color: p.color }}
              onClick={() => signIn(p.key)}
            >
              <span className="login-btn-ic">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
        <div className="login-foot">계속 진행하면 서비스 이용약관에 동의하는 것으로 간주돼요.</div>
      </div>
    </>
  )
}
