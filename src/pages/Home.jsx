import { useEffect, useMemo, useState } from 'react'
import FilterBar from '../components/FilterBar.jsx'
import RestaurantList from '../components/RestaurantList.jsx'
import GeoPanel from '../components/GeoPanel.jsx'
import DetailModal from '../components/DetailModal.jsx'
import { getRestaurants } from '../lib/places.js'
import { getBookmarks, toggleBookmark } from '../lib/supabase.js'

export default function Home() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState('reviews')
  const [items, setItems] = useState([])
  const [region, setRegion] = useState(null) // 대표 국가 클릭 시 검색 영역 { bbox }
  const [source, setSource] = useState('mock')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [listOpen, setListOpen] = useState(true) // 왼쪽 TOP 10 패널 접기/펼치기
  // 필터
  const [category, setCategory] = useState('전체')
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [bookmarkOnly, setBookmarkOnly] = useState(false)

  // 검색어 디바운스
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350)
    return () => clearTimeout(t)
  }, [query])

  // 데이터 로드
  useEffect(() => {
    let active = true
    setLoading(true)
    getRestaurants(debounced, { bbox: region?.bbox, category, openNow: openNowOnly }).then(({ items, source }) => {
      if (!active) return
      setItems(items)
      setSource(source)
      setLoading(false)
    })
    return () => { active = false }
  }, [debounced, region, category, openNowOnly])

  // 북마크 로드
  useEffect(() => { getBookmarks().then(setBookmarks) }, [])

  // 카테고리·영업중은 검색(API)에서 반영됨. 북마크만 클라이언트에서 거른다.
  const visible = useMemo(() => {
    let r = bookmarkOnly ? items.filter((d) => bookmarks.includes(d.id)) : items
    if (sort === 'rating') r = [...r].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    else r = [...r].sort((a, b) => b.reviews - a.reviews) // 기본: 리뷰 많은순
    return r.slice(0, 10) // TOP 10
  }, [items, bookmarkOnly, sort, bookmarks])

  const onBookmark = async (id) => setBookmarks(await toggleBookmark(id))
  const onSelectFromGlobe = (r) => { setSelectedId(r.id); setOpenItem(r) }
  // 지구본에서 대표 국가 클릭 → 그 지역으로 검색 (bbox 제한 포함)
  const onCountrySearch = (c) => {
    setRegion({ bbox: c.bbox })
    setQuery(c.query)
    setDebounced(c.query)
  }
  // 지도에서 "이 지역 TOP 10" → 현재 보고 있는 영역(bbox) + 현재 필터로 재검색
  const onAreaSearch = (bbox) => setRegion({ bbox })

  return (
    <>
      <div className="filters">
        <div className="search">
          <span>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setRegion(null) }}
            placeholder="맛집, 지역, 음식 검색"
          />
        </div>
        <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="reviews">리뷰 많은순</option>
          <option value="rating">평점 높은순</option>
        </select>
      </div>

      <FilterBar
        category={category} onCategory={setCategory}
        openNowOnly={openNowOnly} onOpenNow={setOpenNowOnly}
        bookmarkOnly={bookmarkOnly} onBookmarkOnly={setBookmarkOnly}
      />

      <div className="count">
        <span>한국 맛집 <b>TOP 10</b></span>
        {source === 'mock' && <span className="badge-mock">샘플 데이터</span>}
        <button className="collapse-btn" onClick={() => setListOpen((o) => !o)}>
          {listOpen ? '◀ 목록 접기' : '▶ 목록 펼치기'}
        </button>
      </div>

      <div className={`wrap ${listOpen ? '' : 'collapsed'}`}>
        <div className="results">
          <RestaurantList
            items={visible}
            selected={selectedId}
            bookmarks={bookmarks}
            loading={loading}
            onOpen={(d) => { setSelectedId(d.id); setOpenItem(d) }}
            onBookmark={onBookmark}
          />
        </div>
        <GeoPanel items={visible} selected={selectedId} onSelect={onSelectFromGlobe} onCountrySearch={onCountrySearch} onAreaSearch={onAreaSearch} loading={loading} />
      </div>

      <DetailModal data={openItem} onClose={() => setOpenItem(null)} />
    </>
  )
}
