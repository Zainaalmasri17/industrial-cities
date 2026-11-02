import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { byCity, effectiveStatus, investorName, plotsOf, useStore } from '../data/store'
import { Badge, cls } from './ui'

/** اختيار إضبارة (تخصيص) بالبحث برقم الإضبارة أو اسم المستثمر أو رقم المقسم */
export function AllocPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const { db, idx, city } = useStore()
  const [q, setQ] = useState('')
  const sel = value ? idx.allocById.get(value) : undefined
  const results = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    return byCity(db.allocations, city).filter((a) =>
      String(a['رقم الإضبارة'] ?? '').includes(t) || investorName(a['رمز المستثمر'], idx).includes(t) || plotsOf(a._id, idx).some((p) => p.includes(t)),
    ).slice(0, 8)
  }, [q, db, idx, city])

  if (sel)
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
        <div className="flex-1">
          <div className="font-semibold text-brand-900">إضبارة {sel['رقم الإضبارة'] ?? '(بدون رقم)'} — {investorName(sel['رمز المستثمر'], idx)}</div>
          <div className="mt-0.5 flex gap-2 text-xs text-slate-500"><Badge value={sel['المدينة']} /> المقاسم: <span className="num">{plotsOf(sel._id, idx).join(' ، ')}</span> <Badge value={effectiveStatus(sel, idx) ?? '—'} /></div>
        </div>
        <button className="text-sm text-brand-700 hover:underline" onClick={() => onChange('')}>تغيير</button>
      </div>
    )
  return (
    <div className="relative">
      <Search size={16} className="absolute right-3 top-3 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم الإضبارة أو اسم المستثمر أو رقم المقسم…"
        className={cls('w-full rounded-lg border py-2.5 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-brand-100', error ? 'border-red-400' : 'border-slate-300')} />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      {results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          {results.map((a) => (
            <button key={a._id} onClick={() => { onChange(a._id); setQ('') }} className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2 text-right text-sm hover:bg-brand-50">
              <Badge value={a['المدينة']} />
              <span className="num w-16 font-semibold">{a['رقم الإضبارة'] ?? '—'}</span>
              <span className="flex-1 truncate">{investorName(a['رمز المستثمر'], idx)}</span>
              <span className="num text-xs text-slate-400">{plotsOf(a._id, idx).slice(0, 3).join('، ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
