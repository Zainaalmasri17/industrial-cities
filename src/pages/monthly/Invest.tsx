import { useMemo } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { Badge, Card } from '../../components/ui'
import type { Rec } from '../../data/load'
import { M_CITY_COLOR, type MCity, type Project } from '../../data/monthly'
import { CityName, Columns, Empty, Section, cityData, fmt, fmtSYP, Progress, useMCity } from './shared'

const STATUS_COLORS: Record<string, string> = {
  'متعاقد': '#2f6fa3', 'متعاقد وقيد التنفيذ': '#0a5346', 'متعاقد ومتوقف': '#dc2626', 'منتهٍ': '#c7a66b', 'غير محدد': '#cbd5d1',
}

const sum = (ps: Project[], f: (p: Project) => number | null) => ps.reduce((n, p) => n + (f(p) ?? 0), 0)

function CityTotals({ c }: { c: MCity }) {
  const ps = cityData(c).projects ?? []
  if (!ps.length) return <Card title={<CityName city={c} />}><Empty /></Card>
  const planned = sum(ps, (p) => p.planned), revised = sum(ps, (p) => p.revised), contract = sum(ps, (p) => p.contract), spent = sum(ps, (p) => p.spent)
  const fin = ps.filter((p) => p.financial !== null)
  const avgFin = fin.length ? fin.reduce((n, p) => n + (p.financial ?? 0), 0) / fin.length : null
  const tiles: [string, string][] = [
    ['عدد المشاريع', fmt(ps.length)], ['الاعتماد المخطط', fmtSYP(planned)], ...(revised ? [['الاعتماد المعدل', fmtSYP(revised)] as [string, string]] : []),
    ['قيمة العقود', fmtSYP(contract)], ['المنفق حتى تاريخه', fmtSYP(spent)], ['متوسط التنفيذ المالي', avgFin === null ? '—' : `${fmt(avgFin, 0)}%`],
  ]
  return (
    <Card title={<CityName city={c} />}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#faf9f5] p-2.5 ring-1 ring-[var(--border)]">
            <div className="text-[11.5px] font-bold text-slate-500">{k}</div>
            <div className="num money mt-0.5 text-right text-[16px] font-extrabold text-brand-700">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11.5px] font-bold text-slate-500"><span>المنفق من الاعتماد المخطط</span><span className="num">{planned ? fmt((spent / planned) * 100, 1) : 0}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${planned ? Math.min(100, (spent / planned) * 100) : 0}%`, background: M_CITY_COLOR[c] }} /></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">كل المبالغ بالليرة السورية حسب تعليمات القالب.</p>
    </Card>
  )
}

