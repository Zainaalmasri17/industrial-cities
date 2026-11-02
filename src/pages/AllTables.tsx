import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Note, PageHeader, cls } from '../components/ui'
import { byCity, useStore } from '../data/store'
import { LISTS, SCHEMA_SOURCE, TABLES, listValues } from '../schema/schema'

const TYPE_LABEL: Record<string, string> = { text: 'نص', number: 'رقم', date: 'تاريخ', list: 'قائمة', bool: 'نعم/لا' }

export function AllTables() {
  const { db, city } = useStore()
  const [open, setOpen] = useState<string | null>('allocations')
  return (
    <div className="fade-in">
      <PageHeader kicker={SCHEMA_SOURCE} title="الهيكل المقترح: 19 جدولاً"
        subtitle="أسماء الجداول والحقول والإلزامي والقوائم المرجعية كما في وثيقة الهيكل حرفياً. الأعداد = سطور العينة بعد الهيكلة." />
      <div className="mb-4"><Note>كل جدول أساسي يحمل حقل (المدينة). باقي الجداول تشير إلى القرار عبر (الرقم + الجهة + التاريخ) بدل نسخ تفاصيله.</Note></div>
      <div className="space-y-2">
        {TABLES.map((t) => {
          const n = byCity(db[t.id], city).length
          const isOpen = open === t.id
          return (
            <div key={t.id} className="card">
              <button onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-4 px-5 py-3 text-right">
                <span className="num flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">{t.num}</span>
                <div className="flex-1">
                  <div className="font-semibold text-brand-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.purpose ?? t.row}</div>
                </div>
                <span className="text-xs text-slate-400">{t.fields.length} حقلاً · {t.fields.filter((f) => f.required).length} إلزامي</span>
                <span className="num min-w-16 rounded-full bg-slate-100 px-3 py-1 text-center text-sm font-semibold text-slate-700">{n.toLocaleString('en-US')}</span>
                <ChevronDown size={18} className={cls('text-slate-400 transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-3 fade-in">
                  <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
                    <span><b>كل سطر:</b> {t.row}</span>
                    <span><b>المفتاح:</b> {t.key.join(' + ')}</span>
                    <Link to={`/t/${t.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">عرض البيانات <ExternalLink size={13} /></Link>
                  </div>
                  <table className="data-table w-full overflow-hidden rounded-lg text-sm">
                    <thead>
                      <tr className="text-right text-xs">
                        <th className="px-3 py-2">الحقل</th><th className="px-3 py-2">النوع</th><th className="px-3 py-2">إلزامي</th>
                        <th className="px-3 py-2">الوصف / القاعدة</th><th className="px-3 py-2">المصدر الحالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.fields.map((f) => (
                        <tr key={f.name} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-2 font-semibold text-slate-800">{f.name}</td>
                          <td className="px-3 py-2 text-slate-500">{TYPE_LABEL[f.type]}</td>
                          <td className="px-3 py-2">{f.required ? <span className="text-brand-700">✔</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {f.desc}
                            {f.list && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {listValues(f.list, city).slice(0, 14).map((v) => <span key={v} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{v}</span>)}
                                {LISTS[f.list]?.pending && <Badge value="قيد التحديد" className="!bg-violet-50 !text-violet-700" />}
                                {LISTS[f.list]?.open && <span className="text-[11px] text-slate-400">… (قائمة مفتوحة)</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400">{f.src}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {t.note && <div className="mt-3 rounded-lg bg-gold-100 px-4 py-2 text-sm text-amber-900">{t.note}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
