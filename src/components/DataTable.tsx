import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Filter, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Rec } from '../data/load'
import type { Field, TableId } from '../schema/schema'
import { TABLE } from '../schema/schema'
import { Badge, ReviewFlag, Value, cls } from './ui'

export interface Column {
  key: string
  label: string
  field?: Field
  render?: (r: Rec) => ReactNode
  value?: (r: Rec) => unknown
  filter?: boolean
  hidden?: boolean
}

/** أعمدة جدول من الهيكل مباشرة (بنفس أسماء الحقول) */
export function schemaColumns(table: TableId, visible?: string[], filters: string[] = []): Column[] {
  return TABLE[table].fields.map((f) => ({
    key: f.name,
    label: f.name,
    field: f,
    filter: f.type === 'list' || f.type === 'bool' || filters.includes(f.name),
    hidden: visible ? !visible.includes(f.name) : false,
  }))
}

const valueOf = (c: Column, r: Rec) => (c.value ? c.value(r) : r[c.key])
const asText = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : String(v))

export function DataTable({ rows, columns, onRowClick, storageKey, emptyText = 'لا توجد سجلات', toolbar }: {
  rows: Rec[]
  columns: Column[]
  onRowClick?: (r: Rec) => void
  storageKey: string
  emptyText?: string
  toolbar?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [reviewOnly, setReviewOnly] = useState(false)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`cols:${storageKey}`)
      if (saved) return new Set(JSON.parse(saved))
    } catch { /* تجاهل */ }
    return new Set(columns.filter((c) => c.hidden).map((c) => c.key))
  })
  const [showCols, setShowCols] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(`cols:${storageKey}`, JSON.stringify([...hidden]))
  }, [hidden, storageKey])
  useEffect(() => setPage(0), [query, filters, reviewOnly, rows])
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const visible = columns.filter((c) => !hidden.has(c.key))
  const filterCols = columns.filter((c) => c.filter)

  const options = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const c of filterCols) {
      const set = new Set<string>()
      for (const r of rows) {
        const v = asText(valueOf(c, r))
        if (v) set.add(v)
      }
      out[c.key] = [...set].sort((a, b) => a.localeCompare(b, 'ar'))
    }
    return out
  }, [rows, filterCols.map((c) => c.key).join('|')])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter((r) => {
      if (reviewOnly && !r._review?.length) return false
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue
        const c = columns.find((x) => x.key === k)!
        const cell = asText(valueOf(c, r))
        if (v === '__empty__' ? cell !== '' : cell !== v) return false
      }
      if (!q) return true
      return columns.some((c) => asText(valueOf(c, r)).toLowerCase().includes(q)) || r._id.toLowerCase().includes(q)
    })
    if (sort) {
      const c = columns.find((x) => x.key === sort.key)
      if (c) {
        out = [...out].sort((a, b) => {
          const va = valueOf(c, a), vb = valueOf(c, b)
          if (va == null || va === '') return 1
          if (vb == null || vb === '') return -1
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir
          return asText(va).localeCompare(asText(vb), 'ar', { numeric: true }) * sort.dir
        })
      }
    }
    return out
  }, [rows, query, filters, reviewOnly, sort, columns])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const activeFilters = Object.values(filters).filter(Boolean).length
  const reviewCount = rows.filter((r) => r._review?.length).length

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-64 flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث في كل الأعمدة…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100" />
        </div>
        <button onClick={() => setShowFilters((x) => !x)}
          className={cls('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ring-1 ring-inset',
            showFilters || activeFilters ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')}>
          <Filter size={15} /> فلاتر {activeFilters > 0 && <span className="num rounded-full bg-brand-700 px-1.5 text-xs text-white">{activeFilters}</span>}
        </button>
        <label className={cls('inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm ring-1 ring-inset',
          reviewOnly ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')}>
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="accent-amber-600" />
          المعلّمة للمراجعة فقط <span className="num text-xs text-slate-400">({reviewCount})</span>
        </label>
        <div className="relative" ref={colsRef}>
          <button onClick={() => setShowCols((x) => !x)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            <Columns3 size={15} /> الأعمدة <span className="num text-xs text-slate-400">{visible.length}/{columns.length}</span>
          </button>
          {showCols && (
            <div className="absolute left-0 top-full z-40 mt-1 max-h-96 w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl scroll-thin">
              <div className="mb-1 flex justify-between px-2 py-1 text-xs">
                <button className="text-brand-700 hover:underline" onClick={() => setHidden(new Set())}>إظهار الكل</button>
                <button className="text-slate-500 hover:underline" onClick={() => setHidden(new Set(columns.filter((c) => c.hidden).map((c) => c.key)))}>الافتراضي</button>
              </div>
              {columns.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="accent-brand-700" checked={!hidden.has(c.key)}
                    onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n })} />
                  <span className="flex-1">{c.label}</span>
                  {c.field?.required && <span className="text-xs text-rose-500">إلزامي</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        {toolbar}
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/60 p-3 fade-in">
          {filterCols.map((c) => (
            <label key={c.key} className="text-xs text-slate-500">
              <span className="mb-1 block">{c.label}</span>
              <select value={filters[c.key] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                className="max-w-52 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700">
                <option value="">الكل</option>
                <option value="__empty__">(فارغ)</option>
                {options[c.key]?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
          {activeFilters > 0 && (
            <button onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
              <X size={14} /> مسح الفلاتر
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-right text-xs">
              <th className="w-8 px-2 py-2.5" title="needs_review" />
              {visible.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 font-bold">
                    {c.label}
                    {c.field?.required && <span className="text-gold-300" title="إلزامي حسب الهيكل">*</span>}
                    {sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-30" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r._id} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cls('border-b border-slate-100 align-top', onRowClick && 'cursor-pointer hover:bg-brand-50/50', r._local && 'bg-emerald-50/40')}>
                <td className="px-2 py-2.5 text-center">
                  <ReviewFlag reasons={r._review} />
                </td>
                {visible.map((c) => (
                  <td key={c.key} className="max-w-80 px-3 py-2.5 leading-relaxed">
                    {c.render ? c.render(r) : <Value field={c.field} value={valueOf(c, r)} />}
                    {c === visible[0] && r._local && <Badge value="جديد (محلي)" className="mr-1 !bg-emerald-100 !text-emerald-800" />}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={visible.length + 1} className="py-12 text-center text-slate-400">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-500">
        <div>
          <span className="num font-semibold text-slate-700">{filtered.length.toLocaleString('en-US')}</span> سجل
          {filtered.length !== rows.length && <> من أصل <span className="num">{rows.length.toLocaleString('en-US')}</span></>}
        </div>
        <div className="flex items-center gap-3">
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }} className="rounded-md border border-slate-200 px-2 py-1">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} بالصفحة</option>)}
          </select>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 ring-1 ring-slate-200 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          <span className="num">{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 ring-1 ring-slate-200 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
