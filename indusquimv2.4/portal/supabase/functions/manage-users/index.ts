import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Sin autorización')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) throw new Error('Token inválido')

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'commercial')) {
      throw new Error('No autorizado')
    }

    const isAdmin      = callerProfile.role === 'admin'
    const isCommercial = callerProfile.role === 'commercial'

    const body = await req.json()
    const { action } = body

    // ── Crear usuario ────────────────────────────────────────────
    if (action === 'create') {
      if (!isAdmin) throw new Error('No autorizado')
      const { email, password, full_name, company_name, client_type } = body

      if (!email || !email.trim()) throw new Error('El correo es obligatorio')

      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { full_name, company_name }
      })
      if (authErr) throw authErr

      const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id,
        full_name,
        company_name,
        email: email.trim(),
        role: 'client',
        client_type
      })
      if (profileErr) throw profileErr

      return new Response(JSON.stringify({ user: authData.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ── Eliminar usuario ─────────────────────────────────────────
    if (action === 'delete') {
      if (!isAdmin) throw new Error('No autorizado')
      const { userId } = body

      // La limpieza de datos relacionados la hace el RPC delete_user_safe en el frontend
      // Aquí solo eliminamos el usuario de auth
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ── Solicitar código de cierre (comercial) ───────────────────
    if (action === 'request_pqr_close') {
      const { pqrId } = body
      if (!pqrId) throw new Error('pqrId requerido')

      const { data: pqr } = await supabaseAdmin.from('pqrs')
        .select('id, status, commercial_id')
        .eq('id', pqrId)
        .single()

      if (!pqr) throw new Error('PQRS no encontrada')
      if (pqr.status !== 'pending') throw new Error('Esta PQRS ya está cerrada')
      if (isCommercial && pqr.commercial_id !== user.id) throw new Error('No tienes acceso a esta PQRS')

      const { error } = await supabaseAdmin.from('pqrs')
        .update({ close_requested: true })
        .eq('id', pqrId)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ── Generar código de autorización (solo admin) ──────────────
    if (action === 'generate_close_code') {
      if (!isAdmin) throw new Error('Solo el administrador puede generar códigos de cierre')
      const { pqrId } = body
      if (!pqrId) throw new Error('pqrId requerido')

      const { data: pqr } = await supabaseAdmin.from('pqrs')
        .select('id, status')
        .eq('id', pqrId)
        .single()

      if (!pqr) throw new Error('PQRS no encontrada')
      if (pqr.status !== 'pending') throw new Error('Esta PQRS ya está cerrada')

      const code      = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // válido 1 hora

      const { error } = await supabaseAdmin.from('pqrs')
        .update({ close_code: code, close_code_expires_at: expiresAt })
        .eq('id', pqrId)
      if (error) throw error

      return new Response(JSON.stringify({ code, expires_at: expiresAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ── Cerrar con código (comercial) ────────────────────────────
    if (action === 'close_pqr_with_code') {
      const { pqrId, code, supportPath } = body
      if (!pqrId || !code) throw new Error('pqrId y code son requeridos')

      const { data: pqr } = await supabaseAdmin.from('pqrs')
        .select('id, status, commercial_id, close_code, close_code_expires_at')
        .eq('id', pqrId)
        .single()

      if (!pqr) throw new Error('PQRS no encontrada')
      if (pqr.status !== 'pending') throw new Error('Esta PQRS ya está cerrada')
      if (isCommercial && pqr.commercial_id !== user.id) throw new Error('No tienes acceso a esta PQRS')
      if (!pqr.close_code) throw new Error('No hay código de autorización. Solicita uno al administrador.')
      if (pqr.close_code !== code.trim()) throw new Error('Código incorrecto. Verifica e intenta de nuevo.')
      if (pqr.close_code_expires_at && new Date(pqr.close_code_expires_at) < new Date()) {
        throw new Error('El código ha expirado. Solicita un nuevo código al administrador.')
      }
      if (!supportPath) throw new Error('Debes adjuntar el soporte de la gestión.')

      const { error } = await supabaseAdmin.from('pqrs').update({
        status:                 'closed',
        support_path:           supportPath,
        closed_at:              new Date().toISOString(),
        closed_by:              user.id,
        close_code:             null,
        close_code_expires_at:  null,
        close_requested:        false
      }).eq('id', pqrId)
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Acción desconocida')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
