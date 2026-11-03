import {
  Banknote, BadgeCheck, CalendarRange, Factory, FileWarning, Flag, HardHat, History, KeyRound, LayoutDashboard, MapPinned, Menu,
  Table2, Users, X, Zap,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { M_CITIES, MONTH_LABEL } from '../data/monthly'
import { MCityCtx, type MFilter } from '../pages/monthly/shared'
import { cls } from './ui'

const NAV: Array<{ group: string; items: Array<{ to: string; label: string; icon: React.ElementType }> }> = [
  {
    group: '',
    items: [{ to: '/', label: 'اللوحة العامة', icon: LayoutDashboard }],
  },
  {
    group: 'أقسام اللوحة',
    items: [
      { to: '/monthly/plots', label: 'المقاسم', icon: MapPinned },
      { to: '/monthly/installments', label: 'الأقساط والتخصيصات السابقة', icon: Banknote },
      { to: '/monthly/invest', label: 'الخطة الاستثمارية', icon: HardHat },
      { to: '/monthly/productivity', label: 'الإنتاجية والخدمات', icon: Zap },
      { to: '/monthly/achievements', label: 'الإنجازات والتحديات', icon: Flag },
    ],
  },
  {
    group: 'الجداول',
    items: [
      { to: '/data/plots', label: 'سجل المقاسم', icon: Table2 },
      { to: '/data/investors', label: 'المستثمرون', icon: Users },
      { to: '/data/licenses', label: 'التراخيص', icon: BadgeCheck },
      { to: '/data/leases', label: 'الإيجارات', icon: KeyRound },
      { to: '/data/installments', label: 'الأقساط', icon: Banknote },
      { to: '/data/previous', label: 'التخصيصات السابقة', icon: History },
      { to: '/data/projects', label: 'مشاريع الخطة الاستثمارية', icon: Factory },
    ],
  },
  {
    group: 'الجودة',
    items: [{ to: '/monthly/issues', label: 'مشاكل البيانات', icon: FileWarning }],
  },
]

function readCity(): MFilter {
  try {
    const v = localStorage.getItem('monthly-city') as MFilter | null
    if (v && (v === 'الكل' || M_CITIES.includes(v as never))) return v
  } catch { /* تجاهل */ }
  return 'الكل'
}

export function CitySwitch({ city, setCity, light, className }: { city: MFilter; setCity: (c: MFilter) => void; light?: boolean; className?: string }) {
  return (
    <div className={cls('inline-flex rounded-full border p-1', light ? 'border-[var(--border)] bg-white shadow-sm' : 'flex-wrap border-gold-500/40 bg-white/5', className)} role="radiogroup" aria-label="المدينة">
      {(['الكل', ...M_CITIES] as MFilter[]).map((o) => (
        <button key={o} role="radio" aria-checked={city === o} onClick={() => setCity(o)}
          className={cls('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold transition',
            city === o ? 'bg-gradient-to-l from-gold-300 to-gold-500 text-brand-900 shadow' : light ? 'text-brand-700 hover:bg-gold-100' : 'text-[#f7f3e8]/85 hover:bg-white/10')}>
          {o === 'الكل' ? 'كل المدن' : o}
        </button>
      ))}
    </div>
  )
}

export function Layout() {
  // على الموبايل القائمة تفتح فوق المحتوى وتبدأ مغلقة
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches
  const [open, setOpen] = useState(() => !isMobile() && localStorage.getItem('ic-sidebar') !== '0')
  const toggle = () => setOpen((o) => { if (!isMobile()) localStorage.setItem('ic-sidebar', o ? '0' : '1'); return !o })
  const closeOnMobile = () => { if (isMobile()) setOpen(false) }
  const [city, setCityState] = useState<MFilter>(readCity)
  const setCity = (c: MFilter) => {
    setCityState(c)
    try { localStorage.setItem('monthly-city', c) } catch { /* تجاهل */ }
  }

  return (
    <MCityCtx.Provider value={{ city, setCity }}>
      <div style={{ paddingTop: 'var(--header-h)' }}>
        <header className="site-header">
          <div className="header-overlay" aria-hidden="true" />
          <div className="relative z-10 flex w-full min-w-0 items-center gap-3 lg:gap-4">
            <button className="sidebar-toggle shrink-0" onClick={toggle} aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}>
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
            <img src="/header-logo-ar.png" alt="وزارة الصناعة والتجارة الداخلية" className="h-9 w-auto min-w-0 max-w-[calc(100%-56px)] object-contain object-right sm:h-11" />
            <div className="hidden border-r border-gold-500/30 pr-4 lg:block">
              <div className="text-[15px] font-extrabold leading-tight text-[#f7f3e8]">نظام بيانات المدن الصناعية</div>
              <div className="text-[11px] font-bold text-gold-500">بيانات شهر {MONTH_LABEL}</div>
            </div>
            <span className="flex-1" />
            <div className="hidden lg:block"><CitySwitch city={city} setCity={setCity} /></div>
          </div>
        </header>

        <div className={cls('app-shell flex items-stretch', open ? 'sidebar-open' : 'sidebar-closed')}>
          {open && <div className="sidebar-backdrop lg:hidden" onClick={toggle} aria-hidden="true" />}
          <aside className="app-sidebar" aria-label="القائمة الجانبية">
            <div className="flex items-center gap-3 border-b border-gold-500/20 px-1.5 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-gold-300 to-gold-500 text-lg font-black text-brand-900 shadow-lg">م</div>
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-extrabold">المدن الصناعية</div>
                <div className="text-[11.5px] font-bold text-gold-300">خمس مدن · {MONTH_LABEL}</div>
              </div>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto scroll-thin">
              {NAV.map((g) => (
                <div key={g.group || 'main'} className="flex flex-col gap-0.5">
                  {g.group && <div className="mb-0.5 px-3 text-[11px] font-bold tracking-wide text-gold-300/80">{g.group}</div>}
                  {g.items.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} end onClick={closeOnMobile} className={({ isActive }) => cls('app-sidebar-link', isActive && 'active')}>
                      <Icon size={18} className="shrink-0 opacity-90" />
                      <span className="truncate">{label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="border-t border-gold-500/20 pt-3 text-[11px] leading-relaxed text-[#f6f2e7]/60">
              كل الصفحات تقرأ من ملفات المدن الخمس (20 ملفاً) كما وصلت.
              <span className="mt-1 flex items-center gap-1"><CalendarRange size={12} />عدرا · حسياء · الشيخ نجار · باب الهوى · الراعي</span>
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
            <div className="mx-auto max-w-[1560px]">
              <div className="scroll-thin -mx-3 mb-4 overflow-x-auto px-3 lg:hidden">
                <CitySwitch city={city} setCity={setCity} light />
              </div>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </MCityCtx.Provider>
  )
}
