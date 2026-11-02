import { useMemo } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { Badge, Note } from '../../components/ui'
import { MONTHLY } from '../../data/monthly'
import { CityName, Section, fmt, isOffList, useMCity } from './shared'

const STATUS_STYLE: Record<string, string> = {
  'مخصص': '!bg-brand-50 !text-brand-700', 'شاغر': '!bg-gold-100 !text-gold-600', 'مكتتب عليه': '!bg-sky-50 !text-sky-700', 'غير محدد': '!bg-slate-100 !text-slate-500',
}

const listCell = (list: string) => (r: Record<string, any>, key: string) => {
  const v = r[key]
  if (!v) return <span className="text-slate-300">—</span>
  return isOffList(list, v) ? <span className="font-bold text-red-700" title="ليست من القائمة المنسدلة للقالب">{v}</span> : <span>{v}</span>
}

export function PlotsTable() {
  const { city, cities } = useMCity()
  const rows = useMemo(() => MONTHLY.plots.filter((p) => cities.includes(p['المدينة'])), [city])
  const phase = listCell('المرحلة'), cat = listCell('فئة_الصناعة'), service = listCell('التخديم')
  const columns: Column[] = [
    { key: 'المدينة', label: 'المدينة', filter: true, render: (r) => <CityName city={r['المدينة']} /> },
    { key: 'القطاع', label: 'القطاع', filter: true },
    { key: 'رقم المقسم', label: 'رقم المقسم', render: (r) => <span className="num font-bold">{r['رقم المقسم']}</span> },
    { key: 'المساحة م²', label: 'المساحة م²' },
    { key: 'الحالة', label: 'الحالة', filter: true, render: (r) => <Badge value={r['الحالة']} className={STATUS_STYLE[r['الحالة']]} /> },
    { key: 'مرحلة المقسم', label: 'مرحلة المقسم (كما وردت)', filter: true, render: (r) => phase(r, 'مرحلة المقسم') },
    { key: 'حالة التخديم', label: 'التخديم', filter: true, render: (r) => service(r, 'حالة التخديم') },
    { key: 'تصنيف المقسم', label: 'التصنيف', filter: true, hidden: true },
    { key: 'فئة الصناعة', label: 'فئة الصناعة', filter: true, render: (r) => cat(r, 'فئة الصناعة') },
    { key: 'اسم النشاط الصناعي', label: 'النشاط' },
    { key: 'نوع المستثمر', label: 'نوع المستثمر', filter: true, hidden: true },
    { key: 'اسم المستثمر الحالي', label: 'المستثمر الحالي' },
    { key: 'الجنسية', label: 'الجنسية', filter: true, hidden: true },
    { key: 'الدولة (للأجنبي)', label: 'الدولة', filter: true, hidden: true },
    { key: 'تاريخ قرار التخصيص', label: 'تاريخ التخصيص' },
    { key: 'نمط الاستثمار', label: 'نمط الاستثمار', filter: true, hidden: true },
    { key: 'رقم الترخيص الإداري', label: 'ترخيص إداري', hidden: true },
    { key: 'نوع الترخيص الإداري', label: 'نوع الترخيص الإداري', filter: true, hidden: true },
    { key: 'رقم رخصة البناء', label: 'رخصة البناء', hidden: true },
    { key: 'مدموج؟', label: 'مدموج؟', filter: true, hidden: true },
    { key: 'المقاسم المدموجة', label: 'المقاسم المدموجة', hidden: true },
    { key: 'طريقة الدفع', label: 'طريقة الدفع', filter: true, hidden: true },
    { key: 'سعر المتر', label: 'سعر المتر', hidden: true },
    { key: 'العملة', label: 'العملة', filter: true, hidden: true },
    { key: 'عدد الأقساط', label: 'عدد الأقساط', hidden: true },
    { key: 'أقساط مسجلة', label: 'أقساط مسجلة', hidden: true },
    { key: 'حالة الأقساط', label: 'حالة الأقساط', filter: true, hidden: true },
    { key: 'عليه أقساط متأخرة', label: 'متأخر؟', filter: true, hidden: true },
    { key: 'مؤجر؟', label: 'مؤجر؟', filter: true, hidden: true },
    { key: 'اسم المستأجر', label: 'المستأجر', hidden: true },
    { key: 'ملاحظات', label: 'ملاحظات المدينة', hidden: true },
    { key: '_row', label: 'السطر في الإكسل', value: (r) => r._src?.row, render: (r) => <span className="num text-slate-400">{r._src?.row}</span> },
  ]
  const flagged = rows.filter((r) => r._review.length).length
  return (
    <Section title="سجل المقاسم الكامل" cols="grid-cols-1"
      note={<>كل المقاسم كما وردت في شيت المقاسم: <b className="num">{fmt(rows.length)}</b> مقسم، منها <b className="num text-amber-700">{fmt(flagged)}</b> عليه ملاحظة واحدة على الأقل. «الحالة» محسوبة من المرحلة لتوحيد المدن، و«مرحلة المقسم» كما كتبتها المدينة.</>}>
      <Note>مرّر على المثلث البرتقالي لرؤية مشاكل السطر. القيم الحمراء ليست من القائمة المنسدلة. فعّل «المعلّمة للمراجعة فقط» لرؤية السطور التي تحتاج تصحيحاً، وأظهر أعمدة إضافية من زر «الأعمدة».</Note>
      <DataTable key={city} rows={rows} columns={columns} storageKey="monthly-plots" />
    </Section>
  )
}
