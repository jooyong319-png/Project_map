import { useEffect, useMemo, useRef, useState } from 'react'
import FilterBar from '../components/FilterBar.jsx'
import RestaurantList from '../components/RestaurantList.jsx'
import GeoPanel from '../components/GeoPanel.jsx'
import DetailModal from '../components/DetailModal.jsx'
import { getRestaurants } from '../lib/places.js'
import { getBookmarks, toggleBookmark, getSavedItems } from '../lib/supabase.js'

export default function Home() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('reviews')
  const [limit, setLimit] = useState(10) // 보여줄 개수 10/30/50
  const [items, setItems] = useState([])
  const [search, setSearch] = useState({ q: '', bbox: null, cat: '전체', open: false, sort: 'reviews', lim: 10, tick: 0 }) // 커밋된 검색 조건
  const [source, setSource] = useState('mock')
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [savedItems, setSavedItems] = useState([]) // 저장한 맛집 전체 데이터(지도에 항상 표시)
  const [listOpen, setListOpen] = useState(true) // 왼쪽 TOP 10 패널 접기/펼치기
  const [peek, setPeek] = useState(false) // 검색 시 잠깐 패널 반투명(지도 들여다보기)
  const peekTimer = useRef(null)
  // 필터
  const [category, setCategory] = useState('전체')
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [bookmarkOnly, setBookmarkOnly] = useState(false)

  // 데이터 로드 — 커밋된 검색(search)이 바뀔 때만. 진입(tick 0) 시엔 검색 안 하고 저장된 곳만 표시.
  // 최소 로딩 시간을 둬서 "검색 중" 표시가 살짝 보이게(천천히 검색되는 느낌).
  useEffect(() => {
    if (search.tick === 0) return
    let active = true
    setLoading(true)
    const start = Date.now()
    getRestaurants(search.q, { bbox: search.bbox, category: search.cat, openNow: search.open }).then(({ items, source }) => {
      const wait = Math.max(0, 900 - (Date.now() - start))
      setTimeout(() => {
        if (!active) return
        setItems(items)
        setSource(source)
        setLoading(false)
      }, wait)
    })
    return () => { active = false }
  }, [search])

  // 북마크/저장맛집 로드
  useEffect(() => {
    getBookmarks().then(setBookmarks)
    getSavedItems().then(setSavedItems)
  }, [])

  // 진입(아직 검색 안 함) 또는 저장 필터 ON → 저장한 곳을 보여준다.
  const showingSaved = bookmarkOnly || search.tick === 0
  const visible = useMemo(() => {
    let r = showingSaved ? savedItems : items
    if (search.sort === 'rating') r = [...r].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    else r = [...r].sort((a, b) => b.reviews - a.reviews) // 기본: 리뷰 많은순
    return r.slice(0, search.lim)
  }, [items, savedItems, showingSaved, search])

  // 지도 마커 = TOP10 + 저장한 맛집(검색에 없어도 항상 표시). 저장된 건 saved 표시.
  const mapItems = useMemo(() => {
    const savedIds = new Set(savedItems.map((d) => d.id))
    const byId = new Map()
    for (const d of visible) byId.set(d.id, d)
    for (const s of savedItems) if (!byId.has(s.id)) byId.set(s.id, s)
    return [...byId.values()].map((d) => (savedIds.has(d.id) ? { ...d, saved: true } : d))
  }, [visible, savedItems])

  // 상황에 맞춰 바뀌는 리스트 제목
  const title = useMemo(() => {
    if (showingSaved) return { prefix: '⭐ 저장한 맛집', suffix: '' }
    if (search.q) return { prefix: `'${search.q}'`, suffix: '검색결과' } // 키워드 검색
    const parts = [search.cat !== '전체' ? search.cat : '인기 맛집']
    if (search.open) parts.push('영업중')
    return { prefix: parts.join(' · '), suffix: `TOP ${search.lim}` }
  }, [showingSaved, search])

  const onBookmark = async (data) => {
    await toggleBookmark(data)
    setBookmarks(await getBookmarks())
    setSavedItems(await getSavedItems())
  }
  // 클릭: 선택 + 지도 포커스 + 상세 패널(왼쪽)
  const onPick = (d) => { setSelectedId(d.id); setOpenItem(d) }

  // 검색 시 패널을 잠깐 반투명화 (지도 결과 들여다보기)
  const triggerPeek = () => {
    setPeek(true)
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(false), 2200)
  }
  // 검색 커밋 (현재 검색어/필터 + bbox 로). 이걸 호출할 때만 실제 검색이 일어난다.
  const commitSearch = (bbox = null, qOverride) => {
    triggerPeek()
    setSearch((s) => ({ q: qOverride ?? query.trim(), bbox, cat: category, open: openNowOnly, sort, lim: limit, tick: s.tick + 1 }))
  }

  // 지도 "이 지역 TOP 10" → 현재 영역의 맛집(입력한 텍스트는 비우고 검색)
  const onAreaSearch = (bbox) => { setQuery(''); commitSearch(bbox, '') }
  // 검색창의 검색 버튼/Enter → 전국(영역 제한 없이) 키워드 검색
  const runTextSearch = () => commitSearch(null)
  // 지역 진입/이탈 시 리스트 초기화(기본=저장 뷰) + 선택 해제
  const onReset = () => {
    setQuery('')
    setCategory('전체')
    setOpenNowOnly(false)
    setBookmarkOnly(false)
    setSort('reviews')
    setLimit(10)
    setSearch({ q: '', bbox: null, cat: '전체', open: false, sort: 'reviews', lim: 10, tick: 0 })
    setSelectedId(null)
    setOpenItem(null)
  }

  return (
    <>
      <div className="filters">
        <form className="search" onSubmit={(e) => { e.preventDefault(); runTextSearch() }}>
          <span>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="맛집·지역·음식 검색 (전국)"
          />
          <button type="submit" className="search-go">검색</button>
        </form>
        <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="reviews">리뷰 많은순</option>
          <option value="rating">평점 높은순</option>
        </select>
        <select className="sortsel" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={10}>10개</option>
          <option value={30}>30개</option>
          <option value={50}>50개</option>
        </select>
      </div>

      <FilterBar
        category={category} onCategory={setCategory}
        openNowOnly={openNowOnly} onOpenNow={setOpenNowOnly}
        bookmarkOnly={bookmarkOnly} onBookmarkOnly={setBookmarkOnly}
      />

      <div className="count">
        <span>{title.prefix}{title.suffix && <> <b>{title.suffix}</b></>}</span>
        {source === 'mock' && !showingSaved && <span className="badge-mock">샘플 데이터</span>}
      </div>

      <div className={`wrap ${listOpen ? '' : 'collapsed'} ${peek ? 'peeking' : ''}`}>
        <button
          className="collapse-btn list-toggle"
          onClick={() => setListOpen((o) => !o)}
          aria-label={listOpen ? '목록 접기' : '목록 펼치기'}
          title={listOpen ? '목록 접기' : '목록 펼치기'}
        >
          {listOpen ? '«' : '»'}
        </button>
        <div className="results">
          <RestaurantList
            items={visible}
            selected={selectedId}
            bookmarks={bookmarks}
            loading={loading}
            onOpen={onPick}
            onBookmark={onBookmark}
            emptyText={showingSaved ? '저장한 맛집이 없어요 🔖' : '구글에 등록된 식당이 없어요 🥲'}
          />
        </div>
        <GeoPanel items={mapItems} selected={selectedId} onSelect={onPick} onAreaSearch={onAreaSearch} onReset={onReset} loading={loading} limit={limit} />
        <DetailModal data={openItem} onClose={() => setOpenItem(null)} onBookmark={onBookmark} bookmarked={openItem ? bookmarks.includes(openItem.id) : false} />
      </div>
    </>
  )
}
