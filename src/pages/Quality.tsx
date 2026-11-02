import { FileWarning, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card, PageHeader, Stat, cls } from '../components/ui'
import { DATA } from '../data/load'
import { useStore } from '../data/store'
import { CITIES } from '../schema/schema'

const COLORS: Record<string, string> = { 'عدرا': '#1f4e79', 'حسياء': '#b8892b' }

export function Quality() {
  const { city } = useStore()
  const q = DATA.quality
  const cities = city === 'الكل' ? [...CITIES] : [city]
  const issues = q.issues.filter((i) => cities.some((c) => i.counts[c] > 0))
  const total = (i: (typeof issues)[number]) => cities.reduce((n, c) => n + (i.counts[c] ?? 0), 0)
  const sorted = [...issues].sort((x, y) => total(y) - total(x))
  const [open, setOpen] = useState<string | null>(sorted[0]?.id ?? null)
  const chart = sorted.map((i) => ({ name: i.title, ...Object.fromEntries(cities.map((c) => [c, i.counts[c]])) }))
  const high = sorted.filter((i) => i.severity === 'مرتفع').length

  return (
    <div className="fade-in">
      <PageHeader kicker="quality_report.json — محسوب على كامل الملفين، لا على العينة" title="جودة البيانات"
        subtitle="كل نوع مشكلة وُجد في الملفات الحالية، مع عدد مرات ظهوره وأمثلة حقيقية (رقم الشيت والسطر والعمود). أرقام الهويات في الأمثلة محجوبة." />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Stat label="أنواع المشاكل" value={sorted.length} icon={<ShieldAlert size={16} />} />
        <Stat label="أنواع عالية الخطورة" value={high} tone="red" icon={<FileWarning size={16} />} />
        {cities.map((c) => <Stat key={c} label={`مواضع المشاكل — ${c}`} value={q.issues.reduce((n, i) => n + i.counts[c], 0).toLocaleString('en-US')} tone={c === 'عدرا' ? 'brand' : 'gold'} hint={DATA.quality.files[c]} />)}
      </div>
      <Card title="عدد المواضع حسب نوع المشكلة" className="mb-5">
        <div dir="ltr" style={{ height: Math.max(320, chart.length * 30) }}>
          <ResponsiveContainer>
            <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" scale="sqrt" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" orientation="right" width={230} tick={{ fontSize: 12, fontFamily: 'Tajawal' }} />
              <Tooltip contentStyle={{ fontFamily: 'Tajawal', direction: 'rtl' }} />
              <Legend wrapperStyle={{ fontFamily: 'Tajawal' }} />
              {cities.map((c) => <Bar key={c} dataKey={c} fill={COLORS[c]} radius={[0, 4, 4, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-slate-400">المحور بمقياس جذري لتظهر المشاكل الصغيرة بجانب الكبيرة.</p>
      </Card>
      <div className="space-y-3">
        {sorted.map((i) => {
          const ex = i.examples.filter((e) => cities.includes(e.city as never))
          const isOpen = open === i.id
          return (
            <div key={i.id} className="card">
              <button onClick={() => setOpen(isOpen ? null : i.id)} className="flex w-full items-start gap-4 px-5 py-4 text-right">
                <Badge value={i.severity} />
                <div className="flex-1">
                  <div className="font-semibold text-brand-900">{i.title}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{i.desc}</div>
                </div>
                <div className="flex gap-4">
                  {cities.map((c) => (
                    <div key={c} className="text-center">
                      <div className={cls('num text-xl font-bold', i.counts[c] ? 'text-slate-800' : 'text-slate-300')}>{i.counts[c].toLocaleString('en-US')}</div>
                      <div className="text-[11px] text-slate-400">{c}</div>
                    </div>
                  ))}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-3 fade-in">
                  <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><b>في الهيكل الجديد:</b> {i.fix}</div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                      <th className="px-2 py-2">المدينة</th><th className="px-2 py-2">الشيت</th><th className="px-2 py-2">السطر</th>
                      <th className="px-2 py-2">العمود</th><th className="px-2 py-2">القيمة كما وردت</th><th className="px-2 py-2">ملاحظة</th>
                    </tr></thead>
                    <tbody>
                      {ex.map((e, k) => (
                        <tr key={k} className="border-b border-slate-100 align-top">
                          <td className="px-2 py-2"><Badge value={e.city} /></td>
                          <td className="px-2 py-2 text-slate-600">{e.sheet ?? '—'}</td>
                          <td className="num px-2 py-2 text-slate-600">{e.row ?? '—'}</td>
                          <td className="num px-2 py-2 text-slate-600">{e.col ?? '—'}</td>
                          <td className="px-2 py-2"><code className="whitespace-pre-wrap rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">{e.value}</code></td>
                          <td className="px-2 py-2 text-xs text-slate-500">{e.note}</td>
                        </tr>
                      ))}
                      {!ex.length && <tr><td colSpan={6} className="py-4 text-center text-slate-400">لا أمثلة لهذه المدينة</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
