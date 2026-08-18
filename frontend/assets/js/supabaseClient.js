/* ==========================================================
   Cliente Supabase — instância única compartilhada pelo frontend
   ========================================================== */
// Requer o script UMD do supabase-js carregado ANTES deste arquivo:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
const supabaseClient = window.supabase.createClient(
    window.VIOLA_CONFIG.SUPABASE_URL,
    window.VIOLA_CONFIG.SUPABASE_ANON_KEY
);
