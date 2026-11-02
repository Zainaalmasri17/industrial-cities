import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Field } from '../schema/schema'
import { LISTS, listValues, type CityFilter } from '../schema/schema'
import { cls } from './ui'

const AR = '٠١٢٣٤٥٦٧٨٩'
export const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))

/** تحويل نص تاريخ (يوم/شهر/سنة أو yyyy-mm-dd) إلى ISO، أو رسالة خطأ */
export function parseDate(raw: string): { iso?: string; error?: string } {
  const t = toLatin(raw.trim())
  if (!t) return {}
  const all = t.match(/\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/g) ?? []
  if (all.length > 1 || /[+،,]/.test(t)) return { error: 'الخانة تقبل تاريخاً واحداً فقط — أي تاريخ آخر (تجديد، تعديل) يُسجَّل سطراً مستقلاً' }
  let d: number, m: number, y: number
  let mt = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]]
  else if ((mt = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) [d, m, y] = [+mt[1], +mt[2], +mt[3]]
  else return { error: 'صيغة التاريخ: يوم/شهر/سنة (مثال 15/3/2024) أو 2024-03-15' }
  if (m < 1 || m > 12) return { error: `لا يوجد شهر رقم ${m} — هل كُتب الشهر قبل اليوم؟` }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return { error: `التاريخ ${d}/${m}/${y} غير موجود في التقويم` }
  if (y < 1970 || y > new Date().getFullYear() + 1) return { error: `السنة ${y} غير منطقية` }
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

export function parseNumber(raw: string): { n?: number; error?: string } {
  const t = toLatin(raw.trim()).replace(/٫/g, '.')
  if (!t) return {}
  if (/[^\d.\-]/.test(t.replace(/,/g, ''))) {
    const unit = t.replace(/[\d,\s-]/g, '').replace(/^\.+|\.+$/g, '')
    return { error: unit ? `الأرقام بدون وحدات — اكتب الرقم فقط بدون «${unit}» (الوحدة معروفة من اسم الحقل)` : 'رقم غير صالح' }
  }
  if (/-\d/.test(t.slice(1))) return { error: 'رقم واحد فقط — لا تكتب نطاقاً أو رقمين (مثل 250-74)' }
  const n = Number(t.replace(/,/g, ''))
  if (Number.isNaN(n)) return { error: 'رقم غير صالح' }
  return { n }
}

/** رقم المقسم: مقسم واحد فقط، بالفاصل الموحد / */
export function validatePlot(raw: string): string | undefined {
  const t = toLatin(raw.trim())
  if (!t) return undefined
  if (t.includes('+')) return 'رقم المقسم يقبل مقسماً واحداً فقط — لا تستخدم (+). لإضافة مقسم آخر اضغط «إضافة مقسم»'
  if (t.includes('\\')) return 'الفاصل الموحد للمقسم الفرعي هو / وليس \\ (اكتب 16/5 بدل 16\\5)'
  if (/[،,\s]/.test(t)) return 'مقسم واحد في كل حقل — بدون فواصل أو مسافات'
  if (!/^[A-Za-z]?\d+(\/\d+)?$/.test(t)) return 'صيغة غير صحيحة: رقم (مثل 586) أو رقم فرعي (مثل 146/5)'
  return undefined
}

export type Values = Record<string, string>

/** التحقق من حقل حسب الهيكل. يعيد رسالة الخطأ بالعربي */
export function validateField(f: Field, raw: string | undefined, opts: { required?: boolean; city?: CityFilter } = {}): string | undefined {
  const v = (raw ?? '').trim()
  if (!v) return (opts.required ?? f.required) ? 'حقل إلزامي حسب الهيكل' : undefined
  if (f.type === 'date') return parseDate(v).error
  if (f.type === 'number') {
    const { n, error } = parseNumber(v)
    if (error) return error
    if (f.name.includes('%') && n !== undefined && (n < 0 || n > 100)) return 'النسبة بين 0 و100'
    if (n !== undefined && n < 0) return 'لا يقبل قيمة سالبة'
  }
  if (f.type === 'list' && !listValues(f.list, opts.city).includes(v)) return 'اختر من القائمة المرجعية'
  if (f.name.includes('رقم المقسم')) return validatePlot(v)
  if (f.name.startsWith('الهاتف') || f.name.startsWith('هاتف')) {
    if (/[^\d+\s]/.test(toLatin(v)) || toLatin(v).replace(/\s/g, '').length < 6) return 'رقم هاتف واحد فقط، أرقام بدون نص'
  }
  if (f.name === 'البريد الإلكتروني' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'بريد إلكتروني غير صالح'
  if (f.name === 'الاسم الكامل / اسم المنشأة' && /(سجل\s*تجاري|لاصحابها|لأصحابها|\()/.test(v))
    return 'الاسم فقط — رقم السجل التجاري وأسماء الشركاء لها حقولها المستقلة'
  return undefined
}

/** تحويل قيمة نص الفورم إلى قيمة مخزنة حسب النوع */
export function coerce(f: Field, raw: string | undefined): unknown {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (f.type === 'number') return parseNumber(v).n ?? null
  if (f.type === 'date') return parseDate(v).iso ?? null
  if (f.type === 'bool') return v === 'نعم'
  return toLatin(v)
}

export function FieldInput({ f, value, onChange, error, city, required, hint, options }: {
  f: Field; value: string; onChange: (v: string) => void; error?: string; city?: CityFilter
  required?: boolean; hint?: string; options?: string[]
}) {
  const req = required ?? f.required
  const base = cls('w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2',
    error ? 'border-red-400 bg-red-50/40 focus:ring-red-100' : 'border-slate-300 focus:border-brand-400 focus:ring-brand-100')
  const list = options ?? (f.type === 'list' ? listValues(f.list, city) : [])
  const meta = f.list ? LISTS[f.list] : undefined
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
        {f.name}
        {req && <span className="text-rose-500" title="إلزامي">*</span>}
        {meta?.pending && <span className="rounded bg-violet-50 px-1.5 text-[10px] text-violet-700">قائمة قيد التحديد</span>}
      </span>
      {f.type === 'list' || options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">— اختر —</option>
          {list.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'bool' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">—</option><option>نعم</option><option>لا</option>
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls(base, (f.type === 'number' || f.type === 'date') && 'num text-right')}
          inputMode={f.type === 'number' ? 'decimal' : undefined}
          placeholder={f.type === 'date' ? 'يوم/شهر/سنة' : f.type === 'number' ? 'رقم فقط' : f.desc ?? ''} />
      )}
      {error ? (
        <span className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-red-600"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</span>
      ) : (hint || f.desc) && f.type !== 'list' ? (
        <span className="mt-1 block text-xs text-slate-400">{hint ?? f.desc}</span>
      ) : null}
    </label>
  )
}

export function RulesBox({ rules }: { rules: string[] }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold text-brand-800"><ShieldCheck size={16} /> قواعد التحقق المطبقة</div>
      <ul className="space-y-1.5 text-slate-600">
        {rules.map((r) => <li key={r} className="flex items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-brand-500" />{r}</li>)}
      </ul>
    </div>
  )
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>
}

export const COMMON_RULES = [
  'الحقول المعلّمة * إلزامية حسب وثيقة الهيكل',
  'التاريخ يجب أن يكون تاريخاً حقيقياً (31/2 مرفوض) وتاريخاً واحداً فقط',
  'الأرقام بدون وحدات (2400 وليس 2400 م2)',
  'القوائم المنسدلة من القوائم المرجعية في الهيكل',
]

/** التحقق من مجموعة حقول؛ يعيد الأخطاء */
export function validateAll(fields: Field[], values: Values, opts: { city?: CityFilter; required?: Set<string> } = {}) {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const e = validateField(f, values[f.name], { city: opts.city, required: f.required || opts.required?.has(f.name) })
    if (e) errors[f.name] = e
  }
  return errors
}
