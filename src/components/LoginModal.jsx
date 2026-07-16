import { useAuth } from '../lib/auth.jsx'

// 브랜드 아이콘 (인라인 SVG)
function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#191600" aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.25 4.66 6.66-.16.55-.86 2.95-.9 3.16 0 0-.03.16.08.22.1.06.22.02.22.02.29-.04 3.36-2.2 3.86-2.55.66.09 1.35.14 2.08.14 5.52 0 10-3.54 10-7.91S17.52 3 12 3z" />
    </svg>
  )
}
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
function NaverIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff" aria-hidden="true">
      <path d="M16.27 12.85 7.53 0H0v24h7.73V11.15L16.47 24H24V0h-7.73z" />
    </svg>
  )
}

// 소셜 로그인 모달 — 카카오 / 구글(준비중) / 네이버
const PROVIDERS = [
  { key: 'kakao', label: '카카오로 시작하기', bg: '#FEE500', color: '#191600', Icon: KakaoIcon },
  { key: 'google', label: 'Google로 시작하기', bg: '#fff', color: '#222', Icon: GoogleIcon, border: true, soon: true },
  { key: 'naver', label: '네이버로 시작하기', bg: '#03C75A', color: '#fff', Icon: NaverIcon },
]

export default function LoginModal({ onClose, reason }) {
  const { signIn } = useAuth()
  return (
    <>
      <div className="login-backdrop" onClick={onClose} />
      <div className="login-modal" role="dialog" aria-label="로그인">
        <button className="login-close" onClick={onClose} aria-label="닫기">×</button>
        <div className="login-head">
          <div className="login-logo">📍 콕콕콕</div>
          <div className="login-sub">{reason || '로그인하고 AI 코스·즐겨찾기를 내 계정에'}</div>
        </div>
        <div className="login-btns">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={`login-btn ${p.border ? 'bordered' : ''} ${p.soon ? 'soon' : ''}`}
              style={{ background: p.bg, color: p.color }}
              disabled={p.soon}
              onClick={() => { if (!p.soon) signIn(p.key) }}
            >
              <span className="login-btn-ic"><p.Icon /></span>
              {p.label}
              {p.soon && <span className="login-soon">준비중</span>}
            </button>
          ))}
        </div>
        <div className="login-foot">계속 진행하면 서비스 이용약관에 동의하는 것으로 간주돼요.</div>
      </div>
    </>
  )
}
