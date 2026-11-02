import { Check, ChevronLeft, ChevronRight, FlaskConical, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COMMON_RULES, FieldInput, FormGrid, RulesBox, coerce, toLatin, validateAll, validatePlot, type Values } from '../../components/forms'
import { Badge, Button, Card, Note, PageHeader, cls } from '../../components/ui'
import type { Rec } from '../../data/load'
import { effectiveStatus, investorName, localId, useStore } from '../../data/store'
import { CITIES, TABLE, field, type City } from '../../schema/schema'
import { fullRecord } from './shared'

const STEPS = ['المستثمر', 'الشركاء', 'المقاسم', 'القرار والتفاصيل']
const INV_FIELDS = TABLE.investors.fields.filter((f) => f.name !== 'رمز المستثمر')
const PARTNER_FIELDS = TABLE.partners.fields.filter((f) => f.name !== 'رمز المستثمر')
const ALLOC_FIELDS = TABLE.allocations.fields.filter((f) => !['المدينة', 'رمز المستثمر'].includes(f.name))

interface PlotRow { plot: string; area: string }

export function NewAllocation() {
  const { db, idx, city: globalCity, add } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [invQuery, setInvQuery] = useState('')
  const [invCode, setInvCode] = useState('')
  const [inv, setInv] = useState<Values>({})
  const [partners, setPartners] = useState<Values[]>([])
  const [plots, setPlots] = useState<PlotRow[]>([{ plot: '', area: '' }])
  const [city, setCity] = useState<City>(globalCity === 'الكل' ? 'عدرا' : globalCity)
  const [al, setAl] = useState<Values>({ 'الحالة الحالية': 'فعّال' })
  const [authority, setAuthority] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const existingInv = invCode ? idx.investorByCode.get(invCode) : undefined
  const existingPartners = existingInv ? idx.partnersByInv.get(invCode) ?? [] : []
  const invResults = useMemo(() => {
    const q = invQuery.trim()
    if (!q) return []
    return db.investors.filter((i) => i['الاسم الكامل / اسم المنشأة']?.includes(q) || i['رمز المستثمر'].includes(q)).slice(0, 8)
  }, [invQuery, db.investors])

  const plotMsgs = plots.map((p, i) => {
    const err = validatePlot(p.plot) ?? (p.plot && plots.findIndex((x) => toLatin(x.plot.trim()) === toLatin(p.plot.trim())) !== i ? 'المقسم مكرر في هذا التخصيص' : undefined)
    const areaErr = p.area ? validateAll([field('allocation_plots', 'المساحة المخصصة من المقسم م2')], { 'المساحة المخصصة من المقسم م2': p.area })['المساحة المخصصة من المقسم م2'] : undefined
    const pid = `${city}|${toLatin(p.plot.trim())}`
    const holders = !err && p.plot ? (idx.allocsByPlot.get(pid) ?? []).filter((a) => effectiveStatus(a, idx) === 'فعّال') : []
    return { err, areaErr, exists: !err && p.plot ? idx.plotById.get(pid) : undefined, holders }
  })

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (mode === 'existing' && !invCode) e._inv = 'اختر مستثمراً موجوداً أو انتقل إلى «مستثمر جديد»'
      if (mode === 'new') {
        Object.assign(e, validateAll(INV_FIELDS, inv))
        const dup = db.investors.find((i) => i['الاسم الكامل / اسم المنشأة']?.trim() === inv['الاسم الكامل / اسم المنشأة']?.trim())
        if (dup) e['الاسم الكامل / اسم المنشأة'] = `المستثمر مسجّل مسبقاً برمز ${dup['رمز المستثمر']} — اختره من «مستثمر موجود» (مستثمر واحد مرة واحدة فقط)`
      }
    }
    if (s === 1) {
      partners.forEach((p, i) => Object.entries(validateAll(PARTNER_FIELDS, p)).forEach(([k, m]) => (e[`p${i}:${k}`] = m)))
      const total = partners.reduce((n, p) => n + (Number(toLatin(p['نسبة الملكية %'] ?? '')) || 0), 0)
      if (total > 100) e._partners = `مجموع نسب الملكية ${total}% يتجاوز 100%`
      if (mode === 'new' && inv['نوع المستثمر'] === 'شركة' && !partners.length) e._partners = 'الشركة تحتاج شريكاً واحداً على الأقل'
    }
    if (s === 2) {
      if (!plots.some((p) => p.plot.trim())) e._plots = 'أضف مقسماً واحداً على الأقل'
      plotMsgs.forEach((m, i) => { if (m.err) e[`plot${i}`] = m.err; if (m.areaErr) e[`area${i}`] = m.areaErr })
    }
    if (s === 3) {
      Object.assign(e, validateAll(ALLOC_FIELDS, al, { city }))
      const fno = al['رقم الإضبارة']?.trim()
      if (fno && city === 'حسياء' && db.allocations.some((a) => a['المدينة'] === city && a['رقم الإضبارة'] === fno))
        e['رقم الإضبارة'] = `رقم الإضبارة ${fno} مستخدم في حسياء`
      const total = plots.reduce((n, p) => n + (Number(toLatin(p.area)) || 0), 0)
      const declared = Number(toLatin(al['المساحة الإجمالية م2'] ?? ''))
      if (!e['المساحة الإجمالية م2'] && total && declared && Math.abs(total - declared) > 0.5)
        e['المساحة الإجمالية م2'] = `لا تطابق مجموع مساحات المقاسم (${total.toLocaleString('en-US')} م2)`
    }
    return e
  }

  const next = () => {
    const e = validateStep(step)
    setErrors(e)
    if (!Object.keys(e).length) setStep((s) => Math.min(s + 1, STEPS.length))
  }

  const save = () => {
    const allocId = localId('ALC')
    const code = existingInv ? invCode : `INV-L${String(Date.now()).slice(-5)}`
    const fileNo = al['رقم الإضبارة'].trim()
    const out: Record<string, Rec[]> = { investors: [], partners: [], allocations: [], allocation_plots: [], plots: [], decisions: [] }
    if (!existingInv)
      out.investors.push({ _id: localId('investors'), _review: [], _cities: [city], ...fullRecord('investors', { ...Object.fromEntries(INV_FIELDS.map((f) => [f.name, coerce(f, inv[f.name])])), 'رمز المستثمر': code }) } as Rec)
    for (const p of partners)
      out.partners.push({ _id: localId('partners'), _review: [], ...fullRecord('partners', { ...Object.fromEntries(PARTNER_FIELDS.map((f) => [f.name, coerce(f, p[f.name])])), 'رمز المستثمر': code }) } as Rec)
    const values = Object.fromEntries(ALLOC_FIELDS.map((f) => [f.name, coerce(f, al[f.name])]))
    out.allocations.push({ _id: allocId, _review: [], _src: undefined, ...fullRecord('allocations', { ...values, 'المدينة': city, 'رمز المستثمر': code }) } as Rec)
    for (const p of plots.filter((x) => x.plot.trim())) {
      const plot = toLatin(p.plot.trim()), pid = `${city}|${plot}`
      out.allocation_plots.push({ _id: localId('ap'), _alloc: allocId, _plot: pid, _review: [], ...fullRecord('allocation_plots', { 'المدينة': city, 'رقم الإضبارة': fileNo, 'رقم المقسم الموحد': plot, 'المساحة المخصصة من المقسم م2': p.area ? Number(toLatin(p.area)) : null }) })
      if (!idx.plotById.has(pid))
        out.plots.push({ _id: pid, _review: [], ...fullRecord('plots', { 'المدينة': city, 'رقم المقسم الموحد': plot, 'رقم المقسم كما ورد': p.plot, 'المساحة م2': p.area ? Number(toLatin(p.area)) : null }) })
    }
    out.decisions.push({ _id: localId('decisions'), _review: [], ...fullRecord('decisions', { 'المدينة': city, 'الرقم الرسمي': values['قرار التخصيص'], 'رمز الجهة': authority || null, 'نوع القرار': 'تخصيص', 'تاريخ القرار': values['تاريخ التخصيص'], 'السند القانوني': values['السند القانوني'] }) })
    add(out)
    navigate(`/file/${encodeURIComponent(allocId)}`)
  }

  const tryErrors = () => {
    setErrors({})
    if (step === 0) { setMode('new'); setInv({ 'نوع المستثمر': 'شركة', 'الاسم الكامل / اسم المنشأة': 'شركة مارديني وقلم-ميليا-سجل تجاري رقم/8535/تاريخ31/7/2008 لاصحابها(رشدي سليم قلم ومازن محمد ديب مارديني)', 'الهاتف 1': '2485162-0933455778' }) }
    if (step === 1) setPartners([{ 'الاسم': 'رشدي سليم قلم', 'الكنية': '', 'الجنسية': '', 'نسبة الملكية %': '60%' }, { 'الاسم': 'مازن', 'الكنية': 'مارديني', 'الجنسية': 'سوريا', 'نسبة الملكية %': '70' }])
    if (step === 2) setPlots([{ plot: '578+777', area: '' }, { plot: '16\\5', area: '2400 م2' }, { plot: '146/5', area: '' }, { plot: '146/5', area: '' }])
    if (step === 3) setAl({ 'الحالة الحالية': 'فعّال', 'رقم الإضبارة': '', 'الفئة الصناعية': 'كيميائية', 'المساحة الإجمالية م2': '4800م2', 'قرار التخصيص': '11026/ن', 'تاريخ التخصيص': '4/4/2005+12/11/2006' })
  }

  const setP = (i: number, k: string, val: string) => setPartners((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: val } : p)))

  return (
    <div className="fade-in">
      <PageHeader kicker="الجداول 2، 3، 5، 6، 7" title="تخصيص جديد"
        subtitle="أربع خطوات تكتب في خمسة جداول: المستثمرون، الشركاء، المقاسم/مقاسم التخصيص، سجل القرارات، التخصيصات. كل قيمة في خانتها."
        actions={step < 4 && <Button variant="secondary" onClick={tryErrors}><FlaskConical size={16} /> جرّب أخطاء الإكسل الشائعة</Button>} />

      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button onClick={() => i < step && setStep(i)} className={cls('flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm font-medium',
              i === step ? 'bg-brand-700 text-white' : i < step ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-400')}>
              <span className={cls('num flex h-7 w-7 items-center justify-center rounded-full', i === step ? 'bg-white text-brand-800' : i < step ? 'bg-brand-700 text-white' : 'bg-white')}>
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          {step === 0 && (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {(['existing', 'new'] as const).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setErrors({}) }} className={cls('flex items-center gap-2 rounded-md px-4 py-1.5 text-sm', mode === m ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-500')}>
                    {m === 'existing' ? <><Users size={15} /> مستثمر موجود</> : <><UserPlus size={15} /> مستثمر جديد</>}
                  </button>
                ))}
              </div>
              {mode === 'existing' ? (
                existingInv ? (
                  <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                    <div className="flex-1">
                      <div className="font-semibold text-brand-900">{existingInv['الاسم الكامل / اسم المنشأة']}</div>
                      <div className="mt-1 flex gap-2 text-xs text-slate-500"><code>{invCode}</code>{existingInv['نوع المستثمر']} · {existingPartners.length} شركاء · {(existingInv._cities ?? []).join('، ')}</div>
                    </div>
                    <button className="text-sm text-brand-700 hover:underline" onClick={() => setInvCode('')}>تغيير</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                    <input value={invQuery} onChange={(e) => setInvQuery(e.target.value)} placeholder="ابحث باسم المستثمر أو الرمز (مثال: شركة، INV-0001)…"
                      className={cls('w-full rounded-lg border py-2.5 pl-3 pr-9 text-sm outline-none', errors._inv ? 'border-red-400' : 'border-slate-300')} />
                    {errors._inv && <div className="mt-1 text-xs text-red-600">{errors._inv}</div>}
                    <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {invResults.map((i) => (
                        <button key={i._id} onClick={() => { setInvCode(i['رمز المستثمر']); setErrors({}) }} className="flex w-full items-center gap-3 px-4 py-2 text-right text-sm hover:bg-brand-50">
                          <code className="text-xs text-slate-400">{i['رمز المستثمر']}</code>
                          <span className="flex-1 truncate">{i['الاسم الكامل / اسم المنشأة']}</span>
                          {(i._cities ?? []).map((c: string) => <Badge key={c} value={c} />)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <>
                  <Note>رمز المستثمر يُولَّد تلقائياً وهو موحد على مستوى الوزارة. الاسم فقط — بدون الشركاء أو رقم السجل.</Note>
                  <FormGrid>
                    {INV_FIELDS.map((f) => <FieldInput key={f.name} f={f} value={inv[f.name] ?? ''} error={errors[f.name]} onChange={(x) => { setInv((p) => ({ ...p, [f.name]: x })); setErrors((e) => ({ ...e, [f.name]: '' })) }} />)}
                  </FormGrid>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Note>شريك واحد في كل سطر، وجنسية واحدة في كل خانة. يُلغي هذا صيغة «علي وكامل الشحرور أبناء أحمد» في خانة واحدة.</Note>
              {existingPartners.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="mb-1 text-xs text-slate-500">الشركاء المسجلون لهذا المستثمر:</div>
                  {existingPartners.map((p) => <span key={p._id} className="ml-3 inline-block">{p['الاسم']} {p['الكنية']} <span className="text-xs text-slate-400">({p['الجنسية'] ?? '—'})</span></span>)}
                </div>
              )}
              {partners.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">الشريك {i + 1}</span>
                    <button onClick={() => setPartners((ps) => ps.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={14} /> حذف</button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {PARTNER_FIELDS.map((f) => <FieldInput key={f.name} f={f} value={p[f.name] ?? ''} error={errors[`p${i}:${f.name}`]} onChange={(x) => { setP(i, f.name, x); setErrors((e) => ({ ...e, [`p${i}:${f.name}`]: '' })) }} />)}
                  </div>
                </div>
              ))}
              {errors._partners && <div className="text-sm text-red-600">{errors._partners}</div>}
              <Button variant="secondary" onClick={() => setPartners((ps) => [...ps, {}])}><Plus size={16} /> إضافة شريك</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><span className="text-sm text-slate-600">المدينة:</span>
                {CITIES.map((c) => <button key={c} onClick={() => setCity(c)} className={cls('rounded-full px-3 py-1 text-sm ring-1', city === c ? 'bg-brand-700 text-white ring-brand-700' : 'ring-slate-200 text-slate-600')}>{c}</button>)}
              </div>
              <Note>مقسم واحد في كل حقل. «578+777» تُدخل كحقلين. الفاصل الموحد للفرعي «/».</Note>
              {plots.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_200px_auto] items-start gap-3 rounded-lg border border-slate-100 p-3">
                  <FieldInput f={field('allocation_plots', 'رقم المقسم الموحد')} value={p.plot} error={p.plot ? plotMsgs[i].err : errors[`plot${i}`]}
                    onChange={(x) => setPlots((ps) => ps.map((q, j) => (j === i ? { ...q, plot: x } : q)))} hint="مثال: 586 أو 146/5" />
                  <FieldInput f={field('allocation_plots', 'المساحة المخصصة من المقسم م2')} value={p.area} error={errors[`area${i}`] ?? (p.area ? plotMsgs[i].areaErr : undefined)}
                    onChange={(x) => setPlots((ps) => ps.map((q, j) => (j === i ? { ...q, area: x } : q)))} />
                  <button disabled={plots.length === 1} onClick={() => setPlots((ps) => ps.filter((_, j) => j !== i))} className="mt-7 rounded-md p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={16} /></button>
                  {plotMsgs[i].exists && (
                    <div className="col-span-3 -mt-1 text-xs">
                      {plotMsgs[i].holders.length
                        ? <span className="text-amber-700">⚠ المقسم مخصص حالياً لـ: {plotMsgs[i].holders.map((a) => investorName(a['رمز المستثمر'], idx)).join('، ')}</span>
                        : <span className="text-emerald-700">✓ المقسم موجود في سجل المقاسم وغير مخصص حالياً</span>}
                    </div>
                  )}
                </div>
              ))}
              {errors._plots && <div className="text-sm text-red-600">{errors._plots}</div>}
              <Button variant="secondary" onClick={() => setPlots((ps) => [...ps, { plot: '', area: '' }])}><Plus size={16} /> إضافة مقسم</Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <FormGrid>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">المدينة <span className="text-rose-500">*</span></span>
                  <select value={city} onChange={(e) => setCity(e.target.value as City)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
                </label>
                <FieldInput f={field('decisions', 'رمز الجهة')} value={authority} onChange={setAuthority} hint="الحروف الملحقة برقم القرار — تُخزن في سجل القرارات" />
                {ALLOC_FIELDS.map((f) => (
                  <FieldInput key={f.name} f={f} value={al[f.name] ?? ''} error={errors[f.name]} city={city}
                    hint={f.name === 'رقم الإضبارة' && city === 'عدرا' ? 'في عدرا الرقم غير فريد حالياً — قاعدة الترقيم قيد التحديد' : f.name === 'قرار التخصيص' ? 'الرقم الرسمي فقط، والجهة في حقل (رمز الجهة)' : undefined}
                    onChange={(x) => { setAl((p) => ({ ...p, [f.name]: x })); setErrors((e) => ({ ...e, [f.name]: '' })) }} />
                ))}
              </FormGrid>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 fade-in">
              <h3 className="text-lg font-semibold text-brand-900">مراجعة قبل الحفظ</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['المستثمرون', existingInv ? `موجود: ${existingInv['الاسم الكامل / اسم المنشأة']}` : `جديد: ${inv['الاسم الكامل / اسم المنشأة']}`],
                  ['الشركاء', `${partners.length} سطر جديد`],
                  ['مقاسم التخصيص', `${plots.filter((p) => p.plot).length} سطر: ${plots.map((p) => p.plot).filter(Boolean).join(' ، ')}`],
                  ['سجل القرارات', `قرار ${al['قرار التخصيص']}${authority ? '/' + authority : ''} بتاريخ ${al['تاريخ التخصيص']}`],
                  ['التخصيصات', `إضبارة ${al['رقم الإضبارة']} — ${city} — ${al['الفئة الصناعية']}`],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-400">جدول {t}</div><div className="mt-1 text-sm text-slate-800">{d}</div></div>
                ))}
              </div>
              <Button onClick={save}><Check size={16} /> حفظ وفتح الإضبارة</Button>
            </div>
          )}

          {step < 4 && (
            <div className="mt-6 flex justify-between border-t border-slate-100 pt-4">
              <Button variant="ghost" disabled={step === 0} onClick={() => { setStep((s) => s - 1); setErrors({}) }}><ChevronRight size={16} /> السابق</Button>
              <Button onClick={next}>{step === 3 ? 'تحقق ومراجعة' : 'التالي'} <ChevronLeft size={16} /></Button>
            </div>
          )}
        </Card>
        <RulesBox rules={[
          ...COMMON_RULES,
          'رقم المقسم يرفض + ويقبل مقسماً واحداً، والفاصل الفرعي /',
          'المستثمر لا يُكرر: البحث أولاً، والرمز موحد على مستوى الوزارة',
          'الاسم بدون شركاء أو سجل تجاري، والهاتف رقم واحد',
          'مجموع نسب الملكية ≤ 100%',
          'المساحة الإجمالية = مجموع مساحات المقاسم (إن أُدخلت)',
        ]} />
      </div>
    </div>
  )
}
