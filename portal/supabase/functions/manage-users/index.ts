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
    // Cliente admin con service_role (solo disponible server-side)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verificar que quien llama es un admin válido
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

    if (!callerProfile || callerProfile.role !== 'admin') {
      throw new Error('No autorizado')
    }

    const body = await req.json()
    const { action } = body

    // ── Crear usuario ────────────────────────────────────────────
    if (action === 'create') {
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
      const { userId } = body

      // Limpiar todas las tablas relacionadas antes de borrar el usuario de auth
      await supabaseAdmin.from('notifications').delete().eq('user_id', userId)
      await supabaseAdmin.from('audit_log').delete().eq('user_id', userId)
      await supabaseAdmin.from('client_catalog').delete().eq('client_id', userId)
      await supabaseAdmin.from('pqrs').delete().eq('user_id', userId)
      await supabaseAdmin.from('documents').delete().eq('client_id', userId)
      await supabaseAdmin.from('videos').delete().eq('client_id', userId)

      // Órdenes: limpiar items y status_log antes de borrar las órdenes
      const { data: clientOrders } = await supabaseAdmin.from('orders').select('id').eq('client_id', userId)
      const { data: commOrders }   = await supabaseAdmin.from('orders').select('id').eq('commercial_id', userId)
      const allOrderIds = [
        ...((clientOrders || []).map((o: any) => o.id)),
        ...((commOrders   || []).map((o: any) => o.id))
      ]
      if (allOrderIds.length > 0) {
        await supabaseAdmin.from('order_items').delete().in('order_id', allOrderIds)
        await supabaseAdmin.from('order_status_log').delete().in('order_id', allOrderIds)
      }
      await supabaseAdmin.from('order_status_log').delete().eq('changed_by', userId)
      await supabaseAdmin.from('orders').delete().eq('client_id', userId)
      await supabaseAdmin.from('orders').delete().eq('commercial_id', userId)
      await supabaseAdmin.from('profiles').delete().eq('id', userId)

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
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
