import {
  Ban, BadgeCheck, Building, CalendarX2, FileSignature, FileText, GitMerge, HandCoins, Landmark, RotateCcw,
  Scissors, Shuffle, UserRoundPen, Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Rec } from '../data/load'
import type { Index } from '../data/store'
import { plotsOf } from '../data/store'
import { Badge, ReviewFlag, cls, fmtNum } from './ui'

export interface TItem {
  key: string
  date: string | null
  title: string
  kind: string
  lines: ReactNode[]
  tone: 'brand' | 'green' | 'red' | 'amber' | 'violet' | 'sky' | 'slate'
  icon: React.ElementType
  review?: string[]
  local?: boolean
}

const TONE: Record<TItem['tone'], string> = {
  brand: 'bg-brand-700 text-white ring-brand-200',
  green: 'bg-emerald-600 text-white ring-emerald-100',
  red: 'bg-red-600 text-white ring-red-100',
  amber: 'bg-amber-500 text-white ring-amber-100',
  violet: 'bg-violet-600 text-white ring-violet-100',
  sky: 'bg-sky-600 text-white ring-sky-100',
  slate: 'bg-slate-500 text-white ring-slate-100',
}

const EVENT_STYLE: Record<string, [TItem['tone'], React.ElementType]> = {
  'إلغاء تخصيص': ['red', Ban],
  'طلب طي إلغاء': ['amber', RotateCcw],
  'طي إلغاء': ['green', RotateCcw],
  'نقل ملكية كامل': ['sky', HandCoins],
  'نقل ملكية جزئي': ['sky', HandCoins],
  'دمج': ['violet', GitMerge],
  'فصل': ['violet', Scissors],
  'تبديل مقسم': ['violet', Shuffle],
  'إعادة تخصيص': ['brand', FileText],
  'إضافة/تعديل صناعة': ['slate', UserRoundPen],
  'تعديل شركاء': ['slate', Users],
  'طلب استرداد أموال': ['amber', HandCoins],
  'انسحاب': ['red', CalendarX2],
}

const kv = (label: string, v: unknown) =>
  v === null || v === undefined || v === '' ? null : (
    <span key={label}>
      <span className="text-slate-400">{label}: </span>
      <span className="text-slate-700">{typeof v === 'number' ? fmtNum(v) : String(v)}</span>
    </span>
  )

