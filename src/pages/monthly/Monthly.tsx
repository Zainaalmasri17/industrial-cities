import { NavLink, useParams } from 'react-router-dom'
import { PageHeader, cls } from '../../components/ui'
import { MONTH_LABEL, MONTHLY } from '../../data/monthly'
import { Achievements } from './Achievements'
import { Installments } from './Installments'
import { Invest } from './Invest'
import { Issues } from './Issues'
import { Overview } from './Overview'
import { PlotsSection } from './PlotsSection'
import { Productivity } from './Productivity'
import { CityName, useMCity } from './shared'

const TABS = [
  ['', 'نظرة عامة', Overview],
  ['plots', 'المقاسم', PlotsSection],
  ['installments', 'الأقساط والتخصيصات السابقة', Installments],
  ['invest', 'الخطة الاستثمارية', Invest],
  ['productivity', 'الإنتاجية والخدمات', Productivity],
  ['achievements', 'الإنجازات والتحديات', Achievements],
  ['issues', 'مشاكل البيانات', Issues],
] as const

export function Monthly() {
  const { tab = '' } = useParams()
  const { city } = useMCity()
  const active = TABS.find(([k]) => k === tab) ?? TABS[0]
  const Comp = active[2]
  const totalIssues = MONTHLY.issues.reduce((n, i) => n + Object.values(i.counts).reduce((a, b) => a + b, 0), 0)

  return (
    <div className="fade-in">
      <PageHeader kicker={`قوالب الوزارة · بيانات شهر ${MONTH_LABEL}`} title={tab ? active[1] : 'اللوحة العامة'}
        subtitle={<>البيانات كما وصلت من المدن الخمس في القوالب الأربعة، بدون تصحيح. كل رقم محسوب من الملفات مباشرة، وكل مشكلة وُجدت فيها معروضة مع رقم السطر والعمود — <b className="text-gold-300">{MONTHLY.issues.length} نوع مشكلة في {totalIssues.toLocaleString('en-US')} موضع</b>. اختر المدينة من الشريط العلوي.</>} />

      <nav className="scroll-thin z-20 flex items-center gap-1 overflow-x-auto rounded-2xl lg:sticky lg:top-[calc(var(--header-h)+8px)] lg:flex-wrap lg:overflow-visible border border-[var(--border)] bg-white/92 p-1.5 shadow-sm backdrop-blur">
        {TABS.map(([k, label]) => (
          <NavLink key={k} to={k ? `/monthly/${k}` : '/'} end
            className={() => cls('shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] font-bold transition',
              active[0] === k ? 'bg-gold-500 text-brand-900 shadow-sm' : 'text-brand-700 hover:bg-gold-100',
              k === 'issues' && active[0] !== k && 'text-red-700')}>
            {label}
          </NavLink>
        ))}
        <span className="mr-auto hidden px-3 text-xs font-bold text-slate-400 sm:inline">
          {city === 'الكل' ? 'كل المدن' : <CityName city={city} />}
        </span>
      </nav>

      <Comp />
    </div>
  )
}