export function Invest() {
  const { cities } = useMCity()
  const projects = cities.flatMap((c) => cityData(c).projects ?? [])
  const statusData = cities.map((c) => {
    const m: Record<string, number> = {}
    for (const p of cityData(c).projects ?? []) m[p['حالة المشروع'] ?? 'غير محدد'] = (m[p['حالة المشروع'] ?? 'غير محدد'] ?? 0) + 1
    return { name: c, ...m }
  })
  const statusKeys = Object.keys(STATUS_COLORS).filter((k) => statusData.some((d) => (d as Record<string, unknown>)[k]))
  const typeData = (() => {
    const m: Record<string, Record<string, number>> = {}
    for (const p of projects) {
      const t = p['نوع المشروع'] ?? 'غير محدد'
      m[t] ??= {}
      m[t][p['المدينة']] = (m[t][p['المدينة']] ?? 0) + (p.planned ?? 0) / 1e6
    }
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => Object.values(b).reduce((n: number, x) => n + (typeof x === 'number' ? x : 0), 0) - Object.values(a).reduce((n: number, x) => n + (typeof x === 'number' ? x : 0), 0))
  })()

  const rows: Rec[] = useMemo(() => projects.map((p) => ({ ...p, _id: `${p['المدينة']}-${p._row}`, _src: { sheet: 'الخطة الاستثمارية', row: p._row } })), [projects])
  const columns: Column[] = [
    { key: 'المدينة', label: 'المدينة', filter: true, render: (r) => <CityName city={r['المدينة']} /> },
    { key: 'اسم المشروع', label: 'اسم المشروع', render: (r) => <span className="line-clamp-3 min-w-64 text-[13px]" title={r['اسم المشروع']}>{r['اسم المشروع']}</span> },
    { key: 'نوع المشروع', label: 'النوع', filter: true },
    { key: 'حالة المشروع', label: 'الحالة', filter: true, render: (r) => (r['حالة المشروع'] ? <Badge value={r['حالة المشروع']} className={r['حالة المشروع'] === 'متعاقد ومتوقف' ? '!bg-red-50 !text-red-700' : r['حالة المشروع'] === 'منتهٍ' ? '!bg-gold-100 !text-gold-600' : ''} /> : <span className="text-xs italic text-rose-400">فارغ</span>) },
    { key: 'planned', label: 'الاعتماد المخطط', render: (r) => <span className="num money whitespace-nowrap">{fmtSYP(r.planned)}</span> },
    { key: 'contract', label: 'قيمة العقد', render: (r) => <span className="num money whitespace-nowrap">{fmtSYP(r.contract)}</span> },
    { key: 'spent', label: 'المنفق', render: (r) => <span className="num money whitespace-nowrap">{fmtSYP(r.spent)}</span> },
    { key: 'physical', label: 'التنفيذ المادي', render: (r) => <Progress value={r.physical} flagged={r._review.some((x: string) => x.includes('المادي'))} /> },
    { key: 'financial', label: 'التنفيذ المالي', render: (r) => <Progress value={r.financial} color="#c7a66b" flagged={r._review.some((x: string) => x.includes('المالي'))} /> },
    { key: 'الجهة المنفذة', label: 'الجهة المنفذة' },
    { key: 'dContract', label: 'تاريخ التعاقد', hidden: true },
    { key: 'dStart', label: 'تاريخ المباشرة', hidden: true },
    { key: 'dStop', label: 'تاريخ التوقف', hidden: true },
    { key: 'سبب التوقف', label: 'سبب التوقف', hidden: true },
    { key: 'dEnd', label: 'تاريخ الانتهاء', hidden: true },
    { key: 'revised', label: 'الاعتماد المعدل', hidden: true, render: (r) => <span className="num money">{fmtSYP(r.revised)}</span> },
    { key: 'القطاع', label: 'القطاع', hidden: true },
    { key: 'الحساب الجزئي', label: 'الحساب الجزئي', hidden: true },
    { key: 'ملاحظات', label: 'ملاحظات', hidden: true },
    { key: '_row', label: 'السطر في الإكسل', hidden: true },
  ]

  return (
    <>
      <Section title="الخطة الاستثمارية حسب المدينة" cols="lg:grid-cols-2 2xl:grid-cols-3"
        note="من قالب الخطة الاستثمارية (موازنة الدولة للبنى التحتية). حسياء والشيخ نجار استخدمتا نسخة مختلفة من القالب: فيها (الاعتماد المعدل) وليس فيها (نوع المشروع) و(نسبة التنفيذ المادي).">
        {cities.map((c) => <CityTotals key={c} c={c} />)}
      </Section>

      <Section title="الحالة والنوع">
        <Card title="حالة المشاريع">
          <Columns data={statusData} keys={statusKeys} stacked colors={STATUS_COLORS} height={280} />
          <p className="mt-2 text-[11.5px] text-slate-400">
            «غير محدد»: عمود حالة المشروع فارغ —{' '}
            {cities.map((c) => [c, cityData(c).projects ?? []] as const).filter(([, ps]) => ps.some((p) => !p['حالة المشروع']))
              .map(([c, ps]) => `${ps.filter((p) => !p['حالة المشروع']).length} من ${ps.length} في ${c}`).join('، ') || 'لا يوجد'}.
          </p>
        </Card>
        <Card title="الاعتماد المخطط حسب نوع المشروع (مليون ل.س)">
          <Columns data={typeData} keys={cities} colors={Object.fromEntries(cities.map((c) => [c, M_CITY_COLOR[c]]))} stacked height={280} />
          <p className="mt-2 text-[11.5px] text-slate-400">حسياء والشيخ نجار تظهران تحت «غير محدد» لأن قالبهما لا يحوي عمود النوع.</p>
        </Card>
      </Section>

      <Section title="كل المشاريع" cols="grid-cols-1" note="ابحث وفلتر حسب المدينة والحالة. المثلث البرتقالي يعني أن في السطر ملاحظة (مثل نسب مكتوبة ككسور عرضناها من 100). أعمدة التواريخ مخفية — أظهرها من زر الأعمدة.">
        <DataTable rows={rows} columns={columns} storageKey="monthly-projects" />
      </Section>
    </>
  )
}
