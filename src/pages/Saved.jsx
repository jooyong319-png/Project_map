import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RestaurantList from '../components/RestaurantList.jsx'
import DetailModal from '../components/DetailModal.jsx'
import { getRestaurants } from '../lib/places.js'
import { getBookmarks, toggleBookmark } from '../lib/supabase.js'

export default function Saved() {
  const [all, setAll] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [openItem, setOpenItem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getRestaurants(''), getBookmarks()]).then(([{ items }, bm]) => {
      setAll(items)
      setBookmarks(bm)
      setLoading(false)
    })
  }, [])

  const saved = all.filter((d) => bookmarks.includes(d.id))
  const onBookmark = async (id) => setBookmarks(await toggleBookmark(id))

  return (
    <div className="saved-page">
      <div className="count" style={{ maxWidth: 720, margin: '0 auto' }}>
        저장한 맛집 · <b>{saved.length}</b>곳
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', border: '1px solid #eee' }}>
        {!loading && saved.length === 0 ? (
          <div className="empty">
            저장한 맛집이 없어요 🔖
            <br />
            <Link to="/" style={{ color: '#f0792e' }}>탐색하러 가기</Link>
          </div>
        ) : (
          <RestaurantList
            items={saved}
            selected={null}
            bookmarks={bookmarks}
            loading={loading}
            onOpen={setOpenItem}
            onBookmark={onBookmark}
          />
        )}
      </div>
      <DetailModal data={openItem} onClose={() => setOpenItem(null)} />
    </div>
  )
}
