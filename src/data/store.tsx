import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DATA, type Rec } from './load'
import { TABLES, type CityFilter, type TableId } from '../schema/schema'

export type DB = Record<TableId, Rec[]>

const STORAGE_KEY = 'ic-prototype-additions-v1'
const CITY_KEY = 'ic-prototype-city'

/** الجداول المرتبطة بتخصيص (فيها _alloc) */
export const ALLOC_TABLES: TableId[] = [
  'allocation_plots', 'decision_refs', 'events', 'project', 'production', 'industrial_licenses',
  'building_licenses', 'admin_licenses', 'contracts', 'financial', 'installments', 'leases',
  'investment_licenses', 'subscriptions',
]

export interface Index {
  allocById: Map<string, Rec>
  byAlloc: Record<string, Map<string, Rec[]>>
  investorByCode: Map<string, Rec>
  partnersByInv: Map<string, Rec[]>
  plotById: Map<string, Rec>
  allocsByPlot: Map<string, Rec[]>
  decisionById: Map<string, Rec>
}

interface Ctx {
  db: DB
  idx: Index
  city: CityFilter
  setCity: (c: CityFilter) => void
  add: (records: Partial<Record<TableId, Rec[]>>) => void
  reset: () => void
  localCount: number
}

const StoreContext = createContext<Ctx | null>(null)

function readLocal(): Partial<Record<TableId, Rec[]>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function buildIndex(db: DB): Index {
  const byAlloc: Record<string, Map<string, Rec[]>> = {}
  for (const t of ALLOC_TABLES) {
    const m = new Map<string, Rec[]>()
    for (const r of db[t]) {
      if (!r._alloc) continue
      if (!m.has(r._alloc)) m.set(r._alloc, [])
      m.get(r._alloc)!.push(r)
    }
    byAlloc[t] = m
  }
  const partnersByInv = new Map<string, Rec[]>()
  for (const p of db.partners) {
    const k = p['رمز المستثمر']
    if (!partnersByInv.has(k)) partnersByInv.set(k, [])
    partnersByInv.get(k)!.push(p)
  }
  const allocById = new Map(db.allocations.map((a) => [a._id, a]))
  const allocsByPlot = new Map<string, Rec[]>()
  for (const ap of db.allocation_plots) {
    const a = allocById.get(ap._alloc!)
    if (!a) continue
    if (!allocsByPlot.has(ap._plot)) allocsByPlot.set(ap._plot, [])
    allocsByPlot.get(ap._plot)!.push(a)
  }
  return {
    allocById,
    byAlloc,
    investorByCode: new Map(db.investors.map((i) => [i['رمز المستثمر'], i])),
    partnersByInv,
    plotById: new Map(db.plots.map((p) => [p._id, p])),
    allocsByPlot,
    decisionById: new Map(db.decisions.map((d) => [d._id, d])),
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState(readLocal)
  const [city, setCityState] = useState<CityFilter>(() => (localStorage.getItem(CITY_KEY) as CityFilter) || 'الكل')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local))
  }, [local])

  const setCity = useCallback((c: CityFilter) => {
    setCityState(c)
    localStorage.setItem(CITY_KEY, c)
  }, [])

  const db = useMemo(() => {
    const out = {} as DB
    for (const t of TABLES) out[t.id] = [...(DATA.db[t.id] ?? []), ...(local[t.id] ?? [])]
    return out
  }, [local])

  const idx = useMemo(() => buildIndex(db), [db])

  const add = useCallback((records: Partial<Record<TableId, Rec[]>>) => {
    setLocal((prev) => {
      const next = { ...prev }
      for (const [t, rows] of Object.entries(records) as [TableId, Rec[]][]) {
        next[t] = [...(next[t] ?? []), ...rows.map((r) => ({ ...r, _local: true }))]
      }
      return next
    })
  }, [])

  const reset = useCallback(() => setLocal({}), [])
  const localCount = Object.values(local).reduce((n, rows) => n + (rows?.length ?? 0), 0)

  return (
    <StoreContext.Provider value={{ db, idx, city, setCity, add, reset, localCount }}>{children}</StoreContext.Provider>
  )
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('StoreProvider مفقود')
  return ctx
}

/** فلترة حسب المدينة المختارة في الأعلى */
export function byCity(rows: Rec[], city: CityFilter): Rec[] {
  if (city === 'الكل') return rows
  return rows.filter((r) => (r['المدينة'] ? r['المدينة'] === city : (r._cities ?? []).includes(city)))
}

let seq = Date.now() % 100000
export function localId(prefix: string): string {
  seq += 1
  return `${prefix}-محلي-${seq}`
}

/**
 * الحالة المعروضة للتخصيص: الحالة المخزنة، ثم آخر حدث إلغاء/طي إلغاء مُدخل من الفورمات.
 * (الحالة في الهيكل حقل مخزن، والأحداث لا تحذف أي سجل.)
 */
export function effectiveStatus(a: Rec, idx: Index): string | null {
  const events = (idx.byAlloc.events.get(a._id) ?? []).filter((e) => e._local)
  const last = [...events].reverse().find((e) => ['إلغاء تخصيص', 'طي إلغاء', 'نقل ملكية كامل', 'دمج'].includes(e['نوع الحدث']))
  if (!last) return a['الحالة الحالية']
  return (
    { 'إلغاء تخصيص': 'ملغى', 'طي إلغاء': 'فعّال', 'نقل ملكية كامل': 'منقول ملكية', 'دمج': 'مدموج' } as Record<string, string>
  )[last['نوع الحدث']]
}

export function investorName(code: string | null | undefined, idx: Index): string {
  if (!code) return '—'
  return idx.investorByCode.get(code)?.['الاسم الكامل / اسم المنشأة'] ?? code
}

export function plotsOf(allocId: string, idx: Index): string[] {
  return (idx.byAlloc.allocation_plots.get(allocId) ?? []).map((p) => p['رقم المقسم الموحد'])
}
