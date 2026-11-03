import { ChevronDown, FileWarning, ShieldAlert, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, Stat, cls } from '../../components/ui'
import { MONTHLY, type MIssue } from '../../data/monthly'
import { CityDot, CityName, Columns, Section, cityData, fmt, useMCity } from './shared'

const SEV_ORDER = { 'مرتفع': 0, 'متوسط': 1, 'منخفض': 2 } as const
const SEV_COLORS = { 'مرتفع': '#dc2626', 'متوسط': '#d97706', 'منخفض': '#94a3b8' }
const TEMPLATES = ['الكل', 'عام', 'المقاسم', 'الأقساط', 'الخطة الاستثمارية', 'الإنتاجية', 'الإنجازات والتحديات']

export function Issues() {
  const { cities } = useMCity()
  const [sev, setSev] = useState<'الكل' | keyof typeof SEV_ORDER>('الكل')
  const [tpl, setTpl] = useState('الكل')
  const [open, setOpen] = useState<string | null>(null)
  const total = (i: MIssue) => cities.reduce((n, c) => n + (i.counts[c] ?? 0), 0)
  const all = MONTHLY.issues.filter((i) => total(i) > 0)
  const list = all
    .filter((i) => (sev === 'الكل' || i.severity === sev) && (tpl === 'الكل' || i.template === tpl))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || total(b) - total(a))

  const bySev = cities.map((c) => ({
    name: c,
    ...Object.fromEntries((['مرتفع', 'متوسط', 'منخفض'] as const).map((s) => [s, MONTHLY.issues.filter((i) => i.severity === s && i.counts[c] > 0).length])),
  }))

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4 [&>*]:min-w-0">
        <Stat label="أنواع المشاكل" value={all.length} icon={<ShieldAlert size={16} />} />
        <Stat label="عالية الخطورة" value={all.filter((i) => i.severity === 'مرتفع').length} tone="red" icon={<FileWarning size={16} />} />
        <Stat label="مواضع المشاكل" value={fmt(all.reduce((n, i) => n + total(i), 0))} tone="gold" hint="خلية أو سطر أو ملف" />
        <Stat label="مقاسم معلّمة للمراجعة" value={fmt(cities.reduce((n, c) => n + (cityData(c).summary?.flagged ?? 0), 0))} tone="red"
          hint={`من ${fmt(cities.reduce((n, c) => n + (cityData(c).summary?.plots ?? 0), 0))} مقسم — تجدها في «سجل المقاسم»`} />
      </div>

      <Section title="بطاقة كل مدينة">
        <Card title="عدد أنواع المشاكل حسب الخطورة">
          <Columns data={bySev} keys={['مرتفع', 'متوسط', 'منخفض']} stacked colors={SEV_COLORS} height={260} />
        </Card>
        <Card title="نسبة المقاسم السليمة (بلا أي ملاحظة)">
          <ul className="space-y-3">
            {cities.map((c) => {
              const s = cityData(c).summary
              const ok = s ? ((s.plots - s.flagged) / s.plots) * 100 : 0
              return (
                <li key={c}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <CityName city={c} />
                    <span className="num font-bold text-slate-700">{fmt(ok, 0)}% <span className="text-xs font-normal text-slate-400">({fmt(s ? s.plots - s.flagged : 0)} من {fmt(s?.plots)})</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-red-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${ok}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">المقسم «سليم» إن لم تظهر عليه أي مشكلة من فحوص شيت المقاسم والأقساط. مشكلة واحدة (مثل خانة إلزامية فارغة) تكفي ليُعلَّم.</p>
        </Card>
      </Section>

      <Section title="كل المشاكل" cols="grid-cols-1" note="اضغط على أي مشكلة لرؤية أمثلة حقيقية بالشيت والسطر والعمود والقيمة كما وردت. الأمثلة حتى 8 لكل مدينة.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400">الخطورة:</span>
          {(['الكل', 'مرتفع', 'متوسط', 'منخفض'] as const).map((s) => (
            <button key={s} onClick={() => setSev(s)} className={cls('rounded-full px-3 py-1 text-[13px] font-bold ring-1 ring-inset',
              sev === s ? 'bg-brand-700 text-white ring-brand-700' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')}>{s}</button>
          ))}
          <span className="mr-3 text-xs font-bold text-slate-400">القالب:</span>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px]">
            {TEMPLATES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <span className="num mr-auto text-xs text-slate-400">{list.length} نوع</span>
        </div>

        <div className="space-y-2.5">
          {list.map((i) => {
            const isOpen = open === i.id
            const ex = i.examples.filter((e) => cities.includes(e.city))
            return (
              <div key={i.id} className="card">
                <button onClick={() => setOpen(isOpen ? null : i.id)} className="flex w-full flex-wrap items-start gap-3 px-5 py-3.5 text-right">
                  <Badge value={i.severity} />
                  <div className="min-w-60 flex-1">
                    <div className="font-bold text-brand-900">{i.title} <span className="mr-1 text-xs font-normal text-slate-400">· {i.template}</span></div>
                    <div className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{i.desc}</div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {cities.map((c) => (
                      <div key={c} className={cls('min-w-14 text-center', !i.counts[c] && 'opacity-30')}>
                        <div className={cls('num text-[15px] font-extrabold', i.counts[c] ? 'text-slate-800' : 'text-slate-300')}>{fmt(i.counts[c])}</div>
                        <div className="flex items-center justify-center gap-1 text-[10.5px] font-bold text-slate-500"><CityDot city={c} className="!h-1.5 !w-1.5" />{c}</div>
                      </div>
                    ))}
                  </div>
                  <ChevronDown size={18} className={cls('mt-1 shrink-0 text-slate-400 transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-5 pb-4 pt-3 fade-in">
                    <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-[13px] text-brand-800">
                      <Wrench size={14} /> <b>الحل:</b> {i.fix}
                    </div>
                    <div className="overflow-x-auto scroll-thin">
                      <table className="data-table w-full text-[12.5px]">
                        <thead>
                          <tr className="text-right text-xs">
                            {['المدينة', 'الشيت', 'السطر', 'العمود', 'القيمة كما وردت', 'ملاحظة'].map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-2">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {ex.map((e, n) => (
                            <tr key={n} className="border-b border-slate-100 align-top">
                              <td className="whitespace-nowrap px-2.5 py-1.5"><CityName city={e.city} /></td>
                              <td className="whitespace-nowrap px-2.5 py-1.5">{e.sheet ?? '—'}</td>
                              <td className="num px-2.5 py-1.5">{e.row ?? '—'}</td>
                              <td className="num px-2.5 py-1.5 font-bold">{e.col ?? '—'}</td>
                              <td className="max-w-md px-2.5 py-1.5">
                                {e.value ? <code className="whitespace-pre-wrap break-words rounded bg-red-50 px-1.5 py-0.5 text-[12px] text-red-800">{e.value}</code> : <span className="italic text-slate-400">فارغ</span>}
                              </td>
                              <td className="max-w-sm px-2.5 py-1.5 text-slate-500">{e.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}
