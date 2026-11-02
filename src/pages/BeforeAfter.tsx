import { ArrowLeft, FileSpreadsheet, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AllocPicker } from '../components/AllocPicker'
import { Badge, Card, Note, PageHeader, ReviewFlag, Value, cls } from '../components/ui'
import { DATA, type RawCell, type Rec } from '../data/load'
import { investorName, useStore, type Index } from '../data/store'
import { TABLE, type TableId } from '../schema/schema'

interface Example { label: string; test: (a: Rec, idx: Index) => boolean }

const EXAMPLES: Example[] = [
  { label: 'مقاسم مدموجة (578+777)', test: (a) => a._plotTags?.includes('merged') && a._src?.sheet === 'فرز' },
  { label: 'مقسم فرعي بـ \\ (16\\5)', test: (a) => a._plotTags?.includes('backslash') },
  { label: 'خلايا مدموجة', test: (a) => a._review?.some((r: string) => r.includes('مدموجة')) },
  { label: 'أعمدة مزاحة', test: (a) => a._review?.some((r: string) => r.includes('مزاحة')) },
  { label: 'تاريخان في خلية واحدة', test: (a) => a._dateKind === 'double' },
  { label: 'اسم + شركاء + سجل تجاري', test: (a, idx) => !!idx.investorByCode.get(a['رمز المستثمر'])?.['رقم السجل التجاري'] && (idx.partnersByInv.get(a['رمز المستثمر']) ?? []).length > 1 },
  { label: 'أقساط في 42 عموداً', test: (a, idx) => (idx.byAlloc.installments.get(a._id) ?? []).some((r) => r._status === 'متأخر') },
  { label: 'بيع ونقل ملكية', test: (a, idx) => (idx.byAlloc.contracts.get(a._id) ?? []).some((c) => c['نوع العقد'] === 'بيع بين مستثمرين') },
  { label: 'مستأجرون في خلية واحدة', test: (a, idx) => (idx.byAlloc.leases.get(a._id) ?? []).length > 1 },
  { label: 'تخصيص ملغى (بلاك)', test: (a) => a._src?.sheet === 'بلاك' },
]

const AFTER_TABLES: TableId[] = ['allocation_plots', 'decision_refs', 'events', 'industrial_licenses', 'building_licenses', 'admin_licenses',
  'contracts', 'financial', 'installments', 'leases', 'project', 'production', 'investment_licenses', 'subscriptions']

