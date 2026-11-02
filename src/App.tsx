import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DataPage } from './pages/monthly/DataPage'
import { Monthly } from './pages/monthly/Monthly'

/** كل الصفحات تقرأ من ملفات المدن الخمس (src/data/monthly.json) */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Monthly />} />
          <Route path="monthly" element={<Navigate to="/" replace />} />
          <Route path="monthly/:tab" element={<Monthly />} />
          <Route path="data/:table" element={<DataPage />} />
          {/* روابط النموذج القديم ← الصفحات المقابلة */}
          <Route path="quality" element={<Navigate to="/monthly/issues" replace />} />
          <Route path="t/:tableId" element={<Navigate to="/data/plots" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
