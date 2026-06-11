import RestaurantCard from './RestaurantCard.jsx'

export default function RestaurantList({ items, selected, bookmarks, onOpen, onBookmark, loading, emptyText }) {
  if (loading) {
    return <div className="empty">불러오는 중… ⏳</div>
  }
  if (!items.length) {
    return <div className="empty">{emptyText || '구글에 등록된 식당이 없어요 🥲'}</div>
  }
  return (
    <div>
      {items.map((d, i) => (
        <RestaurantCard
          key={d.id}
          rank={i + 1}
          data={d}
          selected={selected === d.id}
          bookmarked={bookmarks.includes(d.id)}
          onOpen={onOpen}
          onBookmark={onBookmark}
        />
      ))}
    </div>
  )
}
