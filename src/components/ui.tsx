import { AlertTriangle, Info, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Field } from '../schema/schema'
import { PENDING_FIELDS } from '../schema/schema'

export const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ')

export const fmtNum = (n: unknown) =>
  typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(n ?? '')

const STATUS_STYLE: Record<string, string> = {
  'فعّال': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'ملغى': 'bg-red-50 text-red-700 ring-red-200',
  'مدموج': 'bg-violet-50 text-violet-700 ring-violet-200',
  'منقول ملكية': 'bg-sky-50 text-sky-700 ring-sky-200',
  'مدفوع': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'مسدد (مستنتج)': 'bg-teal-50 text-teal-700 ring-teal-200 ring-dashed',
  'متأخر': 'bg-red-50 text-red-700 ring-red-300',
  'غير مستحق بعد': 'bg-slate-50 text-slate-600 ring-slate-200',
  'غير معروف': 'bg-amber-50 text-amber-700 ring-amber-200',
  'مرخص': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'غير مرخص': 'bg-orange-50 text-orange-700 ring-orange-200',
  'مخصص': 'bg-brand-50 text-brand-700 ring-brand-200',
  'غير مخصص': 'bg-slate-50 text-slate-600 ring-slate-200',
  'ملغى التخصيص': 'bg-orange-50 text-orange-700 ring-orange-200',
  'دائم': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'مؤقت': 'bg-amber-50 text-amber-700 ring-amber-200',
  'مقدم': 'bg-amber-50 text-amber-700 ring-amber-200',
  'مقبول': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'مرفوض': 'bg-red-50 text-red-700 ring-red-200',
  'تحوّل إلى تخصيص': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'مرتفع': 'bg-red-50 text-red-700 ring-red-200',
  'متوسط': 'bg-amber-50 text-amber-700 ring-amber-200',
  'منخفض': 'bg-slate-50 text-slate-600 ring-slate-200',
  'عدرا': 'bg-brand-50 text-brand-700 ring-brand-200',
  'حسياء': 'bg-gold-100 text-gold-600 ring-amber-200',
}

/** الحقول التي تُعرض كشارة لونية */
export const BADGE_FIELDS = new Set([
  'الحالة الحالية', 'حالة الترخيص', 'المدة', 'حالة الطلب', 'المدينة', '_status', '_plotStatus', 'نوع الحدث',
])

export function Badge({ value, className }: { value: string; className?: string }) {
  const style = STATUS_STYLE[value] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={cls('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', style, className)}>
      {value}
    </span>
  )
}

export function ReviewFlag({ reasons, size = 16 }: { reasons: string[]; size?: number }) {
  if (!reasons?.length) return null
  return (
    <span className="group relative inline-flex align-middle">
      <AlertTriangle size={size} className="text-amber-500" aria-label="يحتاج مراجعة" />
      <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-80 rounded-lg border border-amber-200 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-xl group-hover:block">
        <b className="mb-1 block text-amber-700">needs_review — يحتاج مراجعة</b>
        <ul className="list-disc space-y-0.5 pr-4">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </span>
    </span>
  )
}

/** عرض قيمة حقل من الهيكل: فارغ إلزامي، قيد التحديد، رقم، تاريخ، شارة… */
export function Value({ field, value }: { field?: Field; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    if (field && PENDING_FIELDS[field.name] && field.name !== 'رقم الإضبارة')
      return (
        <span className="text-xs text-violet-600" title={PENDING_FIELDS[field.name]}>
          قيد التحديد
        </span>
      )
    if (field?.required)
      return (
        <span className="text-xs italic text-rose-400" title="حقل إلزامي حسب الهيكل، غير متوفر في الملف المصدر">
          غير متوفر
        </span>
      )
    return <span className="text-slate-300">—</span>
  }
  if (typeof value === 'boolean') return <span>{value ? 'نعم' : 'لا'}</span>
  if (field && BADGE_FIELDS.has(field.name) && typeof value === 'string') return <Badge value={value} />
  if (field?.name === 'رقم الوثيقة')
    return (
      <span className="num inline-flex items-center gap-1 text-slate-500" title="بيانات حساسة — محجوبة في الديمو">
        <Lock size={12} />
        {String(value)}
      </span>
    )
  if (typeof value === 'number') return <span className="num">{fmtNum(value)}</span>
  if (field?.type === 'date') return <span className="num whitespace-nowrap">{String(value)}</span>
  const text = String(value)
  if (text.length > 48) return <span className="line-clamp-2 min-w-48" title={text}>{text}</span>
  return <span>{text}</span>
}

export function Card({ title, icon, actions, children, className }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls('card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
          <h3 className="card-title">
            {icon && <span className="text-gold-600">{icon}</span>}
            {title}
          </h3>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, kicker }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <section className="hero">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {kicker && <div className="mb-1 text-xs font-bold text-gold-300">{kicker}</div>}
          <h1 className="text-[clamp(22px,3vw,32px)] font-extrabold leading-snug text-[#fffaf0]">{title}</h1>
          <div className="hero-accent-line" />
          {subtitle && <p className="max-w-[80ch] text-[14.5px] leading-relaxed text-[#f7f3e8]/80">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cls('flex items-start gap-2 rounded-lg px-4 py-3 text-sm leading-relaxed',
      tone === 'warn' ? 'bg-gold-100 text-amber-900' : 'bg-brand-50 text-brand-800')}>
      <Info size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, className, title }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'; disabled?: boolean; className?: string; title?: string
}) {
  const styles = {
    primary: 'bg-gradient-to-b from-brand-600 to-brand-700 text-white hover:from-brand-700 hover:to-brand-800 shadow-sm ring-1 ring-inset ring-brand-800',
    secondary: 'bg-white text-brand-700 ring-1 ring-inset ring-brand-700/30 hover:bg-brand-50',
    ghost: 'text-brand-700 hover:bg-brand-50',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cls('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50', styles, className)}>
      {children}
    </button>
  )
}

export function Stat({ label, value, hint, tone = 'brand', icon }: { label: string; value: ReactNode; hint?: string; tone?: 'brand' | 'red' | 'gold' | 'slate' | 'green'; icon?: ReactNode }) {
  const tones = {
    brand: 'text-brand-700 bg-brand-50',
    red: 'text-red-700 bg-red-50',
    gold: 'text-gold-600 bg-gold-100',
    slate: 'text-slate-600 bg-slate-100',
    green: 'text-emerald-700 bg-emerald-50',
  }[tone]
  const valueColor = tone === 'red' ? 'text-red-700' : tone === 'gold' ? 'text-gold-600' : 'text-brand-700'
  return (
    <div className="stat-box">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-bold leading-snug text-slate-500">{label}</span>
        {icon && <span className={cls('rounded-lg p-1.5', tones)}>{icon}</span>}
      </div>
      <div className={cls('num mt-1 text-right text-[26px] font-extrabold leading-tight', valueColor)}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</div>}
    </div>
  )
}
