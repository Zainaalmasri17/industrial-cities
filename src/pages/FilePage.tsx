import {
  AlertTriangle, ArrowLeftRight, Banknote, BadgeCheck, CalendarClock, ChevronLeft, ClipboardPlus, FileSpreadsheet,
  Gauge, History, Info, KeyRound, ListPlus, Lock, MapPinned, User, Users,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Timeline, buildTimeline } from '../components/Timeline'
import { Badge, Button, Card, Note, ReviewFlag, Value, cls, fmtNum } from '../components/ui'
import type { Rec } from '../data/load'
import { effectiveStatus, investorName, useStore } from '../data/store'
import { TABLE, type TableId } from '../schema/schema'

function KV({ table, rec, fields }: { table: TableId; rec: Rec; fields?: string[] }) {
  const fs = TABLE[table].fields.filter((f) => !fields || fields.includes(f.name))
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {fs.map((f) => (
        <div key={f.name} className="contents">
          <dt className="whitespace-nowrap text-slate-400">{f.name}{f.required && <span className="text-rose-400">*</span>}</dt>
          <dd className="text-slate-800"><Value field={f} value={rec[f.name]} /></dd>
        </div>
      ))}
    </dl>
  )
}

function MiniTable({ table, rows, fields, extra }: { table: TableId; rows: Rec[]; fields: string[]; extra?: { label: string; render: (r: Rec) => React.ReactNode } }) {
  const fs = TABLE[table].fields.filter((f) => fields.includes(f.name))
  if (!rows.length) return <div className="py-3 text-center text-sm text-slate-400">لا توجد سجلات</div>
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
            <th className="w-6" />
            {fs.map((f) => <th key={f.name} className="whitespace-nowrap px-2 py-2 font-semibold">{f.name}</th>)}
            {extra && <th className="px-2 py-2 font-semibold">{extra.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className={cls('border-b border-slate-100 align-top', r._local && 'bg-emerald-50/50')}>
              <td className="py-2"><ReviewFlag reasons={r._review} size={14} /></td>
              {fs.map((f) => <td key={f.name} className="px-2 py-2"><Value field={f} value={r[f.name]} /></td>)}
              {extra && <td className="px-2 py-2">{extra.render(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FilePage() {
  const { id = '' } = useParams()
  const { idx } = useStore()
  const navigate = useNavigate()
  const a = idx.allocById.get(decodeURIComponent(id))
  if (!a) return <Note tone="warn">الإضبارة غير موجودة. <Link to="/t/allocations" className="underline">العودة للتخصيصات</Link></Note>

  const get = (t: TableId) => idx.byAlloc[t]?.get(a._id) ?? []
  const inv = idx.investorByCode.get(a['رمز المستثمر'])
  const partners = inv ? idx.partnersByInv.get(inv['رمز المستثمر']) ?? [] : []
  const aPlots = get('allocation_plots')
  const status = effectiveStatus(a, idx)
  const timeline = buildTimeline(a, idx)
  const inst = [...get('installments')].sort((x, y) => x['رقم القسط'] - y['رقم القسط'])
  const fin = get('financial')[0]
  const instStatus = (r: Rec) => r._status ?? (r['تاريخ الدفع'] ? 'مدفوع' : r['تاريخ الاستحقاق'] && r['تاريخ الاستحقاق'] < new Date().toISOString().slice(0, 10) ? 'متأخر' : 'غير مستحق بعد')
  const counts = inst.reduce<Record<string, number>>((m, r) => ({ ...m, [instStatus(r)]: (m[instStatus(r)] ?? 0) + 1 }), {})
  const finSaysDue = fin && [fin['حالة أقساط الأرض'], fin['حالة فرق السعر']].some((x) => x && String(x).startsWith('مستحق'))
  const childFlags = (['events', 'industrial_licenses', 'building_licenses', 'admin_licenses', 'contracts', 'installments', 'leases', 'production'] as TableId[])
    .reduce((n, t) => n + get(t).filter((r) => r._review?.length).length, 0)
  const q = `?alloc=${encodeURIComponent(a._id)}`

  return (
    <div className="fade-in space-y-5">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link to="/t/allocations" className="hover:text-brand-700">التخصيصات</Link>
        <ChevronLeft size={14} />
        <span className="text-slate-700">الإضبارة</span>
      </nav>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-brand-900">
                إضبارة رقم <span className="num">{a['رقم الإضبارة'] ?? <span className="text-base italic text-rose-400">غير متوفر</span>}</span>
              </h1>
              <Badge value={a['المدينة']} />
              {status && <Badge value={status} className="text-sm" />}
              {a._local && <Badge value="مُدخلة الآن (محلي)" className="!bg-emerald-100 !text-emerald-800" />}
            </div>
            <div className="mt-2 text-lg text-slate-700">{investorName(a['رمز المستثمر'], idx)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><KeyRound size={12} /> المفتاح الداخلي المؤقت: <code className="text-slate-700">{a._id}</code></span>
              {a._src && <span className="inline-flex items-center gap-1"><FileSpreadsheet size={12} /> المصدر: شيت «{a._src.sheet}» — السطر {a._src.row}</span>}
              <span>{a['الفئة الصناعية'] ?? '—'} {a['درجة الصناعة'] ?? ''}</span>
              <span>قرار التخصيص <b className="num text-slate-700">{a['قرار التخصيص'] ?? '—'}</b> بتاريخ <b className="num text-slate-700">{a['تاريخ التخصيص'] ?? '—'}</b></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/before-after${q}`)}><ArrowLeftRight size={16} /> السطر الأصلي</Button>
            <Button onClick={() => navigate(`/new/event${q}`)}><CalendarClock size={16} /> تسجيل حدث</Button>
            <Button variant="secondary" onClick={() => navigate(`/new/license${q}`)}><ClipboardPlus size={16} /> ترخيص</Button>
            <Button variant="secondary" onClick={() => navigate(`/new/installment${q}`)}><ListPlus size={16} /> قسط</Button>
          </div>
        </div>
        {(a._review?.length > 0 || childFlags > 0) && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> needs_review — نقاط تحتاج مراجعة قبل الاعتماد</div>
            <ul className="list-disc space-y-0.5 pr-6">
              {a._review.map((r: string, i: number) => <li key={i}>{r}</li>)}
              {childFlags > 0 && <li>{childFlags} سجل مرتبط (أحداث/تراخيص/أقساط…) معلّم — مرّر على أيقونة التحذير بجانب كل سجل</li>}
            </ul>
          </div>
        )}
        {a._info?.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-500"><Info size={14} className="mt-0.5" />{a._info.join(' · ')}</div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card title={<>السجل الزمني للإضبارة <span className="num text-sm font-normal text-slate-400">({timeline.length})</span></>} icon={<History size={18} />}
            actions={<span className="text-xs text-slate-400">مجمّع من: التخصيص، الاكتتاب، التراخيص، العقود، الأحداث</span>}>
            <Timeline items={timeline} />
          </Card>

          <Card title="التراخيص والعقود" icon={<BadgeCheck size={18} />}>
            <div className="space-y-5">
              {([
                ['industrial_licenses', ['رقم القرار الصناعي', 'تاريخ القرار', 'السند القانوني', 'الجهة المصدرة', 'الصناعة المرخصة', 'يعدّل الترخيص رقم']],
                ['building_licenses', ['رقم رخصة البناء', 'تاريخ الرخصة', 'نوع', 'المساحة المرخصة م2', 'حالة الترخيص']],
                ['admin_licenses', ['رقم الرخصة الإدارية', 'رقم القرار', 'تاريخ الترخيص', 'المدة', 'تاريخ الانتهاء', 'النطاق', 'صاحب الترخيص', 'رمز المستأجر']],
                ['investment_licenses', ['رقم إجازة الاستثمار', 'تاريخ الإجازة', 'القانون', 'اسم المشروع', 'مستفيد من القانون']],
                ['contracts', ['نوع العقد', 'رقم العقد', 'تاريخ العقد', 'القيمة', 'العملة', 'البائع', 'الشاري', 'النسبة المباعة %']],
              ] as [TableId, string[]][]).map(([t, fs]) => (
                <div key={t}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    {TABLE[t].name} <span className="num rounded-full bg-slate-100 px-2 text-xs text-slate-500">{get(t).length}</span>
                  </div>
                  <MiniTable table={t} rows={t === 'contracts' ? get(t).map((c) => ({ ...c, 'الشاري': c['الشاري']?.startsWith?.('INV-') ? investorName(c['الشاري'], idx) : c['الشاري'] })) : get(t)} fields={fs} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="الوضع المالي والأقساط" icon={<Banknote size={18} />}
            actions={inst.length > 0 && (
              <div className="flex gap-2">{Object.entries(counts).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1"><Badge value={k} /><span className="num text-xs text-slate-500">{n}</span></span>)}</div>
            )}>
            {fin ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[['سعر المتر', fin['سعر المتر'] != null ? `${fmtNum(fin['سعر المتر'])} ${fin['العملة'] ?? ''}` : null], ['نوع السعر', fin['نوع السعر']],
                  ['حالة أقساط الأرض', fin['حالة أقساط الأرض']], ['حالة فرق السعر', fin['حالة فرق السعر']]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-400">{k}</div>
                    <div className={cls('text-sm font-medium', String(v ?? '').startsWith('مستحق') ? 'text-red-700' : 'text-slate-700')}>{v ?? '—'}</div>
                  </div>
                ))}
              </div>
            ) : <div className="mb-3 text-sm text-slate-400">لا توجد بيانات مالية لهذه الإضبارة في الملف المصدر{a['المدينة'] === 'عدرا' ? ' (ملف عدرا لا يحتوي أقساطاً)' : ''}.</div>}
            {finSaysDue && !inst.some((r) => r._status === 'متأخر') && (
              <div className="mb-3"><Note tone="warn">الحالة المالية النصية تقول «مستحق» لكن لا يوجد جدول أقساط بتواريخ في الملف — لا يمكن معرفة أي قسط متأخر. في الهيكل الجديد كل قسط سطر بتاريخ استحقاق ودفع.</Note></div>
            )}
            {inst.length > 0 && (
              <MiniTable table="installments" rows={inst} fields={['نوع القسط', 'رقم القسط', 'المبلغ المستحق', 'العملة', 'تاريخ الاستحقاق', 'تاريخ الدفع', 'المبلغ المدفوع']}
                extra={{ label: 'الحالة (محسوبة)', render: (r) => <span title={r._statusBasis}><Badge value={instStatus(r)} /></span> }} />
            )}
            {inst.some((r) => r._status === 'مسدد (مستنتج)') && (
              <p className="mt-2 text-xs text-slate-400">«مسدد (مستنتج)»: لا يوجد تاريخ دفع في الملف؛ الحالة مستنتجة من نص الحالة المالية. مرّر على الشارة لرؤية الأساس.</p>
            )}
          </Card>

          {get('leases').length > 0 && (
            <Card title="الإيجارات" icon={<KeyRound size={18} />}>
              <MiniTable table="leases" rows={get('leases')} fields={['اسم المستأجر', 'هاتف المستأجر', 'رقم عقد الإيجار', 'تاريخ العقد', 'المساحة المؤجرة م2', 'مدة العقد (أشهر)', 'الصناعة حسب العقد']}
                extra={{ label: 'المدة كما وردت', render: (r) => <span className="text-xs text-slate-500">{r._durationRaw}</span> }} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="المستثمر والشركاء" icon={<User size={18} />} actions={inv && <code className="text-xs text-slate-500">{inv['رمز المستثمر']}</code>}>
            {inv ? (
              <>
                <div className="mb-1 flex items-start gap-2">
                  <div className="flex-1 font-semibold text-slate-800">{inv['الاسم الكامل / اسم المنشأة']}</div>
                  <ReviewFlag reasons={inv._review} />
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {inv['نوع المستثمر'] && <Badge value={inv['نوع المستثمر']} />}
                  {inv['الشكل القانوني'] && <Badge value={inv['الشكل القانوني']} />}
                  {(inv._cities ?? []).length > 1 && <Badge value={`مستثمر في ${inv._cities.join(' و')}`} className="!bg-gold-100 !text-gold-600" />}
                </div>
                <KV table="investors" rec={inv} fields={['رقم السجل التجاري', 'سنة / مكان السجل', 'العنوان', 'الهاتف 1', 'الهاتف 2', 'البريد الإلكتروني']} />
                {inv._rawName && inv._rawName !== inv['الاسم الكامل / اسم المنشأة'] && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-500"><b>الاسم كما ورد:</b> {inv._rawName}</div>
                )}
                <div className="mt-4 mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users size={15} /> الشركاء ({partners.length})</div>
                <div className="space-y-2">
                  {partners.map((p) => (
                    <div key={p._id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{p['الاسم']} {p['اسم الأب'] && <span className="text-slate-400">بن/بنت {p['اسم الأب']}</span>} {p['الكنية'] ?? <span className="text-xs italic text-rose-400">(الكنية غير متوفرة)</span>}</span>
                        <span className="flex-1" />
                        <ReviewFlag reasons={p._review} size={14} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>الجنس: {p['الجنس'] ?? '—'}</span>
                        <span>الجنسية: {p['الجنسية'] ?? <i className="text-rose-400">غير متوفر</i>}</span>
                        {p['رقم الوثيقة'] && <span className="inline-flex items-center gap-1"><Lock size={11} />{p['نوع الوثيقة'] ?? 'وثيقة'}: <span className="num">{p['رقم الوثيقة']}</span></span>}
                      </div>
                    </div>
                  ))}
                  {!partners.length && <div className="text-sm text-slate-400">{inv['نوع المستثمر'] === 'جهة عامة' ? 'جهة عامة — لا شركاء' : 'لا يوجد شركاء مسمّون في المصدر'}</div>}
                </div>
              </>
            ) : <div className="text-sm text-slate-400">لا يوجد مستثمر</div>}
          </Card>

          <Card title={<>المقاسم المرتبطة <span className="num text-sm font-normal text-slate-400">({aPlots.length})</span></>} icon={<MapPinned size={18} />}>
            <div className="space-y-2">
              {aPlots.map((ap) => {
                const p = idx.plotById.get(ap._plot)
                const others = (idx.allocsByPlot.get(ap._plot) ?? []).filter((x) => x._id !== a._id)
                return (
                  <div key={ap._id} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="num rounded bg-brand-700 px-2 py-0.5 font-semibold text-white">{ap['رقم المقسم الموحد']}</span>
                      {p?.['رقم المقسم كما ورد'] && p['رقم المقسم كما ورد'] !== ap['رقم المقسم الموحد'] && (
                        <span className="text-xs text-slate-400">كما ورد: <span className="num text-slate-600">{p['رقم المقسم كما ورد']}</span></span>
                      )}
                    </div>
                    {p && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>{p['المنطقة / القطاع'] ?? '—'}</span>
                        {p['المرحلة الجغرافية'] && <span>{p['المرحلة الجغرافية']}</span>}
                        <span>{p['تصنيف المقسم'] ?? '—'}</span>
                        {p['المساحة م2'] != null && <span className="num">{fmtNum(p['المساحة م2'])} م2</span>}
                        {p['حالة الخدمة'] && <span>{p['حالة الخدمة']}</span>}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        تخصيصات أخرى على نفس المقسم:
                        {others.map((o) => (
                          <Link key={o._id} to={`/file/${encodeURIComponent(o._id)}`} className="mr-2 inline-flex items-center gap-1 text-brand-600 hover:underline">
                            {investorName(o['رمز المستثمر'], idx).slice(0, 28)} <Badge value={effectiveStatus(o, idx) ?? '—'} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {aPlots.length > 1 && <p className="text-xs text-slate-400">خانة واحدة في الإكسل ← {aPlots.length} سطور في جدول (مقاسم التخصيص).</p>}
            </div>
          </Card>

          <Card title="تفاصيل التخصيص" icon={<Gauge size={18} />}>
            <KV table="allocations" rec={{ ...a, 'الحالة الحالية': status }} fields={TABLE.allocations.fields.map((f) => f.name).filter((n) => !['المدينة', 'رمز المستثمر'].includes(n))} />
          </Card>

          {(get('project').length > 0 || get('production').length > 0) && (
            <Card title="بيانات المشروع والطاقة الإنتاجية" icon={<Gauge size={18} />}>
              {get('project').map((p) => {
                const filled = TABLE.project.fields.filter((f) => p[f.name] != null && !['المدينة', 'رقم الإضبارة'].includes(f.name)).map((f) => f.name)
                return <div key={p._id} className="mb-3"><KV table="project" rec={p} fields={filled} /></div>
              })}
              {get('production').length > 0 && (
                <MiniTable table="production" rows={get('production')} fields={['المنتج', 'الكمية', 'الوحدة', 'الفترة']} />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
