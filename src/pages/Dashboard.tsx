import {
  Ban, BadgeCheck, Banknote, Briefcase, Building, Coins, Factory, FileSignature, FolderOpen, Gauge, GitMerge, Globe2,
  HardHat, KeyRound, Landmark, MapPinned, Ruler, ShieldAlert, Sparkles, UserRound, Users, Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, PageHeader, cls } from '../components/ui'
import { DATA } from '../data/load'
import { byCity, useStore } from '../data/store'
import { CITIES, type City } from '../schema/schema'

type NV = { name: string; value: number }
type More = Record<string, any>

const CITY_COLOR: Record<string, string> = { 'عدرا': '#0e6d5c', 'حسياء': '#c7a66b' }
const PALETTE = ['#0a5346', '#c7a66b', '#1a8f79', '#8a6a2f', '#5fa996', '#dbc08f', '#04302a', '#a9c9bf', '#b8934f', '#7d8f89', '#3f7f71']
const FONT = { fontFamily: 'Tajawal', fontSize: 12 }
const TT = { contentStyle: { ...FONT, direction: 'rtl' as const, borderRadius: 10, border: '1px solid rgba(10,83,70,.2)' } }
const fmt = (n: number) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(n ?? '—'))
const more = (DATA.stats as unknown as { more: Record<City, More> }).more

/** المفتاح ← صفحة الجدول التي تشرح المؤشر (الفلتر في TablePage.PRESETS) */
const KPI_PAGE: Record<string, string> = {
  plots: 'plots', active: 'allocations', cancelled: 'allocations', investors: 'investors', area: 'allocations', avgArea: 'allocations',
  merged: 'allocations', admin: 'licenses', industrial: 'licenses', building: 'licenses', sales: 'contracts', overdue: 'financial',
  tenants: 'leases', workers: 'project', capital: 'project', women: 'investors', foreign: 'investors', law18: 'licenses',
}

function Kpi({ k, label, icon, get, unit, hint, tone = 'green' }: {
  k: string; label: string; icon: ReactNode; get: (c: City) => number | null | undefined; unit?: string; hint?: string; tone?: 'green' | 'gold' | 'red'
}) {
  const { city } = useStore()
  const cities: City[] = city === 'الكل' ? [...CITIES] : [city]
  const vals = cities.map((c) => [c, get(c)] as const)
  const known = vals.filter(([, v]) => v !== null && v !== undefined) as [City, number][]
  const total = known.reduce((n, [, v]) => n + v, 0)
  const color = tone === 'red' ? 'text-red-700' : tone === 'gold' ? 'text-gold-600' : 'text-brand-700'
  const preset = k === 'avgArea' ? 'area' : k
  return (
    <Link to={`/t/${KPI_PAGE[k]}?kpi=${preset}${known.length ? `&n=${Math.round(total)}` : ''}`} title="اضغط لعرض البيانات التي يُحسب منها هذا الرقم"
      className="stat-box group block cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-bold leading-snug text-slate-500">{label}</span>
        <span className={cls('rounded-lg p-1.5', tone === 'gold' ? 'bg-gold-100 text-gold-600' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700')}>{icon}</span>
      </div>
      <div className={cls('num mt-1 text-right text-[25px] font-extrabold leading-tight', color)}>
        {known.length ? fmt(total) : <span className="text-base text-slate-400">غير متوفر</span>}
        {unit && known.length > 0 && <span className="mr-1 text-xs font-bold text-slate-400">{unit}</span>}
      </div>
      {cities.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] font-bold">
          {vals.map(([c, v]) => (
            <span key={c} className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: CITY_COLOR[c] }} />{c}: <span className="num text-slate-700">{v === null || v === undefined ? '—' : fmt(v)}</span>
            </span>
          ))}
        </div>
      )}
      {hint && <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</div>}
      <div className="mt-1.5 text-[11px] font-bold text-gold-600 opacity-0 transition group-hover:opacity-100">عرض البيانات ←</div>
    </Link>
  )
}

function Empty() {
  return <div className="py-10 text-center text-sm text-slate-400">لا توجد بيانات لهذه المدينة في الملف المصدر</div>
}

