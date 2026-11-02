import { AlertTriangle } from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { cls } from '../../components/ui'
import { M_CITIES, M_CITY_COLOR, MONTHLY, type MCity, type NV } from '../../data/monthly'

export type MFilter = 'الكل' | MCity

export const MCityCtx = createContext<{ city: MFilter; setCity: (c: MFilter) => void }>({ city: 'الكل', setCity: () => {} })
export const useMCity = () => {
  const { city, setCity } = useContext(MCityCtx)
  const cities: MCity[] = city === 'الكل' ? [...M_CITIES] : [city]
  return { city, setCity, cities }
}

export const cityData = (c: MCity) => MONTHLY.byCity[c]

export const PALETTE = ['#0a5346', '#c7a66b', '#2f6fa3', '#b5523b', '#6d5a9e', '#1a8f79', '#8a6a2f', '#5fa996', '#dbc08f', '#7d8f89', '#a9c9bf', '#04302a']
export const FONT = { fontFamily: 'Tajawal', fontSize: 12 }
export const TT = { contentStyle: { ...FONT, direction: 'rtl' as const, borderRadius: 10, border: '1px solid rgba(10,83,70,.2)' } }

export const fmt = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits })

/** مبالغ بالليرة: مليون / مليار */
export const fmtSYP = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1e9) return `${fmt(n / 1e9, 2)} مليار`
  if (Math.abs(n) >= 1e6) return `${fmt(n / 1e6, 1)} مليون`
  return fmt(n, 0)
}

