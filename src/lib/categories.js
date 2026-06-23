// Single source of truth for the portfolio categories.
// `key` matches works.category in the database.
// `defaultKind` is only the admin upload default; per-tile behaviour is driven
// by works.kind: 'cover' → image slider, 'project' → real PDF in a new tab,
// 'video' → fullscreen player. `media: true` lets STAGE VISUAL upload videos.
export const CATEGORIES = [
  { key: 'cover_arts',         slug: 'cover-arts',         defaultKind: 'cover',   en: 'COVER ARTS',         ru: 'ОБЛОЖКИ' },
  { key: 'title_cards',        slug: 'title-cards',        defaultKind: 'project', en: 'TITLE CARDS',        ru: 'ТАЙТЛ-КАРТЫ' },
  { key: 'stage_visual',       slug: 'stage-visual',       defaultKind: 'cover',   media: true, en: 'STAGE VISUAL', ru: 'СЦЕНИЧЕСКИЙ ВИЗУАЛ' },
  { key: 'clothing_design',    slug: 'clothing-design',    defaultKind: 'project', en: 'CLOTHING DESIGN',    ru: 'ДИЗАЙН ОДЕЖДЫ' },
  { key: 'creative_direction', slug: 'creative-direction', defaultKind: 'cover',   en: 'CREATIVE DIRECTION', ru: 'КРЕАТИВНЫЙ ДИРЕКШН' },
  { key: 'logotypes',          slug: 'logotypes',          defaultKind: 'cover',   en: 'LOGOTYPES',          ru: 'ЛОГОТИПЫ' },
]

export const byKey = (k) => CATEGORIES.find((c) => c.key === k)
export const bySlug = (s) => CATEGORIES.find((c) => c.slug === s)
export const catLabel = (k, lang) => {
  const c = byKey(k)
  return c ? c[lang] || c.en : k
}
