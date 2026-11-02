import { useState } from 'react'
import { COMMON_RULES, FieldInput, FormGrid, coerce, validateAll, type Values } from '../../components/forms'
import { cls } from '../../components/ui'
import { localId, useStore } from '../../data/store'
import { TABLE, type TableId } from '../../schema/schema'
import { FormShell, fullRecord, useAllocParam, useSave } from './shared'

const KINDS: Array<{ table: TableId; label: string }> = [
  { table: 'industrial_licenses', label: 'ترخيص صناعي' },
  { table: 'building_licenses', label: 'رخصة بناء' },
  { table: 'admin_licenses', label: 'ترخيص إداري' },
]

export function LicenseForm() {
  const { idx, city } = useStore()
  const [alloc, setAlloc] = useAllocParam()
  const { saved, setSaved, add } = useSave()
  const [kind, setKind] = useState<TableId>('admin_licenses')
  const [v, setV] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [allocError, setAllocError] = useState<string>()
  const a = alloc ? idx.allocById.get(alloc) : undefined
  const fields = TABLE[kind].fields.filter((f) => !['المدينة', 'رقم الإضبارة'].includes(f.name))
  const set = (k: string, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k]: '' })); setSaved(null) }
  const temp = kind === 'admin_licenses' && v['المدة'] === 'مؤقت'
  const tenant = kind === 'admin_licenses' && v['صاحب الترخيص'] === 'المستأجر'

  const submit = () => {
    const req = new Set<string>([...(temp ? ['تاريخ الانتهاء'] : []), ...(tenant ? ['رمز المستأجر'] : [])])
    const errs = validateAll(fields, v, { city, required: req })
    if (temp && !errs['تاريخ الانتهاء'] && !errs['تاريخ الترخيص']) {
      const s = coerce(TABLE[kind].fields.find((f) => f.name === 'تاريخ الترخيص')!, v['تاريخ الترخيص']) as string
      const e = coerce(TABLE[kind].fields.find((f) => f.name === 'تاريخ الانتهاء')!, v['تاريخ الانتهاء']) as string
      if (s && e && e <= s) errs['تاريخ الانتهاء'] = 'تاريخ انتهاء الترخيص المؤقت يجب أن يكون بعد تاريخ الترخيص'
    }
    if (kind === 'admin_licenses' && v['المدة'] === 'دائم' && v['تاريخ الانتهاء']) errs['تاريخ الانتهاء'] = 'الترخيص الدائم لا يحمل تاريخ انتهاء'
    setAllocError(a ? undefined : 'اختر الإضبارة أولاً')
    setErrors(errs)
    if (!a || Object.keys(errs).length) return
    const values = Object.fromEntries(TABLE[kind].fields.map((f) => [f.name, coerce(f, v[f.name])]))
    const rec = { _id: localId(kind), _alloc: a._id, _review: [], ...fullRecord(kind, { ...values, 'المدينة': a['المدينة'], 'رقم الإضبارة': a['رقم الإضبارة'] }) }
    add({ [kind]: [rec] })
    setSaved(rec)
  }

  const tryErrors = () => {
    setSaved(null); setErrors({})
    if (kind === 'building_licenses') setV({ 'رقم رخصة البناء': '16/ش', 'تاريخ الرخصة': '18/06/2003 14/4/2004', 'المساحة المرخصة م2': '250-74', 'حالة الترخيص': '' })
    else if (kind === 'industrial_licenses') setV({ 'رقم القرار الصناعي': '', 'تاريخ القرار': '2/14/2007', 'السند القانوني': 'قانون 21' })
    else setV({ 'رقم الرخصة الإدارية': '', 'تاريخ الترخيص': '30/2/2024', 'المدة': 'مؤقت', 'تاريخ الانتهاء': '', 'صاحب الترخيص': 'المستأجر' })
  }

  return (
    <FormShell kicker="الجداول 12، 13، 14" title="إضافة ترخيص"
      subtitle="ترخيص صناعي، أو رخصة بناء، أو ترخيص إداري. التجديد أو التعديل يُسجَّل سطراً جديداً، لا تاريخاً إضافياً في نفس الخلية."
      alloc={alloc} setAlloc={(x) => { setAlloc(x); setSaved(null) }} allocError={allocError} saved={saved} onSubmit={submit} onTryErrors={tryErrors}
      rules={[...COMMON_RULES, 'الترخيص المؤقت: تاريخ الانتهاء إلزامي وبعد تاريخ الترخيص', 'الترخيص الدائم بلا تاريخ انتهاء', 'ترخيص باسم مستأجر: رمز المستأجر إلزامي', 'المساحة رقم واحد (250-74 مرفوض)']}>
      <div className="mb-5 inline-flex rounded-lg bg-slate-100 p-1">
        {KINDS.map((k) => (
          <button key={k.table} onClick={() => { setKind(k.table); setV({}); setErrors({}); setSaved(null) }}
            className={cls('rounded-md px-4 py-1.5 text-sm', kind === k.table ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-500')}>
            {k.label}
          </button>
        ))}
      </div>
      <FormGrid>
        {fields.map((f) => (
          <FieldInput key={f.name} f={f} value={v[f.name] ?? ''} onChange={(x) => set(f.name, x)} error={errors[f.name]} city={city}
            required={f.required || (temp && f.name === 'تاريخ الانتهاء') || (tenant && f.name === 'رمز المستأجر')} />
        ))}
      </FormGrid>
    </FormShell>
  )
}
