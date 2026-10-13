// 계정·데이터 삭제 안내 — 독립 페이지(/account-delete). 현재는 계정 기능이 없다(2026-10 정리).
export default function AccountDelete() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 80px', lineHeight: 1.7, color: '#222', fontSize: 15 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>계정 및 데이터 삭제</h1>
      <p style={{ color: '#888', marginTop: 0 }}>앱: <b>콕콕콕(KokKokKok)</b></p>

      <p>
        콕콕콕은 현재 <b>회원가입·로그인 기능이 없어, 서버에 저장되는 계정이나 개인 데이터가 없습니다.</b>
      </p>

      <h2>기기에 남는 데이터</h2>
      <ul>
        <li>AI 코스 하루 이용 횟수 — 이용자 기기에만 저장됩니다. 앱 데이터(또는 브라우저 사이트 데이터)를 지우면 삭제됩니다.</li>
      </ul>

      <h2>문의</h2>
      <p>
        데이터와 관련해 문의하실 내용이 있으면 아래 이메일로 연락해 주세요.<br />
        이메일: <a href="mailto:tksmaster82@gmail.com?subject=콕콕콕 데이터 문의">tksmaster82@gmail.com</a>
      </p>
    </div>
  )
}
