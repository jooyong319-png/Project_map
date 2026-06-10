import RestaurantCard from './RestaurantCard.jsx'

export default function RestaurantList({ items, selected, bookmarks, onOpen, onBookmark, loading }) {
  if (loading) {
    return <div className="empty">불러오는 중… ⏳</div>
  }
  if (!items.length) {
    return (
      <div className="empty">
        검색 결과가 없어요 🥲
        <br />
        다른 키워드나 카테고리를 시도해보세요.
      </div>
    )
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
