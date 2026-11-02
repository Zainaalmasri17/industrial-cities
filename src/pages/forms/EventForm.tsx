import { useEffect, useMemo, useState } from 'react'
import { COMMON_RULES, FieldInput, FormGrid, coerce, validateAll, type Values } from '../../components/forms'
import { Note } from '../../components/ui'
import { investorName, localId, plotsOf, useStore } from '../../data/store'
import { TABLE, field } from '../../schema/schema'
import { FormShell, fullRecord, useAllocParam, useSave } from './shared'

const TRANSFER = ['المستثمر السابق', 'المستثمر الجديد', 'النسبة المنقولة %']
const REQUEST = ['تاريخ تقديم الطلب', 'رقم الطلب الوارد', 'حالة الطلب']
const PLOT_CHANGE = ['رقم المقسم', 'القيمة المعدّلة']

/** الحقول الإضافية المطلوبة حسب نوع الحدث (قاعدة واجهة فوق إلزامية الهيكل) */
const BY_TYPE: Record<string, { fields: string[]; hint: string }> = {
  'نقل ملكية كامل': { fields: TRANSFER, hint: 'البيع / نقل الملكية: البائع والشاري والنسبة إلزامية. الكامل = 100%.' },
  'نقل ملكية جزئي': { fields: TRANSFER, hint: 'نقل جزئي: النسبة أقل من 100%.' },
  'طلب طي إلغاء': { fields: REQUEST, hint: 'الطلب يُسجّل حدثاً بحالة «مقدم»؛ القبول يُسجّل لاحقاً حدث «طي إلغاء».' },
  'طلب استرداد أموال': { fields: REQUEST, hint: 'رقم الطلب الوارد وتاريخه من كتاب المستثمر.' },
  'دمج': { fields: PLOT_CHANGE, hint: 'القيمة المعدّلة: أرقام المقاسم بعد الدمج.' },
  'فصل': { fields: PLOT_CHANGE, hint: 'القيمة المعدّلة: المقاسم الناتجة عن الفصل.' },
  'تبديل مقسم': { fields: [...PLOT_CHANGE, 'يُحتسب في الإحصاء'], hint: 'تبديل المقسم لا يُحتسب عادة في إحصاء الإلغاءات.' },
  'إضافة/تعديل صناعة': { fields: ['القيمة المعدّلة'], hint: 'القيمة المعدّلة: الصناعة الجديدة.' },
  'تعديل شركاء': { fields: ['القيمة المعدّلة'], hint: 'القيمة المعدّلة: الشريك الداخل/الخارج.' },
  'إلغاء تخصيص': { fields: ['يُحتسب في الإحصاء'], hint: 'بعد الحفظ تصبح حالة التخصيص «ملغى» — والسجل لا يُحذف.' },
  'طي إلغاء': { fields: [], hint: 'بعد الحفظ تعود حالة التخصيص «فعّال».' },
  'إعادة تخصيص': { fields: [], hint: '' },
  'انسحاب': { fields: [], hint: '' },
}

