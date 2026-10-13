import RestaurantCard from './RestaurantCard.jsx'

export default function RestaurantList({ items, selected, onOpen, loading, emptyText }) {
  if (loading) {
    return <div className="empty">불러오는 중… ⏳</div>
  }
  if (!items.length) {
    return <div className="empty">{emptyText || '이 지역에 표시할 곳이 없어요 🥲'}</div>
  }
  return (
    <div>
      {items.map((d, i) => (
        <RestaurantCard key={d.id} rank={i + 1} data={d} selected={selected === d.id} onOpen={onOpen} />
      ))}
    </div>
  )
}
