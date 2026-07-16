// 계정·데이터 삭제 요청 안내 — Google Play 필수(계정 생성 지원 앱). 독립 페이지(/account-delete).
export default function AccountDelete() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 80px', lineHeight: 1.7, color: '#222', fontSize: 15 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>계정 및 데이터 삭제 요청</h1>
      <p style={{ color: '#888', marginTop: 0 }}>앱: <b>콕콕콕(KokKokKok)</b></p>

      <p>
        콕콕콕 이용자는 언제든지 본인의 계정과 관련 데이터의 삭제를 요청할 수 있습니다.
        아래 절차에 따라 요청해 주세요.
      </p>

      <h2>삭제 요청 방법</h2>
      <ol>
        <li>아래 이메일로 <b>계정 삭제 요청</b> 메일을 보냅니다.<br />
          이메일: <a href="mailto:tksmaster82@gmail.com?subject=콕콕콕 계정 삭제 요청">tksmaster82@gmail.com</a></li>
        <li>메일 제목에 <b>“콕콕콕 계정 삭제 요청”</b> 을 적습니다.</li>
        <li>본문에 <b>로그인에 사용한 방식(카카오/네이버)</b> 과 <b>닉네임 또는 이메일</b> 을 적어 본인 계정을 확인할 수 있게 합니다.</li>
        <li>접수 후 본인 확인을 거쳐 처리해 드립니다.</li>
      </ol>

      <h2>삭제되는 데이터</h2>
      <ul>
        <li>계정 정보 — 이름(닉네임), 이메일, 소셜 로그인 식별자</li>
        <li>즐겨찾기(저장한 장소) 목록</li>
      </ul>

      <h2>보관 및 처리 기간</h2>
      <ul>
        <li>요청 확인 후 <b>영업일 기준 7일 이내</b> 계정과 위 데이터를 <b>완전히 삭제</b>합니다.</li>
        <li>삭제된 데이터는 <b>별도로 보관하지 않습니다.</b> (백업본이 있는 경우 최대 30일 이내 파기)</li>
        <li>위치 정보는 애초에 서버에 저장하지 않으므로 삭제 대상이 아닙니다.</li>
      </ul>

      <h2>계정을 삭제하지 않고 데이터만 삭제하기</h2>
      <p>
        계정을 유지한 채 일부 데이터만 삭제할 수도 있습니다. 로그인 후 앱에서 <b>저장한 장소(즐겨찾기)를 개별적으로 삭제</b>할 수 있으며,
        특정 데이터의 삭제가 필요하면 위 이메일로 요청해 주세요.
      </p>

      <h2>문의</h2>
      <p>이메일: <a href="mailto:tksmaster82@gmail.com">tksmaster82@gmail.com</a></p>
    </div>
  )
}
