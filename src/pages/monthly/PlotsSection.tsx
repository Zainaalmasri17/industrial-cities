import type { ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, cls } from '../../components/ui'
import { M_CITY_COLOR, type MCity, type PlotSummary } from '../../data/monthly'
import { CityName, Columns, Donut, Empty, FONT, HBars, Section, TT, cityData, fmt, useMCity } from './shared'

function PerCity({ title, render, note, wide }: { title: string; render: (s: PlotSummary, c: MCity) => ReactNode; note?: (c: MCity) => ReactNode; wide?: boolean }) {
  const { cities } = useMCity()
  return (
    <>
      {cities.map((c) => {
        const s = cityData(c).summary
        return (
          <Card key={c} className={wide ? 'lg:col-span-2' : undefined} title={<>{title} <span className="mr-1 text-sm">— <CityName city={c} /></span></>}>
            {s ? render(s, c) : <Empty />}
            {note?.(c) && <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">{note(c)}</p>}
          </Card>
        )
      })}
    </>
  )
}

/** مقارنة نفس التوزيع بين المدن (أعمدة متجاورة) */
export function compare(cities: MCity[], key: keyof PlotSummary, top = 10) {
  const names = new Map<string, number>()
  for (const c of cities) for (const x of (cityData(c).summary?.[key] as { name: string; value: number }[]) ?? []) names.set(x.name, (names.get(x.name) ?? 0) + x.value)
  const order = [...names.entries()].filter(([n]) => n !== 'غير محدد').sort((a, b) => b[1] - a[1]).slice(0, top).map(([n]) => n)
  return order.map((n) => ({ name: n, ...Object.fromEntries(cities.map((c) => [c, ((cityData(c).summary?.[key] as { name: string; value: number }[]) ?? []).find((x) => x.name === n)?.value ?? 0])) }))
}

function Completeness() {
  const { cities } = useMCity()
  const cols = Object.keys(cityData('عدرا').completeness ?? {})
  const color = (v: number | null | undefined) =>
    v === null || v === undefined ? 'bg-slate-100 text-slate-300' : v >= 90 ? 'bg-emerald-600 text-white' : v >= 60 ? 'bg-emerald-200 text-emerald-900' : v >= 25 ? 'bg-amber-200 text-amber-900' : v > 0 ? 'bg-red-200 text-red-900' : 'bg-red-600 text-white'
  return (
    <Card title="نسبة تعبئة الأعمدة الأساسية في شيت المقاسم" className="lg:col-span-2">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-separate border-spacing-0.5 text-[12.5px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-right text-xs text-slate-500">العمود</th>
              {cities.map((c) => <th key={c} className="px-2 py-1.5 text-center"><CityName city={c} /></th>)}
            </tr>
          </thead>
          <tbody>
            {cols.map((col) => (
              <tr key={col}>
                <td className="whitespace-nowrap px-2 py-1 font-bold text-slate-600">{col}</td>
                {cities.map((c) => {
                  const v = cityData(c).completeness?.[col]
                  return (
                    <td key={c} className={cls('num rounded-md px-2 py-1 text-center font-bold', color(v))}
                      title={v === null || v === undefined ? 'العمود غير موجود' : `${v}% من المقاسم معبأة بقيمة فعلية (الفارغ و«ــ» لا يُحسبان)`}>
                      {v === null || v === undefined ? '—' : `${v}%`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-slate-500">
        {[['bg-emerald-600', '90% فأكثر'], ['bg-emerald-200', '60–89%'], ['bg-amber-200', '25–59%'], ['bg-red-200', 'أقل من 25%'], ['bg-red-600', 'فارغ بالكامل']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span className={cls('h-3 w-3 rounded', c)} />{l}</span>
        ))}
        <span>الفارغ و«ــ» و«-» لا تُحسب تعبئة. «لا يوجد» تُحسب لأن القالب يطلبها.</span>
      </div>
    </Card>
  )
}

export function YearsChart() {
  const { cities } = useMCity()
  const years = [...new Set(cities.flatMap((c) => cityData(c).summary?.allocByYear.map((y) => y.year) ?? []))].sort()
  const data = years.map((y) => ({ year: y, ...Object.fromEntries(cities.map((c) => [c, cityData(c).summary?.allocByYear.find((x) => x.year === y)?.value ?? 0])) }))
  if (!data.length) return <Empty />
  return (
    <div dir="ltr" style={{ height: 290 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(10,83,70,.12)" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip {...TT} />
          <Legend wrapperStyle={FONT} />
          {cities.map((c) => <Area isAnimationActive={false} key={c} dataKey={c} type="monotone" stroke={M_CITY_COLOR[c]} strokeWidth={2.2} fill={M_CITY_COLOR[c]} fillOpacity={0.12} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PlotsSection() {
  const { cities } = useMCity()
  const colors = Object.fromEntries(cities.map((c) => [c, M_CITY_COLOR[c]]))
  return (
    <>
      <Section title="المرحلة والتخديم" note="القيم باللون الأحمر ليست من القائمة المنسدلة في القالب (كُتبت يدوياً)، فلا يمكن جمعها مع المدن الأخرى.">
        <PerCity title="مرحلة المقسم" render={(s) => <HBars data={s.byPhase} offList="المرحلة" />}
          note={(c) => c === 'الشيخ نجار' ? 'استُخدمت مراحل خاصة بالمدينة (مباشر بناء، مشغل دون ترخيص…) بدل قائمة القالب.' : c === 'الراعي' ? 'العمود فارغ بالكامل.' : c === 'حسياء' ? 'قيم إضافية: «جاهز ولكن غير معلن عنه» و«غير جاهز وغير معلن عنه» و«حكومي جاهز».' : null} />
        <PerCity title="حالة التخديم" render={(s) => <Donut data={s.byService} offList="التخديم" />} />
      </Section>

      <Section title="الصناعة والاستعمال">
        <Card title="فئة الصناعة — مقارنة بين المدن" className="lg:col-span-2">
          <Columns data={compare(cities, 'byCategory', 12)} keys={cities} colors={colors} height={320} />
        </Card>
        <PerCity title="تصنيف المقسم" render={(s) => <Donut data={s.byClass} offList="تصنيف_المقسم" />} />
        <PerCity title="أكثر الأنشطة الصناعية" render={(s) => <HBars data={s.byActivity} max={10} />}
          note={(c) => c === 'الشيخ نجار' ? '«ــ» في 1236 مقسماً لم تُحسب.' : null} />
        <PerCity title="المقاسم حسب القطاع" render={(s, c) => <HBars data={s.bySector} color={M_CITY_COLOR[c]} max={14} />}
          note={(c) => c === 'حسياء' ? 'حسياء تكتب الفئة الصناعية في عمود القطاع (هندسية، غذائية…).' : c === 'الشيخ نجار' ? 'القطاع مكتوب كفئة (الأولى، الثانية، الثالثة).' : null} />
      </Section>

      <Section title="المستثمرون">
        <PerCity title="نوع المستثمر" render={(s) => <Donut data={s.byInvestorType} offList="نوع_المستثمر" />} />
        <PerCity title="الجنسية والدولة" render={(s) => (
          <div className="space-y-4">
            <Donut data={s.byNationality} offList="الجنسية" height={150} />
            {s.byCountry.filter((x) => x.name !== 'سوريا').length > 0 && <HBars data={s.byCountry.filter((x) => x.name !== 'سوريا')} color="#c7a66b" max={8} />}
          </div>
        )} note={(c) => c === 'عدرا' ? 'عدرا لم تعبّئ عمود الجنسية.' : c === 'حسياء' ? 'حسياء كتبت «سوريا» في عمود الدولة للسوريين، وهو للأجنبي فقط.' : null} />
        <PerCity title="أكثر المستثمرين مقاسم" render={(s) => (
          s.topInvestors.length ? (
            <ol className="space-y-1.5 text-[13px]">
              {s.topInvestors.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={d.name}>{d.name}</span>
                  <span className="num font-bold text-gold-600">{d.value}</span>
                </li>
              ))}
            </ol>
          ) : <Empty />
        )} />
      </Section>

      <Section title="التراخيص والتخصيص">
        <Card title="المقاسم حسب سنة قرار التخصيص" className="lg:col-span-2"><YearsChart /></Card>
        <PerCity title="الترخيص الإداري والإيجار والدمج" render={(s) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['ترخيص إداري', s.adminLicenses], ['رخصة بناء', s.buildingLicenses], ['مؤجر', s.leased], ['مدموج', s.merged]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#faf9f5] p-3 text-center ring-1 ring-[var(--border)]">
                  <div className="num text-xl font-extrabold text-brand-700">{fmt(v)}</div>
                  <div className="text-xs font-bold text-slate-500">{k}</div>
                </div>
              ))}
            </div>
            {s.byAdminType.length > 0 && <div><div className="mb-1 text-xs font-bold text-slate-500">نوع الترخيص الإداري</div><HBars data={s.byAdminType} offList="الترخيص_الإداري" /></div>}
          </div>
        )} note={(c) => c === 'حسياء' ? '«نهائي» ليست من القائمة (مؤقت / دائم).' : null} />
      </Section>

      <Section title="اكتمال البيانات">
        <Completeness />
      </Section>
    </>
  )
}
