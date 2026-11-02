import schemaJson from './schema.json'
import { DATA } from '../data/load'

export type FieldType = 'text' | 'number' | 'date' | 'list' | 'bool'
export type TableId =
  | 'plots' | 'investors' | 'partners' | 'subscriptions' | 'decisions' | 'allocations'
  | 'allocation_plots' | 'decision_refs' | 'events' | 'project' | 'production'
  | 'industrial_licenses' | 'building_licenses' | 'admin_licenses' | 'contracts'
  | 'financial' | 'installments' | 'leases' | 'investment_licenses'

export interface Field {
  name: string
  type: FieldType
  required: boolean
  list?: string
  desc?: string
  src?: string
}

export interface Table {
  id: TableId
  num: number
  name: string
  purpose?: string
  row: string
  key: string[]
  note?: string
  fields: Field[]
}

export interface RefList {
  name: string
  values: string[]
  open?: boolean
  pending?: boolean
  perCity?: boolean
  fromData?: boolean
  note?: string
}

export const SCHEMA_SOURCE: string = schemaJson.source
export const TABLES = schemaJson.tables as unknown as Table[]
export const TABLE = Object.fromEntries(TABLES.map((t) => [t.id, t])) as Record<TableId, Table>
export const LISTS = schemaJson.lists as unknown as Record<string, RefList>

export const CITIES = ['عدرا', 'حسياء'] as const
export type City = (typeof CITIES)[number]
export type CityFilter = City | 'الكل'

/** حقول لم يحسم الهيكل معناها بعد — تُعرض كـ«قيد التحديد» */
export const PENDING_FIELDS: Record<string, string> = {
  'البلوك / الجزيرة': 'قيد التحديد — هل الجزء الأول من الرقم الفرعي بلوك؟ (السؤال 1)',
  'حالة التدقيق': 'قيد التحديد — معنى (حد فاصل للتدقيق) سؤال مفتوح (السؤال 16)',
  'نظام الدفع': 'قيد التحديد — معنى (انتقال) سؤال مفتوح (السؤال 19)',
  'رقم الإضبارة': 'مفتاح التخصيص يحتاج تأكيداً — الرقم غير فريد في عدرا (السؤال 5)',
}

export function field(table: TableId, name: string): Field {
  const f = TABLE[table].fields.find((x) => x.name === name)
  if (!f) throw new Error(`حقل غير موجود في الهيكل: ${table}.${name}`)
  return f
}

/** قيم القائمة المرجعية: قيم الهيكل + القيم المستخرجة من الملفات للقوائم المفتوحة */
export function listValues(listId: string | undefined, city?: CityFilter): string[] {
  if (!listId) return []
  const l = LISTS[listId]
  if (!l) return []
  const data = (DATA.lists as Record<string, unknown>)[listId]
  let fromData: string[] = []
  if (Array.isArray(data)) fromData = data as string[]
  else if (data && typeof data === 'object') {
    const byCity = data as Record<string, string[]>
    fromData = city && city !== 'الكل' ? byCity[city] ?? [] : Object.values(byCity).flat()
  }
  return Array.from(new Set([...l.values, ...fromData]))
}
