import {
  CATEGORY_BY_KEY,
  categoryKey,
  type PortalKey,
} from './categories';

/**
 * One category tree for the whole site.
 *
 * Each source (Kompas, CNN Indonesia) has its own category names. Categories
 * that cover the same ground are merged here, e.g. Kompas "Liga Inggris" +
 * "Liga Indonesia" and CNN "Sepakbola" all become Olahraga › Sepakbola.
 *
 * This table is the single place to edit when two categories should (or should
 * not) be grouped. `from` lists the source categories feeding a node.
 */

const kmp = (slug: string, parent?: string) =>
  categoryKey('kompas', slug, parent ?? null);
const cnn = (slug: string, parent?: string) =>
  categoryKey('cnn-indonesia', slug, parent ?? null);

interface Def {
  id: string;
  name: string;
  from?: string[];
  children?: Def[];
}

const leaf = (id: string, name: string, ...from: string[]): Def => ({
  id,
  name,
  from,
});

const DEFINITION: Def[] = [
  {
    id: 'nasional',
    name: 'Nasional',
    children: [
      leaf('politik', 'Politik', cnn('politik', 'nasional'), cnn('info-politik', 'nasional')),
      leaf('hukum-kriminal', 'Hukum & Kriminal', cnn('hukum-kriminal', 'nasional')),
      leaf('peristiwa', 'Peristiwa', cnn('peristiwa', 'nasional'), kmp('nasional', 'news')),
      leaf('megapolitan', 'Megapolitan', kmp('megapolitan', 'news')),
    ],
  },
  {
    id: 'internasional',
    name: 'Internasional',
    children: [
      leaf('umum', 'Umum', kmp('internasional', 'global')),
      leaf('asia-pasifik', 'Asia Pasifik', cnn('asia-pasifik', 'internasional')),
      leaf('asean', 'Asean', cnn('asean', 'internasional')),
      leaf('timur-tengah', 'Timur Tengah', cnn('timur-tengah', 'internasional')),
      leaf('eropa-amerika', 'Eropa & Amerika', cnn('eropa-amerika', 'internasional')),
    ],
  },
  {
    id: 'regional',
    name: 'Regional',
    children: [
      'bandung',
      'denpasar',
      'makassar',
      'medan',
      'surabaya',
      'yogyakarta',
    ].map((slug) =>
      leaf(slug, CATEGORY_BY_KEY[kmp(slug, 'regional')].name, kmp(slug, 'regional')),
    ),
  },
  {
    id: 'ekonomi-bisnis',
    name: 'Ekonomi & Bisnis',
    children: [
      leaf('bisnis', 'Bisnis', cnn('bisnis', 'ekonomi'), kmp('ekbis', 'money')),
      leaf('keuangan', 'Keuangan', cnn('keuangan', 'ekonomi'), kmp('keuangan', 'money')),
      leaf('energi', 'Energi', cnn('energi', 'ekonomi'), kmp('energi', 'money')),
      leaf('makro', 'Makro', cnn('makro', 'ekonomi')),
      leaf('corporate-action', 'Corporate Action', cnn('corporate-action', 'ekonomi')),
    ],
  },
  {
    id: 'teknologi',
    name: 'Teknologi',
    children: [
      leaf('ai', 'AI', cnn('ai', 'teknologi')),
      leaf('gadget', 'Gadget', cnn('gadget', 'teknologi')),
      leaf('sains', 'Sains', cnn('sains', 'teknologi')),
      leaf('climate', 'Climate', cnn('climate', 'teknologi')),
      leaf('e-business', 'e-Business', kmp('e-business', 'tekno')),
      leaf('trenology', 'Trenology', kmp('trenology', 'tekno')),
      leaf('lainnya', 'Lainnya', cnn('lainnya', 'teknologi')),
    ],
  },
  {
    id: 'hiburan',
    name: 'Hiburan',
    children: [
      leaf('seleb', 'Seleb', cnn('seleb', 'hiburan'), kmp('seleb', 'hype')),
      leaf('film', 'Film', cnn('film', 'hiburan')),
      leaf('musik', 'Musik', kmp('musik', 'hype')),
      leaf('umum', 'Umum', kmp('entertainment', 'hype')),
    ],
  },
  {
    id: 'olahraga',
    name: 'Olahraga',
    children: [
      leaf(
        'sepakbola',
        'Sepakbola',
        cnn('sepakbola', 'olahraga'),
        kmp('liga-inggris', 'bola'),
        kmp('liga-indonesia', 'bola'),
      ),
      leaf('raket', 'Raket', cnn('raket', 'olahraga'), kmp('badminton', 'bola')),
      leaf('moto-gp', 'Moto GP', cnn('moto-gp', 'olahraga'), kmp('motogp', 'bola')),
      leaf('lainnya', 'Lainnya', cnn('lainnya', 'olahraga')),
    ],
  },
  {
    id: 'gaya-hidup',
    name: 'Gaya Hidup',
    children: [
      leaf('health', 'Health', cnn('health', 'gaya-hidup')),
      leaf('food', 'Food', cnn('food', 'gaya-hidup')),
      leaf('trends', 'Trends', cnn('trends', 'gaya-hidup'), kmp('tren')),
      leaf('travel', 'Travel', cnn('travel', 'gaya-hidup'), kmp('travel-news', 'travel')),
      leaf('lainnya', 'Lainnya', cnn('lainnya', 'gaya-hidup')),
    ],
  },
  {
    id: 'otomotif',
    name: 'Otomotif',
    children: [
      leaf('e-vehicle', 'E-vehicle', cnn('e-vehicle', 'otomotif')),
      leaf('tren-oto', 'Tren Oto', cnn('tren-oto', 'otomotif')),
      leaf('commercial', 'Commercial', cnn('commercial', 'otomotif')),
    ],
  },
  {
    id: 'edukasi',
    name: 'Edukasi',
    children: [
      leaf('kampus', 'Kampus', cnn('kampus', 'edukasi')),
      leaf('sekolah', 'Sekolah', cnn('sekolah', 'edukasi')),
    ],
  },
  leaf('properti', 'Properti', kmp('berita', 'properti')),
  leaf('cek-fakta', 'Cek Fakta', kmp('hoaks-atau-fakta', 'cek-fakta')),
  leaf('cahaya', 'Cahaya', kmp('aktual', 'cahaya')),
];

