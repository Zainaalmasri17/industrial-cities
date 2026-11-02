import { AlertTriangle, Droplets, Flame, Phone, Zap } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Card, ReviewFlag, cls } from '../../components/ui'
import type { MCity, Productivity as P } from '../../data/monthly'
import { CityName, Columns, Section, cityData, fmt, useMCity } from './shared'

const GROUPS: Array<{ title: string; icon: ReactNode; rows: Array<[string, string]> }> = [
  { title: 'المياه', icon: <Droplets size={16} />, rows: [['waterDrink', 'الماء — شرب (م³)'], ['waterInd', 'الماء — صناعي (م³)']] },
  {
    title: 'الكهرباء', icon: <Zap size={16} />, rows: [
      ['mwTotal', 'إجمالي استطاعة محطة التحويل (MW)'], ['mwAvail', 'الاستطاعة المتاحة (MW)'], ['mwUse', 'الاستهلاك الحالي (MW)'], ['mwGap', 'العجز أو الفائض (MW)'],
    ],
  },
  {
    title: 'الاتصالات', icon: <Phone size={16} />, rows: [
      ['landline', 'منشآت مخدمة بالهاتف الأرضي'], ['satNet', 'منشآت مخدمة بالنت الفضائي'], ['noNet', 'منشآت غير مخدمة بالنت'],
      ['linesOk', 'خطوط هاتف عاملة'], ['linesMissing', 'خطوط هاتف ناقصة'], ['towers', 'أبراج خليوي عاملة'], ['weakSites', 'مواقع فيها نقص تغطية'],
    ],
  },
  { title: 'المحروقات', icon: <Flame size={16} />, rows: [['fuelOil', 'الفيول (طن)'], ['diesel', 'المازوت الصناعي (لتر)'], ['gas', 'الغاز (م³)'], ['coal', 'الفحم الحجري (طن)']] },
]

function Cell({ p, k }: { p: P | null | undefined; k: string }) {
  if (!p) return <span className="text-slate-300">لم يصل</span>
  const v = p[k] as number | null | undefined
  if (v === null || v === undefined) return <span className="text-xs italic text-rose-400">فارغ</span>
  const unknown = v === 0 && p.unknownZeros
  const gapWrong = k === 'mwGap' && p.mwGapCalc !== undefined && Math.abs((p.mwGapCalc as number) - v) > 0.01
  return (
    <span className={cls('num font-bold', unknown ? 'text-amber-600' : gapWrong ? 'text-red-700' : k === 'mwGap' && v < 0 ? 'text-red-700' : 'text-slate-800')}
      title={unknown ? 'المدينة كتبت أن الأصفار تعني «غير متوفر»' : gapWrong ? `الحساب: ${fmt(p.mwGapCalc as number)}` : undefined}>
      {fmt(v)}{unknown && ' ؟'}
    </span>
  )
}

export function Productivity() {
  const { cities } = useMCity()
  const prod = (c: MCity) => cityData(c).productivity
  const power = cities.map((c) => ({ name: c, 'الإجمالي': prod(c)?.mwTotal ?? 0, 'المتاح': prod(c)?.mwAvail ?? 0, 'الاستهلاك': prod(c)?.mwUse ?? 0 }))
  const water = cities.map((c) => ({ name: c, 'شرب': prod(c)?.waterDrink ?? 0, 'صناعي': prod(c)?.waterInd ?? 0 }))

  return (
    <>
      <Section title="احتياجات المدن من الخدمات" cols="grid-cols-1" note="من قالب الإنتاجية: سطر واحد لكل مدينة لشهر 10. الأحمر: قيمة خاطئة أو عجز، البرتقالي «؟»: صفر قالت المدينة إنه يعني «غير متوفر».">
        <Card>
          <div className="overflow-x-auto scroll-thin">
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr className="text-right text-xs">
                  <th className="px-3 py-2.5">المؤشر</th>
                  {cities.map((c) => <th key={c} className="px-3 py-2.5 text-center">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-gold-100/40">
                  <td className="px-3 py-2 font-bold text-slate-600">الشهر كما ورد</td>
                  {cities.map((c) => {
                    const p = prod(c)
                    return (
                      <td key={c} className="px-3 py-2 text-center">
                        {p ? (
                          <span className={cls('num inline-flex items-center gap-1 font-bold', p._review.length ? 'text-red-700' : 'text-emerald-700')}>
                            {p.month || 'فارغ'} <ReviewFlag reasons={p._review} size={14} />
                          </span>
                        ) : '—'}
                      </td>
                    )
                  })}
                </tr>
                {GROUPS.map((g) => (
                  <Fragment key={g.title}>
                    <tr className="bg-brand-50/60">
                      <td colSpan={cities.length + 1} className="px-3 py-1.5 text-xs font-extrabold text-brand-700">
                        <span className="inline-flex items-center gap-1.5">{g.icon}{g.title}</span>
                      </td>
                    </tr>
                    {g.rows.map(([k, label]) => (
                      <tr key={k} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{label}</td>
                        {cities.map((c) => <td key={c} className="px-3 py-2 text-center"><Cell p={prod(c)} k={k} /></td>)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="الكهرباء والمياه">
        <Card title="الاستطاعة الكهربائية (MW)" icon={<Zap size={18} />}>
          <Columns data={power} keys={['الإجمالي', 'المتاح', 'الاستهلاك']} colors={{ 'الإجمالي': '#c7a66b', 'المتاح': '#0a5346', 'الاستهلاك': '#2f6fa3' }} height={280} />
          <p className="mt-2 text-[11.5px] text-slate-400">الراعي كتبت الاستطاعة المتاحة فقط (40). عدرا: المتاح يساوي الاستهلاك (900) فلا فائض.</p>
        </Card>
        <Card title="المياه (م³)" icon={<Droplets size={18} />}>
          <Columns data={water} keys={['شرب', 'صناعي']} colors={{ 'شرب': '#2f6fa3', 'صناعي': '#0a5346' }} height={280} />
          <p className="mt-2 text-[11.5px] text-slate-400">لم يحدد القالب إن كانت الكميات شهرية أو يومية، والأرقام متفاوتة جداً بين المدن (من 100 م³ في الراعي إلى 283,620 م³ صناعي في حسياء).</p>
        </Card>
      </Section>

      <Section title="ملاحظات المدن">
        {cities.map((c) => {
          const p = prod(c)
          return (
            <Card key={c} title={<CityName city={c} />}>
              {p?.notes ? <p className="text-[13.5px] leading-relaxed text-slate-700">{p.notes}</p> : <p className="text-sm text-slate-400">لا توجد ملاحظات.</p>}
              {p?._review.length ? (
                <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">
                  {p._review.map((r) => <li key={r} className="flex gap-1.5"><AlertTriangle size={13} className="mt-1 shrink-0" />{r}</li>)}
                </ul>
              ) : null}
            </Card>
          )
        })}
      </Section>
    </>
  )
}
