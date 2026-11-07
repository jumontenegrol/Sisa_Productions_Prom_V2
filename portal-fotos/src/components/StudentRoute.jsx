import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function StudentRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="center-msg">Validando sesión…</div>
  if (!session) return <Navigate to="/" replace />
  return children
}