export interface UnifiedCategory {
  /** `parent` for top-level, `parent/child` for children. */
  id: string;
  name: string;
  parentId: string | null;
  children: UnifiedCategory[];
  /** Source categories merged into this one (leaves only). */
  sourceKeys: string[];
  /** Sources that contribute at least one category. */
  sources: PortalKey[];
}

const build = (def: Def, parentId: string | null): UnifiedCategory => {
  const id = parentId ? `${parentId}/${def.id}` : def.id;
  const children = (def.children ?? []).map((c) => build(c, id));
  const sourceKeys = children.length
    ? children.flatMap((c) => c.sourceKeys)
    : (def.from ?? []);
  return {
    id,
    name: def.name,
    parentId,
    children,
    sourceKeys,
    sources: [
      ...new Set(sourceKeys.map((k) => CATEGORY_BY_KEY[k].portalKey)),
    ],
  };
};

export const TAXONOMY: UnifiedCategory[] = DEFINITION.map((d) => {
  // A parent with a single child is just that child (e.g. Properti).
  const flat =
    d.children?.length === 1
      ? { ...d, from: d.children[0].from, children: undefined }
      : d;
  return build(flat, null);
});

export const UNIFIED_BY_ID: Record<string, UnifiedCategory> = {};
const index = (c: UnifiedCategory) => {
  UNIFIED_BY_ID[c.id] = c;
  c.children.forEach(index);
};
TAXONOMY.forEach(index);

/** Leaf categories (no children): what articles and sentiment belong to. */
export const leavesOf = (c: UnifiedCategory): UnifiedCategory[] =>
  c.children.length ? c.children.flatMap(leavesOf) : [c];

export const UNIFIED_LEAVES = TAXONOMY.flatMap(leavesOf);

export const rootOf = (id: string): UnifiedCategory => {
  let c = UNIFIED_BY_ID[id];
  while (c.parentId) c = UNIFIED_BY_ID[c.parentId];
  return c;
};

/** "Parent › Child", or just the name for top-level ones. */
export const categoryLabel = (id: string) => {
  const c = UNIFIED_BY_ID[id];
  if (!c) return id;
  return c.parentId ? `${UNIFIED_BY_ID[c.parentId].name} › ${c.name}` : c.name;
};

/**
 * The single category a selection of leaf ids amounts to, if any:
 * one leaf, or every leaf of exactly one parent. Otherwise null.
 */
export const focusOf = (leafIds: string[]): UnifiedCategory | null => {
  if (!leafIds.length) return null;
  const picked = new Set(leafIds);
  const matches = (c: UnifiedCategory) => {
    const l = leavesOf(c);
    return l.length === picked.size && l.every((x) => picked.has(x.id));
  };
  const find = (list: UnifiedCategory[]): UnifiedCategory | null => {
    for (const c of list) {
      if (matches(c)) return c;
      const inner = find(c.children);
      if (inner) return inner;
    }
    return null;
  };
  return find(TAXONOMY);
};