function cellTone(c: RawCell): { cls: string; note?: string } {
  const v = c.v
  if (c.merged) return { cls: 'cell-merged', note: `خلية مدموجة ${c.merged}${c.fromMerge ? ' — القيمة في الخلية الأولى فقط' : ''}` }
  if (/^(#N\/A|#######)$/.test(v)) return { cls: 'bg-slate-100 text-slate-400 line-through', note: 'خطأ إكسل محفوظ كقيمة' }
  if (c.t === 'text' && /\d{1,2}\/\d{1,2}\/\d{2,4}.*\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) return { cls: 'bg-red-50', note: 'أكثر من تاريخ في خلية واحدة' }
  if (c.t === 'text' && /^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(v)) return { cls: 'bg-amber-50', note: 'تاريخ مكتوب كنص' }
  if (c.t === 'text' && /^\d+[\\/]?\d*(\+\d+[\\/]?\d*)+$/.test(v.trim())) return { cls: 'bg-red-50', note: 'أكثر من مقسم في خلية' }
  if (c.t === 'text' && /\d+\\\d+/.test(v)) return { cls: 'bg-amber-50', note: 'فاصل فرعي \\ غير موحد' }
  if (c.t === 'text' && (/سجل\s*تجاري|لاصحابها|لأصحابها/.test(v))) return { cls: 'bg-amber-50', note: 'الاسم يجمع الشركة والشركاء والسجل' }
  if (c.t === 'text' && v.includes('\n')) return { cls: 'bg-amber-50', note: 'أكثر من قيمة في خلية' }
  if (c.t === 'text' && /^\d+(\.\d+)?\s*[^\d\s.]+/.test(v.trim()) && v.length < 30) return { cls: 'bg-amber-50', note: 'رقم مع وحدة/نص' }
  if (c.h === null) return { cls: 'bg-violet-50/50', note: 'عمود بدون عنوان' }
  return { cls: '' }
}

const showSpaces = (v: string) => {
  const lead = v.match(/^\s+/)?.[0].length ?? 0
  const trail = v.match(/\s+$/)?.[0].length ?? 0
  return (
    <>
      {lead > 0 && <span className="text-rose-400" title="مسافات زائدة">{'␣'.repeat(Math.min(lead, 3))}</span>}
      <span className="whitespace-pre-wrap">{v.trim()}</span>
      {trail > 0 && <span className="text-rose-400" title="مسافات زائدة">{'␣'.repeat(Math.min(trail, 3))}</span>}
    </>
  )
}

function AfterTable({ table, rows }: { table: TableId; rows: Rec[] }) {
  const fs = TABLE[table].fields.filter((f) => f.name !== 'المدينة' && (f.required || rows.some((r) => r[f.name] != null)))
  return (
    <div className="rounded-lg border border-emerald-200 bg-white">
      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm">
        <span className="num rounded bg-brand-700 px-1.5 text-xs font-bold text-white">{TABLE[table].num}</span>
        <span className="font-semibold text-brand-900">{TABLE[table].name}</span>
        <span className="num text-xs text-slate-500">{rows.length} سطر</span>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-xs">
          <thead><tr className="text-right text-slate-500">
            <th className="w-5" />
            {fs.map((f) => <th key={f.name} className="whitespace-nowrap px-2 py-1.5 font-semibold">{f.name}{f.required && <span className="text-rose-400">*</span>}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t border-slate-100 align-top">
                <td className="px-1 py-1.5"><ReviewFlag reasons={r._review} size={13} /></td>
                {fs.map((f) => <td key={f.name} className="px-2 py-1.5"><Value field={f} value={r[f.name]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BeforeAfter() {
  const { db, idx } = useStore()
  const [sp, setSp] = useSearchParams()
  const candidates = useMemo(() => db.allocations.filter((a) => DATA.raw[a._id]), [db])
  const examples = useMemo(() => EXAMPLES.map((e) => ({ ...e, alloc: candidates.find((a) => e.test(a, idx)) })).filter((e) => e.alloc), [candidates, idx])
  const [allocId, setAllocId] = useState(sp.get('alloc') ?? examples[0]?.alloc?._id ?? '')
  const choose = (id: string) => { setAllocId(id); setSp(id ? { alloc: id } : {}) }
  const a = idx.allocById.get(allocId)
  const raw = a ? DATA.raw[a._id] ?? [] : []
  const inv = a ? idx.investorByCode.get(a['رمز المستثمر']) : undefined
  const partners = inv ? idx.partnersByInv.get(inv['رمز المستثمر']) ?? [] : []
  const after: [TableId, Rec[]][] = a ? [
    ['allocations', [a]],
    ...(inv ? [['investors', [inv]] as [TableId, Rec[]]] : []),
    ...(partners.length ? [['partners', partners] as [TableId, Rec[]]] : []),
    ...AFTER_TABLES.map((t) => [t, idx.byAlloc[t]?.get(a._id) ?? []] as [TableId, Rec[]]).filter(([, r]) => r.length),
  ] : []
  const rawCells = raw.reduce((n, r) => n + r.cells.length, 0)
  const afterRows = after.reduce((n, [, r]) => n + r.length, 0)

  return (
    <div className="fade-in">
      <PageHeader kicker="للعرض" title="قبل / بعد"
        subtitle="سطر حقيقي من الإكسل كما هو (خلايا مدموجة، نصوص مخلوطة، أعمدة عريضة) جنب نفس البيانات بعد الهيكلة: كل معلومة في خانتها، وكل تكرار سطر مستقل." />
      <div className="mb-4 flex flex-wrap gap-2">
        {examples.map((e) => (
          <button key={e.label} onClick={() => choose(e.alloc!._id)}
            className={cls('rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition', allocId === e.alloc!._id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-brand-50')}>
            {e.label}
          </button>
        ))}
      </div>
      <div className="mb-5 max-w-2xl"><AllocPicker value={allocId} onChange={choose} /></div>

      {!a ? <Note>اختر مثالاً من الأعلى.</Note> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-brand-900 px-6 py-4 text-white">
            <div className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-gold-500" /><span className="num text-2xl font-bold">{raw.length}</span> سطر إكسل · <span className="num">{rawCells}</span> خلية</div>
            <ArrowLeft size={22} className="text-gold-500" />
            <div className="flex items-center gap-2"><Table2 size={20} className="text-gold-500" /><span className="num text-2xl font-bold">{afterRows}</span> سجلاً في <span className="num">{after.length}</span> جداول موحدة</div>
            <span className="flex-1" />
            <Link to={`/file/${encodeURIComponent(a._id)}`} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">فتح الإضبارة ←</Link>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title={<span className="flex items-center gap-2"><FileSpreadsheet size={18} className="text-emerald-700" /> قبل: كما ورد في الإكسل</span>}>
              <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                <span className="cell-merged rounded px-2 py-0.5 ring-1 ring-violet-200">خلية مدموجة</span>
                <span className="rounded bg-red-50 px-2 py-0.5 ring-1 ring-red-200">عدة قيم في خلية</span>
                <span className="rounded bg-amber-50 px-2 py-0.5 ring-1 ring-amber-200">صيغة غير موحدة</span>
                <span className="rounded px-2 py-0.5 ring-1 ring-slate-200"><span className="text-rose-400">␣</span> مسافات زائدة</span>
              </div>
              <div className="space-y-4">
                {raw.map((r, i) => (
                  <div key={i} className="overflow-hidden rounded-lg border border-slate-300">
                    <div className="flex items-center gap-2 bg-emerald-700 px-3 py-1.5 text-xs text-white">
                      <FileSpreadsheet size={13} /> {r.label} <span className="flex-1" /> شيت «{r.sheet}» · السطر <span className="num">{r.row}</span>
                    </div>
                    <div className="max-h-[560px] overflow-y-auto scroll-thin font-mono">
                      <table className="w-full text-xs">
                        <tbody>
                          {r.cells.map((c) => {
                            const tone = cellTone(c)
                            return (
                              <tr key={c.col} className="border-b border-slate-200">
                                <td className="w-10 bg-slate-100 px-2 py-1 text-center text-slate-500 num">{c.col}</td>
                                <td className="w-44 border-x border-slate-200 bg-slate-50 px-2 py-1 font-sans text-slate-600">{c.h ?? <i className="text-violet-500">(بدون عنوان)</i>}</td>
                                <td className={cls('px-2 py-1 font-sans text-slate-800', tone.cls)} title={tone.note}>
                                  {c.v === '' ? <i className="text-slate-300">فارغة</i> : showSpaces(c.v)}
                                  {tone.note && <span className="mr-2 text-[10px] text-slate-500">← {tone.note}</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title={<span className="flex items-center gap-2"><Table2 size={18} className="text-brand-700" /> بعد: الهيكل الموحد</span>}
              actions={<Badge value={investorName(a['رمز المستثمر'], idx).slice(0, 30)} />}>
              <div className="space-y-3">
                {after.map(([t, rows]) => <AfterTable key={t} table={t} rows={rows} />)}
              </div>
              {a._review?.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <b>ما لم يُخمَّن (needs_review):</b>
                  <ul className="mt-1 list-disc pr-5">{a._review.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
