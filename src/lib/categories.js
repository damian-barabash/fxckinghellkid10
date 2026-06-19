// Single source of truth for the portfolio categories.
// `key` matches works.category in the database.
// `cover` categories show an image lightbox; others open a generated PDF.
export const CATEGORIES = [
  { key: 'cover_arts',         slug: 'cover-arts',         kind: 'cover',   en: 'COVER ARTS',         ru: 'ОБЛОЖКИ' },
  { key: 'title_cards',        slug: 'title-cards',        kind: 'project', en: 'TITLE CARDS',        ru: 'ТАЙТЛ-КАРТЫ' },
  { key: 'stage_visual',       slug: 'stage-visual',       kind: 'project', en: 'STAGE VISUAL',       ru: 'СЦЕНИЧЕСКИЙ ВИЗУАЛ' },
  { key: 'clothing_design',    slug: 'clothing-design',    kind: 'project', en: 'CLOTHING DESIGN',    ru: 'ДИЗАЙН ОДЕЖДЫ' },
  { key: 'creative_direction', slug: 'creative-direction', kind: 'project', en: 'CREATIVE DIRECTION', ru: 'КРЕАТИВНЫЙ ДИРЕКШН' },
  { key: 'logotypes',          slug: 'logotypes',          kind: 'project', en: 'LOGOTYPES',          ru: 'ЛОГОТИПЫ' },
]

export const byKey = (k) => CATEGORIES.find((c) => c.key === k)
export const bySlug = (s) => CATEGORIES.find((c) => c.slug === s)
export const catLabel = (k, lang) => {
  const c = byKey(k)
  return c ? c[lang] || c.en : k
}
