import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import EditorRoute from './components/EditorRoute'
import StudentRoute from './components/StudentRoute'
import UnifiedLogin from './pages/UnifiedLogin'
import PhotoEditor from './pages/PhotoEditor'
import StudentSelection from './pages/StudentSelection'

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<UnifiedLogin />} />
    <Route path="/editor/login" element={<Navigate to="/" replace />} />
    <Route path="/estudiante/login" element={<Navigate to="/" replace />} />
    <Route path="/seleccion" element={<StudentRoute><StudentSelection /></StudentRoute>} />
    <Route path="/editor/fotos" element={<EditorRoute><PhotoEditor /></EditorRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></AuthProvider>
}
