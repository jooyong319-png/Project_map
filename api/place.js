// Vercel 서버리스 함수 - Google Place Details 프록시
// 상세 패널 열 때 GET /api/place?id=<placeId> 로 호출.
// 전화·홈페이지·지도링크·사진여러장·영업시간 등 풍부한 정보를 한국어로 반환.

export default async function handler(req, res) {
  const id = (req.query?.id || '').toString()
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!id || !key) {
    res.status(200).json({ error: 'no id/key' })
    return
  }
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=ko&regionCode=KR`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,shortFormattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,primaryType,priceLevel,regularOpeningHours.weekdayDescriptions,regularOpeningHours.openNow,photos.name',
      },
    })
    const d = await r.json()
    if (d.error) {
      res.status(200).json({ error: d.error.message })
      return
    }
    const photos = (d.photos || []).slice(0, 8).map((p) => `/api/photo?ref=${encodeURIComponent(p.name)}&w=400`)
    res.status(200).json({
      id: d.id,
      name: d.displayName?.text || '',
      address: d.formattedAddress || '',
      shortAddress: d.shortFormattedAddress || '',
      phone: d.nationalPhoneNumber || '',
      website: d.websiteUri || '',
      mapsUrl: d.googleMapsUri || '',
      openNow: d.regularOpeningHours?.openNow ?? null,
      hours: d.regularOpeningHours?.weekdayDescriptions || [],
      photos,
    })
  } catch (e) {
    res.status(200).json({ error: String(e) })
  }
}
