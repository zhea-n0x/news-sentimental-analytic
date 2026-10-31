// Unified category taxonomy shared by every portal.
//
// Each portal names its sections differently (detik "detikFinance", kumparan "Bisnis", Liputan6
// "Saham", ...). Articles are mapped onto this one tree by matching `portal:category/subcategory`
// against RULES below, first match wins. Ids are `root` or `root/child`; analysis and filters
// only ever deal with these ids.

export interface TaxonomyNode {
  id: string
  name: string
  children?: TaxonomyNode[]
}

const node = (id: string, name: string, children?: [string, string][]): TaxonomyNode => ({
  id,
  name,
  children: children?.map(([childId, childName]) => ({ id: `${id}/${childId}`, name: childName })),
})

export const TAXONOMY: TaxonomyNode[] = [
  node('nasional', 'Nasional', [
    ['politik', 'Politik'],
    ['hukum', 'Hukum & Kriminal'],
    ['peristiwa', 'Peristiwa'],
    ['megapolitan', 'Megapolitan'],
    ['umum', 'Nasional Umum'],
  ]),
  node('internasional', 'Internasional', [
    ['asia-pasifik', 'Asia Pasifik'],
    ['timur-tengah', 'Timur Tengah'],
    ['eropa-amerika', 'Eropa & Amerika'],
    ['umum', 'Internasional Umum'],
  ]),
  node('regional', 'Regional', [
    ['jawa', 'Jawa'],
    ['sumatra', 'Sumatra'],
    ['bali-nusra', 'Bali & Nusa Tenggara'],
    ['kalimantan', 'Kalimantan'],
    ['sulawesi-timur', 'Sulawesi & Indonesia Timur'],
    ['umum', 'Regional Umum'],
  ]),
  node('ekonomi', 'Ekonomi & Bisnis', [
    ['makro', 'Makro & Kebijakan'],
    ['pasar-modal', 'Pasar Modal & Kripto'],
    ['keuangan', 'Keuangan & Perbankan'],
    ['energi', 'Energi & Tambang'],
    ['industri', 'Bisnis & Industri'],
    ['properti', 'Properti'],
    ['umum', 'Ekonomi Umum'],
  ]),
  node('teknologi', 'Teknologi & Sains', [
    ['gadget', 'Gadget'],
    ['internet', 'Internet & Aplikasi'],
    ['game', 'Game & Esport'],
    ['sains', 'Sains'],
    ['umum', 'Teknologi Umum'],
  ]),
  node('hiburan', 'Hiburan', [
    ['seleb', 'Selebritas'],
    ['film-tv', 'Film & TV'],
    ['musik', 'Musik'],
    ['umum', 'Hiburan Umum'],
  ]),
  node('olahraga', 'Olahraga', [
    ['sepakbola', 'Sepak Bola'],
    ['balap', 'Balap'],
    ['raket', 'Bulu Tangkis & Tenis'],
    ['lainnya', 'Olahraga Lainnya'],
  ]),
  node('gaya-hidup', 'Gaya Hidup', [
    ['kesehatan', 'Kesehatan'],
    ['kuliner', 'Kuliner'],
    ['travel', 'Travel'],
    ['fashion', 'Fashion & Kecantikan'],
    ['keluarga', 'Keluarga & Relasi'],
    ['tren', 'Tren & Viral'],
    ['umum', 'Gaya Hidup Umum'],
  ]),
  node('otomotif', 'Otomotif', [
    ['mobil', 'Mobil'],
    ['motor', 'Motor'],
    ['umum', 'Otomotif Umum'],
  ]),
  node('edukasi', 'Edukasi'),
  node('religi', 'Religi'),
  node('cek-fakta', 'Cek Fakta'),
  node('opini', 'Opini & Riset'),
  node('lainnya', 'Lainnya'),
]

export const FALLBACK_ID = 'lainnya'

