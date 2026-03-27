// ─── Supabase Client ────────────────────────────────────────────
// Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY con los valores
// de tu proyecto en: supabase.com → Settings → API
// ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://cmoaqbhhprjbtimihway.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtb2FxYmhocHJqYnRpbWlod2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTY3NDYsImV4cCI6MjA5MDE5Mjc0Nn0.LpJ9MlfpF4eK5idwu-ULbOhVIXegQax02mEOh-DoDPU';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
