import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type Column } from '../../components/DataTable'
import { Badge, Note, PageHeader } from '../../components/ui'
import { MONTH_LABEL, MONTHLY, tables } from '../../data/monthly'
import type { Rec } from '../../data/load'
import { PlotsTable } from './PlotsTable'
import { CityName, Progress, fmt, fmtSYP, useMCity } from './shared'

const city: Column = { key: 'المدينة', label: 'المدينة', filter: true, render: (r) => <CityName city={r['المدينة']} /> }
const row: Column = { key: '_row', label: 'السطر في الإكسل', value: (r) => r._src?.row, render: (r) => <span className="num text-slate-400">{r._src?.row}</span> }
const num = (key: string, label = key, hidden = false): Column => ({ key, label, hidden, render: (r) => <span className="num">{fmt(r[key])}</span> })

const INST_STYLE: Record<string, string> = {
  'مدفوع': '!bg-emerald-50 !text-emerald-700', 'متأخر': '!bg-red-50 !text-red-700', 'غير مستحق بعد': '!bg-slate-50 !text-slate-600', 'بلا تاريخ': '!bg-amber-50 !text-amber-700',
}

const DEFS: Record<string, { title: string; subtitle: string; source: string; rows: () => Rec[]; columns: Column[] }> = {
  investors: {
    title: 'المستثمرون',
    subtitle: 'كل مستثمر حالي مع عدد مقاسمه ومساحتها. التجميع حسب الاسم كما ورد في كل مدينة: نفس الشخص بكتابة مختلفة يظهر مرتين.',
    source: 'شيت المقاسم — عمود (اسم المستثمر الحالي)',
    rows: () => tables().investors,
    columns: [
      city,
      { key: 'اسم المستثمر', label: 'اسم المستثمر', render: (r) => <span className="min-w-48 font-bold text-slate-800">{r['اسم المستثمر']}</span> },
      { key: 'نوع المستثمر', label: 'النوع', filter: true },
      { key: 'الجنسية', label: 'الجنسية', filter: true },
      { key: 'الدولة', label: 'الدولة', filter: true, hidden: true },
      num('عدد المقاسم'),
      num('المساحة م²'),
      { key: 'القطاعات', label: 'القطاعات' },
      { key: 'الأنشطة', label: 'الأنشطة' },
      { key: 'المقاسم', label: 'المقاسم', hidden: true },
      { key: 'رقم السجل التجاري', label: 'السجل التجاري', hidden: true },
    ],
  },
  licenses: {
    title: 'التراخيص',
    subtitle: 'سطر لكل ترخيص صناعي أو إداري أو رخصة بناء أو سجل صناعي مذكور في شيت المقاسم.',
    source: 'شيت المقاسم — أعمدة أرقام وتواريخ التراخيص',
    rows: () => tables().licenses,
    columns: [
      city,
      { key: 'نوع الترخيص', label: 'نوع الترخيص', filter: true, render: (r) => <Badge value={r['نوع الترخيص']} /> },
      { key: 'الرقم', label: 'الرقم', render: (r) => <span className="num">{r['الرقم'] ?? <span className="text-xs italic text-rose-400">فارغ</span>}</span> },
      { key: 'التاريخ', label: 'التاريخ', render: (r) => <span className="num whitespace-nowrap">{r['التاريخ'] ?? '—'}</span> },
      { key: 'نوع الترخيص الإداري', label: 'مدة الترخيص الإداري', filter: true },
      { key: 'المقسم', label: 'المقسم' },
      { key: 'المستثمر', label: 'المستثمر' },
      { key: 'النشاط', label: 'النشاط', hidden: true },
      { key: 'مرحلة المقسم', label: 'مرحلة المقسم', filter: true, hidden: true },
      row,
    ],
  },
  leases: {
    title: 'الإيجارات',
    subtitle: 'المقاسم المؤجرة، أو التي فيها اسم مستأجر.',
    source: 'شيت المقاسم — أعمدة الإيجار',
    rows: () => tables().leases,
    columns: [
      city,
      { key: 'المقسم', label: 'المقسم' },
      { key: 'المالك (المستثمر)', label: 'المالك (المستثمر)' },
      { key: 'المستأجر', label: 'المستأجر', render: (r) => r['المستأجر'] ? <span className="whitespace-pre-line">{r['المستأجر']}</span> : <span className="text-xs italic text-rose-400">فارغ</span> },
      { key: 'مؤجر؟', label: 'مؤجر؟', filter: true },
      { key: 'رقم ترخيص المستأجر', label: 'ترخيص المستأجر', render: (r) => <span className="num whitespace-pre-line">{r['رقم ترخيص المستأجر'] ?? '—'}</span> },
      { key: 'تاريخ ترخيص المستأجر', label: 'تاريخه', render: (r) => <span className="num whitespace-pre-line">{r['تاريخ ترخيص المستأجر'] ?? '—'}</span> },
      { key: 'سجل المستأجر الصناعي', label: 'السجل الصناعي للمستأجر', hidden: true },
      { key: 'النشاط', label: 'النشاط' },
      num('المساحة م²', 'المساحة م²', true),
      row,
    ],
  },
  installments: {
    title: 'الأقساط',
    subtitle: 'سطر لكل قسط. «متأخر» = غير مدفوع وتاريخ استحقاقه قبل 2026-10-31. عبّأت هذا الشيت حسياء وباب الهوى فقط.',
    source: 'ملف المقاسم — شيت الأقساط',
    rows: () => MONTHLY.installments,
    columns: [
      city,
      { key: 'المقسم', label: 'المقسم' },
      num('رقم القسط'),
      num('قيمة القسط'),
      { key: 'تاريخ الاستحقاق', label: 'الاستحقاق', render: (r) => <span className="num whitespace-nowrap">{r['تاريخ الاستحقاق'] ?? <span className="text-xs italic text-rose-400">فارغ</span>}</span> },
      { key: 'الوضع', label: 'الوضع', filter: true, render: (r) => <Badge value={r['الوضع']} className={INST_STYLE[r['الوضع']]} /> },
      { key: 'رقم الإيصال', label: 'رقم الإيصال', render: (r) => <span className="num">{r['رقم الإيصال'] ?? '—'}</span> },
      { key: 'تاريخ الإيصال', label: 'تاريخ الإيصال', hidden: true },
      num('القيمة بالليرة', 'القيمة بالليرة', true),
      num('القيمة بالدولار', 'القيمة بالدولار', true),
      row,
    ],
  },
  previous: {
    title: 'التخصيصات السابقة',
    subtitle: 'المستثمرون الذين أُلغي تخصيصهم. سجّلت حسياء وحدها بيانات في هذا الشيت.',
    source: 'ملف المقاسم — شيت التخصيصات السابقة',
    rows: () => tables().previous,
    columns: [
      city,
      { key: 'المقسم', label: 'المقسم' },
      { key: 'المستثمر السابق', label: 'المستثمر السابق' },
      { key: 'تاريخ التخصيص', label: 'تاريخ التخصيص' },
      { key: 'تاريخ الإلغاء', label: 'تاريخ الإلغاء' },
      { key: 'سبب الإلغاء', label: 'سبب الإلغاء', filter: true },
      { key: 'التفاصيل', label: 'التفاصيل', hidden: true },
      row,
    ],
  },
  projects: {
    title: 'مشاريع الخطة الاستثمارية',
    subtitle: 'كل مشاريع الخطة الاستثمارية للبنى التحتية. المبالغ بالليرة السورية.',
    source: 'قالب الاستثمارات — شيت الخطة الاستثمارية',
    rows: () => tables().projects,
    columns: [
      city,
      { key: 'اسم المشروع', label: 'اسم المشروع', render: (r) => <span className="line-clamp-3 min-w-64 text-[13px]" title={r['اسم المشروع']}>{r['اسم المشروع']}</span> },
      { key: 'نوع المشروع', label: 'النوع', filter: true },
      { key: 'حالة المشروع', label: 'الحالة', filter: true, render: (r) => (r['حالة المشروع'] ? <Badge value={r['حالة المشروع']} /> : <span className="text-xs italic text-rose-400">فارغ</span>) },
      { key: 'planned', label: 'الاعتماد المخطط', render: (r) => <span className="num whitespace-nowrap">{fmtSYP(r.planned)}</span> },
      { key: 'contract', label: 'قيمة العقد', render: (r) => <span className="num whitespace-nowrap">{fmtSYP(r.contract)}</span> },
      { key: 'spent', label: 'المنفق', render: (r) => <span className="num whitespace-nowrap">{fmtSYP(r.spent)}</span> },
      { key: 'physical', label: 'التنفيذ المادي', render: (r) => <Progress value={r.physical} /> },
      { key: 'financial', label: 'التنفيذ المالي', render: (r) => <Progress value={r.financial} color="#c7a66b" /> },
      { key: 'الجهة المنفذة', label: 'الجهة المنفذة' },
      { key: 'dContract', label: 'تاريخ التعاقد', hidden: true },
      { key: 'dStart', label: 'تاريخ المباشرة', hidden: true },
      { key: 'dStop', label: 'تاريخ التوقف', hidden: true },
      { key: 'سبب التوقف', label: 'سبب التوقف', hidden: true },
      { key: 'dEnd', label: 'تاريخ الانتهاء', hidden: true },
      { key: 'ملاحظات', label: 'ملاحظات', hidden: true },
      row,
    ],
  },
}