export function EventForm() {
  const { idx, city } = useStore()
  const [alloc, setAlloc] = useAllocParam()
  const { saved, setSaved, add } = useSave()
  const [v, setV] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [allocError, setAllocError] = useState<string>()
  const a = alloc ? idx.allocById.get(alloc) : undefined
  const type = v['نوع الحدث'] ?? ''
  const extra = BY_TYPE[type]?.fields ?? []
  const shown = ['نوع الحدث', 'تاريخ الحدث', 'رقم القرار / الوثيقة', ...extra.filter((x) => x !== 'رقم المقسم'), 'التفاصيل']
  const set = (k: string, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k]: '' })); setSaved(null) }

  useEffect(() => {
    if (TRANSFER.every((f) => extra.includes(f)) && a && !v['المستثمر السابق']) set('المستثمر السابق', investorName(a['رمز المستثمر'], idx))
    if (type === 'نقل ملكية كامل') set('النسبة المنقولة %', '100')
  }, [type, alloc])

  const plots = useMemo(() => (a ? plotsOf(a._id, idx) : []), [a, idx])

  const submit = () => {
    const fields = [...shown, ...(extra.includes('رقم المقسم') ? ['رقم المقسم'] : [])].map((n) => field('events', n))
    const errs = validateAll(fields, v, { city, required: new Set(extra.filter((x) => x !== 'يُحتسب في الإحصاء')) })
    const pct = Number(v['النسبة المنقولة %'])
    if (type === 'نقل ملكية كامل' && v['النسبة المنقولة %'] && pct !== 100) errs['النسبة المنقولة %'] = 'نقل الملكية الكامل = 100%'
    if (type === 'نقل ملكية جزئي' && pct >= 100) errs['النسبة المنقولة %'] = 'النقل الجزئي يجب أن يكون أقل من 100% — وإلا اختر «نقل ملكية كامل»'
    if (v['المستثمر السابق'] && v['المستثمر السابق'] === v['المستثمر الجديد']) errs['المستثمر الجديد'] = 'الشاري هو نفسه البائع'
    if (v['تاريخ تقديم الطلب'] && v['تاريخ الحدث'] && !errs['تاريخ الحدث'] && coerce(field('events', 'تاريخ تقديم الطلب'), v['تاريخ تقديم الطلب'])! > coerce(field('events', 'تاريخ الحدث'), v['تاريخ الحدث'])!)
      errs['تاريخ تقديم الطلب'] = 'تاريخ تقديم الطلب بعد تاريخ الحدث'
    setAllocError(a ? undefined : 'اختر الإضبارة أولاً')
    setErrors(errs)
    if (!a || Object.keys(errs).length) return
    const values = Object.fromEntries(TABLE.events.fields.map((f) => [f.name, coerce(f, v[f.name])]))
    const rec = { _id: localId('events'), _alloc: a._id, _review: [], ...fullRecord('events', { ...values, 'المدينة': a['المدينة'], 'رقم الإضبارة': a['رقم الإضبارة'] }) }
    add({ events: [rec] })
    setSaved(rec)
  }

  const tryErrors = () => {
    setSaved(null); setErrors({})
    setV({ 'نوع الحدث': 'نقل ملكية جزئي', 'تاريخ الحدث': '31/2/2025', 'رقم القرار / الوثيقة': '', 'المستثمر السابق': a ? investorName(a['رمز المستثمر'], idx) : 'محمد', 'المستثمر الجديد': '', 'النسبة المنقولة %': '50 %' })
  }

  return (
    <FormShell kicker="جدول 9 — الأحداث" title="تسجيل حدث على إضبارة"
      subtitle="نوع الحدث من القائمة المرجعية، والحقول تتغير حسب النوع. لا يُعدَّل أي سجل قديم: كل تغيير حدث جديد في السجل الزمني."
      alloc={alloc} setAlloc={(x) => { setAlloc(x); setSaved(null) }} allocError={allocError} saved={saved}
      onSubmit={submit} onTryErrors={tryErrors}
      rules={[...COMMON_RULES, 'البيع/نقل الملكية: البائع والشاري والنسبة إلزامية', 'نقل كامل = 100%، الجزئي أقل من 100%', 'الطلبات: رقم الطلب الوارد وتاريخه وحالته إلزامية', 'رقم المقسم من مقاسم الإضبارة نفسها']}>
      <FormGrid>
        <FieldInput f={field('events', 'نوع الحدث')} value={type} onChange={(x) => set('نوع الحدث', x)} error={errors['نوع الحدث']} />
        {extra.includes('رقم المقسم') && (
          <FieldInput f={field('events', 'رقم المقسم')} value={v['رقم المقسم'] ?? ''} onChange={(x) => set('رقم المقسم', x)} error={errors['رقم المقسم']}
            options={plots} required />
        )}
        {shown.slice(1).map((n) => (
          <FieldInput key={n} f={field('events', n)} value={v[n] ?? ''} onChange={(x) => set(n, x)} error={errors[n]} city={city}
            required={field('events', n).required || (extra.includes(n) && n !== 'يُحتسب في الإحصاء')} />
        ))}
      </FormGrid>
      {BY_TYPE[type]?.hint && <div className="mt-4"><Note>{BY_TYPE[type].hint}</Note></div>}
    </FormShell>
  )
}
