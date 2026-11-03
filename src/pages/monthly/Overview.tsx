import {
  AlertTriangle, Ban, BadgeCheck, Banknote, Briefcase, Building, CalendarDays, CheckCircle2, ClipboardList, Factory, FileCheck2, FileSignature,
  FileSpreadsheet, Flag, GitMerge, Globe2, HardHat, History, KeyRound, Landmark, MapPinned, PenLine, Percent, Ruler, ShieldAlert, Trophy, Users,
  Wallet, XCircle, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '../../components/ui'
import type { Rec } from '../../data/load'
import { M_CITY_COLOR, MONTHLY, TEMPLATE_TITLE, type MCity, type NV, type PlotSummary, type TemplateKey } from '../../data/monthly'
import { YearsChart, compare } from './PlotsSection'
import { CityDot, CityName, Columns, Donut, Empty, HBars, MKpi, Section, cityData, fmt, fmtSYP, useMCity } from './shared'

const STATUS_COLORS: Record<string, string> = { 'مخصص': '#0a5346', 'شاغر': '#c7a66b', 'مكتتب عليه': '#2f6fa3', 'غير محدد': '#cbd5d1' }

const sum = <T,>(xs: T[] | undefined, f: (x: T) => number | null | undefined) => (xs ?? []).reduce((n, x) => n + (f(x) ?? 0), 0)

function FilesMatrix() {
  const { cities } = useMCity()
  const rows = MONTHLY.files.filter((f) => cities.includes(f.city))
  const keys: TemplateKey[] = ['plots', 'invest', 'prod', 'ach']
  const count = (c: MCity, k: TemplateKey) => {
    const f = MONTHLY.files.find((x) => x.city === c)?.files[k]
    if (!f) return null
    if (k === 'plots') return `${fmt(f.rows)} مقسم${f.installments ? ` · ${fmt(f.installments)} قسط` : ''}${f.previous ? ` · ${f.previous} تخصيص سابق` : ''}`
    if (k === 'invest') return `${f.rows} مشروع`
    if (k === 'prod') return f.rows ? 'سطر الشهر' : 'فارغ'
    return `${f.rows} بند`
  }
  return (
    <Card title="استلام الملفات" icon={<FileSpreadsheet size={18} />} className="lg:col-span-2">
      <div className="overflow-x-auto scroll-thin">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-right text-xs">
              <th className="px-3 py-2.5">المدينة</th>
              {keys.map((k) => <th key={k} className="px-3 py-2.5">{TEMPLATE_TITLE[k]}</th>)}
              <th className="px-3 py-2.5">مشاكل البيانات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = cityData(r.city)
              return (
                <tr key={r.city} className="border-b border-slate-100">
                  <td className="px-3 py-3"><CityName city={r.city} /></td>
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-3">
                      {r.files[k] ? (
                        <div className="flex items-start gap-1.5">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                          <div>
                            <div className="text-[13px] font-bold text-slate-700">{count(r.city, k)}</div>
                            <div className="max-w-56 truncate text-[11px] text-slate-400" title={r.files[k]!.name}>{r.files[k]!.name}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={16} /> لم يصل</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <Link to="/monthly/issues" className="group inline-flex flex-col">
                      <span className="num font-extrabold text-red-700 group-hover:underline">{fmt(d.issueCount)} موضع</span>
                      <span className="text-[11.5px] text-slate-500">{d.issueTypes} نوع، منها <b className="text-red-600">{d.highTypes}</b> عالية الخطورة</span>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-slate-400">وصلت الملفات الأربعة من كل المدن. أسماء الملفات لا تتبع قاعدة التسمية في 3 مدن (تفاصيلها في «مشاكل البيانات»).</p>
    </Card>
  )
}

function TopIssues() {
  const { cities } = useMCity()
  return (
    <Card title="أهم ما يجب تصحيحه في كل مدينة" icon={<ShieldAlert size={18} />}>
      <div className="space-y-4">
        {cities.map((c) => {
          const top = MONTHLY.issues
            .filter((i) => i.counts[c] > 0)
            .sort((a, b) => (a.severity === b.severity ? b.counts[c] - a.counts[c] : a.severity === 'مرتفع' ? -1 : b.severity === 'مرتفع' ? 1 : a.severity === 'متوسط' ? -1 : 1))
            .slice(0, 4)
          return (
            <div key={c}>
              <div className="mb-1.5"><CityName city={c} /></div>
              <ul className="space-y-1">
                {top.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-[13px]">
                    <Badge value={i.severity} />
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={i.desc}>{i.title}</span>
                    <span className="num text-xs font-bold text-slate-500">{fmt(i.counts[c])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <Link to="/monthly/issues" className="mt-4 inline-block text-sm font-bold text-gold-600 hover:underline">كل المشاكل مع الأمثلة ←</Link>
    </Card>
  )
}

/** دمج نفس التوزيع من المدن المختارة في توزيع واحد («غير محدد» في الآخر) */
function merge(cities: MCity[], key: keyof PlotSummary): NV[] {
  const m = new Map<string, number>()
  for (const c of cities) for (const x of (cityData(c).summary?.[key] as NV[] | undefined) ?? []) m.set(x.name, (m.get(x.name) ?? 0) + x.value)
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => (a.name === 'غير محدد' ? 1 : b.name === 'غير محدد' ? -1 : b.value - a.value))
}

const PLOTS_BY_CITY = new Map<MCity, Rec[]>()
for (const p of MONTHLY.plots) {
  const c = p['المدينة'] as MCity
  if (!PLOTS_BY_CITY.has(c)) PLOTS_BY_CITY.set(c, [])
  PLOTS_BY_CITY.get(c)!.push(p)
}
/** عدد المقاسم التي فيها قيمة في العمود */
const filled = (c: MCity, col: string) => PLOTS_BY_CITY.get(c)?.filter((p) => p[col]).length ?? 0

const AREA_BUCKETS: [string, number][] = [['أقل من 1000', 1000], ['1000–2500', 2500], ['2500–5000', 5000], ['5000–10000', 10000], ['1–5 هكتار', 50000], ['أكثر من 5 هكتار', Infinity]]
function areaBuckets(cities: MCity[]) {
  return AREA_BUCKETS.map(([name, hi], i) => {
    const lo = i ? AREA_BUCKETS[i - 1][1] : 0
    return { name, ...Object.fromEntries(cities.map((c) => [c, (PLOTS_BY_CITY.get(c) ?? []).filter((p) => p['المساحة م²'] > 0 && p['المساحة م²'] >= lo && p['المساحة م²'] < hi).length])) }
  })
}

/** نسبة على مستوى المدن المختارة: مجموع البسط ÷ مجموع المقام */
const ratio = (num: (c: MCity) => number | null | undefined, den: (c: MCity) => number | null | undefined, scale = 100) =>
  (known: [MCity, number][]) => {
    const d = known.reduce((n, [c]) => n + (den(c) ?? 0), 0)
    return d ? (known.reduce((n, [c]) => n + (num(c) ?? 0), 0) / d) * scale : 0
  }
const pct = (n: number) => `${fmt(n, 0)}%`

function TopInvestors() {
  const { cities } = useMCity()
  const top = cities.flatMap((c) => (cityData(c).summary?.topInvestors ?? []).map((x) => ({ ...x, city: c }))).sort((a, b) => b.value - a.value).slice(0, 12)
  if (!top.length) return <Empty />
  return (
    <ol className="space-y-1.5 text-[13px]">
      {top.map((d, i) => (
        <li key={d.city + d.name} className="flex items-center gap-2">
          <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-slate-700" title={d.name}>{d.name}</span>
          {cities.length > 1 && <CityDot city={d.city} />}
          <span className="num w-8 text-left font-bold text-gold-600">{d.value}</span>
        </li>
      ))}
    </ol>
  )
}

export function Overview() {
  const { cities } = useMCity()
  const s = (c: MCity) => cityData(c).summary
  const colors = Object.fromEntries(cities.map((c) => [c, M_CITY_COLOR[c]]))
  const statusData = cities.map((c) => ({ name: c, ...Object.fromEntries((s(c)?.byStatus ?? []).map((x) => [x.name, x.value])) }))
  const statusKeys = ['مخصص', 'شاغر', 'مكتتب عليه', 'غير محدد'].filter((k) => statusData.some((d) => (d as Record<string, unknown>)[k]))
  const ach = (c: MCity, t: string) => cityData(c).achievements?.filter((a) => a.type === t).length ?? null
  const prod = (c: MCity, k: string) => (cityData(c).productivity?.[k] as number | null | undefined) ?? null
  const planned = (c: MCity) => sum(cityData(c).projects, (p) => p.planned)
  const spent = (c: MCity) => sum(cityData(c).projects, (p) => p.spent)

  const statusCount = new Map<string, number>()
  for (const c of cities) for (const p of cityData(c).projects ?? []) statusCount.set(p['حالة المشروع'] ?? 'غير محدد', (statusCount.get(p['حالة المشروع'] ?? 'غير محدد') ?? 0) + 1)
  const projectStatus = [...statusCount.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => (a.name === 'غير محدد' ? 1 : b.name === 'غير محدد' ? -1 : b.value - a.value))

  const LIC: [string, (c: MCity) => number][] = [
    ['ترخيص إداري', (c) => s(c)?.adminLicenses ?? 0], ['رخصة بناء', (c) => s(c)?.buildingLicenses ?? 0],
    ['قرار ترخيص صناعي', (c) => filled(c, 'رقم قرار الترخيص الصناعي')], ['سجل صناعي', (c) => filled(c, 'رقم السجل الصناعي')],
    ['عقد بيع', (c) => filled(c, 'رقم عقد البيع')], ['مؤجر', (c) => s(c)?.leased ?? 0],
  ]
  const licData = LIC.map(([name, f]) => ({ name, ...Object.fromEntries(cities.map((c) => [c, f(c)])) }))
  const areaData = cities.map((c) => {
    const x = s(c)
    return { name: c, 'مخصصة': Math.round((x?.allocArea ?? 0) / 1e4), 'شاغرة': Math.round((x?.vacantArea ?? 0) / 1e4), 'أخرى': Math.round(((x?.totalArea ?? 0) - (x?.allocArea ?? 0) - (x?.vacantArea ?? 0)) / 1e4) }
  })
  const occupancy = cities.map((c) => ({ name: c, value: s(c)?.plots ? Math.round((s(c)!.allocated / s(c)!.plots) * 100) : 0 }))
  const moneyData = cities.map((c) => ({ name: c, 'الاعتماد المخطط': Math.round(planned(c) / 1e6), 'المنفق': Math.round(spent(c) / 1e6) }))
  const mwData = cities.map((c) => ({ name: c, 'المتاحة': prod(c, 'mwAvail') ?? 0, 'المستجرة': prod(c, 'mwUse') ?? 0, 'العجز': prod(c, 'mwGap') ?? 0 }))
  const achData = cities.map((c) => ({ name: c, 'إنجاز': ach(c, 'إنجاز') ?? 0, 'تحدٍّ': ach(c, 'تحدٍّ') ?? 0 }))
  const kpiCols = 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'

  return (
    <>
      <Section title="المقاسم والمساحات" cols={kpiCols}
        note="مجموع المدن المختارة، وتحته رقم كل مدينة. الأرقام كما وردت في الملفات — اقرأها مع قسم مشاكل البيانات.">
        <MKpi label="عدد المقاسم المسجلة" icon={<MapPinned size={16} />} get={(c) => s(c)?.plots} />
        <MKpi label="المقاسم المخصصة" icon={<ClipboardList size={16} />} get={(c) => s(c)?.allocated} hint="حسب (مرحلة المقسم)، أو وجود مستثمر إن كانت المرحلة فارغة" />
        <MKpi label="المقاسم الشاغرة" icon={<Ban size={16} />} get={(c) => s(c)?.vacant} tone="gold" hint="معروض للاستثمار / غير مخصص / غير معلن عنه" />
        <MKpi label="المكتتب عليها" icon={<PenLine size={16} />} get={(c) => s(c)?.subscribed} />
        <MKpi label="نسبة الإشغال" icon={<Percent size={16} />} get={(c) => (s(c)?.plots ? (s(c)!.allocated / s(c)!.plots) * 100 : null)} format={pct}
          aggregate={ratio((c) => s(c)?.allocated, (c) => s(c)?.plots)} hint="المخصصة ÷ كل المقاسم" />
        <MKpi label="المساحة الإجمالية" icon={<Ruler size={16} />} get={(c) => (s(c) ? s(c)!.totalArea / 1e4 : null)} unit="هكتار" tone="gold" format={(n) => fmt(n, 0)} />
        <MKpi label="المساحة المخصصة" icon={<Ruler size={16} />} get={(c) => (s(c) ? s(c)!.allocArea / 1e4 : null)} unit="هكتار" tone="gold" format={(n) => fmt(n, 0)} />
        <MKpi label="المساحة الشاغرة" icon={<Ruler size={16} />} get={(c) => (s(c) ? s(c)!.vacantArea / 1e4 : null)} unit="هكتار" tone="gold" format={(n) => fmt(n, 0)} />
        <MKpi label="متوسط مساحة المقسم" icon={<Ruler size={16} />} get={(c) => (s(c)?.plots ? s(c)!.totalArea / s(c)!.plots : null)} unit="م²" format={(n) => fmt(n, 0)}
          aggregate={ratio((c) => s(c)?.totalArea, (c) => s(c)?.plots, 1)} />
        <MKpi label="مقاسم مدموجة" icon={<GitMerge size={16} />} get={(c) => s(c)?.merged} />
      </Section>

      <Section title="المستثمرون والتراخيص" cols={kpiCols}>
        <MKpi label="المستثمرون (أسماء مختلفة)" icon={<Users size={16} />} get={(c) => s(c)?.investors} />
        <MKpi label="مقاسم لشركات" icon={<Briefcase size={16} />} get={(c) => s(c)?.byInvestorType.find((x) => x.name === 'شركة')?.value ?? 0} hint="نوع المستثمر «شركة»" />
        <MKpi label="مستثمرون أجانب" icon={<Globe2 size={16} />} get={(c) => (s(c)?.byNationality.some((x) => x.name !== 'غير محدد') ? s(c)!.foreign : null)} />
        <MKpi label="التراخيص الإدارية" icon={<BadgeCheck size={16} />} get={(c) => s(c)?.adminLicenses} />
        <MKpi label="رخص البناء" icon={<Building size={16} />} get={(c) => s(c)?.buildingLicenses} hint="مقاسم فيها رقم رخصة بناء" />
        <MKpi label="قرارات الترخيص الصناعي" icon={<Factory size={16} />} get={(c) => filled(c, 'رقم قرار الترخيص الصناعي')} />
        <MKpi label="السجلات الصناعية" icon={<FileCheck2 size={16} />} get={(c) => filled(c, 'رقم السجل الصناعي')} />
        <MKpi label="عقود البيع" icon={<FileSignature size={16} />} get={(c) => filled(c, 'رقم عقد البيع')} />
        <MKpi label="المقاسم المؤجرة" icon={<KeyRound size={16} />} get={(c) => s(c)?.leased} />
        <MKpi label="تخصيصات ملغاة" icon={<History size={16} />} tone="red" get={(c) => cityData(c).previous?.length ?? 0} hint="من شيت التخصيصات السابقة" />
      </Section>

      <Section title="المال والخدمات والإنجاز" cols={kpiCols}>
        <MKpi label="الأقساط المتأخرة" icon={<Banknote size={16} />} tone="red" get={(c) => s(c)?.installments?.overdue ?? null}
          hint="غير مدفوع وتاريخ استحقاقه قبل نهاية تشرين الأول 2026. فقط حسياء وباب الهوى عبّأتا الأقساط" />
        <MKpi label="مقاسم عليها أقساط متأخرة" icon={<Banknote size={16} />} tone="red" get={(c) => s(c)?.installments?.overduePlots ?? null} />
        <MKpi label="مشاريع الخطة الاستثمارية" icon={<HardHat size={16} />} get={(c) => cityData(c).projects?.length ?? null} />
        <MKpi label="الاعتماد المخطط" icon={<Landmark size={16} />} tone="gold" format={fmtSYP} unit="ل.س" get={planned} />
        <MKpi label="المنفق حتى تاريخه" icon={<Wallet size={16} />} tone="gold" format={fmtSYP} unit="ل.س" get={spent} />
        <MKpi label="نسبة الإنفاق من المخطط" icon={<Percent size={16} />} tone="gold" format={pct} get={(c) => (planned(c) ? (spent(c) / planned(c)) * 100 : null)} aggregate={ratio(spent, planned)} />
        <MKpi label="الاستطاعة الكهربائية المتاحة" icon={<Zap size={16} />} unit="MW" get={(c) => prod(c, 'mwAvail')} />
        <MKpi label="العجز الكهربائي" icon={<Zap size={16} />} tone="red" unit="MW" get={(c) => prod(c, 'mwGap')} />
        <MKpi label="الإنجازات" icon={<Trophy size={16} />} get={(c) => ach(c, 'إنجاز')} />
        <MKpi label="التحديات" icon={<Flag size={16} />} tone="red" get={(c) => ach(c, 'تحدٍّ')} />
      </Section>

      <Section title="المقاسم والتخصيص" cols="grid-flow-dense lg:grid-cols-2 2xl:grid-cols-3">
        <Card title="المساحة: مخصصة وشاغرة (هكتار)" icon={<Ruler size={18} />}>
          <Columns data={areaData} keys={['مخصصة', 'شاغرة', 'أخرى'].filter((k) => areaData.some((d) => (d as Record<string, number | string>)[k] as number > 0))} stacked
            colors={{ 'مخصصة': '#0a5346', 'شاغرة': '#c7a66b', 'أخرى': '#cbd5d1' }} height={280} />
        </Card>
        <Card title="نسبة الإشغال (%)" icon={<Percent size={18} />}>
          <HBars data={occupancy} />
          <p className="mt-3 text-[11.5px] text-slate-400">المقاسم المخصصة من كل المقاسم المسجلة في ملف المدينة.</p>
        </Card>
        <Card title="توزع مساحات المقاسم (م²)" icon={<Ruler size={18} />}>
          <Columns data={areaBuckets(cities)} keys={cities} colors={colors} height={280} />
        </Card>
        <Card title="المقاسم حسب سنة قرار التخصيص" className="lg:col-span-2" icon={<CalendarDays size={18} />}><YearsChart /></Card>
        <Card title="تصنيف المقسم" icon={<MapPinned size={18} />}><Donut data={merge(cities, 'byClass')} offList="تصنيف_المقسم" /></Card>
        <Card title="فئة الصناعة — مقارنة بين المدن" className="lg:col-span-2" icon={<Factory size={18} />}>
          <Columns data={compare(cities, 'byCategory', 12)} keys={cities} colors={colors} height={320} />
        </Card>
        <Card title="حالة التخديم" icon={<Zap size={18} />}><Donut data={merge(cities, 'byService')} offList="التخديم" /></Card>
      </Section>

      <Section title="المستثمرون والتراخيص" cols="grid-flow-dense lg:grid-cols-2 2xl:grid-cols-3">
        <Card title="نوع المستثمر" icon={<Users size={18} />}><Donut data={merge(cities, 'byInvestorType')} offList="نوع_المستثمر" /></Card>
        <Card title="الجنسية" icon={<Globe2 size={18} />}><Donut data={merge(cities, 'byNationality')} offList="الجنسية" /></Card>
        <Card title="أكثر المستثمرين مقاسم" icon={<Trophy size={18} />}><TopInvestors /></Card>
        <Card title="التراخيص والعقود في كل مدينة" className="lg:col-span-2" icon={<BadgeCheck size={18} />}>
          <Columns data={licData} keys={cities} colors={colors} height={300} />
          <p className="mt-2 text-[11.5px] text-slate-400">عدد المقاسم التي فيها رقم في العمود. الصفر غالباً يعني أن المدينة لم تعبّئ العمود، لا أنه لا توجد تراخيص.</p>
        </Card>
        <Card title="نوع الترخيص الإداري" icon={<BadgeCheck size={18} />}><Donut data={merge(cities, 'byAdminType')} offList="الترخيص_الإداري" /></Card>
        <Card title="نمط الاستثمار" icon={<Briefcase size={18} />}><Donut data={merge(cities, 'byInvestMode')} offList="نمط_الاستثمار" /></Card>
      </Section>

      <Section title="الخطة الاستثمارية والخدمات" cols="grid-flow-dense lg:grid-cols-2 2xl:grid-cols-3">
        <Card title="المخطط والمنفق (مليون ل.س)" icon={<Landmark size={18} />}>
          <Columns data={moneyData} keys={['الاعتماد المخطط', 'المنفق']} colors={{ 'الاعتماد المخطط': '#0a5346', 'المنفق': '#c7a66b' }} height={280} />
        </Card>
        <Card title="حالة مشاريع الخطة الاستثمارية" icon={<HardHat size={18} />}><Donut data={projectStatus} /></Card>
        <Card title="الكهرباء (MW)" icon={<Zap size={18} />}>
          <Columns data={mwData} keys={['المتاحة', 'المستجرة', 'العجز']} colors={{ 'المتاحة': '#0a5346', 'المستجرة': '#5fa996', 'العجز': '#b5523b' }} height={280} />
          <p className="mt-2 text-[11.5px] text-slate-400">من قالب الإنتاجية. الراعي لم تعبّئ إلا الاستطاعة المتاحة.</p>
        </Card>
        <Card title="الإنجازات والتحديات" icon={<Trophy size={18} />}>
          <Columns data={achData} keys={['إنجاز', 'تحدٍّ']} colors={{ 'إنجاز': '#0a5346', 'تحدٍّ': '#b5523b' }} height={260} />
        </Card>
      </Section>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-gold-100 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>المقارنة بين المدن تحتاج حذراً:</b> عدرا لم تعبّئ الجنسية ولا الأقساط ولا رخص البناء، الشيخ نجار ملأت آلاف الخانات بـ«ــ» واستخدمت مراحل من خارج القائمة،
          الراعي لم تعبّئ المرحلة والتخديم، وملف حسياء بعناوين أعمدة مختلفة عن باقي المدن. التفاصيل في <Link to="/monthly/issues" className="font-bold underline">مشاكل البيانات</Link>.
        </div>
      </div>

      <Section title="الصورة العامة">
        <FilesMatrix />
        <Card title="حالة المقاسم في كل مدينة" icon={<MapPinned size={18} />}>
          <Columns data={statusData} keys={statusKeys} stacked colors={STATUS_COLORS} height={300} />
          <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
            «غير محدد»: مرحلة المقسم فارغة ولا يوجد مستثمر. في الراعي عمود المرحلة فارغ بالكامل، فالحالة مستنتجة من اسم المستثمر.
          </p>
        </Card>
        <TopIssues />
      </Section>
    </>
  )
}