export function DataPage() {
  const { table = 'plots' } = useParams()
  const { city: cf, cities } = useMCity()
  const def = DEFS[table]
  const rows = useMemo(() => (def ? def.rows().filter((r) => cities.includes(r['المدينة'])) : []), [table, cf])

  if (table === 'plots' || !def) {
    return (
      <div className="fade-in">
        <PageHeader kicker={`ملف المقاسم · ${MONTH_LABEL}`} title="سجل المقاسم" subtitle="كل المقاسم كما وردت من المدن الخمس، مع مشاكل كل سطر." />
        <PlotsTable />
      </div>
    )
  }
  const flagged = rows.filter((r) => r._review?.length).length
  return (
    <div className="fade-in">
      <PageHeader kicker={`${def.source} · ${MONTH_LABEL}`} title={def.title} subtitle={def.subtitle} />
      <div className="mt-6 space-y-4">
        <Note>
          <b className="num">{fmt(rows.length)}</b> سجل{cf !== 'الكل' && <> في {cf}</>}، منها <b className="num">{fmt(flagged)}</b> عليه ملاحظة (المثلث البرتقالي).
          غيّر المدينة من الشريط العلوي. المشاكل كلها مع أمثلتها في <Link to="/monthly/issues" className="font-bold underline">مشاكل البيانات</Link>.
        </Note>
        <DataTable key={`${table}-${cf}`} rows={rows} columns={def.columns} storageKey={`m-${table}`} emptyText="لا توجد سجلات لهذه المدينة في الملفات المستلمة" />
      </div>
    </div>
  )
}