export function buildTimeline(a: Rec, idx: Index): TItem[] {
  const get = (t: string) => idx.byAlloc[t]?.get(a._id) ?? []
  const items: TItem[] = []
  for (const s of get('subscriptions'))
    items.push({ key: s._id, date: s['تاريخ الاكتتاب'], title: 'اكتتاب', kind: 'طلبات الاكتتاب', tone: 'slate', icon: FileText, review: s._review,
      lines: [kv('الصناعة المطلوبة', s['الصناعة المطلوبة']), kv('المساحة المطلوبة م2', s['المساحة المطلوبة م2']), kv('حالة الطلب', s['حالة الطلب'])] })
  items.push({
    key: a._id, date: a['تاريخ التخصيص'], title: 'تخصيص', kind: 'التخصيصات', tone: 'brand', icon: Landmark, local: a._local,
    review: a._dateKind === 'double' || a._dateKind === 'invalid' ? a._review.filter((r: string) => r.includes('تاريخ')) : [],
    lines: [kv('قرار التخصيص', a['قرار التخصيص']), kv('المساحة الإجمالية م2', a['المساحة الإجمالية م2']), kv('المقاسم', plotsOf(a._id, idx).join(' + '))],
  })
  for (const l of get('industrial_licenses'))
    items.push({ key: l._id, date: l['تاريخ القرار'], title: 'ترخيص صناعي', kind: 'التراخيص الصناعية', tone: 'green', icon: BadgeCheck, review: l._review, local: l._local,
      lines: [kv('رقم القرار الصناعي', l['رقم القرار الصناعي']), kv('السند القانوني', l['السند القانوني']), kv('الجهة المصدرة', l['الجهة المصدرة'])] })
  for (const l of get('building_licenses'))
    items.push({ key: l._id, date: l['تاريخ الرخصة'], title: 'رخصة بناء', kind: 'رخص البناء', tone: 'green', icon: Building, review: l._review, local: l._local,
      lines: [kv('رقم رخصة البناء', l['رقم رخصة البناء']), kv('المساحة المرخصة م2', l['المساحة المرخصة م2']), kv('حالة الترخيص', l['حالة الترخيص'])] })
  for (const l of get('admin_licenses'))
    items.push({ key: l._id, date: l['تاريخ الترخيص'], title: 'ترخيص إداري', kind: 'التراخيص الإدارية', tone: 'green', icon: BadgeCheck, review: l._review, local: l._local,
      lines: [kv('رقم الرخصة الإدارية', l['رقم الرخصة الإدارية']), kv('رقم القرار', l['رقم القرار']), kv('المدة', l['المدة']), kv('تاريخ الانتهاء', l['تاريخ الانتهاء']), kv('صاحب الترخيص', l['صاحب الترخيص'])] })
  for (const l of get('investment_licenses'))
    items.push({ key: l._id, date: l['تاريخ الإجازة'], title: 'إجازة استثمار', kind: 'الإجازات الاستثمارية', tone: 'brand', icon: FileSignature, review: l._review,
      lines: [kv('رقم الإجازة', l['رقم إجازة الاستثمار']), kv('القانون', l['القانون']), kv('اسم المشروع', l['اسم المشروع'])] })
  for (const c of get('contracts').filter((c) => c['نوع العقد'] === 'بيع من المدينة'))
    items.push({ key: c._id, date: c['تاريخ العقد'], title: 'عقد بيع من المدينة', kind: 'العقود', tone: 'sky', icon: FileSignature, review: c._review, local: c._local,
      lines: [kv('رقم العقد', c['رقم العقد']), kv('القيمة', c['القيمة'] != null ? `${fmtNum(c['القيمة'])} ${c['العملة'] ?? ''}` : null)] })
  for (const e of get('events')) {
    const [tone, icon] = EVENT_STYLE[e['نوع الحدث']] ?? ['slate', FileText]
    items.push({
      key: e._id, date: e['تاريخ الحدث'], title: e['نوع الحدث'] ?? 'حدث غير مصنّف', kind: 'الأحداث', tone, icon, review: e._review, local: e._local,
      lines: [
        kv('رقم القرار / الوثيقة', e['رقم القرار / الوثيقة']), kv('رقم المقسم', e['رقم المقسم']),
        e['المستثمر السابق'] || e['المستثمر الجديد'] ? (
          <span key="tr" className="block"><span className="text-slate-400">من: </span>{e['المستثمر السابق'] ?? '—'} <span className="text-slate-400">← إلى: </span>{e['المستثمر الجديد'] ?? '—'}</span>
        ) : null,
        kv('النسبة المنقولة %', e['النسبة المنقولة %']), kv('رقم الطلب الوارد', e['رقم الطلب الوارد']), kv('حالة الطلب', e['حالة الطلب']),
        kv('القيمة المعدّلة', e['القيمة المعدّلة']),
        e['يُحتسب في الإحصاء'] === false ? <span key="nc" className="text-slate-500">لا يُحتسب في الإحصاء</span> : null,
        e['التفاصيل'] ? <span key="d" className="block text-slate-500">{e['التفاصيل']}</span> : null,
      ],
    })
  }
  return items.sort((x, y) => (x.date ?? '9999').localeCompare(y.date ?? '9999'))
}

export function Timeline({ items }: { items: TItem[] }) {
  const dated = items.filter((i) => i.date)
  const undated = items.filter((i) => !i.date)
  const row = (it: TItem) => {
    const Icon = it.icon
    return (
      <li key={it.key} className="relative pr-12 pb-6 last:pb-0">
        <span className={cls('absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full ring-4', TONE[it.tone])}>
          <Icon size={16} />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="num min-w-24 text-sm font-semibold text-brand-800">{it.date ?? 'بدون تاريخ'}</span>
          <span className="font-semibold text-slate-800">{it.title}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">جدول: {it.kind}</span>
          {it.local && <Badge value="مُدخل الآن" className="!bg-emerald-100 !text-emerald-800" />}
          <ReviewFlag reasons={it.review ?? []} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm leading-relaxed">{it.lines.filter(Boolean)}</div>
      </li>
    )
  }
  return (
    <div>
      <ol className="relative before:absolute before:right-[17px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:bg-slate-200">
        {dated.map(row)}
      </ol>
      {undated.length > 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4">
          <div className="mb-3 text-sm font-semibold text-amber-800">أحداث بدون تاريخ في الملف الأصلي (needs_review)</div>
          <ol className="relative">{undated.map(row)}</ol>
        </div>
      )}
    </div>
  )
}
