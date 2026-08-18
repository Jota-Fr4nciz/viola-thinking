/* ==========================================================
   Configuração do projeto Supabase
   ----------------------------------------------------------
   Preencha com os dados do seu projeto em:
   Supabase Dashboard → Project Settings → API

   ATENÇÃO: a "anon key" é pública por design (protegida pelo RLS).
   NUNCA coloque aqui a "service_role key" — essa fica só no backend (.env).
   ========================================================== */
window.VIOLA_CONFIG = {
    SUPABASE_URL: 'https://nxqloahztwuuuxphxvep.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_zU6h1Rax3ME_3UOb0E4tug_Sk1hveFD',

    // Backend Express opcional, usado apenas pelo painel do professor
    // (operações que exigem Service Role, fora do alcance do RLS).
    API_BASE: '/api',
};
