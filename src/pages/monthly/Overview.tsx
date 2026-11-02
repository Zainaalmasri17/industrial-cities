import {
  AlertTriangle, Ban, BadgeCheck, Banknote, Building, CheckCircle2, ClipboardList, FileSpreadsheet, Flag, Globe2, HardHat, KeyRound,
  Landmark, MapPinned, Ruler, ShieldAlert, Trophy, Users, Wallet, XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '../../components/ui'
import { MONTHLY, TEMPLATE_TITLE, type MCity, type TemplateKey } from '../../data/monthly'
import { CityName, Columns, MKpi, Section, cityData, fmt, fmtSYP, useMCity } from './shared'

const STATUS_COLORS: Record<string, string> = { 'مخصص': '#0a5346', 'شاغر': '#c7a66b', 'مكتتب عليه': '#2f6fa3', 'غير محدد': '#cbd5d1' }

const sum = <T,>(xs: T[] | undefined, f: (x: T) => number | null | undefined) => (xs ?? []).reduce((n, x) => n + (f(x) ?? 0), 0)

function FilesMatrix() {
  const { cities } = useMCity()
  const rows = MONTHLY.files.filter((f) => cities.includes(f.city))
  const keys: TemplateKey[] = ['plots', 'invest', 'prod', 'ach']
  const count = (c: MCity, k: TemplateKey) => {
    const f = MONTHLY.files.find((x) => x.city === c)?.files[k]
    if (!f) return null
    if (k === 'plots') return `${fmt(f.rows)} مقسم${f.installments ? ` · ${fmt(f.installments)} قسط` : ''}${f.previous ? ` · ${f.previous} تخصيص سابق` : ''}`
    if (k === 'invest') return `${f.rows} مشروع`
    if (k === 'prod') return f.rows ? 'سطر الشهر' : 'فارغ'
    return `${f.rows} بند`
  }
  return (
    <Card title="استلام الملفات" icon={<FileSpreadsheet size={18} />} className="lg:col-span-2">
      <div className="overflow-x-auto scroll-thin">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-right text-xs">
              <th className="px-3 py-2.5">المدينة</th>
              {keys.map((k) => <th key={k} className="px-3 py-2.5">{TEMPLATE_TITLE[k]}</th>)}
              <th className="px-3 py-2.5">مشاكل البيانات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = cityData(r.city)
              return (
                <tr key={r.city} className="border-b border-slate-100">
                  <td className="px-3 py-3"><CityName city={r.city} /></td>
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-3">
                      {r.files[k] ? (
                        <div className="flex items-start gap-1.5">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                          <div>
                            <div className="text-[13px] font-bold text-slate-700">{count(r.city, k)}</div>
                            <div className="max-w-56 truncate text-[11px] text-slate-400" title={r.files[k]!.name}>{r.files[k]!.name}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={16} /> لم يصل</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <Link to="/monthly/issues" className="group inline-flex flex-col">
                      <span className="num font-extrabold text-red-700 group-hover:underline">{fmt(d.issueCount)} موضع</span>
                      <span className="text-[11.5px] text-slate-500">{d.issueTypes} نوع، منها <b className="text-red-600">{d.highTypes}</b> عالية الخطورة</span>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-slate-400">وصلت الملفات الأربعة من كل المدن. أسماء الملفات لا تتبع قاعدة التسمية في 3 مدن (تفاصيلها في «مشاكل البيانات»).</p>
    </Card>
  )
}

function TopIssues() {
  const { cities } = useMCity()
  return (
    <Card title="أهم ما يجب تصحيحه في كل مدينة" icon={<ShieldAlert size={18} />}>
      <div className="space-y-4">
        {cities.map((c) => {
          const top = MONTHLY.issues
            .filter((i) => i.counts[c] > 0)
            .sort((a, b) => (a.severity === b.severity ? b.counts[c] - a.counts[c] : a.severity === 'مرتفع' ? -1 : b.severity === 'مرتفع' ? 1 : a.severity === 'متوسط' ? -1 : 1))
            .slice(0, 4)
          return (
            <div key={c}>
              <div className="mb-1.5"><CityName city={c} /></div>
              <ul className="space-y-1">
                {top.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-[13px]">
                    <Badge value={i.severity} />
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={i.desc}>{i.title}</span>
                    <span className="num text-xs font-bold text-slate-500">{fmt(i.counts[c])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <Link to="/monthly/issues" className="mt-4 inline-block text-sm font-bold text-gold-600 hover:underline">كل المشاكل مع الأمثلة ←</Link>
    </Card>
  )
}

export function Overview() {
  const { cities } = useMCity()
  const s = (c: MCity) => cityData(c).summary
  const statusData = cities.map((c) => ({ name: c, ...Object.fromEntries((s(c)?.byStatus ?? []).map((x) => [x.name, x.value])) }))
  const statusKeys = ['مخصص', 'شاغر', 'مكتتب عليه', 'غير محدد'].filter((k) => statusData.some((d) => (d as Record<string, unknown>)[k]))
  const ach = (c: MCity, t: string) => cityData(c).achievements?.filter((a) => a.type === t).length ?? null

  return (
    <>
      <Section title="المؤشرات الرئيسية" cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
        note="مجموع المدن المختارة، وتحته رقم كل مدينة. الأرقام كما وردت في الملفات — اقرأها مع قسم مشاكل البيانات.">
        <MKpi label="عدد المقاسم المسجلة" icon={<MapPinned size={16} />} get={(c) => s(c)?.plots} />
        <MKpi label="المقاسم المخصصة" icon={<ClipboardList size={16} />} get={(c) => s(c)?.allocated} hint="حسب (مرحلة المقسم)، أو وجود مستثمر إن كانت المرحلة فارغة" />
        <MKpi label="المقاسم الشاغرة" icon={<Ban size={16} />} get={(c) => s(c)?.vacant} tone="gold" hint="معروض للاستثمار / غير مخصص / غير معلن عنه" />
        <MKpi label="المساحة الإجمالية" icon={<Ruler size={16} />} get={(c) => (s(c) ? s(c)!.totalArea / 10000 : null)} unit="هكتار" tone="gold" format={(n) => fmt(n, 0)} />
        <MKpi label="المستثمرون (أسماء مختلفة)" icon={<Users size={16} />} get={(c) => s(c)?.investors} />
        <MKpi label="التراخيص الإدارية" icon={<BadgeCheck size={16} />} get={(c) => s(c)?.adminLicenses} />
        <MKpi label="رخص البناء" icon={<Building size={16} />} get={(c) => s(c)?.buildingLicenses} />
        <MKpi label="المقاسم المؤجرة" icon={<KeyRound size={16} />} get={(c) => s(c)?.leased} />
        <MKpi label="مستثمرون أجانب" icon={<Globe2 size={16} />} get={(c) => (s(c)?.byNationality.some((x) => x.name !== 'غير محدد') ? s(c)!.foreign : null)} />
        <MKpi label="الأقساط المتأخرة" icon={<Banknote size={16} />} tone="red" get={(c) => s(c)?.installments?.overdue ?? null}
          hint="غير مدفوع وتاريخ استحقاقه قبل 2026-10-31. فقط حسياء وباب الهوى عبّأتا الأقساط" />
        <MKpi label="مشاريع الخطة الاستثمارية" icon={<HardHat size={16} />} get={(c) => cityData(c).projects?.length ?? null} />
        <MKpi label="الاعتماد المخطط" icon={<Landmark size={16} />} tone="gold" format={fmtSYP} unit="ل.س" get={(c) => sum(cityData(c).projects, (p) => p.planned)} />
        <MKpi label="المنفق حتى تاريخه" icon={<Wallet size={16} />} tone="gold" format={fmtSYP} unit="ل.س" get={(c) => sum(cityData(c).projects, (p) => p.spent)} />
        <MKpi label="الإنجازات" icon={<Trophy size={16} />} get={(c) => ach(c, 'إنجاز')} />
        <MKpi label="التحديات" icon={<Flag size={16} />} tone="red" get={(c) => ach(c, 'تحدٍّ')} />
      </Section>

      <Section title="الصورة العامة">
        <FilesMatrix />
        <Card title="حالة المقاسم في كل مدينة" icon={<MapPinned size={18} />}>
          <Columns data={statusData} keys={statusKeys} stacked colors={STATUS_COLORS} height={300} />
          <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
            «غير محدد»: مرحلة المقسم فارغة ولا يوجد مستثمر. في الراعي عمود المرحلة فارغ بالكامل، فالحالة مستنتجة من اسم المستثمر.
          </p>
        </Card>
        <TopIssues />
      </Section>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-gold-100 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>المقارنة بين المدن تحتاج حذراً:</b> عدرا لم تعبّئ الجنسية ولا الأقساط، الشيخ نجار ملأت آلاف الخانات بـ«ــ» واستخدمت مراحل من خارج القائمة،
          الراعي لم تعبّئ المرحلة والتخديم، وحسياء غيّرت أسماء أعمدة. التفاصيل في <Link to="/monthly/issues" className="font-bold underline">مشاكل البيانات</Link>.
        </div>
      </div>
    </>
  )
}