export function Empty({ text = 'لا توجد بيانات لهذه المدينة في الملف المستلم' }: { text?: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{text}</div>
}

export function CityDot({ city, className }: { city: MCity; className?: string }) {
  return <span className={cls('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ background: M_CITY_COLOR[city] }} />
}

export function CityName({ city }: { city: MCity }) {
  return <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: M_CITY_COLOR[city] }}><CityDot city={city} />{city}</span>
}

export function Section({ title, children, cols = 'lg:grid-cols-2', note }: { title: string; children: ReactNode; cols?: string; note?: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1 flex items-center gap-3 text-lg font-extrabold text-brand-800">
        <span className="h-0.5 w-8 rounded-full bg-gold-500" />{title}
      </h2>
      {note && <p className="mb-3 mr-11 text-[13px] leading-relaxed text-slate-500">{note}</p>}
      <div className={cls('mt-3 grid gap-5', cols)}>{children}</div>
    </section>
  )
}

/** تمييز القيم غير الموجودة في القائمة المنسدلة للقالب */
export function isOffList(listName: string, value: string) {
  const l = MONTHLY.lists[listName]
  return !!l && value !== 'غير محدد' && !l.includes(value)
}

export function Donut({ data, offList, height = 190 }: { data: NV[]; offList?: string; height?: number }) {
  const total = (data ?? []).reduce((n, d) => n + d.value, 0)
  if (!total) return <Empty />
  return (
    <div className="flex items-center gap-4">
      <div dir="ltr" style={{ width: 150, height }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="#fff">
              {data.map((d, i) => <Cell key={i} fill={d.name === 'غير محدد' ? '#d5dbd9' : PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-[13px]">
        {data.slice(0, 9).map((d, i) => {
          const bad = offList && isOffList(offList, d.name)
          return (
            <li key={d.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.name === 'غير محدد' ? '#d5dbd9' : PALETTE[i % PALETTE.length] }} />
              <span className={cls('min-w-0 flex-1 truncate', bad ? 'font-bold text-red-700' : d.name === 'غير محدد' ? 'italic text-slate-400' : 'text-slate-600')}
                title={bad ? `${d.name} — ليست من القائمة المنسدلة للقالب` : d.name}>
                {d.name}{bad && <AlertTriangle size={12} className="mr-1 inline text-red-500" />}
              </span>
              <span className="num font-bold text-slate-800">{fmt(d.value)}</span>
              <span className="num w-10 text-left text-xs text-slate-400">{d.value / total < 0.01 ? '<1' : Math.round((d.value / total) * 100)}%</span>
            </li>
          )
        })}
        {data.length > 9 && <li className="text-xs text-slate-400">و{data.length - 9} قيم أخرى</li>}
      </ul>
    </div>
  )
}

export function HBars({ data, color = '#0a5346', offList, max: maxItems = 12 }: { data: NV[]; color?: string; offList?: string; max?: number }) {
  if (!data?.length) return <Empty />
  const shown = data.slice(0, maxItems)
  const max = Math.max(...shown.map((d) => d.value), 1)
  return (
    <ul className="space-y-2">
      {shown.map((d) => {
        const bad = offList && isOffList(offList, d.name)
        return (
          <li key={d.name} className="text-[13px]">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={cls('truncate', bad ? 'font-bold text-red-700' : d.name === 'غير محدد' ? 'italic text-slate-400' : 'text-slate-600')}
                title={bad ? `${d.name} — ليست من القائمة المنسدلة للقالب` : d.name}>
                {d.name}{bad && <AlertTriangle size={12} className="mr-1 inline text-red-500" />}
              </span>
              <span className="num font-bold text-slate-800">{fmt(d.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-brand-50">
              <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: bad ? '#dc2626' : d.name === 'غير محدد' ? '#cbd5d1' : color }} />
            </div>
          </li>
        )
      })}
      {data.length > maxItems && <li className="text-xs text-slate-400">و{data.length - maxItems} قيم أخرى</li>}
    </ul>
  )
}

export function Columns({ data, keys, xKey = 'name', height = 280, stacked, colors, names, layout }: {
  data: Array<Record<string, unknown>>; keys: string[]; xKey?: string; height?: number; stacked?: boolean
  colors?: Record<string, string>; names?: Record<string, string>; layout?: 'vertical'
}) {
  if (!data?.length) return <Empty />
  const tilt = !layout && data.length > 6
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={!!layout} horizontal={!layout} stroke="rgba(10,83,70,.12)" />
          {layout ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey={xKey} orientation="right" width={92} tick={FONT} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={FONT} interval={0} angle={tilt ? -28 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 62 : 30} />
              <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            </>
          )}
          <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
          {keys.length > 1 && <Legend wrapperStyle={FONT} />}
          {keys.map((k, i) => (
            <Bar isAnimationActive={false} key={k} dataKey={k} name={names?.[k] ?? k} stackId={stacked ? 's' : undefined} fill={colors?.[k] ?? PALETTE[i % PALETTE.length]}
              radius={stacked ? 0 : layout ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={44} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** بطاقة مؤشر: مجموع المدن المختارة + توزيعه على كل مدينة */
export function MKpi({ label, icon, get, unit, hint, tone = 'green', format = fmt }: {
  label: string; icon: ReactNode; get: (c: MCity) => number | null | undefined; unit?: string; hint?: ReactNode
  tone?: 'green' | 'gold' | 'red'; format?: (n: number) => string
}) {
  const { cities } = useMCity()
  const vals = cities.map((c) => [c, get(c)] as const)
  const known = vals.filter(([, v]) => v !== null && v !== undefined) as [MCity, number][]
  const total = known.reduce((n, [, v]) => n + v, 0)
  const color = tone === 'red' ? 'text-red-700' : tone === 'gold' ? 'text-gold-600' : 'text-brand-700'
  return (
    <div className="stat-box">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-bold leading-snug text-slate-500">{label}</span>
        <span className={cls('rounded-lg p-1.5', tone === 'gold' ? 'bg-gold-100 text-gold-600' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700')}>{icon}</span>
      </div>
      <div className={cls('num mt-1 text-right text-[24px] font-extrabold leading-tight', color)}>
        {known.length ? format(total) : <span className="text-base text-slate-400">غير متوفر</span>}
        {unit && known.length > 0 && <span className="mr-1 text-xs font-bold text-slate-400">{unit}</span>}
      </div>
      {cities.length > 1 && (
        <div className="mt-1.5 grid grid-cols-1 gap-y-0.5 text-[11.5px] font-bold">
          {vals.map(([c, v]) => (
            <span key={c} className="flex items-center gap-1.5 text-slate-500">
              <CityDot city={c} className="!h-2 !w-2" />{c}
              <span className="flex-1 border-b border-dotted border-slate-200" />
              <span className={cls('num', v === null || v === undefined ? 'text-slate-300' : 'text-slate-700')}>{v === null || v === undefined ? 'غير متوفر' : format(v)}</span>
            </span>
          ))}
        </div>
      )}
      {hint && <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{hint}</div>}
    </div>
  )
}

/** شريط نسبة صغير */
export function Progress({ value, color = '#0a5346', flagged }: { value: number | null; color?: string; flagged?: boolean }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: flagged ? '#d97706' : color }} />
      </div>
      <span className={cls('num w-10 text-left text-xs font-bold', flagged ? 'text-amber-700' : 'text-slate-600')}>{fmt(value, 0)}%</span>
    </div>
  )
}
