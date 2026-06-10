# 🍴 전국맛집 (matjip-app)

전국 맛집을 **평점순**으로 보여주고, **돌아가는 3D 지구본**에서 탐색하는 웹 앱.

- **프런트엔드**: React + React Router (Vite)
- **지도**: D3 `geoOrthographic` 기반 인터랙티브 지구본 (드래그 회전 / 확대축소)
- **평점 데이터**: Google Places API (New) — 서버리스 함수로 프록시
- **저장(북마크)**: Supabase (미설정 시 `localStorage` 폴백)
- **배포**: Vercel

키를 하나도 설정하지 않아도 **샘플(목) 데이터로 바로 실행**됩니다. 키를 넣으면 실제 평점으로 동작합니다.

---

## 1. 로컬 실행

> ⚠️ 폴더에 `node_modules`, `dist` 가 들어있다면 빌드 검증 때 생긴 잔여물(리눅스용)입니다. **먼저 지우고** 새로 설치하세요:
> ```bash
> rm -rf node_modules dist        # Windows: rmdir /s /q node_modules dist
> ```

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속. (키 없이 샘플 데이터로 동작)

> Google Places 실데이터를 로컬에서 테스트하려면 `vercel dev` 를 사용하세요 (`/api` 함수 실행). 일반 `npm run dev` 에서는 `/api` 가 없어 자동으로 샘플 데이터로 폴백됩니다.

---

## 2. 환경변수 설정

`.env.example` 을 복사해 `.env` 를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

| 변수 | 용도 | 노출 |
|------|------|------|
| `GOOGLE_PLACES_API_KEY` | 서버리스 함수에서 Google Places 호출 | 서버 전용(비공개) |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | 클라이언트(공개) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon 키 | 클라이언트(공개) |

### Google Places API 키 발급
1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 생성
2. **Places API (New)** 활성화 (APIs & Services → Library)
3. 결제 계정 연결 (월 무료 크레딧 내 사용 시 사실상 무료, 카드 등록 필요)
4. 사용자 인증 정보 → API 키 생성 → `GOOGLE_PLACES_API_KEY` 에 입력
5. 보안을 위해 키에 **Places API** 만 허용하도록 제한 권장

### Supabase 설정 (선택)
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. Settings → API 에서 URL, anon key 복사 → `.env` 에 입력
3. SQL Editor 에서 북마크 테이블 생성:

```sql
create table bookmarks (
  id bigint generated always as identity primary key,
  place_id text not null,
  created_at timestamptz default now()
);
-- 데모용: 익명 읽기/쓰기 허용 (실서비스에서는 인증+RLS 적용 권장)
alter table bookmarks enable row level security;
create policy "anon all" on bookmarks for all using (true) with check (true);
```

> Supabase 미설정 시 북마크는 브라우저 `localStorage` 에 저장됩니다.

---

## 3. GitHub 에 올리기

이 폴더에서 아래 명령을 순서대로 실행하세요. (`YOUR-ID` 는 본인 GitHub 아이디로 교체)

```bash
git init
git add .
git commit -m "feat: 전국맛집 평점순 + 지구본 탐색 초기 버전"
git branch -M main

# GitHub 에서 빈 레포(matjip-app)를 먼저 만든 뒤:
git remote add origin https://github.com/YOUR-ID/matjip-app.git
git push -u origin main
```

> GitHub 레포는 https://github.com/new 에서 `matjip-app` 이름으로, README/gitignore 체크 없이 빈 상태로 만드세요. (이미 여기 파일이 있으므로)

---

## 4. Vercel 배포

1. [vercel.com](https://vercel.com) → New Project → 위 GitHub 레포 import
2. Framework: **Vite** 자동 감지
3. Environment Variables 에 위 3개 변수 입력
4. Deploy

`/api/places` 서버리스 함수가 자동 배포되어 Google 평점을 프록시합니다.

---

## 폴더 구조

```
matjip-app/
├─ api/places.js            # Vercel 서버리스: Google Places 프록시
├─ src/
│  ├─ components/
│  │  ├─ Globe.jsx          # D3 인터랙티브 지구본
│  │  ├─ Header.jsx
│  │  ├─ CategoryChips.jsx
│  │  ├─ RestaurantList.jsx
│  │  ├─ RestaurantCard.jsx
│  │  └─ DetailModal.jsx
│  ├─ pages/
│  │  ├─ Home.jsx           # 검색 + 평점순 리스트 + 지구본
│  │  └─ Saved.jsx          # 저장한 맛집
│  ├─ lib/
│  │  ├─ places.js          # 데이터 로드 (API → 목 폴백)
│  │  └─ supabase.js        # 북마크 (Supabase → localStorage 폴백)
│  ├─ data/mockRestaurants.js
│  ├─ App.jsx
│  ├─ main.jsx
│  └─ index.css
├─ .env.example
├─ vercel.json
└─ vite.config.js
```

## 다음 확장 아이디어
- 지구본 확대 시 한국 지도(Leaflet/Mapbox)로 자동 전환
- Google Place Details API 로 개별 리뷰 텍스트 표시
- 사용자 로그인(Supabase Auth) + 개인 저장 리스트 공유
- 지역/가격대 필터, 무한 스크롤
