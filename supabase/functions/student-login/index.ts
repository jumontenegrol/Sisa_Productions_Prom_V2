import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function normalizeName(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

async function rateLimitHash(serviceKey: string, normalizedName: string) {
  const bytes = new TextEncoder().encode(`${serviceKey}:${normalizedName}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' })

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name : ''
    const phoneInput = typeof body.phone === 'string' ? body.phone : ''
    const normalizedName = normalizeName(name)
    const normalizedPhone = normalizePhone(phoneInput)
    if (normalizedName.length < 3 || normalizedName.length > 160 || normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return response(401, { error: 'Datos no válidos' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return response(500, { error: 'Function environment is incomplete' })

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const keyHash = await rateLimitHash(serviceKey, normalizedName)
    const { data: allowed, error: limitError } = await admin.rpc('consume_student_login_attempt', { p_key_hash: keyHash })
    if (limitError) {
      console.error('Login throttling failed:', limitError.message)
      return response(500, { error: 'No se pudo validar el acceso' })
    }
    if (!allowed) return response(429, { error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' })

    const { data: students, error: rosterError } = await admin
      .from('estudiantes')
      .select('id,nombre,grado,telefono,plan_id')
      .in('plan_id', [1, 2])
      .limit(1000)
    if (rosterError) {
      console.error('Roster lookup failed:', rosterError.message)
      return response(500, { error: 'No se pudo validar el acceso' })
    }

    const matches = (students || []).filter((student) =>
      normalizeName(student.nombre || '') === normalizedName &&
      normalizePhone(String(student.telefono || '')) === normalizedPhone,
    )
    if (matches.length !== 1) return response(401, { error: 'Datos no válidos' })

    const student = matches[0]
    const syntheticEmail = `portal-student-${student.id}@sisa.invalid`
    let { data: account, error: accountLookupError } = await admin
      .from('student_portal_accounts')
      .select('auth_user_id')
      .eq('student_id', student.id)
      .maybeSingle()
    if (accountLookupError) {
      console.error('Account lookup failed:', accountLookupError.message)
      return response(500, { error: 'No se pudo preparar el acceso' })
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
          return response(500, { error: 'No se pudo preparar el acceso' })
        }
        authUserId = existing.id
      }

      const { error: mappingError } = await admin.from('student_portal_accounts').upsert({
        auth_user_id: authUserId,
        student_id: student.id,
      }, { onConflict: 'student_id' })
      if (mappingError) {
        console.error('Account mapping failed:', mappingError.message)
        return response(500, { error: 'No se pudo preparar el acceso' })
      }
      account = { auth_user_id: authUserId }
    } else {
      // Keep the Auth password aligned if an editor updates the registered phone.
      const { error: passwordError } = await admin.auth.admin.updateUserById(account.auth_user_id, { password: normalizedPhone })
      if (passwordError) {
        console.error('Auth password sync failed:', passwordError.message)
        return response(500, { error: 'No se pudo validar el acceso' })
      }
    }

    return response(200, { email: syntheticEmail })
  } catch (error) {
    console.error('Student login error:', error)
    return response(400, { error: 'Solicitud no válida' })
  }
})
