import { Flag, Trophy } from 'lucide-react'
import { Card, ReviewFlag, cls } from '../../components/ui'
import { M_CITY_COLOR } from '../../data/monthly'
import { Columns, Empty, Section, cityData, useMCity } from './shared'

export function Achievements() {
  const { cities } = useMCity()
  const counts = cities.map((c) => {
    const a = cityData(c).achievements ?? []
    return { name: c, 'إنجاز': a.filter((x) => x.type === 'إنجاز').length, 'تحدٍّ': a.filter((x) => x.type === 'تحدٍّ').length }
  })
  return (
    <>
      <Section title="عدد البنود" cols="grid-cols-1">
        <Card>
          <Columns data={counts} keys={['إنجاز', 'تحدٍّ']} colors={{ 'إنجاز': '#0a5346', 'تحدٍّ': '#b5523b' }} names={{ 'تحدٍّ': 'تحدٍّ' }} height={240} />
        </Card>
      </Section>

      {cities.map((c) => {
        const items = cityData(c).achievements ?? []
        const flagged = items.filter((i) => i._review.length).length
        return (
          <Section key={c} title={c} cols="lg:grid-cols-2"
            note={flagged ? <span className="text-amber-700">{flagged} بند عليه ملاحظة (مثل شهر غير شهر التقرير) — مرّر على المثلث لرؤيتها.</span> : undefined}>
            {(['إنجاز', 'تحدٍّ'] as const).map((t) => {
              const list = items.filter((i) => i.type === t)
              return (
                <Card key={t} title={<span className="inline-flex items-center gap-2">{t === 'إنجاز' ? <Trophy size={17} className="text-brand-600" /> : <Flag size={17} className="text-red-600" />}{t === 'إنجاز' ? 'الإنجازات' : 'التحديات'} <span className="num text-sm text-slate-400">({list.length})</span></span>}>
                  {list.length ? (
                    <ol className="space-y-2.5">
                      {list.map((i, n) => (
                        <li key={i._row} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                          <span className={cls('num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                            t === 'إنجاز' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{n + 1}</span>
                          <span className="flex-1 text-slate-700">{i.desc ?? <span className="italic text-rose-400">بلا وصف</span>}</span>
                          <ReviewFlag reasons={i._review} size={15} />
                        </li>
                      ))}
                    </ol>
                  ) : <Empty text={t === 'إنجاز' ? 'لم تُسجَّل إنجازات' : 'لم تُسجَّل تحديات'} />}
                  <div className="mt-3 h-0.5 w-10 rounded-full" style={{ background: M_CITY_COLOR[c] }} />
                </Card>
              )
            })}
            {items.some((i) => !i.type) && (
              <Card title="بنود بلا نوع" className="lg:col-span-2">
                <ul className="list-disc space-y-1 pr-5 text-[13px] text-slate-600">{items.filter((i) => !i.type).map((i) => <li key={i._row}>{i.desc}</li>)}</ul>
              </Card>
            )}
          </Section>
        )
      })}
    </>
  )
}
