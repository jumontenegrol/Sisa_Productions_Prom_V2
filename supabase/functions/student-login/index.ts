import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://sisaproductionspromv2.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function corsHeadersFor(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function normalizeName(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

async function rateLimitHash(serviceKey: string, scope: string, value: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${scope}:${value}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function response(status: number, body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || ''
  if (!allowedOrigins.has(origin)) return new Response('Origin not allowed', { status: 403, headers: { 'Vary': 'Origin' } })
  const corsHeaders = corsHeadersFor(origin)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' }, corsHeaders)

  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return response(415, { error: 'Content-Type no válido' }, corsHeaders)
    }
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 2048) return response(413, { error: 'Solicitud demasiado grande' }, corsHeaders)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 2048) return response(413, { error: 'Solicitud demasiado grande' }, corsHeaders)
    const body = JSON.parse(rawBody)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response(400, { error: 'Solicitud no válida' }, corsHeaders)
    }
    const name = typeof body.name === 'string' ? body.name : ''
    const phoneInput = typeof body.phone === 'string' ? body.phone : ''
    const normalizedName = normalizeName(name)
    const normalizedPhone = normalizePhone(phoneInput)
    if (normalizedName.length < 3 || normalizedName.length > 160 || normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return response(401, { error: 'Datos no válidos' }, corsHeaders)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return response(500, { error: 'Function environment is incomplete' }, corsHeaders)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const sourceIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
    const ipKeyHash = await rateLimitHash(serviceKey, 'ip', sourceIp.trim())
    const { data: ipAllowed, error: ipLimitError } = await admin.rpc('consume_student_login_attempt_v2', {
      p_key_hash: ipKeyHash,
      p_max_attempts: 180,
      p_window_seconds: 900,
    })
    if (ipLimitError) {
      console.error('IP throttling failed:', ipLimitError.message)
      return response(500, { error: 'No se pudo validar el acceso' }, corsHeaders)
    }
    if (!ipAllowed) return response(429, { error: 'Demasiados intentos desde esta conexión. Espera 15 minutos e intenta de nuevo.' }, corsHeaders)

    const { data: students, error: rosterError } = await admin
      .from('estudiantes')
      .select('id,nombre,grado,telefono,plan_id')
      .in('plan_id', [1, 2])
      .limit(1000)
    if (rosterError) {
      console.error('Roster lookup failed:', rosterError.message)
      return response(500, { error: 'No se pudo validar el acceso' }, corsHeaders)
    }

    const nameMatches = (students || []).filter((student) => normalizeName(student.nombre || '') === normalizedName)
    if (nameMatches.length) {
      const nameKeyHash = await rateLimitHash(serviceKey, 'name', normalizedName)
      const { data: nameAllowed, error: nameLimitError } = await admin.rpc('consume_student_login_attempt_v2', {
        p_key_hash: nameKeyHash,
        p_max_attempts: 8,
        p_window_seconds: 900,
      })
      if (nameLimitError) {
        console.error('Name throttling failed:', nameLimitError.message)
        return response(500, { error: 'No se pudo validar el acceso' }, corsHeaders)
      }
      if (!nameAllowed) return response(429, { error: 'Demasiados intentos para este estudiante. Espera 15 minutos e intenta de nuevo.' }, corsHeaders)
    }

    const matches = nameMatches.filter((student) => normalizePhone(String(student.telefono || '')) === normalizedPhone)
    if (matches.length !== 1) return response(401, { error: 'Datos no válidos' }, corsHeaders)

    /* The IP and existing-name throttles run before account provisioning or Auth calls. */

    const student = matches[0]
    const syntheticEmail = `portal-student-${student.id}@sisa.invalid`
    let { data: account, error: accountLookupError } = await admin
      .from('student_portal_accounts')
      .select('auth_user_id')
      .eq('student_id', student.id)
      .maybeSingle()
    if (accountLookupError) {
      console.error('Account lookup failed:', accountLookupError.message)
      return response(500, { error: 'No se pudo preparar el acceso' }, corsHeaders)
    }

    if (!account) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        password: normalizedPhone,
        email_confirm: true,
        user_metadata: { portal_role: 'student' },
      })
      let authUserId = created?.user?.id
      if (createError || !authUserId) {
        // A prior concurrent request may have created the same synthetic Auth user.
        const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = !listError ? listed.users.find((user) => user.email === syntheticEmail) : undefined
        if (!existing) {
          console.error('Auth user creation failed:', createError?.message, listError?.message)
          return response(500, { error: 'No se pudo preparar el acceso' }, corsHeaders)
        }
        authUserId = existing.id
      }

      const { error: mappingError } = await admin.from('student_portal_accounts').upsert({
        auth_user_id: authUserId,
        student_id: student.id,
      }, { onConflict: 'student_id' })
      if (mappingError) {
        console.error('Account mapping failed:', mappingError.message)
        return response(500, { error: 'No se pudo preparar el acceso' }, corsHeaders)
      }
      account = { auth_user_id: authUserId }
    } else {
      // Keep the Auth password aligned if an editor updates the registered phone.
      const { error: passwordError } = await admin.auth.admin.updateUserById(account.auth_user_id, { password: normalizedPhone })
      if (passwordError) {
        console.error('Auth password sync failed:', passwordError.message)
        return response(500, { error: 'No se pudo validar el acceso' }, corsHeaders)
      }
    }

    return response(200, { email: syntheticEmail }, corsHeaders)
  } catch (error) {
    console.error('Student login error:', error)
    const origin = request.headers.get('origin') || ''
    return response(400, { error: 'Solicitud no válida' }, corsHeadersFor(origin))
  }
})
