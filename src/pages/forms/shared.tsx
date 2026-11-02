import { CheckCircle2, FlaskConical, Save } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AllocPicker } from '../../components/AllocPicker'
import { RulesBox } from '../../components/forms'
import { Button, Card, PageHeader } from '../../components/ui'
import type { Rec } from '../../data/load'
import { useStore } from '../../data/store'
import { TABLE, type TableId } from '../../schema/schema'

export function useAllocParam() {
  const [sp] = useSearchParams()
  const [alloc, setAlloc] = useState(sp.get('alloc') ?? '')
  return [alloc, setAlloc] as const
}

/** يملأ سجلاً بكل حقول الجدول (null للفارغ) */
export function fullRecord(table: TableId, values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(TABLE[table].fields.map((f) => [f.name, values[f.name] ?? null]))
}

export function FormShell({ title, subtitle, kicker, alloc, setAlloc, allocError, children, rules, onSubmit, onTryErrors, saved }: {
  title: string; subtitle: string; kicker: string; alloc: string; setAlloc: (v: string) => void; allocError?: string
  children: ReactNode; rules: string[]; onSubmit: () => void; onTryErrors: () => void; saved: Rec | null
}) {
  const navigate = useNavigate()
  return (
    <div className="fade-in">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle}
        actions={<Button variant="secondary" onClick={onTryErrors} title="يملأ الفورم بقيم خاطئة شائعة في الإكسل لعرض رسائل التحقق"><FlaskConical size={16} /> جرّب أخطاء الإكسل الشائعة</Button>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card title="الإضبارة">
            <AllocPicker value={alloc} onChange={setAlloc} error={allocError} />
          </Card>
          <Card title="البيانات">{children}</Card>
          {saved ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800 fade-in">
              <CheckCircle2 size={20} />
              <span className="flex-1">تم الحفظ (في المتصفح) — السجل يظهر الآن في الجداول وفي السجل الزمني للإضبارة.</span>
              <Button onClick={() => navigate(`/file/${encodeURIComponent(saved._alloc!)}`)}>فتح الإضبارة</Button>
            </div>
          ) : (
            <div className="flex justify-end"><Button onClick={onSubmit}><Save size={16} /> تحقق واحفظ</Button></div>
          )}
        </div>
        <div className="space-y-4"><RulesBox rules={rules} /></div>
      </div>
    </div>
  )
}

export function useSave() {
  const { add } = useStore()
  const [saved, setSaved] = useState<Rec | null>(null)
  return { saved, setSaved, add }
}
