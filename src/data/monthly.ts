/**
 * بيانات القوالب الشهرية للمدن الخمس — ينتجها scripts/prepare_monthly.py
 */
import type { Rec } from './load'

const files = import.meta.glob('./monthly.json', { eager: true, import: 'default' }) as Record<string, unknown>
const maybeRaw = files['./monthly.json'] as MonthlyRaw | undefined
if (!maybeRaw) throw new Error('ملف البيانات غير موجود: src/data/monthly.json — شغّل: python scripts/prepare_monthly.py')
const raw: MonthlyRaw = maybeRaw

export type MCity = 'عدرا' | 'حسياء' | 'الشيخ نجار' | 'باب الهوى' | 'الراعي'
export type TemplateKey = 'plots' | 'invest' | 'prod' | 'ach'
export type NV = { name: string; value: number }

export interface Installments {
  total: number; paid: number; unpaid: number; overdue: number; overduePlots: number; noDue: number
  /** القيم حسب عملة المقسم: لا تُجمع الليرة مع الدولار */
  values: Array<{ currency: string; paid: number; overdue: number; notDue: number }>
  byYear: Array<{ year: string; 'مدفوع': number; 'غير مدفوع': number }>
}

export interface PlotSummary {
  plots: number; allocated: number; vacant: number; subscribed: number; undetermined: number
  totalArea: number; allocArea: number; vacantArea: number; investors: number; merged: number; leased: number
  adminLicenses: number; buildingLicenses: number; foreign: number; installmentPlots: number; flagged: number
  byStatus: NV[]; byPhase: NV[]; byService: NV[]; byCategory: NV[]; bySector: NV[]; byClass: NV[]
  byInvestorType: NV[]; byNationality: NV[]; byCountry: NV[]; byAdminType: NV[]; byInstStatus: NV[]
  byCurrency: NV[]; byInvestMode: NV[]; byActivity: NV[]; topInvestors: NV[]
  allocByYear: Array<{ year: string; value: number }>
  installments: Installments | null
}

export interface Project {
  _row: number; _review: string[]
  'المدينة': MCity; 'اسم المشروع': string; 'الحساب الفرعي'?: string; 'الحساب الجزئي'?: string
  'نوع المشروع'?: string; 'القطاع'?: string; 'حالة المشروع'?: string; 'الجهة المنفذة'?: string; 'سبب التوقف'?: string; 'ملاحظات'?: string
  planned: number | null; revised: number | null; contract: number | null; spent: number | null
  physical: number | null; financial: number | null
  dContract: string | null; dStart: string | null; dStop: string | null; dEnd: string | null; dAnnounce: string | null; dClose: string | null
}

export interface Productivity {
  _row: number; _review: string[]; month: string; notes: string | null; unknownZeros?: boolean
  [k: string]: number | null | string | string[] | boolean | undefined
}

export interface Achievement { _row: number; type: string | null; desc: string | null; month: string; _review: string[] }

export interface PrevAlloc {
  'المقسم': string; 'المستثمر السابق': string; 'تاريخ التخصيص': string | null; 'تاريخ الإلغاء': string | null
  'سبب الإلغاء': string | null; 'التفاصيل': string | null; _row: number
}

export interface CityData {
  city: MCity
  summary?: PlotSummary
  completeness?: Record<string, number | null>
  previous?: PrevAlloc[]
  projects?: Project[]
  productivity?: Productivity | null
  achievements?: Achievement[]
  issueCount: number; issueTypes: number; highTypes: number
}

export interface MIssueExample { city: MCity; sheet: string | null; row: number | null; col: string | null; value: string | null; note: string | null }
export interface MIssue {
  id: string; title: string; desc: string; severity: 'مرتفع' | 'متوسط' | 'منخفض'; fix: string; template: string
  counts: Record<MCity, number>; examples: MIssueExample[]
}

export interface FileRow {
  city: MCity
  files: Record<TemplateKey, null | { name: string; size: number; rows?: number; installments?: number; previous?: number }>
}

interface MonthlyRaw {
  generated: string; month: string; cities: MCity[]; files: FileRow[]
  byCity: Record<MCity, CityData>; issues: MIssue[]
  plots: { cols: string[]; rows: unknown[][] }
  installments: { cols: string[]; rows: unknown[][] }
  lists: Record<string, string[]>
}

