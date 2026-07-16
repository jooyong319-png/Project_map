# log

[[콕콕콕]] 진행 기록 — append-only, 최신이 위. grep 가능하게 `[날짜] 태그: 내용`.

---

`[2026-07] app:` **출시 준비** — AI코스 비로그인 하루 1회 무료(localStorage `ai_free_date`, 로그인 무제한). 앱 위치권한(@capacitor/geolocation, 매니페스트 권한). 개인정보처리방침 `/privacy`(로그인·위치·검색 데이터 명시). 앱아이콘·스플래시(사용자 로고, @capacitor/assets 전 크기). 릴리즈 서명 keystore(`android/keystore/upload.jks`, key.properties·keystore gitignore, 비번 백업 필수) + **서명된 AAB 생성**. 로그인모달 브랜드 SVG아이콘+구글 준비중 처리. Play 등록정보 초안 [[플레이스토어-등록]]. 남음: 스크린샷·데이터안전 양식·심사.
`[2026-07] app:` **앱 실기 테스트**(갤럭시 Z플립7, Android16). 커맨드라인 빌드로 APK 설치. 지구본·검색 정상. 카카오 로그인 딥링크 왕복 성공(외부브라우저→앱 복귀→세션). 버그수정: 앱은 로그인해도 리로드가 없어 로그인모달이 안 닫힘→user 생기면 닫기. **구글은 `disabled_client`(구글콘솔에서 OAuth클라 비활성됨, 웹도 동일영향)—재활성 필요, 우리코드 무관.** 네이버는 매직링크가 외부브라우저에 웹을 열어 앱복귀 안 됨→native=1 시 callback이 `kokkokkok://auth-callback?token_hash=`로 복귀, 앱에서 verifyOtp로 세션. adb가 자주 offline(Z플립 절전)→화면캡처(`screencap`)로 디버깅.
`[2026-07] app:` **앱화 1단계** — Capacitor로 안드로이드 껍데기(앱ID `com.kokkokkok.app`). 웹뷰 소스=라이브 Vercel URL(옵션 B, `/api` 상대경로 재활용). 로그인 딥링크 전환: 앱=외부브라우저(`@capacitor/browser`)+`kokkokkok://auth-callback` 복귀→PKCE code교환, 웹=기존 리다이렉트. Supabase Redirect URLs에 딥링크 추가. **구글·카카오는 Supabase 콜백 그대로라 프로바이더 설정 변경 없음**(신규 안드로이드 클라/SHA-1 불필요). 네이버 앱로그인은 서버 딥링크복귀 필요→후속. 다음: JDK17+Android Studio로 폰 실기 테스트.
`[2026-07] goal:` **다음 목표 = 앱화(출시).** 상세 [[다음-목표-앱화]]

`[2026-07] auth:` 소셜 로그인 3종 완료 — 구글·카카오(Supabase 네이티브), 네이버(커스텀 OAuth `/api/auth/naver/[action]`). Supabase Auth 세션, `AuthProvider`/`LoginModal`/헤더 아바타. AI 코스는 로그인 게이팅.
`[2026-07] auth:` 카카오 이메일 동의 위해 **비즈앱 전환**. 네이버는 이메일 미사용(합성 이메일). 카카오 로그인앱은 지도앱과 별개 앱(REST키 다름).
`[2026-07] fav:` 즐겨찾기 **계정 동기화** — 게스트=localStorage, 로그인=Supabase `favorites`(RLS). 로그인 시 로컬→계정 병합.
`[2026-07] deploy:` Vercel 배포 `project-map-zeta.vercel.app`. 함수 11개(한도 12). 환경변수 11개. OAuth 프로덕션 콜백/Redirect URLs 정리. → [[배포와-키]]
`[2026-07] fn-limit:` 네이버 login·callback을 동적 라우트 `[action].js` 1함수로 통합해 12→11.

`[2026-06] search:` 엔터 검색을 자연어화 + 통일 — "지역/근처 + 키워드"는 **구글 텍스트검색**(장르 정확) + 지역 주소필터. 카카오 느슨매칭 보완. 자동완성은 카카오 유지(무료).
`[2026-06] search:` "근처 X"=지도중심 반경, "개봉 전집"=지역 지오코딩 후 그 동네. 카카오 키워드 정확매칭 상위 정렬.
`[2026-06] ui:` 상세 이미지 라이트박스(화살표·확대·팬·줌유지), 닫기 고정. 내 위치 오프셋(웹 오른쪽/모바일 위). 지도이동 시 상세 반투명(animation fill 버그 수정).
`[2026-06] course:` **AI 하루 코스** — Gemini(gemini-2.5-flash), seed 후보만 주고 환각방지. 런처 3모드(현재지역/즐겨찾기/동네)+테마. 구간 이동시간(차=카카오모빌리티, 도보=추정, 대중교통=ODsay 선택). 실패 시 휴리스틱 폴백+3회 재시도. 결과는 왼쪽 리스트영역, 지도엔 번호핀+점선.
`[2026-06] infra:` Supabase 미사용 자동 일시정지 겪음 → Restore. `store.js`/`gcache.js`를 `lib/`로 이동(함수수 절감).

`[2026-05] tags:` 네이버 블로그 검색량으로 태그 판정(노포·핫플·혼밥·맛집). "동+이름" 정확매칭 비율. 태그=네이버, 별점·사진=구글(비용 절감). seed를 Supabase로(공유).
`[2026-05] kinds:` 음식/관광지/숙소/전체 카테고리 시스템 — 카카오 FD6/AT4/AD5. 종류별 태그·키워드.
`[2026-05] base:` 지구본(d3)↔지도(leaflet+maplibre) 전환. 카카오 로컬 검색 + 구글 보강. SEO(/place/:id, sitemap).

---
> 규칙: 큰 변경마다 한 줄 추가. 상세는 [[아키텍처]]·[[기능]]·[[배포와-키]] 노트에.
