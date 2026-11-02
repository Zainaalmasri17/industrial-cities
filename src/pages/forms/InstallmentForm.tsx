import { useState } from 'react'
import { COMMON_RULES, FieldInput, FormGrid, coerce, validateAll, type Values } from '../../components/forms'
import { Note } from '../../components/ui'
import { localId, useStore } from '../../data/store'
import { TABLE } from '../../schema/schema'
import { FormShell, fullRecord, useAllocParam, useSave } from './shared'

export function InstallmentForm() {
  const { idx, city } = useStore()
  const [alloc, setAlloc] = useAllocParam()
  const { saved, setSaved, add } = useSave()
  const [v, setV] = useState<Values>({ 'نوع القسط': 'قسط أرض', 'العملة': 'ل.س' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [allocError, setAllocError] = useState<string>()
  const a = alloc ? idx.allocById.get(alloc) : undefined
  const fields = TABLE.installments.fields.filter((f) => !['المدينة', 'رقم الإضبارة'].includes(f.name))
  const existing = a ? idx.byAlloc.installments.get(a._id) ?? [] : []
  const set = (k: string, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k]: '' })); setSaved(null) }
  const paid = !!v['تاريخ الدفع']?.trim()

  const submit = () => {
    const errs = validateAll(fields, v, { city, required: new Set(paid ? ['المبلغ المدفوع'] : []) })
    const n = Number(v['رقم القسط'])
    if (!errs['رقم القسط'] && (!Number.isInteger(n) || n < 0)) errs['رقم القسط'] = 'رقم القسط عدد صحيح (0 = الدفعة الأولى)'
    if (!errs['رقم القسط'] && existing.some((r) => r['نوع القسط'] === v['نوع القسط'] && r['رقم القسط'] === n))
      errs['رقم القسط'] = `القسط رقم ${n} (${v['نوع القسط']}) مسجل مسبقاً لهذه الإضبارة`
    const due = Number(v['المبلغ المستحق']), pay = Number(v['المبلغ المدفوع'])
    if (!errs['المبلغ المدفوع'] && v['المبلغ المدفوع'] && pay > due) errs['المبلغ المدفوع'] = 'المبلغ المدفوع أكبر من المستحق'
    if (v['المبلغ المدفوع'] && !paid) errs['تاريخ الدفع'] = 'يوجد مبلغ مدفوع بدون تاريخ دفع'
    setAllocError(a ? undefined : 'اختر الإضبارة أولاً')
    setErrors(errs)
    if (!a || Object.keys(errs).length) return
    const values = Object.fromEntries(TABLE.installments.fields.map((f) => [f.name, coerce(f, v[f.name])]))
    const status = paid ? 'مدفوع' : (values['تاريخ الاستحقاق'] as string) < new Date().toISOString().slice(0, 10) ? 'متأخر' : 'غير مستحق بعد'
    const rec = { _id: localId('installments'), _alloc: a._id, _review: [], _status: status, _statusBasis: 'مُدخل من الفورم',
      ...fullRecord('installments', { ...values, 'المدينة': a['المدينة'], 'رقم الإضبارة': a['رقم الإضبارة'] }) }
    add({ installments: [rec] })
    setSaved(rec)
  }

  const tryErrors = () => {
    setSaved(null); setErrors({})
    setV({ 'نوع القسط': 'قسط أرض', 'رقم القسط': existing[1] ? String(existing[1]['رقم القسط']) : '1', 'المبلغ المستحق': '156,670 ل.س', 'العملة': 'ل.س', 'تاريخ الاستحقاق': '1/6/2005+1/12/2005', 'تاريخ الدفع': '', 'المبلغ المدفوع': '100000' })
  }

  return (
    <FormShell kicker="جدول 17 — الأقساط" title="إضافة قسط"
      subtitle="سطر لكل قسط بدل 42 عموداً (14 قسطاً × 3). القسط المتأخر يُحسب من تاريخ الاستحقاق وتاريخ الدفع، ولا يُكتب كنص."
      alloc={alloc} setAlloc={(x) => { setAlloc(x); setSaved(null) }} allocError={allocError} saved={saved} onSubmit={submit} onTryErrors={tryErrors}
      rules={[...COMMON_RULES, 'رقم القسط فريد لكل إضبارة ونوع قسط (0 = الدفعة الأولى)', 'إذا وُجد تاريخ دفع فالمبلغ المدفوع إلزامي', 'المبلغ المدفوع لا يتجاوز المستحق']}>
      {a && <div className="mb-4"><Note>هذه الإضبارة لها <b className="num">{existing.length}</b> قسطاً مسجلاً{existing.length ? ` (آخر رقم: ${Math.max(...existing.map((r) => r['رقم القسط']))})` : ''}.</Note></div>}
      <FormGrid>
        {fields.map((f) => (
          <FieldInput key={f.name} f={f} value={v[f.name] ?? ''} onChange={(x) => set(f.name, x)} error={errors[f.name]} city={city}
            required={f.required || (paid && f.name === 'المبلغ المدفوع')} />
        ))}
      </FormGrid>
    </FormShell>
  )
}
