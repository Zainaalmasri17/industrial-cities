import { Filter, FolderOpen, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DataTable, schemaColumns, type Column } from '../components/DataTable'
import { Badge, Note, PageHeader, Value, cls } from '../components/ui'
import type { Rec } from '../data/load'
import { byCity, effectiveStatus, investorName, plotsOf, useStore, type Index } from '../data/store'
import { TABLE, type TableId } from '../schema/schema'

interface Tab {
  table: TableId
  label: string
  visible?: string[]
  extra?: (idx: Index) => Column[]
  /** ترتيب الأعمدة الأولى (والباقي بعدها بترتيب الهيكل) */
  order?: string[]
  /** تعديل أعمدة الهيكل (مثلاً حالة محسوبة بدل المخزنة) */
  override?: (idx: Index) => Partial<Record<string, Partial<Column>>>
}

const investorCol = (key = 'رمز المستثمر'): ((idx: Index) => Column) => (idx) => ({
  key: '_investor', label: 'المستثمر (محسوب)', value: (r) => investorName(r[key], idx),
  render: (r) => <span className="line-clamp-2 min-w-48 font-medium text-slate-700" title={investorName(r[key], idx)}>{investorName(r[key], idx)}</span>,
})

const allocInvestor = (idx: Index): Column => ({
  key: '_allocInvestor', label: 'المستثمر', value: (r) => investorName(idx.allocById.get(r._alloc!)?.['رمز المستثمر'], idx),
})

