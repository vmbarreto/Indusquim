-- ============================================================
-- INDUSQUIM — Supabase Setup
-- Ejecuta este script en: supabase.com → SQL Editor → New query
-- ============================================================

-- 1. Tabla de perfiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  company_name TEXT,
  role         TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  client_type  TEXT CHECK (client_type IN ('large', 'small')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de documentos
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('report', 'presentation', 'general_doc')),
  file_path   TEXT NOT NULL,
  client_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de videos
CREATE TABLE IF NOT EXISTS videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  file_path   TEXT NOT NULL,
  client_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos    ENABLE ROW LEVEL SECURITY;

-- Función auxiliar: ¿es admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Función auxiliar: tipo de cliente
CREATE OR REPLACE FUNCTION my_client_type()
RETURNS TEXT AS $$
  SELECT client_type FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- ─── Políticas: profiles ─────────────────────────────────────
-- Admin ve todo
CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL USING (is_admin());

-- Cliente ve solo su propio perfil (SIN client_type)
CREATE POLICY "client_own_profile" ON profiles
  FOR SELECT USING (
    auth.uid() = id AND NOT is_admin()
  );

-- ─── Políticas: documents ────────────────────────────────────
-- Admin ve y gestiona todo
CREATE POLICY "admin_all_documents" ON documents
  FOR ALL USING (is_admin());

-- Cliente grande: solo sus documentos
CREATE POLICY "large_client_documents" ON documents
  FOR SELECT USING (
    NOT is_admin() AND my_client_type() = 'large' AND client_id = auth.uid()
  );

-- Cliente pequeño: solo documentos generales (client_id IS NULL)
CREATE POLICY "small_client_documents" ON documents
  FOR SELECT USING (
    NOT is_admin() AND my_client_type() = 'small' AND client_id IS NULL
  );

-- ─── Políticas: videos ───────────────────────────────────────
CREATE POLICY "admin_all_videos" ON videos
  FOR ALL USING (is_admin());

CREATE POLICY "large_client_videos" ON videos
  FOR SELECT USING (
    NOT is_admin() AND my_client_type() = 'large' AND client_id = auth.uid()
  );

CREATE POLICY "small_client_videos" ON videos
  FOR SELECT USING (
    NOT is_admin() AND my_client_type() = 'small' AND client_id IS NULL
  );

-- ============================================================
-- Storage: crear buckets
-- (También puedes hacerlo desde el dashboard de Supabase)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('client-files',   'client-files',   false),
  ('general-files',  'general-files',  false),
  ('videos',         'videos',         false)
ON CONFLICT DO NOTHING;

-- Políticas de storage: admin puede subir y descargar todo
CREATE POLICY "admin_storage_client_files" ON storage.objects
  FOR ALL USING (bucket_id = 'client-files' AND is_admin());

CREATE POLICY "admin_storage_general_files" ON storage.objects
  FOR ALL USING (bucket_id = 'general-files' AND is_admin());

CREATE POLICY "admin_storage_videos" ON storage.objects
  FOR ALL USING (bucket_id = 'videos' AND is_admin());

-- Clientes grandes descargan sus archivos
CREATE POLICY "large_client_storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-files' AND
    NOT is_admin() AND my_client_type() = 'large' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Clientes pequeños descargan archivos generales
CREATE POLICY "small_client_storage_general" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'general-files' AND
    NOT is_admin() AND my_client_type() = 'small'
  );

-- Clientes descargan videos según su tipo
CREATE POLICY "large_client_videos_storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND
    NOT is_admin() AND my_client_type() = 'large' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "small_client_videos_storage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND
    NOT is_admin() AND my_client_type() = 'small' AND
    (storage.foldername(name))[1] = 'general'
  );

-- ============================================================
-- Crear usuario administrador (ejecutar DESPUÉS del SQL anterior)
-- Reemplaza los valores con los del admin real
-- ============================================================
-- PASO 1: Ve a Authentication → Users → Add user en el dashboard
--         Crea el usuario admin con su email y contraseña
-- PASO 2: Copia el UUID del usuario creado y ejecuta:

-- INSERT INTO profiles (id, full_name, company_name, role)
-- VALUES ('UUID-DEL-ADMIN-AQUI', 'Administrador', 'Indusquim', 'admin');
