// Tarayıcıda tutulan küçük kolaylıklar (kritik veri değil)
export function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* gizli sekme vb. */ }
}

export interface RecentPlace { slug: string; name: string; at: number }
export function rememberPlace(p: Omit<RecentPlace, 'at'>) {
  const list = load<RecentPlace[]>('recentPlaces', []).filter((x) => x.slug !== p.slug)
  save('recentPlaces', [{ ...p, at: Date.now() }, ...list].slice(0, 8))
  save('lastPlace', `/${p.slug}`)
}
export const recentPlaces = () => load<RecentPlace[]>('recentPlaces', [])

export function slugify(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
  return s.toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}