/** إعادة بناء السجلات من صيغة الجدول المضغوطة */
function unpack(t: { cols: string[]; rows: unknown[][] }, sheet: string): Rec[] {
  return t.rows.map((row) => {
    const r: Record<string, unknown> = {}
    t.cols.forEach((c, i) => {
      if (row[i] !== null && row[i] !== undefined) r[c] = row[i]
    })
    r._review = r._review ?? []
    r._src = { sheet, row: r._src as number }
    return r as Rec
  })
}

const plots = unpack(raw.plots, 'المقاسم')
const installments = unpack(raw.installments, 'الأقساط')

const plotLabel = (p: Rec) => `${p['القطاع'] ?? '—'} | ${p['رقم المقسم']}`
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const NOT_A_NAME = /^(مفصول|اكتتاب\s*\d*|بقع[هة] استثماري[هة]|مركز تحويلي|المدينة الصناعية|لا يوجد|[\d.\s/]+)$/

/** المستثمرون: تجميع المقاسم المخصصة حسب المدينة + اسم المستثمر كما ورد */
function buildInvestors(): Rec[] {
  const m = new Map<string, Rec>()
  for (const p of plots) {
    const name = p['اسم المستثمر الحالي'] as string | undefined
    if (!name || NOT_A_NAME.test(name)) continue
    const key = `${p['المدينة']}|${name}`
    let r = m.get(key)
    if (!r) {
      r = { _id: key, _review: [], 'المدينة': p['المدينة'], 'اسم المستثمر': name, 'نوع المستثمر': p['نوع المستثمر'], 'الجنسية': p['الجنسية'],
        'الدولة': p['الدولة (للأجنبي)'], 'رقم السجل التجاري': p['رقم السجل التجاري'], 'عدد المقاسم': 0, 'المساحة م²': 0, _sectors: new Set<string>(),
        _acts: new Set<string>(), 'مقاسم عليها ملاحظات': 0, _plots: [] as string[] }
      m.set(key, r)
    }
    r['عدد المقاسم'] += 1
    r['المساحة م²'] += p['المساحة م²'] ?? 0
    if (p['القطاع']) r._sectors.add(p['القطاع'])
    if (p['اسم النشاط الصناعي']) r._acts.add(p['اسم النشاط الصناعي'])
    if (p._review.length) r['مقاسم عليها ملاحظات'] += 1
    r._plots.push(plotLabel(p))
    for (const k of ['نوع المستثمر', 'الجنسية', 'رقم السجل التجاري'] as const) {
      const v = p[k]
      const cur = r[k]
      if (v && cur && v !== cur && !r._review.includes(`«${k}» مختلف بين مقاسم نفس المستثمر`)) r._review.push(`«${k}» مختلف بين مقاسم نفس المستثمر`)
    }
  }
  return [...m.values()].map((r) => {
    if (NOTE_IN_NAME.test(r['اسم المستثمر'])) r._review.push('ملاحظات داخل خانة الاسم')
    if (!r['نوع المستثمر']) r._review.push('نوع المستثمر فارغ')
    if (/^\d|سجل تجاري/.test(r['اسم المستثمر'])) r._review.push('رقم أو سجل تجاري داخل خانة الاسم')
    return {
      ...r, 'القطاعات': [...r._sectors].join('، '), 'الأنشطة': [...r._acts].slice(0, 3).join('، '), 'المقاسم': r._plots.slice(0, 8).join('، ') + (r._plots.length > 8 ? '…' : ''),
      'المساحة م²': Math.round(r['المساحة م²']),
    }
  })
}
const NOTE_IN_NAME = /\((?:[^)]*)(مفصول|منسحب|ملغى|ملغي|متوفى|قرار|\d{4})/

