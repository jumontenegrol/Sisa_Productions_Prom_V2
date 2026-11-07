import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function EditorLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    const { error: loginError } = await signIn(email, password)
    if (loginError) { setBusy(false); setError('Correo o contraseña incorrectos.'); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('editor_profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (!['editor', 'admin'].includes(profile?.role)) {
      await supabase.auth.signOut()
      setBusy(false)
      setError('Esta cuenta no tiene permiso de editor.')
      return
    }
    navigate('/editor/fotos')
  }

  return <main className="editor-login-page"><form className="editor-login-card" onSubmit={submit}>
    <span className="portal-mark">S</span><p className="overline">SISA PRODUCTIONS · ACCESO INTERNO</p>
    <h1>Editor de fotografías</h1><p>Ingresa con tu cuenta autorizada para organizar las fotos de cada estudiante.</p>
    {!supabase && <div className="inline-error">Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `portal-fotos/.env`.</div>}
    <label>Correo<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <div className="inline-error">{error}</div>}
    <button className="gold-button" disabled={busy || !supabase}>{busy ? 'Ingresando…' : 'Entrar al editor'}</button>
    <Link to="/" className="back-link">Volver a la vista de estudiante</Link>
  </form></main>
}
