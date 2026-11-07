import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import BrandLogo from '../components/BrandLogo'

export default function UnifiedLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!supabase) { setError('Falta configurar portal-fotos/.env.'); return }
    setBusy(true); setError('')
    const value = identifier.trim()

    if (value.includes('@')) {
      const { error: authError } = await signIn(value, password)
      if (authError) { setBusy(false); setError('No se pudo iniciar sesión. Revisa los datos e intenta de nuevo.'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { await supabase.auth.signOut(); setBusy(false); setError('No se pudo verificar la cuenta.'); return }
      const { data: profile } = await supabase.from('editor_profiles').select('role').eq('user_id', user.id).maybeSingle()
      if (!['editor', 'admin'].includes(profile?.role)) {
        await supabase.auth.signOut()
        setBusy(false); setError('La cuenta ingresada no tiene perfil de editor.'); return
      }
      navigate('/editor/fotos')
      setBusy(false)
      return
    }

    const phone = password.replace(/\D/g, '')
    const { data, error: lookupError } = await supabase.functions.invoke('student-login', {
      body: { name: value, phone },
    })
    if (lookupError || !data?.email) {
      setBusy(false)
      setError('No se pudo validar el acceso. Revisa el nombre y teléfono registrado o consulta al editor.')
      return
    }
    const { error: sessionError } = await supabase.auth.signInWithPassword({ email: data.email, password: phone })
    setBusy(false)
    if (sessionError) { setError('No se pudo abrir la sesión. Intenta nuevamente.'); return }
    navigate('/seleccion')
  }

  return <main className="editor-login-page unified-login-page"><form className="editor-login-card unified-login-card" onSubmit={submit}>
    <BrandLogo variant="login" />
    <p className="overline">PORTAL DE FOTOGRAFÍAS · PROMOCIÓN</p>
    <h1>Ingresa a tu cuenta</h1>
    <p>Estudiantes: ingresen su nombre completo y el teléfono registrado.</p>
    <label>Usuario
      <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
    </label>
    <label>Contraseña
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" inputMode={identifier.includes('@') ? undefined : 'tel'} required />
    </label>
    {error && <div className="inline-error">{error}</div>}
    {!supabase && <div className="inline-error">Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `portal-fotos/.env`.</div>}
    <button className="gold-button" disabled={busy || !supabase}>{busy ? 'Validando…' : 'Ingresar'}</button>
    <p className="login-help">El sistema valida tus datos y abre el portal correspondiente.</p>
  </form></main>
}