const fileLink = (): Column => ({
  key: '_alloc', label: 'الإضبارة', value: (r) => r._alloc,
  render: (r) => r._alloc ? (
    <Link to={`/file/${encodeURIComponent(r._alloc)}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
      <FolderOpen size={13} /> فتح
    </Link>
  ) : null,
})

const PLOT_STATUS = (p: Rec, idx: Index) => {
  const allocs = idx.allocsByPlot.get(p._id) ?? []
  if (allocs.some((a) => ['فعّال', 'منقول ملكية', 'مدموج'].includes(effectiveStatus(a, idx) ?? ''))) return 'مخصص'
  if (allocs.length) return 'ملغى التخصيص'
  return 'غير مخصص'
}

const CONFIG: Record<string, { title: string; subtitle: string; tabs: Tab[] }> = {
  plots: {
    title: 'المقاسم', subtitle: 'السجل الأم لكل قطعة أرض. حالة المقسم لا تُكتب بل تُحسب من التخصيصات (العمود الأخير).',
    tabs: [{
      table: 'plots', label: 'المقاسم',
      visible: ['المدينة', 'رقم المقسم الموحد', 'رقم المقسم كما ورد', 'المنطقة / القطاع', 'المرحلة الجغرافية', 'المساحة م2', 'تصنيف المقسم', 'حالة الخدمة', 'التوتر الكهربائي'],
      extra: (idx) => [
        { key: '_plotStatus', label: 'حالة المقسم (محسوبة)', filter: true, value: (r) => PLOT_STATUS(r, idx), render: (r) => <Badge value={PLOT_STATUS(r, idx)} /> },
        { key: '_allocCount', label: 'عدد التخصيصات', value: (r) => (idx.allocsByPlot.get(r._id) ?? []).length },
      ],
    }],
  },
  investors: {
    title: 'المستثمرون والشركاء', subtitle: 'مستثمر واحد مرة واحدة فقط مهما كان عدد مقاسمه، والرمز موحد على مستوى الوزارة. الشركاء مفككون من خانة الاسم.',
    tabs: [
      {
        table: 'investors', label: 'المستثمرون',
        visible: ['رمز المستثمر', 'نوع المستثمر', 'الاسم الكامل / اسم المنشأة', 'الشكل القانوني', 'رقم السجل التجاري', 'سنة / مكان السجل', 'الهاتف 1'],
        extra: (idx) => [
          { key: '_cities', label: 'المدن', filter: true, value: (r) => (r._cities ?? []).join(' + '), render: (r) => <span className="flex gap-1">{(r._cities ?? []).map((c: string) => <Badge key={c} value={c} />)}</span> },
          { key: '_partners', label: 'عدد الشركاء', value: (r) => (idx.partnersByInv.get(r['رمز المستثمر']) ?? []).length },
          { key: '_raw', label: 'الاسم كما ورد في الملف', hidden: true, value: (r) => r._rawName },
        ],
      },
      { table: 'partners', label: 'الشركاء', order: ['رمز المستثمر', '_investor'], extra: (idx) => [investorCol()(idx)] },
    ],
  },
  allocations: {
    title: 'التخصيصات', subtitle: 'القلب: ربط مستثمر بمقسم أو أكثر بقرار تخصيص. اضغط على أي سطر لفتح الإضبارة.',
    tabs: [{
      table: 'allocations', label: 'التخصيصات',
      order: ['المدينة', 'رقم الإضبارة', '_investor', '_plots', 'الفئة الصناعية'],
      visible: ['المدينة', 'رقم الإضبارة', 'الفئة الصناعية', 'درجة الصناعة', 'المساحة الإجمالية م2', 'قرار التخصيص', 'تاريخ التخصيص', 'الحالة الحالية', 'الوضع التشغيلي'],
      override: (idx) => ({
        'الحالة الحالية': { value: (r) => effectiveStatus(r, idx), render: (r) => <Value field={TABLE.allocations.fields.find((f) => f.name === 'الحالة الحالية')} value={effectiveStatus(r, idx)} /> },
      }),
      extra: (idx) => [
        investorCol()(idx),
        {
          key: '_plots', label: 'المقاسم (من جدول مقاسم التخصيص)', value: (r) => plotsOf(r._id, idx).join(' ، '),
          render: (r) => <span className="flex flex-wrap gap-1">{plotsOf(r._id, idx).map((p, i) => <span key={i} className="num rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p}</span>)}</span>,
        },
        { key: '_plotCount', label: 'عدد المقاسم (محسوب)', value: (r) => plotsOf(r._id, idx).length },
        { key: '_id', label: 'المفتاح الداخلي المؤقت', hidden: true, value: (r) => r._id, render: (r) => <code className="text-xs text-slate-500">{r._id}</code> },
      ],
    }],
  },
  events: {
    title: 'الأحداث', subtitle: 'كل ما يحدث للتخصيص بعد إنشائه. لا يُحذف أي سجل: كل تغيير حدث جديد. شيتات بلاك والمفصولين والمباعة والدمج وطلبات الطي أصبحت كلها سطوراً هنا.',
    tabs: [{ table: 'events', label: 'الأحداث', order: ['المدينة', 'رقم الإضبارة', '_allocInvestor', 'نوع الحدث', 'تاريخ الحدث'], visible: ['المدينة', 'رقم الإضبارة', 'رقم المقسم', 'نوع الحدث', 'رقم القرار / الوثيقة', 'تاريخ الحدث', 'المستثمر السابق', 'المستثمر الجديد', 'النسبة المنقولة %', 'التفاصيل'], extra: (idx) => [allocInvestor(idx), fileLink()] }],
  },
  licenses: {
    title: 'التراخيص', subtitle: 'كل ترخيص سطر مستقل في جدوله؛ التعديل أو التجديد سطر جديد بدل خلية فيها تاريخان.',
    tabs: [
      { table: 'industrial_licenses', label: 'التراخيص الصناعية', extra: (idx) => [allocInvestor(idx), fileLink()] },
      { table: 'building_licenses', label: 'رخص البناء', extra: (idx) => [allocInvestor(idx), fileLink()] },
      { table: 'admin_licenses', label: 'التراخيص الإدارية', extra: (idx) => [allocInvestor(idx), fileLink()] },
      { table: 'investment_licenses', label: 'الإجازات الاستثمارية', extra: (idx) => [allocInvestor(idx), fileLink()] },
    ],
  },
  contracts: {
    title: 'العقود (البيع)', subtitle: 'عقد البيع من المدينة للمستثمر (حسياء)، وعقود البيع بين المستثمرين (شيت المقاسم المباعة في عدرا).',
    tabs: [{ table: 'contracts', label: 'العقود', extra: (idx) => [allocInvestor(idx), fileLink()] }],
  },
  installments: {
    title: 'الأقساط', subtitle: 'سطر لكل قسط بدل 42 عموداً. الحالة محسوبة: «مدفوع» فقط عند وجود تاريخ دفع، و«مستنتج» عندما نعتمد على نص الحالة المالية.',
    tabs: [{
      table: 'installments', label: 'الأقساط',
      extra: (idx) => [
        { key: '_status', label: 'حالة القسط (محسوبة)', filter: true, value: (r) => r._status ?? (r['تاريخ الدفع'] ? 'مدفوع' : 'غير معروف'), render: (r) => <span title={r._statusBasis}><Badge value={r._status ?? (r['تاريخ الدفع'] ? 'مدفوع' : 'غير معروف')} /></span> },
        allocInvestor(idx), fileLink(),
      ],
    }],
  },
  leases: {
    title: 'الإيجارات', subtitle: 'تأجير المستثمر لجزء من منشأته. مدة العقد بالأشهر كرقم، بدل (سنتين) أو (3سنوات).',
    tabs: [{
      table: 'leases', label: 'الإيجارات',
      extra: (idx) => [
        { key: '_dur', label: 'المدة كما وردت', value: (r) => r._durationRaw },
        allocInvestor(idx), fileLink(),
      ],
    }],
  },
}

/** فلاتر جاهزة تفتحها بطاقات اللوحة العامة: /t/<page>?kpi=<key> */
export const PRESETS: Record<string, { table: TableId; label: string; explain: string; pred?: (r: Rec, idx: Index) => boolean }> = {
  plots: { table: 'plots', label: 'عدد المقاسم', explain: 'كل مقسم سطر واحد؛ حالة المقسم محسوبة من التخصيصات المرتبطة.' },
  active: { table: 'allocations', label: 'التخصيصات الفعالة', explain: 'التخصيصات التي حالتها الحالية «فعّال».', pred: (r, idx) => effectiveStatus(r, idx) === 'فعّال' },
  cancelled: { table: 'allocations', label: 'التخصيصات الملغاة', explain: 'من شيت بلاك (عدرا) وشيتي المفصولين (حسياء) — كل إلغاء محفوظ كحدث ولا يُحذف التخصيص.', pred: (r, idx) => effectiveStatus(r, idx) === 'ملغى' },
  investors: { table: 'investors', label: 'المستثمرون', explain: 'مستثمر واحد مرة واحدة مهما كان عدد مقاسمه، برمز موحد على مستوى الوزارة.' },
  area: { table: 'allocations', label: 'المساحة المخصصة', explain: 'مجموع (المساحة الإجمالية م2) للتخصيصات — رتّب العمود لرؤية الأكبر.' },
  merged: { table: 'allocations', label: 'تخصيصات بمقاسم مدموجة', explain: 'تخصيصات كان رقم مقسمها خانة واحدة فيها + (مثل 578+777)، وأصبحت عدة سطور في (مقاسم التخصيص).', pred: (r, idx) => plotsOf(r._id, idx).length > 1 },
  admin: { table: 'admin_licenses', label: 'التراخيص الإدارية', explain: 'ترخيص بدء العمل — دائم أو مؤقت، باسم المستثمر أو المستأجر.' },
  industrial: { table: 'industrial_licenses', label: 'التراخيص الصناعية', explain: 'القرار الصناعي وتعديلاته.' },
  building: { table: 'building_licenses', label: 'رخص البناء', explain: 'كل رخصة أو تجديد سطر مستقل.' },
  sales: { table: 'contracts', label: 'عقود البيع', explain: 'عدرا: بيوع بين مستثمرين (شيت المقاسم المباعة) · حسياء: عقود البيع من المدينة.' },
  overdue: { table: 'financial', label: 'الأقساط المتأخرة', explain: 'الرقم مجموع N من عبارة «مستحق عليه N أقساط» في عمودي (حالة أقساط الأرض) و(حالة فرق السعر). هذه الإضبارات التي حالتها «مستحق» — أغلبها بلا جدول أقساط بتواريخ.',
    pred: (r) => [r['حالة أقساط الأرض'], r['حالة فرق السعر']].some((x) => typeof x === 'string' && x.startsWith('مستحق')) },
  overdueRows: { table: 'installments', label: 'أقساط متأخرة لها تواريخ', explain: 'الأقساط الوحيدة في الملف التي لها جدول بتواريخ استحقاق وحالة «مستحق» (إضبارتان فقط في كامل ملف حسياء).', pred: (r) => r._status === 'متأخر' },
  tenants: { table: 'leases', label: 'المستأجرون', explain: 'كل عقد إيجار سطر؛ الخلية التي فيها أكثر من مستأجر فُصلت لسطور.' },
  workers: { table: 'project', label: 'عدد العمال', explain: 'من جدول (بيانات المشروع) — حقل عدد العمال الفعلي.', pred: (r) => r['عدد العمال الفعلي'] != null },
  capital: { table: 'project', label: 'رأس المال المصرح', explain: 'من جدول (بيانات المشروع) — رأس المال بالمليون ل.س كما ورد.', pred: (r) => r['رأس المال'] != null },
  women: { table: 'partners', label: 'سيدات أعمال', explain: 'شركاء جنسهم «أنثى» — من عمود سيدات الأعمال (حسياء) ومن صيغة بنت/بنات (عدرا).', pred: (r) => r['الجنس'] === 'أنثى' },
  foreign: { table: 'partners', label: 'مستثمرون غير سوريين', explain: 'شركاء جنسيتهم غير سورية.', pred: (r) => !!r['الجنسية'] && r['الجنسية'] !== 'سوريا' },
  law18: { table: 'investment_licenses', label: 'مشاريع قانون 18', explain: 'الإجازات الاستثمارية المشمولة بقانون الاستثمار 18.' },
}

export function TablePage() {
  const { tableId = 'allocations' } = useParams()
  const { db, idx, city } = useStore()
  const navigate = useNavigate()
  const cfg = CONFIG[tableId] ?? (TABLE[tableId as TableId] ? {
    title: TABLE[tableId as TableId].name, subtitle: TABLE[tableId as TableId].purpose ?? '',
    tabs: [{ table: tableId as TableId, label: TABLE[tableId as TableId].name, extra: (i: Index) => (TABLE[tableId as TableId].fields.some((f) => f.name === 'رقم الإضبارة') ? [allocInvestor(i), fileLink()] : []) }],
  } : CONFIG.allocations)
  const [sp, setSp] = useSearchParams()
  const preset = PRESETS[sp.get('kpi') ?? '']
  const presetTab = preset ? cfg.tabs.findIndex((x) => x.table === preset.table) : -1
  const [chosenTab, setChosenTab] = useState(0)
  useEffect(() => setChosenTab(0), [tableId])
  // الفلتر القادم من اللوحة يحدد التبويب مباشرة من الرابط
  const tabIndex = presetTab >= 0 ? presetTab : chosenTab
  const setTabIndex = (i: number) => { setChosenTab(i); if (preset) setSp({}) }
  const tab = cfg.tabs[Math.min(tabIndex, cfg.tabs.length - 1)]
  const t = TABLE[tab.table]
  const activePreset = preset && preset.table === tab.table ? preset : undefined

  const columns = useMemo(() => {
    const base = schemaColumns(tab.table, tab.visible)
    const over = tab.override?.(idx) ?? {}
    const merged = base.map((c) => ({ ...c, ...(over[c.key] ?? {}) }))
    const all = [...merged, ...(tab.extra?.(idx) ?? [])]
    const order = tab.order ?? []
    const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length)
    return all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i).map((x) => x.c)
  }, [tab, idx])

  const rows = useMemo(() => {
    const base = byCity(db[tab.table], city)
    return activePreset?.pred ? base.filter((r) => activePreset.pred!(r, idx)) : base
  }, [db, tab.table, city, activePreset, idx])
  const onRowClick = (r: Rec) => {
    if (tab.table === 'allocations') return navigate(`/file/${encodeURIComponent(r._id)}`)
    if (r._alloc) return navigate(`/file/${encodeURIComponent(r._alloc)}`)
    if (tab.table === 'plots') {
      const a = idx.allocsByPlot.get(r._id)?.[0]
      if (a) navigate(`/file/${encodeURIComponent(a._id)}`)
    }
  }

  return (
    <div className="fade-in">
      <PageHeader kicker={`الجدول ${cfg.tabs.map((x) => TABLE[x.table].num).join('، ')} من الهيكل المقترح`} title={cfg.title} subtitle={cfg.subtitle} />
      {cfg.tabs.length > 1 && (
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {cfg.tabs.map((x, i) => (
            <button key={x.table} onClick={() => setTabIndex(i)}
              className={cls('-mb-px border-b-2 px-4 py-2 text-sm font-medium', i === tabIndex ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {x.label} <span className="num text-xs text-slate-400">({byCity(db[x.table], city).length})</span>
            </button>
          ))}
        </div>
      )}
      {activePreset && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/50 bg-gold-100 px-5 py-3 text-sm text-amber-950 fade-in">
          <Filter size={18} className="shrink-0 text-gold-600" />
          <div className="flex-1 leading-relaxed">
            <b>من اللوحة العامة: {activePreset.label}</b> — {activePreset.explain}
            <div className="text-xs text-amber-900/80">
              المعروض هنا <b className="num">{rows.length}</b> سجل من <b>العينة</b>
              {sp.get('n') && <> · الرقم في اللوحة (<b className="num">{Number(sp.get('n')).toLocaleString('en-US')}</b>) محسوب على كامل الملف</>}
              {sp.get('kpi') === 'overdue' && <> · <Link to="/t/installments?kpi=overdueRows" className="font-bold underline">عرض الأقساط التي لها تواريخ فعلاً</Link></>}
            </div>
          </div>
          <button onClick={() => setSp({})} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-700/20 hover:bg-brand-50">
            <X size={13} /> إزالة الفلتر
          </button>
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <Note>
          <b>كل سطر:</b> {t.row} · <b>المفتاح:</b> {t.key.join(' + ')}
          {t.note && <> · {t.note}</>}
        </Note>
        <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          <span><span className="text-rose-500">*</span> إلزامي حسب الهيكل</span>
          <span className="italic text-rose-400">غير متوفر</span> = إلزامي لكنه غير موجود في المصدر
        </div>
      </div>
      <DataTable key={`${tab.table}-${activePreset?.label ?? ''}`} storageKey={tab.table} rows={rows} columns={columns} onRowClick={onRowClick} />
    </div>
  )
}