// Matched against `portal:category/subcategory` (subcategory empty when there is none).
// Order matters: the first rule whose pattern matches decides.
const RULES: [string, RegExp][] = [
  ['cek-fakta', /:cek-fakta\//],
  ['religi', /:(cahaya|islami|muslim|kalam)\//],
  ['opini', /:opini\/|\/opini$|^detik:detiknews\/kolom$|^cnbc-indonesia:research\//],
  ['edukasi', /:(edukasi|pendidikan)\/|\/pendidikan$/],
  ['gaya-hidup/tren', /:(tren|trending)\/|\/(trends|viral|fun-fact|unik|gensindo)$/],

  ['olahraga/balap', /\/(moto-?gp|f1|otosport|motosport|balap)$/],
  ['olahraga/raket', /\/(raket|badminton|netting)$/],
  ['olahraga/lainnya', /^liputan6:bola\/sports$/],
  ['olahraga/sepakbola', /:(sepakbola|bola|super-skor)\/|\/(sepakbola|soccer|bola)$/],
  ['olahraga/lainnya', /:(sport|sports|olahraga)\//],

  ['hiburan/musik', /:musik\/|\/(musik|music|lirik|kunci-gitar|dangdut|kpop)$/],
  ['hiburan/film-tv', /\/(film|movie|cinefilm|cinema-tv|tv-scoop|hollywood|kdrama)$/],
  ['hiburan/seleb', /:(hot|celebrity|seleb)\/|\/(seleb|celeb|selebritis|hot-gossip|gosip|gosipi|red-carpet|knews)$/],
  ['hiburan/umum', /:(hiburan|hype|showbiz|entertainment|detikhot|korea)\/|\/entertainment$/],

  ['otomotif/umum', /^okezone:ototekno\/otomotif$/],
  ['teknologi/game', /:games\/|\/(game|games|esport|games-news)$/],
  ['teknologi/gadget', /:gadget\/|\/(gadget|consumer|review|elektronik)$/],
  ['teknologi/sains', /:science\/|\/(sains|science|discovery|experiment|climate)$/],
  ['teknologi/internet', /:cyberlife\/|:(tekno|techno|teknologi|tech)\/(tips|ai|internet|apps|telco|e-business)$/],
  ['teknologi/umum', /:(tekno|techno|teknologi|tech|ototekno)\//],

  ['otomotif/motor', /\/(motor|motorbike)$/],
  ['otomotif/mobil', /\/(mobil|car|mobil-listrik|e-vehicle)$/],
  ['otomotif/umum', /:(otomotif|automotive|detikoto)\//],

  ['ekonomi/properti', /:properti\/|\/properti$/],
  ['ekonomi/pasar-modal', /:(saham|crypto|market)\/|\/(market|bursa|bursa-dan-valas|bursa-finansial|market-update)$/],
  ['ekonomi/keuangan', /\/(keuangan|finance|bank|fintech|smart-money|moneter)$/],
  ['ekonomi/energi', /\/(energi|energi-tambang)$/],
  ['ekonomi/makro', /\/(makro|ekopol)$/],
  [
    'ekonomi/industri',
    /:entrepreneur\/|\/(bisnis|business|corporate-action|industri|sektor-riil|riil|inspirasi-bisnis|inspiratif|harga|infrastruktur)$/,
  ],
  ['ekonomi/umum', /:(money|bisnis|business|economy|ekonomi|ekonomi-bisnis|uang|detikfinance)\//],

  ['internasional/asia-pasifik', /\/(asia-pasifik|asean)$/],
  ['internasional/timur-tengah', /\/timur-tengah$/],
  ['internasional/eropa-amerika', /\/(eropa-amerika|eropa|amerika)$/],
  ['internasional/umum', /:(internasional|global|dunia)\/|\/(internasional|international|world)$/],

  ['nasional/megapolitan', /:metropolitan\/|\/(megapolitan|metropolitan|jabodetabek)$/],
  [
    'regional/jawa',
    /\/(jawa-barat|jawa-tengah|jawa-timur|jawa-tengah-diy|jawa-bali|jogja|yogyakarta|bandung|surabaya|banten)$/,
  ],
  ['regional/sumatra', /\/(sumatra-selatan|sumatra-utara|sumatera|lampung|medan)$/],
  ['regional/bali-nusra', /\/(bali|bali-nusra|ntb|denpasar)$/],
  ['regional/kalimantan', /\/kalimantan-timur$/],
  ['regional/sulawesi-timur', /\/(sulawesi|sulawesi-selatan|makassar|indonesia-timur)$/],
  ['regional/umum', /:(regional|daerah)\/|\/(regional|nusantara)$/],

  ['nasional/politik', /:politik\/|\/(politik|info-politik)$/],
  ['nasional/hukum', /\/(hukum-kriminal|hukum|kriminal)$/],
  ['nasional/peristiwa', /:peristiwa\/|\/(peristiwa|umum)$/],
  ['nasional/umum', /:(nasional|news|detiknews)\//],

  ['gaya-hidup/kesehatan', /:(health|detikhealth|kesehatan)\/|\/(health|info-sehat|diet|health-and-diet|fitness|medical|kebugaran|konsultasi|health-info|true-story)$/],
  ['gaya-hidup/kuliner', /:(detikfood|food)\/|\/(food|culinary|kuliner|dining-guide|recipe|resep)$/],
  ['gaya-hidup/travel', /:(travel|detiktravel)\/|\/(travel|travel-kuliner|food-travel|destination|cerita-perjalanan)$/],
  ['gaya-hidup/fashion', /:(beauty|fashion)\/|\/(beauty|fashion-beauty|style|makeup-and-skincare|fashion-news)$/],
  ['gaya-hidup/keluarga', /:(relationship|wedding)\/|\/(relationship|love|mom-and-kids|wedding-news)$/],
  ['gaya-hidup/umum', /:(lifestyle|gaya|gaya-hidup|life|men|women|living|sale-and-shop|citizen6)\//],
]

export const NODE_BY_ID = new Map<string, TaxonomyNode>()
const PARENT_OF = new Map<string, string>()
for (const root of TAXONOMY) {
  NODE_BY_ID.set(root.id, root)
  for (const child of root.children ?? []) {
    NODE_BY_ID.set(child.id, child)
    PARENT_OF.set(child.id, root.id)
  }
}

const cache = new Map<string, string>()

/** Unified leaf id for an article's portal category. */
export function classify(portalKey: string, categorySlug: string, subcategorySlug?: string | null): string {
  const key = `${portalKey}:${categorySlug}/${subcategorySlug ?? ''}`
  let id = cache.get(key)
  if (id === undefined) {
    id = RULES.find(([, pattern]) => pattern.test(key))?.[0] ?? FALLBACK_ID
    cache.set(key, id)
  }
  return id
}

export const rootOf = (id: string) => PARENT_OF.get(id) ?? id

/** Leaf ids under a node (the node itself when it has no children). */
export function leavesOf(id: string): string[] {
  const n = NODE_BY_ID.get(id)
  if (!n) return []
  return n.children?.length ? n.children.map((c) => c.id) : [n.id]
}

/** Expands a filter selection (roots and/or leaves) into a set of leaf ids. Empty means everything. */
export function expandSelection(ids: string[]): Set<string> | null {
  const valid = ids.filter((id) => NODE_BY_ID.has(id))
  if (!valid.length) return null
  return new Set(valid.flatMap(leavesOf))
}

/**
 * The single category a selection amounts to, if any: one leaf, or every leaf of one root.
 * Returns null for "everything" or a mix of categories.
 */
export function focusOf(leaves: Set<string> | null): TaxonomyNode | null {
  if (!leaves || !leaves.size) return null
  const roots = new Set([...leaves].map(rootOf))
  if (roots.size !== 1) return null
  const root = NODE_BY_ID.get([...roots][0])!
  const all = leavesOf(root.id)
  if (all.length === leaves.size && all.every((l) => leaves.has(l))) return root
  return leaves.size === 1 ? NODE_BY_ID.get([...leaves][0])! : null
}
