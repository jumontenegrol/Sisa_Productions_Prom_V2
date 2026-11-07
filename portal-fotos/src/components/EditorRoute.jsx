import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function EditorRoute({ children }) {
  const { session, loading: authLoading } = useAuth()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    async function checkRole() {
      if (!session?.user?.id || !supabase) { if (active) setChecking(false); return }
      const { data, error } = await supabase.from('editor_profiles').select('role').eq('user_id', session.user.id).maybeSingle()
      if (active) {
        setAllowed(!error && ['editor', 'admin'].includes(data?.role))
        setChecking(false)
      }
    }
    checkRole()
    return () => { active = false }
  }, [session?.user?.id])

  if (authLoading || checking) return <div className="center-msg">Verificando acceso…</div>
  if (!session) return <Navigate to="/editor/login" replace />
  if (!allowed) return <Navigate to="/" replace />
  return children
}
