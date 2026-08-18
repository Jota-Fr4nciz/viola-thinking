// db/supabaseAdmin.js — Cliente Supabase com a Service Role Key.
// NUNCA exponha esta chave no frontend: ela ignora o Row Level Security.
// Use este cliente apenas para operações de servidor que precisam enxergar
// dados de mais de um usuário (ex.: o professor consultando vários alunos).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Viola Thinking] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados no .env');
}

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = supabaseAdmin;
