import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FilterBar from '../components/FilterBar.jsx'
import RestaurantList from '../components/RestaurantList.jsx'
import GeoPanel from '../components/GeoPanel.jsx'
import DetailModal from '../components/DetailModal.jsx'
import CourseLauncher from '../components/CourseLauncher.jsx'
import CoursePanel from '../components/CoursePanel.jsx'
import LoginModal from '../components/LoginModal.jsx'
import { useAuth } from '../lib/auth.jsx'
import { getRestaurants, getCuration, getCourse } from '../lib/places.js'
import { getBookmarks, toggleBookmark, getSavedItems, mergeLocalFavorites } from '../lib/supabase.js'
import { COUNTRIES, PRICE_LABEL } from '../data/countries.js'
import { kindOf } from '../data/kinds.js'

const REGION_FOCUS_BOOST = 1.5 // 지역 선택 후 이동 시 추가로 줌인하는 양

export default function Home() {
  const { user } = useAuth() // 로그인 유저 (AI 코스 게이팅용)
  const [loginPrompt, setLoginPrompt] = useState(false) // 비로그인 시 AI 클릭 → 로그인 유도
  const [kind, setKind] = useState('food') // 검색 종류: food/travel/stay
  const [headerSlot, setHeaderSlot] = useState(null) // 헤더의 검색바 포털 위치
  useEffect(() => { setHeaderSlot(document.getElementById('header-search-slot')) }, [])
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState([]) // 검색바 자동완성(가게)
  const pickedRef = useRef(false) // 자동완성 선택 직후 재조회 방지
  const suppressSuggestRef = useRef(false) // 검색 직후 디바운스 타이머가 자동완성 다시 띄우는 것 방지
  const [sort, setSort] = useState('reviews')
  const [limit, setLimit] = useState(50) // 보여줄 개수 50/100/200
  const [items, setItems] = useState([])
  const [search, setSearch] = useState({ q: '', bbox: null, sort: 'reviews', lim: 50, price: 0, tick: 0 }) // 커밋된 검색 조건
  const [source, setSource] = useState('mock')
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [savedItems, setSavedItems] = useState([]) // 저장한 맛집 전체 데이터(지도에 항상 표시)
  const [listOpen, setListOpen] = useState(true) // 왼쪽 TOP 10 패널 접기/펼치기
  const [filtersOpen, setFiltersOpen] = useState(false) // 모바일: 검색·필터 전체 접기/펼치기
  const [peek, setPeek] = useState(false) // 검색 시 잠깐 패널 반투명(지도 들여다보기)
  const [mapMoving, setMapMoving] = useState(false) // 지도 이동/줌 중 → 리스트·상세 반투명
  const [mapZoom, setMapZoom] = useState(0) // 현재 지도 줌(지구본=0). '지금 보고 있는 지역' 활성 조건용
  const peekTimer = useRef(null)
  const mapBoundsRef = useRef(null) // 현재 지도 영역(검색 기준)
  const pendingSearchRef = useRef(null) // 지역 이동 후 자동 검색 예약 {q}
  const pendingSelectRef = useRef(null) // 검색으로 고른 가게 id — 결과 로드되면 선택+상세
  // 모바일 바텀시트 드래그 스냅 ('full' | 'half' | 'collapsed')
  const [sheet, setSheet] = useState('half')
  const sheetRef = useRef(null)
  const sdrag = useRef({ down: false, y: 0, start: 0, h: 0 })
  const [sheetEnter, setSheetEnter] = useState(true) // 첫 진입 시 아래에서 슬라이드 업
  // 필터
  const [country, setCountry] = useState('') // 지구본 상태에선 선택 없음
  const [city, setCity] = useState('') // 도시
  const [area, setArea] = useState('') // 동네
  const [keyword, setKeyword] = useState('') // 나라별 키워드 ('' = 전체)
  const [price, setPrice] = useState(0) // 가격대 0=전체, 1~4 = ₩~₩₩₩₩ (priceLevel)
  const [tags, setTags] = useState([]) // 태그 필터(맛집/노포/혼밥) — 한국 한정, 시드에서 검색
  const toggleTag = (t) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))
  const [bookmarkOnly, setBookmarkOnly] = useState(false)
  const [navTo, setNavTo] = useState(null) // 나라 필터 검색 시 지도 이동 신호
  const [regionTarget, setRegionTarget] = useState(null) // 선택한 지역 {center,zoom} ('필터 적용' 시 이동+검색)
  const [pickedLabel, setPickedLabel] = useState('') // 주소검색으로 고른 지역 라벨
  const [course, setCourse] = useState(null) // AI 코스(동선)
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseLauncher, setCourseLauncher] = useState(false) // 지구본/어디서든 AI 코스 시작
  const pendingCourseRef = useRef(null) // 지역 이동 후 도착하면 그 bbox 로 코스 생성

  // 데이터 로드 — 커밋된 검색(search)이 바뀔 때만. 진입(tick 0) 시엔 검색 안 하고 저장된 곳만 표시.
  // 최소 로딩 시간을 둬서 "검색 중" 표시가 살짝 보이게(천천히 검색되는 느낌).
  useEffect(() => {
    if (search.tick === 0) return
    let active = true
    setLoading(true)
    const start = Date.now()
    const fetcher = search.curation
      ? getCuration()
      : getRestaurants(search.q, { bbox: search.bbox, global: search.global, forceGoogle: search.google, regionTerm: search.regionTerm, limit: search.lim, tags: search.tags, kind: search.kind })
    fetcher.then(({ items, source, center }) => {
      const wait = Math.max(0, 900 - (Date.now() - start))
      setTimeout(() => {
        if (!active) return
        setItems(items)
        setSource(source)
        setLoading(false)
        // 검색어에 지역명이 있어 그 동네로 이동한 경우(예 "개봉 전집") → 지도도 그쪽으로.
        if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
          setNavTo({ center: [center.lng, center.lat], zoom: 14 })
        } else if (search.global && items.length) {
          // 전국 텍스트 검색은 지도가 결과 위치로 따라가게 (안 그러면 지도는 딴 데 머물러 마커가 안 보임)
          const hit = items.find((i) => Number.isFinite(i.lng) && Number.isFinite(i.lat))
          if (hit) setNavTo({ center: [hit.lng, hit.lat], zoom: 14 })
        }
      }, wait)
    })
    return () => { active = false }
  }, [search])

  // 검색으로 고른 가게가 결과에 있으면 선택 + 상세 열기 (정확히 그곳에 도착)
  useEffect(() => {
    if (!pendingSelectRef.current || !items.length) return
    const hit = items.find((x) => x.id === pendingSelectRef.current)
    pendingSelectRef.current = null
    if (hit) { setSelectedId(hit.id); setOpenItem(hit) }
  }, [items])

  // 북마크/저장맛집 로드 — 로그인 상태 바뀌면 다시 (로그인 시 게스트 즐겨찾기 계정으로 병합)
  useEffect(() => {
    let active = true
    if (user) setLoginPrompt(false) // 앱(딥링크): 로그인되면 유도 모달 닫기
    ;(async () => {
      if (user) await mergeLocalFavorites()
      const [bm, si] = await Promise.all([getBookmarks(), getSavedItems()])
      if (active) { setBookmarks(bm); setSavedItems(si) }
    })()
    return () => { active = false }
  }, [user])

  // 코스가 뜨면 모바일 바텀시트를 중간 크기로 (지도+코스 같이 보이게)
  useEffect(() => { if (course || courseLoading) setSheet('half') }, [course, courseLoading])

  // 리스트 시트 첫 진입 슬라이드 업
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSheetEnter(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  // 진입(아직 검색 안 함) 또는 저장 필터 ON → 저장한 곳을 보여준다.
  const showingSaved = bookmarkOnly || search.tick === 0
  const visible = useMemo(() => {
    let r = showingSaved ? savedItems : items
    // '전체'는 음식·여행지·숙소 인터리브 순서 유지(정렬하면 한 종류로 쏠림)
    if (search.kind !== 'all') {
      const metric = search.sort === 'rating'
        ? (a, b) => b.rating - a.rating || b.reviews - a.reviews
        : (a, b) => b.reviews - a.reviews                                          // 기본: 리뷰 많은순
      // 맛집 우선표시(보이지 않는 정렬): 베이스 깐 지역(강남)에서 맛집 태그>신호 보유>raw 순.
      //  다른 지역(라이브)은 태그 없어 평점/리뷰순 그대로 → 전국 UX 일관.
      const tier = (x) => (x.tags?.includes('맛집') ? 2 : ((x.rating > 0 || x.blog > 0) ? 1 : 0))
      r = [...r].sort((a, b) => tier(b) - tier(a) || metric(a, b))
    }
    if (search.price) r = r.filter((d) => d.priceLevel === search.price) // 가격대 필터(가격 미상은 제외)
    return r.slice(0, search.lim)
  }, [items, savedItems, showingSaved, search.sort, search.lim, search.price, search.kind])

  // 지도 마커 = TOP10 + 저장한 맛집(검색에 없어도 항상 표시). 저장된 건 saved 표시.
  const mapItems = useMemo(() => {
    const savedIds = new Set(savedItems.map((d) => d.id))
    const byId = new Map()
    for (const d of visible) byId.set(d.id, d)
    for (const s of savedItems) if (!byId.has(s.id)) byId.set(s.id, s)
    return [...byId.values()].map((d) => (savedIds.has(d.id) ? { ...d, saved: true } : d))
  }, [visible, savedItems])

  // 상황에 맞춰 바뀌는 리스트 제목 (종류별 명칭 + 적용 필터 요약)
  const title = useMemo(() => {
    const noun = { all: '장소', food: '맛집', travel: '관광지', stay: '숙소' }
    if (course || courseLoading) return { prefix: '🧭 AI 추천 코스', suffix: '' }
    if (showingSaved) return { prefix: '⭐ 저장한 곳', suffix: '' }
    if (search.curation) return { prefix: '🏆 화제의 맛집', suffix: '' }
    if (search.q) return { prefix: `'${search.q}'`, suffix: '검색결과' } // 키워드 검색
    // 기본(지역 검색): 종류 N곳 + 무슨 필터가 적용됐는지
    const f = []
    if (search.kind !== 'all') f.push(search.sort === 'rating' ? '평점 높은순' : '리뷰 많은순') // 전체는 정렬 안 함
    if (search.tags?.length) f.push(search.tags.join('·'))
    if (search.price) f.push(PRICE_LABEL[search.price])
    return { prefix: noun[search.kind] || '장소', suffix: `${search.lim}곳`, meta: f.join(' · ') }
  }, [showingSaved, search, course, courseLoading])

  const onBookmark = async (data) => {
    await toggleBookmark(data)
    setBookmarks(await getBookmarks())
    setSavedItems(await getSavedItems())
  }
  // 클릭: 선택 + 지도 포커스 + 상세 패널(왼쪽)
  const onPick = (d) => { setSelectedId(d.id); setOpenItem(d) }
  const onBoundsChange = (b) => {
    mapBoundsRef.current = b
    // 지역 이동 후 도착하면(지도가 영역 보고) 그때 AI 코스 / 일반 검색
    if (pendingCourseRef.current) {
      const { bbox, theme, candidates } = pendingCourseRef.current
      pendingCourseRef.current = null
      onCourse(bbox, theme, candidates)
      return
    }
    if (pendingSearchRef.current) {
      const p = pendingSearchRef.current
      pendingSearchRef.current = null
      commitSearch(b, p.q, false, !!p.google)
    }
  }

  // 모바일 바텀시트: 핸들을 위/아래로 끌면 가까운 스냅 지점에 달라붙음
  const sheetY = (state, h) => (state === 'full' ? 0 : state === 'half' ? h * 0.5 : Math.max(0, h - 60))
  const onSheetDown = (e) => {
    const el = sheetRef.current; if (!el) return
    const h = el.offsetHeight
    sdrag.current = { down: true, y: e.clientY, start: sheetY(sheet, h), h }
    el.style.transition = 'none'
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
  }
  const onSheetMove = (e) => {
    const d = sdrag.current; if (!d.down) return
    const el = sheetRef.current; if (!el) return
    const ty = Math.max(0, Math.min(d.h - 60, d.start + (e.clientY - d.y)))
    el.style.transform = `translateY(${ty}px)`
  }
  const onSheetUp = () => {
    const d = sdrag.current; if (!d.down) return
    d.down = false
    const el = sheetRef.current; if (!el) return
    const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform)
    const ty = m ? parseFloat(m[1]) : d.start
    const pts = [['full', 0], ['half', d.h * 0.5], ['collapsed', Math.max(0, d.h - 60)]]
    let best = 'half', bd = Infinity
    for (const [name, p] of pts) { const dd = Math.abs(p - ty); if (dd < bd) { bd = dd; best = name } }
    el.style.transition = ''
    el.style.transform = ''
    setSheet(best)
  }

  // 검색 시 패널을 잠깐 반투명화 (지도 결과 들여다보기)
  const triggerPeek = () => {
    setPeek(true)
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(false), 2200)
  }
  // 검색 커밋 (현재 검색어/필터 + bbox 로). 이걸 호출할 때만 실제 검색이 일어난다.
  const commitSearch = (bbox = null, qOverride, global = false, forceGoogle = false, regionTerm = '') => {
    triggerPeek()
    setSearch((s) => ({ q: qOverride ?? query.trim(), bbox, global, google: forceGoogle, regionTerm, sort, lim: limit, price, tags, kind, tick: s.tick + 1 }))
  }

  // 카테고리 전환(음식/여행지/숙소) — 태그·검색어 초기화(태그 칩이 그 종류로 바뀜). 실제 검색은 '필터 적용'/검색 때.
  const onKind = (k) => {
    if (k === kind) return
    setKind(k); setTags([]); setKeyword(''); setQuery(''); setSuggests([])
    if (k !== 'food') setPrice(0) // 가격은 음식만
  }

  // 지도 카테고리 버튼(음식/여행지/숙소) → 그 카테고리로 전환 + 현재 영역 검색 (1탭)
  const onAreaSearch = (bbox, k = kind) => {
    const sameKind = k === kind
    if (!sameKind) { setKind(k); setTags([]); setKeyword(''); setQuery(''); if (k !== 'food') setPrice(0) }
    triggerPeek()
    const px = sameKind ? price : (k === 'food' ? price : 0)
    setSearch((s) => ({ q: '', bbox, sort, lim: limit, price: px, tags: sameKind ? tags : [], kind: k, tick: s.tick + 1 }))
  }
  // 즐겨찾기를 코스 후보 형태로 정규화 (좌표 있는 것만)
  const favCandidates = () => savedItems
    .filter((d) => d.lat != null && d.lng != null)
    .map((d) => ({ id: d.id, name: d.name, kind: d.kind || 'food', region: d.region || '', tags: d.tags || [], blog: d.blog || 0, lat: d.lat, lng: d.lng }))

  // 🧭 AI 코스 짜기 — 지역 + 테마(선택) + 즐겨찾기 참고(선택)
  const onCourse = async (bbox, theme = '', candidates = null) => {
    setCourseLoading(true)
    setCourse(null)
    setSheet('half') // 모바일: 지도+코스 같이 보이는 중간 크기로
    try {
      const c = await getCourse(bbox, theme, candidates)
      if (!c || !c.stops?.length) {
        setCourse(null)
        alert('이 지역엔 코스로 묶을 저장된 곳이 부족해요. 먼저 음식·관광지·숙소를 검색해 보세요 🙏')
        return null
      }
      setCourse(c)
      return c
    } finally {
      setCourseLoading(false)
    }
  }
  // '즐겨찾기로' — 저장한 곳들만으로 코스(근처 seed 안 넣음). AI가 가까운 것끼리 묶고 지도도 그 묶음으로 이동.
  const onCourseFav = async (theme = '') => {
    setCourseLauncher(false)
    const cand = favCandidates()
    if (cand.length < 2) { alert('즐겨찾기로 코스를 만들려면 저장한 곳이 2곳 이상 필요해요 ⭐'); return }
    const c = await onCourse(null, theme, cand) // bbox 없음 → 즐겨찾기만
    if (c?.stops?.length) {
      const sx = c.stops.map((s) => s.lng), sy = c.stops.map((s) => s.lat)
      const center = [sx.reduce((a, b) => a + b, 0) / sx.length, sy.reduce((a, b) => a + b, 0) / sy.length]
      setNavTo({ center, zoom: 13 }) // 코스 묶음으로 지도 이동
    }
  }
  const onClearCourse = () => { setCourse(null); setCourseLoading(false) }
  // [기본 모드] 런처에서 지역+테마 선택 → 그 동네로 날아가 도착하면 코스 생성(onBoundsChange 에서 트리거)
  const launchCourse = (center, label, theme = '') => {
    setCourseLauncher(false)
    setCourse(null)
    setPickedLabel(label || '')
    const d = 0.02 // ≈2km 박스
    pendingCourseRef.current = { bbox: [center[0] - d, center[1] - d, center[0] + d, center[1] + d], theme }
    setNavTo({ center, zoom: 15 })
  }
  // [지금 보고 있는 지역] 현재 지도 영역으로 바로 코스
  const onCourseHere = (theme = '') => {
    setCourseLauncher(false)
    if (mapBoundsRef.current) onCourse(mapBoundsRef.current, theme)
  }

  // 검색바 자동완성: 타이핑하면 전국 가게를 카카오로 제안
  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; setSuggests([]); return }
    suppressSuggestRef.current = false // 새로 타이핑하면 자동완성 다시 허용
    const q = query.trim()
    if (q.length < 1) { setSuggests([]); return }
    const t = setTimeout(async () => {
      if (suppressSuggestRef.current) return // 검색 눌렀으면 결과를 안 띄움
      try {
        const b = mapBoundsRef.current
        const bb = Array.isArray(b) ? `&bbox=${b.join(',')}` : ''
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&kind=${kind}${bb}`)
        const d = await r.json()
        if (!suppressSuggestRef.current) setSuggests(Array.isArray(d.results) ? d.results : [])
      } catch (_) { setSuggests([]) }
    }, 220)
    return () => clearTimeout(t)
  }, [query, kind])

  // 자동완성에서 가게 선택 → 그 위치로 날아가 그 동네 검색 + '그 가게'를 선택/상세 오픈
  const pickSuggest = (s) => {
    pickedRef.current = true
    setQuery(s.name)
    setSuggests([])
    pendingSearchRef.current = { q: '' } // 도착 후 그 동네 검색
    pendingSelectRef.current = s.id // 결과 로드되면 이 가게 선택+상세
    setNavTo({ center: [s.lng, s.lat], zoom: 16 })
  }

  // 검색 버튼/Enter → 전국 구글 의미검색(결과 리스트). 보는 화면에 안 갇히고, 자동선택도 안 함.
  // (특정 가게로 바로 가고 싶으면 자동완성에서 클릭하면 됨)
  const runTextSearch = async () => {
    const q = query.trim()
    suppressSuggestRef.current = true // 검색 후 자동완성(미리보기) 안 뜨게
    setSuggests([])
    if (!q) { const b = mapBoundsRef.current; if (b) commitSearch(b, '') ; return } // 빈 검색 → 현재 영역

    const tokens = q.split(/\s+/).filter(Boolean)
    // ① "근처/주변 + 키워드" → 지금 보는 지도 영역에서 그 키워드 검색
    const NEAR = /^(근처|주변|내\s*근처|이\s*근처|가까운|가까이)\s*/
    if (NEAR.test(q)) {
      const kw = q.replace(NEAR, '').trim()
      const b = mapBoundsRef.current
      if (b) { commitSearch(b, kw, false, true); return } // 현재 영역에서 구글 텍스트검색(장르 정확)
    }
    // ② "지역 + 키워드" → 지역이 지오코딩되면 그 동네로 날아가 그 영역에서 구글 텍스트검색(장르 정확)
    if (tokens.length >= 2) {
      for (let i = tokens.length - 1; i >= Math.max(1, tokens.length - 3); i--) {
        const region = tokens.slice(0, i).join(' ')
        const kw = tokens.slice(i).join(' ')
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(region)}`)
          const hit = (await r.json()).results?.[0]
          if (hit) {
            // 지도 줌(좁음)에 안 갇히게, 지역 크기에 맞춘 넉넉한 박스로 구글 검색
            const pad = hit.zoom >= 15 ? 0.025 : hit.zoom >= 13 ? 0.06 : 0.12
            const sb = [hit.lng - pad, hit.lat - pad, hit.lng + pad, hit.lat + pad]
            setNavTo({ center: [hit.lng, hit.lat], zoom: Math.max(12, hit.zoom - 2) })
            commitSearch(sb, kw, false, true, tokens[i - 1]) // 그 영역 구글검색 + 그 지역명(개봉) 주소필터
            return
          }
        } catch (_) {}
      }
    }
    // ③ 그 외(가게 이름/브랜드 등) → 전국 구글 의미검색
    commitSearch(null, q, true)
  }
  // 필터 패널의 '필터 적용' → 선택 지역으로 이동 + 그 지역에서 검색 + 패널 닫기
  const applyFilters = () => {
    setFiltersOpen(false)
    if (regionTarget) {
      setQuery('')
      pendingSearchRef.current = { q: keyword } // 지도 도착 후 검색 예약
      setNavTo({ center: regionTarget.center, zoom: regionTarget.zoom + REGION_FOCUS_BOOST }) // 포커스 더 들어가게
    } else {
      runTextSearch() // 지역 선택 없으면 현재 보는 영역에서 검색
    }
  }

  // 🏆 화제의 맛집(큐레이션) 불러오기 — 어디서든
  const loadCuration = () => {
    triggerPeek()
    setQuery('')
    setBookmarkOnly(false)
    setSearch((s) => ({ q: '', bbox: null, sort, lim: limit, tick: s.tick + 1, curation: true }))
  }

  // 지역 칩은 '선택'만 — 지도 이동/검색은 '필터 적용' 누를 때
  const onCountry = (name) => {
    const c = COUNTRIES.find((x) => x.name === name)
    if (!c) return
    setCountry(name); setCity(''); setArea(''); setKeyword(''); setPickedLabel('')
    setRegionTarget({ center: c.center, zoom: c.zoom })
  }
  const onCity = (c) => { setCity(c.name); setArea(''); setPickedLabel(''); setRegionTarget({ center: c.center, zoom: c.zoom }) }
  const onArea = (a) => { setArea(a.name); setPickedLabel(''); setRegionTarget({ center: a.center, zoom: a.zoom }) }
  // 주소검색으로 지역 선택 (카카오 좌표). 나라/도시/동네 칩 선택은 해제.
  const onRegionPick = (s) => {
    setCountry(''); setCity(''); setArea('')
    setPickedLabel(s.label)
    setRegionTarget({ center: [s.lng, s.lat], zoom: s.zoom })
  }
  // 지역 진입/이탈 시 리스트 초기화(기본=저장 뷰) + 선택 해제
  const onReset = (countryName) => {
    setQuery('')
    setKeyword('')
    setPrice(0)
    setTags([])
    setBookmarkOnly(false)
    setCountry(countryName || '') // 지구본 복귀 시 선택 해제
    setCity('')
    setArea('')
    setPickedLabel('')
    setRegionTarget(null)
    setSort('reviews')
    setLimit(50)
    setSearch({ q: '', bbox: null, sort: 'reviews', lim: 50, price: 0, tick: 0 })
    setSelectedId(null)
    setOpenItem(null)
    setCourse(null)
    setCourseLoading(false)
    setMapZoom(0)
    mapBoundsRef.current = null
  }

  // 검색바 + 필터 아이콘 (헤더로 포털) — 검색과 필터가 한 묶음으로 보이게
  const searchBar = (
    <div className="header-search-wrap">
    <form className="search" onSubmit={(e) => { e.preventDefault(); runTextSearch() }}>
      <svg className="search-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setSuggests([]), 150)}
        placeholder="맛집·여행지·숙소, 콕 찍어 검색"
      />
      <button type="submit" className="search-go">검색</button>
      {suggests.length > 0 && (
        <div className="search-suggests">
          {suggests.map((s) => (
            <button key={s.id} type="button" className="search-suggest" onMouseDown={() => pickSuggest(s)}>
              <span className="ss-ic">{s.icon || '🍽️'}</span>
              <span className="ss-name">{s.name}</span>
              <span className="ss-region">{s.region}</span>
            </button>
          ))}
        </div>
      )}
    </form>
      <div className="hdr-ai-wrap">
        <button
          className={`hdr-ai ${courseLauncher ? 'on' : ''}`}
          onClick={() => { if (!user) { setLoginPrompt(true); return } setCourseLauncher((o) => !o) }}
          aria-expanded={courseLauncher}
          title="AI 코스 짜기"
        >
          <span className="hdr-ai-ic">🧭</span>
          <span className="hdr-ai-label">AI 코스</span>
          <span className="hdr-ai-mini">AI</span>
        </button>
      </div>
      <button
        className={`hdr-filter ${filtersOpen ? 'on' : ''}`}
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        title="필터" aria-label="필터"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
      </button>
    </div>
  )

  return (
    <>
      {headerSlot && createPortal(searchBar, headerSlot)}

      {/* AI 코스 런처 — 헤더 backdrop-filter 영향을 피해 본문에서 렌더(fixed 가 뷰포트 기준이 되게) */}
      {courseLauncher && (
        <CourseLauncher
          onLaunch={launchCourse}
          onUseCurrent={onCourseHere}
          onUseFav={onCourseFav}
          hasCurrent={!!mapBoundsRef.current && mapZoom >= 12}
          favCount={savedItems.filter((d) => d.lat != null && d.lng != null).length}
          onClose={() => setCourseLauncher(false)}
        />
      )}

      {/* 비로그인 상태에서 AI 코스 클릭 → 로그인 유도 */}
      {loginPrompt && createPortal(
        <LoginModal reason="AI 코스는 로그인 후 이용할 수 있어요 🧭" onClose={() => setLoginPrompt(false)} />,
        document.body,
      )}

      {filtersOpen && <div className="filter-backdrop" onClick={() => setFiltersOpen(false)} />}
      <div className={`filterpanel ${filtersOpen ? 'open' : ''}`}>
        <div className="sheet-handle" onClick={() => setFiltersOpen(false)}><span className="sheet-grip" /></div>
        <button className="filterpanel-close" onClick={() => setFiltersOpen(false)} aria-label="닫기">×</button>
        <div className="filter-scroll">
        <FilterBar
          kind={kind} onKind={onKind}
          sort={sort} onSort={setSort}
          limit={limit} onLimit={setLimit}
          country={country} onCountry={onCountry}
          city={city} onCity={onCity}
          area={area} onArea={onArea}
          keyword={keyword} onKeyword={setKeyword}
          price={price} onPrice={setPrice}
          tags={tags} onToggleTag={toggleTag} tagOptions={kindOf(kind).tags}
          onRegionPick={onRegionPick} pickedLabel={pickedLabel}
        />
        </div>
        <div className="filter-apply-wrap">
          <button className="filter-apply" onClick={applyFilters} disabled={!regionTarget}>
            {regionTarget ? '필터 적용' : '지역을 먼저 선택하세요'}
          </button>
        </div>
      </div>

      <div className="count">
        <span className="count-title">
          {title.prefix}{title.suffix && <> <b>{title.suffix}</b></>}
          {title.meta && <span className="count-meta">{title.meta}</span>}
        </span>
        {source === 'mock' && !showingSaved && <span className="badge-mock">샘플 데이터</span>}
        <div className="count-actions">
          <button
            className={`save-toggle top ${bookmarkOnly ? 'on' : ''}`}
            onClick={() => setBookmarkOnly((o) => !o)}
            title="저장한 곳만 보기" aria-label="저장한 곳만 보기" aria-pressed={bookmarkOnly}
          >
            <svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
          </button>
        </div>
      </div>

      <div className={`wrap ${listOpen ? '' : 'collapsed'} ${peek ? 'peeking' : ''} ${openItem ? 'detail-open' : ''} ${mapMoving ? 'mapmoving' : ''}`}>
        <button
          className="collapse-btn list-toggle"
          onClick={() => setListOpen((o) => !o)}
          aria-label={listOpen ? '목록 접기' : '목록 펼치기'}
          title={listOpen ? '목록 접기' : '목록 펼치기'}
        >
          {listOpen ? '«' : '»'}
        </button>
        <div className={`results sheet-${sheet} ${sheetEnter ? 'sheet-enter' : ''}`} ref={sheetRef}>
          <div
            className="sheet-handle"
            onPointerDown={onSheetDown}
            onPointerMove={onSheetMove}
            onPointerUp={onSheetUp}
            onPointerCancel={onSheetUp}
          >
            <span className="sheet-grip" />
          </div>
          {(course || courseLoading) ? (
            <CoursePanel
              course={course}
              loading={courseLoading}
              selected={selectedId}
              onSelectStop={onPick}
              onClose={onClearCourse}
            />
          ) : (
            <>
              <RestaurantList
                items={visible}
                selected={selectedId}
                bookmarks={bookmarks}
                loading={loading}
                onOpen={onPick}
                onBookmark={onBookmark}
                emptyText={
                  showingSaved
                    ? '저장한 곳이 없어요 🔖'
                    : `이 지역에 표시할 ${({ all: '장소', food: '맛집', travel: '여행지', stay: '숙소' })[kind] || '장소'}이 없어요 🥲`
                }
              />
              <div className="results-foot">평점·리뷰 수는 Google Places API 기준입니다.</div>
            </>
          )}
        </div>
        <GeoPanel items={mapItems} selected={selectedId} onSelect={onPick} onAreaSearch={onAreaSearch} onReset={onReset} onBounds={onBoundsChange} onMoving={setMapMoving} onZoom={setMapZoom} navTo={navTo} loading={loading} limit={limit} kind={kind} course={course} courseLoading={courseLoading} onCourse={onCourse} onClearCourse={onClearCourse} />
        <DetailModal data={openItem} onClose={() => setOpenItem(null)} onBookmark={onBookmark} bookmarked={openItem ? bookmarks.includes(openItem.id) : false} sheet="half" />
      </div>
    </>
  )
}
