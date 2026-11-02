/**
 * تحميل ملفات JSON التي ينتجها scripts/prepare_data.py.
 * نستخدم import.meta.glob حتى لا يحاول TypeScript استنتاج أنواع ملفات بحجم عدة ميغابايت.
 */
const files = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, unknown>

function get<T>(name: string): T {
  const v = files[`./${name}`]
  if (!v) throw new Error(`ملف البيانات غير موجود: src/data/${name} — شغّل: python scripts/prepare_data.py`)
  return v as T
}

export interface Rec {
  _id: string
  _alloc?: string
  _review: string[]
  _local?: boolean
  _src?: { sheet: string; row: number }
  [key: string]: any
}

export interface RawCell {
  col: string
  h: string | null
  v: string
  t: 'date' | 'num' | 'text' | 'empty'
  merged: string | null
  fromMerge: boolean
}
export interface RawRow {
  sheet: string
  row: number
  label: string
  cells: RawCell[]
}

export interface QualityExample {
  city: string
  sheet: string | null
  row: number | null
  col: string | null
  value: string
  note: string | null
}
export interface QualityIssue {
  id: string
  title: string
  desc: string
  severity: 'مرتفع' | 'متوسط' | 'منخفض'
  fix: string
  counts: Record<string, number>
  examples: QualityExample[]
}

export interface CityStats {
  plots: number
  plotsNote: string
  allocated: number
  cancelled: number
  adminLicenses: number
  overdue: number | null
  overdueNote: string
  investors: number
}

export interface Stats {
  cities: Record<string, CityStats>
  byCategory: Array<{ name: string; [city: string]: number | string }>
  byYear: Array<{ year: string; [city: string]: number | string }>
  hasyaPlotStatus: Record<string, number>
}

export const DATA = {
  db: get<Record<string, Rec[]>>('db.json'),
  raw: get<Record<string, RawRow[]>>('raw_rows.json'),
  quality: get<{ generated: string; files: Record<string, string>; issues: QualityIssue[] }>('quality_report.json'),
  stats: get<Stats>('stats.json'),
  lists: get<Record<string, unknown>>('lists_data.json'),
}