function Donut({ data, explain }: { data: NV[]; explain?: Record<string, { text: string; bad?: boolean }> }) {
  const total = (data ?? []).reduce((n, d) => n + d.value, 0)
  if (!total) return <Empty />
  return (
    <div className="flex items-center gap-4">
      <div dir="ltr" style={{ width: 170, height: 200 }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="#fff">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.name}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className={cls('min-w-0 flex-1 truncate', explain?.[d.name]?.bad ? 'font-bold text-red-700' : 'text-slate-600')} title={d.name}>{d.name}</span>
              <span className="num font-bold text-slate-800">{fmt(d.value)}</span>
              <span className="num w-11 text-left text-xs text-slate-400">{d.value / total < 0.01 ? '<1' : Math.round((d.value / total) * 100)}%</span>
            </div>
            {explain?.[d.name] && <div className={cls('mr-4.5 text-[11.5px] leading-snug', explain[d.name].bad ? 'text-red-600/80' : 'text-slate-400')}>{explain[d.name].text}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function HBars({ data, color = '#0a5346' }: { data: NV[]; color?: string }) {
  if (!data?.length) return <Empty />
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.name} className="text-[13px]">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-slate-600" title={d.name}>{d.name}</span>
            <span className="num font-bold text-slate-800">{fmt(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-50">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Columns({ data, keys, xKey = 'name', height = 280, stacked, colors }: {
  data: Array<Record<string, any>>; keys: string[]; xKey?: string; height?: number; stacked?: boolean; colors?: Record<string, string>
}) {
  if (!data?.length) return <Empty />
  const tilt = data.length > 7
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(10,83,70,.12)" />
          <XAxis dataKey={xKey} tick={FONT} interval={0} angle={tilt ? -30 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 64 : 30} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
          {keys.length > 1 && <Legend wrapperStyle={FONT} />}
          {keys.map((k, i) => <Bar key={k} dataKey={k} name={k === 'value' ? 'العدد' : k} stackId={stacked ? 's' : undefined} fill={colors?.[k] ?? PALETTE[i]} radius={stacked ? 0 : [5, 5, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function YearsArea({ series, height = 280 }: { series: Record<string, Record<string, number>>; height?: number }) {
  const now = new Date().getFullYear()
  const years = [...new Set(Object.values(series).flatMap((s) => Object.keys(s ?? {})))].filter((y) => +y >= 1995 && +y <= now).sort()
  const data = years.map((y) => ({ year: y, ...Object.fromEntries(Object.entries(series).map(([k, s]) => [k, s?.[y] ?? 0])) }))
  if (!data.length) return <Empty />
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <defs>
            {Object.keys(series).map((k, i) => (
              <linearGradient key={k} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CITY_COLOR[k]} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CITY_COLOR[k]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(10,83,70,.12)" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip {...TT} />
          <Legend wrapperStyle={FONT} />
          {Object.keys(series).map((k, i) => <Area key={k} dataKey={k} type="monotone" stroke={CITY_COLOR[k]} strokeWidth={2.4} fill={`url(#g${i})`} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** بطاقة لكل مدينة مختارة (التصنيفات تختلف بين المدن فلا تُجمع) */
function PerCity({ title, render, only, note }: { title: string; render: (m: More, c: City) => ReactNode; only?: City; note?: string }) {
  const { city } = useStore()
  const cities = (city === 'الكل' ? [...CITIES] : [city]).filter((c) => !only || c === only)
  return (
    <>
      {cities.map((c) => (
        <Card key={c} title={<>{title} <span className="text-sm font-bold" style={{ color: CITY_COLOR[c] }}>— {c}</span></>}>
          {render(more[c], c)}
          {note && <p className="mt-3 text-[11.5px] text-slate-400">{note}</p>}
        </Card>
      ))}
    </>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <h2 className="mb-3 mt-8 flex items-center gap-3 text-lg font-extrabold text-brand-800">
        <span className="h-0.5 w-8 rounded-full bg-gold-500" />{title}
      </h2>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{children}</div>
    </section>
  )
}

const VOLTAGE_EXPLAIN: Record<string, { text: string; bad?: boolean }> = {
  'متوسط': { text: 'المقسم موصول على شبكة التوتر المتوسط' },
  'منخفض': { text: 'المقسم موصول على شبكة التوتر المنخفض' },
  'غير مدروس': { text: 'لم تُحدَّد التغذية الكهربائية للمقسم بعد — قيمة غير موجودة في قائمة الهيكل' , bad: true },
  'مسطح أخضر': { text: 'ليست قيمة توتر: المقسم نفسه مساحة خضراء — مكانها (تصنيف المقسم)', bad: true },
  'محطة تحويل': { text: 'ليست قيمة توتر: المقسم نفسه محطة تحويل كهرباء — مكانها (تصنيف المقسم)', bad: true },
  'محطة تحويل n2': { text: 'نفس السابق مع رقم المحطة داخل الخلية', bad: true },
}

const SERVICE_EXPLAIN: Record<string, { text: string; bad?: boolean }> = {
  'مخدم': { text: 'المقسم واصلة إليه خدمات البنية التحتية حسب سجل المقاسم' },
  'غير مخدم': { text: 'الخدمات غير واصلة للمقسم بعد' },
}

const SECTIONS = [
  ['overview', 'نظرة عامة'], ['allocations', 'التخصيصات'], ['plots', 'المقاسم'], ['investors', 'المستثمرون'],
  ['licenses', 'التراخيص والتشغيل'], ['finance', 'المالية والمشروع'], ['events', 'البيع والإلغاء والتعديلات'],
] as const

export function Dashboard() {
  const { db, city } = useStore()
  const cities: City[] = city === 'الكل' ? [...CITIES] : [city]
  const st = DATA.stats
  const sample = byCity(db.allocations, city)
  const flagged = sample.filter((a) => a._review?.length).length
  const m = (c: City) => more[c]
  const areaData = m('عدرا').areaBuckets.map((b: NV, i: number) => ({ name: b.name, 'عدرا': b.value, 'حسياء': m('حسياء').areaBuckets[i].value }))

  return (
    <div className="fade-in">
      <PageHeader kicker="كل الأرقام محسوبة على كامل الملفين الحاليين — لا على العينة" title="اللوحة العامة"
        subtitle="صورة موحدة لمدينتي عدرا وحسياء: التخصيصات والمقاسم والمستثمرون والتراخيص والمالية والأحداث. اختر المدينة من الشريط العلوي." />

      <nav className="sticky top-[calc(var(--header-h)+8px)] z-20 flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-white/90 p-1.5 shadow-sm backdrop-blur">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }}
            className="rounded-full px-4 py-1.5 text-sm font-bold text-brand-700 hover:bg-gold-100">{label}</a>
        ))}
      </nav>

      <section id="overview" className="scroll-mt-32">
        <h2 className="mb-3 mt-6 flex items-center gap-3 text-lg font-extrabold text-brand-800"><span className="h-0.5 w-8 rounded-full bg-gold-500" />نظرة عامة</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi k="plots" label="عدد المقاسم" icon={<MapPinned size={16} />} get={(c) => st.cities[c].plots} hint={cities.includes('عدرا') ? 'عدرا: مشتق من التخصيصات' : undefined} />
          <Kpi k="active" label="التخصيصات الفعالة" icon={<FolderOpen size={16} />} get={(c) => st.cities[c].allocated} />
          <Kpi k="cancelled" label="التخصيصات الملغاة" icon={<Ban size={16} />} get={(c) => st.cities[c].cancelled} tone="red" />
          <Kpi k="investors" label="المستثمرون (أسماء مختلفة)" icon={<Users size={16} />} get={(c) => st.cities[c].investors} />
          <Kpi k="area" label="المساحة المخصصة" icon={<Ruler size={16} />} get={(c) => Math.round(m(c).totalArea / 10000)} unit="هكتار" tone="gold" />
          <Kpi k="avgArea" label="متوسط مساحة التخصيص" icon={<Ruler size={16} />} get={(c) => m(c).avgArea} unit="م2" tone="gold" />
          <Kpi k="merged" label="تخصيصات بمقاسم مدموجة" icon={<GitMerge size={16} />} get={(c) => m(c).mergedAllocs} hint="خانة فيها +" />
          <Kpi k="admin" label="التراخيص الإدارية" icon={<BadgeCheck size={16} />} get={(c) => st.cities[c].adminLicenses} />
          <Kpi k="industrial" label="التراخيص الصناعية" icon={<Factory size={16} />} get={(c) => (c === 'حسياء' ? m(c).industrialLicenses : null)} />
          <Kpi k="building" label="رخص البناء" icon={<Building size={16} />} get={(c) => (c === 'حسياء' ? m(c).buildingLicenses : null)} />
          <Kpi k="sales" label="عقود البيع" icon={<FileSignature size={16} />} get={(c) => (c === 'عدرا' ? m(c).salesTotal : m(c).contracts)} hint="عدرا: بين مستثمرين · حسياء: من المدينة" />
          <Kpi k="overdue" label="الأقساط المتأخرة" icon={<Banknote size={16} />} get={(c) => st.cities[c].overdue} tone="red" hint={cities.includes('حسياء') ? `${(st.cities['حسياء'] as any).overdueDiff} فرق سعر + ${(st.cities['حسياء'] as any).overdueLand} أرض، من نص الحالة المالية في ${(st.cities['حسياء'] as any).overdueFiles} إضبارة` : undefined} />
          <Kpi k="tenants" label="المستأجرون" icon={<KeyRound size={16} />} get={(c) => (c === 'حسياء' ? m(c).tenants : null)} />
          <Kpi k="workers" label="عدد العمال" icon={<HardHat size={16} />} get={(c) => (c === 'حسياء' ? m(c).workers : null)} tone="gold" />
          <Kpi k="capital" label="رأس المال المصرح" icon={<Coins size={16} />} get={(c) => (c === 'حسياء' ? Math.round(m(c).capital / 1000) : null)} unit="مليار ل.س" tone="gold" />
          <Kpi k="women" label="سيدات أعمال" icon={<UserRound size={16} />} get={(c) => (c === 'عدرا' ? m(c).womenNames : m(c).women)} hint="عدرا: أسماء فيها بنت/بنات" />
          <Kpi k="foreign" label="مستثمرون غير سوريين" icon={<Globe2 size={16} />} get={(c) => (c === 'حسياء' ? m(c).foreign : null)} />
          <Kpi k="law18" label="مشاريع قانون 18" icon={<Sparkles size={16} />} get={(c) => (c === 'عدرا' ? m(c).law18.projects : null)} />
        </div>
      </section>

      <Section id="allocations" title="التخصيصات">
        <Card title="التخصيصات حسب الفئة الصناعية" className="lg:col-span-2">
          <Columns data={st.byCategory} keys={cities} colors={CITY_COLOR} height={300} />
        </Card>
        <Card title="التخصيصات حسب سنة التخصيص" className="lg:col-span-2 2xl:col-span-1">
          <YearsArea series={Object.fromEntries(cities.map((c) => [c, Object.fromEntries(st.byYear.map((r) => [r.year, r[c] as number]))]))} />
        </Card>
        <Card title="توزع مساحات التخصيص (م2)">
          <Columns data={areaData} keys={cities} colors={CITY_COLOR} />
        </Card>
        <PerCity title="درجة الصناعة" render={(x) => <Donut data={x.byGrade} />} />
        <PerCity title="عدد المقاسم في التخصيص الواحد" only="عدرا" render={(x) => <Columns data={x.plotsPerAlloc} keys={['value']} />} note="كل تخصيص بأكثر من مقسم كان خانة واحدة بـ + في الإكسل." />
        <PerCity title="المرحلة الجغرافية" render={(x) => <Donut data={x.byPhase} />} />
        <PerCity title="نوع الصناعة (التصنيف الفرعي)" only="حسياء" render={(x) => <HBars data={x.byIndustryType} />} />
        <PerCity title="السند القانوني" only="حسياء" render={(x) => <Donut data={x.byLegal} />} />
      </Section>

      <Section id="plots" title="المقاسم">
        <PerCity title="التخصيصات حسب المنطقة / القطاع" render={(x, c) => <HBars data={x.bySector} color={CITY_COLOR[c]} />} />
        <PerCity title="حالة المقاسم في السجل الكامل" only="حسياء" render={(x) => <Donut data={x.plotStatus} />} note="من شيت كامل المقاسم — في الهيكل الجديد تُحسب من التخصيصات." />
        <PerCity title="الخدمة" only="حسياء" render={(x) => <Donut data={x.plotService} explain={SERVICE_EXPLAIN} />}
          note="من عمود (مخدم / غيرمخدم) في شيت كامل المقاسم. الهيكل يضيف قيمة ثالثة: مخدم جزئياً." />
        <PerCity title="التوتر الكهربائي" only="حسياء" render={(x) => <Donut data={x.plotVoltage} explain={VOLTAGE_EXPLAIN} />}
          note="هذا مستوى التوتر الكهربائي (نوع التغذية) الواصل للمقسم — وليس استهلاكاً للكهرباء. الاستهلاك المطلوب بالـ kVA في (بيانات المشروع). القيم الحمراء ليست مستويات توتر أصلاً بل أخطاء إدخال." />
        <PerCity title="تصنيف المقاسم" only="حسياء" render={(x) => <Donut data={x.plotClassAll} />} />
        <Card title="المقاسم الفرعية والمدموجة">
          <HBars data={cities.flatMap((c) => [{ name: `${c}: تخصيصات بمقسم فرعي`, value: m(c).subPlots }, { name: `${c}: تخصيصات بمقاسم مدموجة`, value: m(c).mergedAllocs }])} />
        </Card>
      </Section>

      <Section id="investors" title="المستثمرون">
        <PerCity title="نوع المستثمر" render={(x) => <Donut data={x.investorTypes} />} note="مستخرج من الاسم (شركة / جهة عامة / شخص طبيعي)." />
        <PerCity title="الشكل القانوني" render={(x) => <HBars data={x.legalForms} />} />
        <PerCity title="الجنسيات" only="حسياء" render={(x) => <HBars data={x.nationalities} color="#c7a66b" />} />
        <PerCity title="أكثر المستثمرين تخصيصاً" render={(x) => (
          <ol className="space-y-1.5 text-[13px]">
            {(x.topInvestors as NV[]).map((d, i) => (
              <li key={d.name} className="flex items-center gap-2">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700" title={d.name}>{d.name}</span>
                <span className="num font-bold text-gold-600">{d.value}</span>
              </li>
            ))}
          </ol>
        )} />
        <PerCity title="السجل التجاري داخل الاسم" only="عدرا" render={(x) => (
          <div className="py-4 text-center">
            <div className="num text-4xl font-extrabold text-brand-700">{fmt(x.withCR)}</div>
            <div className="mt-1 text-sm text-slate-500">اسم مستثمر يحوي رقم سجل تجاري داخل خانة الاسم — يُفصل لحقل مستقل</div>
          </div>
        )} />
      </Section>

      <Section id="licenses" title="التراخيص والتشغيل">
        <PerCity title="الوضع التشغيلي للمنشآت" only="حسياء" render={(x) => <HBars data={x.operational} />} />
        <PerCity title="مدة الترخيص الإداري" render={(x) => <Donut data={x.adminDuration} />} />
        <PerCity title="نطاق الترخيص الإداري" only="حسياء" render={(x) => <Donut data={x.adminScope} />} />
        <PerCity title="ترخيص البناء" only="حسياء" render={(x) => <Donut data={x.buildingStatus} />} />
        <PerCity title="الجهة المصدرة للترخيص الصناعي" only="حسياء" render={(x) => <HBars data={x.issuers} />} />
        <PerCity title="التراخيص الإدارية حسب النشاط" only="عدرا" render={(x) => <HBars data={x.adminByIndustry} />} note="من شيت متفرقات هام." />
      </Section>

      <Section id="finance" title="المالية وبيانات المشروع">
        <PerCity title="الحالة المالية — أقساط الأرض" only="حسياء" render={(x) => <HBars data={x.landStatus} />} />
        <PerCity title="الحالة المالية — فرق السعر" only="حسياء" render={(x) => <HBars data={x.diffStatus} color="#c7a66b" />} />
        <PerCity title="مؤشرات المشاريع" only="حسياء" render={(x) => (
          <div className="grid grid-cols-2 gap-3">
            {([
              ['رأس المال المصرح', `${fmt(x.capital)} مليون ل.س`, Coins], ['رأس المال بالدولار', `${fmt(x.capitalUSD)} $`, Coins],
              ['الكهرباء المطلوبة', `${fmt(x.kva)} kVA`, Zap], ['المياه المطلوبة', `${fmt(x.water)} م3/سنة`, Gauge],
              ['عدد العمال', fmt(x.workers), HardHat], ['قيمة عقود البيع', `${fmt(x.contractsValue)} $`, Landmark],
              ['المساحة المؤجرة', `${fmt(x.leasedArea)} م2`, KeyRound], ['جداول أقساط مسجلة', fmt(x.schedules), Banknote],
            ] as [string, string, React.ElementType][]).map(([k, v, I]) => (
              <div key={k} className="rounded-xl bg-[#faf9f5] p-3 ring-1 ring-[var(--border)]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><I size={13} className="text-gold-600" />{k}</div>
                <div className="num mt-1 text-right text-[17px] font-extrabold text-brand-700">{v}</div>
              </div>
            ))}
          </div>
        )} note="القيم كما وردت في الملف (بدون تحقق من الوحدات)." />
        <PerCity title="مشاريع قانون الاستثمار 18" only="عدرا" render={(x) => (
          <div className="grid grid-cols-3 gap-3 py-2 text-center">
            {([['مشروع', x.law18.projects], ['فرصة عمل متوقعة', x.law18.jobs], ['مليار ل.س قيمة تقديرية', Math.round(x.law18.value / 1e9)]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gold-100/60 p-3">
                <div className="num text-2xl font-extrabold text-gold-600">{fmt(v)}</div>
                <div className="text-xs font-bold text-slate-500">{k}</div>
              </div>
            ))}
          </div>
        )} />
      </Section>

      <Section id="events" title="البيع والإلغاء والتعديلات">
        <Card title="الإلغاءات حسب السنة" className="lg:col-span-2">
          <YearsArea series={Object.fromEntries(cities.map((c) => [c, m(c).cancelByYear]))} height={260} />
          <p className="mt-2 text-[11.5px] text-slate-400">عدرا: شيت بلاك · حسياء: المفصولين 2025 (المفصولون قبل 2025 بدون تاريخ).</p>
        </Card>
        <PerCity title="أسباب الإلغاء" only="عدرا" render={(x) => <Donut data={x.cancelReasons} />} />
        <PerCity title="البيوع بين المستثمرين حسب السنة" only="عدرا" render={(x) => <Columns data={x.salesByYear} xKey="year" keys={['كامل', 'حصة']} stacked colors={{ 'كامل': '#0a5346', 'حصة': '#c7a66b' }} />} />
        <PerCity title="البيع: كامل أم حصة" only="عدرا" render={(x) => <Donut data={x.salesShare} />} />
        <PerCity title="التعديلات على الإضبارات" only="حسياء" render={(x) => <HBars data={x.modifications} />} note="من عمود (نوع التعديل) — مكتوبة بأكثر من 90 صيغة مختلفة." />
        <PerCity title="طلبات وتسويات" only="عدرا" render={(x) => (
          <HBars data={[{ name: 'مكتتبون منسحبون (إلغاء اكتتاب)', value: x.subsCancelled }, { name: 'تمت التسوية', value: x.settled },
            { name: 'طلبات طي قرار إلغاء', value: x.foldRequests }, { name: 'انتقال ملكية بالإرث (ليس بيعاً)', value: x.inheritTransfers }, { name: 'قرارات تخصيص مختلفة', value: x.decisions }]} />
        )} />
      </Section>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Link to="/quality" className="card flex items-center gap-4 p-5 transition hover:border-gold-500">
          <ShieldAlert className="text-red-600" />
          <div><div className="font-extrabold text-brand-800">جودة البيانات</div><div className="text-sm text-slate-500">{DATA.quality.issues.length} نوعاً من المشاكل مع أمثلة حقيقية</div></div>
        </Link>
        <Link to="/before-after" className="card flex items-center gap-4 p-5 transition hover:border-gold-500">
          <Briefcase className="text-brand-600" />
          <div><div className="font-extrabold text-brand-800">قبل / بعد</div><div className="text-sm text-slate-500">سطر إكسل حقيقي جنب نفس البيانات بعد الهيكلة</div></div>
        </Link>
        <Link to="/t/allocations" className="card flex items-center gap-4 p-5 transition hover:border-gold-500">
          <FolderOpen className="text-gold-600" />
          <div><div className="font-extrabold text-brand-800">العينة المعروضة</div><div className="text-sm text-slate-500"><span className="num">{sample.length}</span> تخصيصاً، منها <span className="num">{flagged}</span> معلّم للمراجعة</div></div>
        </Link>
      </div>
    </div>
  )
}