/** التراخيص: سطر لكل ترخيص مذكور في شيت المقاسم */
function buildLicenses(): Rec[] {
  const kinds: Array<[string, string, string]> = [
    ['ترخيص صناعي', 'رقم قرار الترخيص الصناعي', 'تاريخ قرار الترخيص الصناعي'],
    ['ترخيص إداري', 'رقم الترخيص الإداري', 'تاريخ الترخيص الإداري'],
    ['رخصة بناء', 'رقم رخصة البناء', 'تاريخ رخصة البناء'],
    ['سجل صناعي', 'رقم السجل الصناعي', 'تاريخ السجل الصناعي'],
  ]
  const out: Rec[] = []
  for (const p of plots) {
    for (const [kind, noKey, dateKey] of kinds) {
      const no = p[noKey], date = p[dateKey]
      if ((!no || no === 'لا يوجد') && !date) continue
      const review: string[] = []
      if (!no) review.push('بلا رقم')
      if (!date) review.push('بلا تاريخ')
      else if (!isDate(date)) review.push(`تاريخ غير صالح: ${date}`)
      else if (date > '2026-10-31') review.push('تاريخ بعد نهاية الشهر')
      const type = kind === 'ترخيص إداري' ? p['نوع الترخيص الإداري'] : undefined
      if (type && !['مؤقت', 'دائم'].includes(type)) review.push(`نوع الترخيص «${type}» ليس من القائمة`)
      out.push({ _id: `${p._id}-${kind}`, _src: p._src, _review: review, 'المدينة': p['المدينة'], 'المقسم': plotLabel(p), 'نوع الترخيص': kind,
        'الرقم': no, 'التاريخ': date, 'نوع الترخيص الإداري': type, 'المستثمر': p['اسم المستثمر الحالي'], 'النشاط': p['اسم النشاط الصناعي'], 'مرحلة المقسم': p['مرحلة المقسم'] })
    }
  }
  return out
}

/** الإيجارات: المقاسم المؤجرة */
function buildLeases(): Rec[] {
  return plots.filter((p) => p['مؤجر؟'] === 'نعم' || (p['اسم المستأجر'] && p['اسم المستأجر'] !== 'لا يوجد')).map((p) => {
    const review = p._review.filter((x: string) => x.includes('الإيجار') || x.includes('أكثر من قيمة'))
    return { _id: `${p._id}-lease`, _src: p._src, _review: review, 'المدينة': p['المدينة'], 'المقسم': plotLabel(p), 'المالك (المستثمر)': p['اسم المستثمر الحالي'],
      'مؤجر؟': p['مؤجر؟'], 'المستأجر': p['اسم المستأجر'], 'رقم ترخيص المستأجر': p['رقم قرار الترخيص الصناعي للمستأجر'],
      'تاريخ ترخيص المستأجر': p['تاريخ قرار الترخيص الصناعي للمستأجر'], 'سجل المستأجر الصناعي': p['رقم السجل الصناعي للمستأجر'],
      'النشاط': p['اسم النشاط الصناعي'], 'المساحة م²': p['المساحة م²'] }
  })
}

function buildPrevious(): Rec[] {
  return raw.cities.flatMap((c) => (raw.byCity[c].previous ?? []).map((p) => {
    const review: string[] = []
    if (!p['تاريخ الإلغاء']) review.push('بلا تاريخ إلغاء')
    else if (!isDate(p['تاريخ الإلغاء'])) review.push(`تاريخ إلغاء مكتوب كنص: ${p['تاريخ الإلغاء']}`)
    if (!p['تاريخ التخصيص']) review.push('تاريخ تخصيص غير صالح')
    return { ...p, _id: `${c}-prev-${p._row}`, _src: { sheet: 'التخصيصات السابقة', row: p._row }, _review: review, 'المدينة': c } as Rec
  }))
}

function buildProjects(): Rec[] {
  return raw.cities.flatMap((c) => (raw.byCity[c].projects ?? []).map((p) => ({ ...p, _id: `${c}-prj-${p._row}`, _src: { sheet: 'الخطة الاستثمارية', row: p._row } }) as Rec))
}

export const MONTHLY = { ...raw, plots, installments }

let cache: Record<string, Rec[]> | null = null
/** الجداول المشتقة (تُبنى عند أول طلب) */
export function tables() {
  cache ??= { investors: buildInvestors(), licenses: buildLicenses(), leases: buildLeases(), previous: buildPrevious(), projects: buildProjects() }
  return cache
}
export const M_CITIES = raw.cities

export const M_CITY_COLOR: Record<MCity, string> = {
  'عدرا': '#0e6d5c',
  'حسياء': '#c7a66b',
  'الشيخ نجار': '#2f6fa3',
  'باب الهوى': '#b5523b',
  'الراعي': '#6d5a9e',
}

export const TEMPLATE_TITLE: Record<TemplateKey, string> = {
  plots: 'المقاسم',
  invest: 'الخطة الاستثمارية',
  prod: 'الإنتاجية',
  ach: 'الإنجازات والتحديات',
}

export const MONTH_LABEL = 'تشرين الأول 2026'
