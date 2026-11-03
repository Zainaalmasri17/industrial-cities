import { History } from 'lucide-react'
import { Card } from '../../components/ui'
import type { MCity } from '../../data/monthly'
import { CityName, Columns, Donut, Empty, HBars, Section, cityData, fmt, fmtSYP, useMCity } from './shared'

function InstCard({ c }: { c: MCity }) {
  const s = cityData(c).summary
  const i = s?.installments
  if (!i) {
    return (
      <Card title={<>الأقساط — <CityName city={c} /></>}>
        <Empty text="شيت الأقساط فارغ (أو فيه سطر المثال فقط). لا يمكن معرفة المتأخر أو المدفوع لهذه المدينة." />
      </Card>
    )
  }
  const tiles: [string, string, string?][] = [
    ['أقساط مسجلة', fmt(i.total)], ['مدفوعة', fmt(i.paid)], ['غير مدفوعة', fmt(i.unpaid)],
    ['متأخرة', fmt(i.overdue), 'text-red-700'], ['مقاسم عليها متأخر', fmt(i.overduePlots), 'text-red-700'], ['بلا تاريخ استحقاق', fmt(i.noDue), 'text-amber-700'],
  ]
  const unit = (c: string) => (c === 'ل.س' || c === 'USD' ? c : '')
  return (
    <Card title={<>الأقساط — <CityName city={c} /></>} className="lg:col-span-2">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
        <div className="grid grid-cols-3 gap-2.5 self-start">
          {tiles.map(([k, v, tone]) => (
            <div key={k} className="rounded-xl bg-[#faf9f5] p-2.5 ring-1 ring-[var(--border)]">
              <div className="text-[11.5px] font-bold text-slate-500">{k}</div>
              <div className={`num mt-0.5 text-right text-[17px] font-extrabold ${tone ?? 'text-brand-700'}`}>{v}</div>
            </div>
          ))}
          <table className="col-span-3 mt-1 w-full text-[12.5px]">
            <thead><tr className="text-right text-[11.5px] text-slate-500">
              <th className="py-1 font-bold">العملة</th><th className="py-1 font-bold">قيمة المدفوع</th><th className="py-1 font-bold">قيمة المتأخر</th><th className="py-1 font-bold">غير المستحق بعد</th>
            </tr></thead>
            <tbody>
              {i.values.map((v) => (
                <tr key={v.currency} className="border-t border-slate-100">
                  <td className={`py-1.5 font-bold ${unit(v.currency) ? 'text-slate-600' : 'text-amber-700'}`}>{v.currency}</td>
                  <td className="num money py-1.5 font-extrabold text-brand-700">{fmtSYP(v.paid)} <span className="text-[10.5px] text-slate-400">{unit(v.currency)}</span></td>
                  <td className="num money py-1.5 font-extrabold text-red-700">{fmtSYP(v.overdue)} <span className="text-[10.5px] text-slate-400">{unit(v.currency)}</span></td>
                  <td className="num money py-1.5 font-extrabold text-brand-700">{fmtSYP(v.notDue)} <span className="text-[10.5px] text-slate-400">{unit(v.currency)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-slate-500">الأقساط حسب سنة الاستحقاق</div>
          <Columns data={i.byYear} xKey="year" keys={['مدفوع', 'غير مدفوع']} stacked colors={{ 'مدفوع': '#0a5346', 'غير مدفوع': '#dc2626' }} height={230} />
        </div>
      </div>
      {s!.byInstStatus.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 [&>*]:min-w-0">
          <div><div className="mb-1 text-xs font-bold text-slate-500">حالة الأقساط على مستوى المقسم (العمود التلقائي)</div><Donut data={s!.byInstStatus} height={160} /></div>
          <div><div className="mb-1 text-xs font-bold text-slate-500">العملة</div><HBars data={s!.byCurrency} /></div>
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
        «متأخر» = غير مدفوع وتاريخ استحقاقه قبل نهاية تشرين الأول 2026. القيم مجموعة حسب عملة المقسم في شيت المقاسم، و«عملة غير مؤكدة» مقاسم مجموع أقساطها أكبر بكثير من قيمتها بعملتها (تفاصيلها في «مشاكل البيانات»).
        {c === 'حسياء' && ' كل الأقساط المدفوعة في حسياء (11,474) بلا رقم إيصال ولا تاريخه.'}
        {c === 'باب الهوى' && ' كل أقساط باب الهوى بلا تاريخ استحقاق، فلا يمكن حساب المتأخر منها.'}
      </p>
    </Card>
  )
}

export function Installments() {
  const { cities } = useMCity()
  const withPrev = cities.filter((c) => (cityData(c).previous?.length ?? 0) > 0)
  return (
    <>
      <Section title="الأقساط" note="من شيت (الأقساط) في ملف المقاسم: سطر لكل قسط. عبّأته حسياء وباب الهوى فقط؛ باقي المدن تركته فارغاً أو أبقت سطر المثال.">
        {cities.map((c) => <InstCard key={c} c={c} />)}
      </Section>

      <Section title="التخصيصات السابقة (الملغاة)" note="من شيت (التخصيصات السابقة): سطر لكل مستثمر أُلغي تخصيصه.">
        {withPrev.length === 0 && <Card><Empty text="لم تسجل المدن المختارة أي تخصيص سابق." /></Card>}
        {withPrev.map((c) => {
          const prev = cityData(c).previous!
          const reasons = Object.entries(prev.reduce<Record<string, number>>((m, p) => ({ ...m, [p['سبب الإلغاء'] ?? 'غير محدد']: (m[p['سبب الإلغاء'] ?? 'غير محدد'] ?? 0) + 1 }), {}))
            .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
          return (
            <Card key={c} className="lg:col-span-2" title={<>التخصيصات السابقة — <CityName city={c} /> <span className="num mr-2 text-sm text-slate-400">{prev.length} سجل</span></>} icon={<History size={18} />}>
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr] [&>*]:min-w-0">
                <div><div className="mb-1 text-xs font-bold text-slate-500">سبب الإلغاء</div><Donut data={reasons} offList="سبب_الإلغاء" /></div>
                <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-[var(--border)] scroll-thin">
                  <table className="data-table w-full text-[12.5px]">
                    <thead className="sticky top-0"><tr className="text-right text-xs">
                      {['السطر', 'المقسم', 'المستثمر السابق', 'تاريخ التخصيص', 'تاريخ الإلغاء', 'السبب'].map((h) => <th key={h} className="px-2.5 py-2">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {prev.map((p) => (
                        <tr key={p._row} className="border-b border-slate-100">
                          <td className="num px-2.5 py-1.5 text-slate-400">{p._row}</td>
                          <td className="px-2.5 py-1.5">{p['المقسم']}</td>
                          <td className="px-2.5 py-1.5">{p['المستثمر السابق']}</td>
                          <td className="num px-2.5 py-1.5">{p['تاريخ التخصيص'] ?? <span className="text-rose-400">غير صالح</span>}</td>
                          <td className="num px-2.5 py-1.5">{p['تاريخ الإلغاء'] ?? <span className="text-rose-400">فارغ</span>}</td>
                          <td className="px-2.5 py-1.5">{p['سبب الإلغاء']}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] text-slate-400">
                {prev.filter((p) => !p['تاريخ الإلغاء']).length} سجل بلا تاريخ إلغاء، و{prev.filter((p) => !p['تاريخ التخصيص']).length} بتاريخ تخصيص غير صالح.
                التواريخ المكتوبة كنص معروضة كما وردت.
              </p>
            </Card>
          )
        })}
      </Section>
    </>
  )
}
