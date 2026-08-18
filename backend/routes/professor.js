// routes/professor.js — Endpoints OPCIONAIS do Backstage.
// O frontend já lê tudo isso direto do Supabase (ver frontend/assets/js/api.js);
// esta rota fica só como referência de uso da Service Role Key, caso um dia
// seja necessária uma operação administrativa que cruze dados de todos os
// professores/alunos de uma vez.
const express = require('express');
const supabaseAdmin = require('../db/supabaseAdmin');
const { verificarToken, exigirPapel } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken, exigirPapel('professor'));

// ------------------------------------------------------------
// GET /api/professor/dashboard
// ------------------------------------------------------------
router.get('/dashboard', async (req, res) => {
    const professorId = req.usuario.id;
    try {
        const { data: professor, error: erroPerfil } = await supabaseAdmin
            .from('professores')
            .select('id, nome, email, especialidade, bio, portfolio_url')
            .eq('id', professorId)
            .single();
        if (erroPerfil) throw erroPerfil;

        const { data: modulos, error: erroModulos } = await supabaseAdmin
            .from('modulos')
            .select('id, instrumento, nivel, titulo')
            .order('ordem', { ascending: true });
        if (erroModulos) throw erroModulos;

        const { data: matriculas, error: erroMatriculas } = await supabaseAdmin
            .from('aluno_modulos')
            .select('modulo_id, aluno_id');
        if (erroMatriculas) throw erroMatriculas;

        const { data: vinculosAula, error: erroVinculos } = await supabaseAdmin
            .from('aula_modulos')
            .select('modulo_id, aula_id');
        if (erroVinculos) throw erroVinculos;

        const modulosResumo = modulos.map((m) => ({
            id: m.id,
            titulo: m.titulo,
            instrumento: m.instrumento,
            nivel: m.nivel,
            total_alunos: matriculas.filter((x) => x.modulo_id === m.id).length,
            total_aulas: new Set(vinculosAula.filter((x) => x.modulo_id === m.id).map((x) => x.aula_id)).size,
        }));

        const { data: alunosBrutos, error: erroAlunos } = await supabaseAdmin
            .from('alunos')
            .select('id, nome, nivel, instrumento, progresso_aluno(percentual_concluido)');
        if (erroAlunos) throw erroAlunos;

        const alunos = alunosBrutos
            .map((a) => {
                const percentuais = (a.progresso_aluno || []).map((p) => p.percentual_concluido);
                const media = percentuais.length
                    ? Math.round(percentuais.reduce((soma, p) => soma + p, 0) / percentuais.length)
                    : 0;
                return { id: a.id, nome: a.nome, nivel: a.nivel, instrumento: a.instrumento, progresso_medio: media };
            })
            .sort((a, b) => b.progresso_medio - a.progresso_medio);

        const { count: leadsPendentes, error: erroLeads } = await supabaseAdmin
            .from('mensagens_contato')
            .select('*', { count: 'exact', head: true })
            .eq('respondida', false);
        if (erroLeads) throw erroLeads;

        return res.json({
            sucesso: true,
            professor,
            modulos: modulosResumo,
            alunos,
            leadsPendentes: leadsPendentes ?? 0,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar o painel do professor.' });
    }
});

// ------------------------------------------------------------
// GET /api/professor/mensagens — leads recebidos pela tela "Fale Conosco"
// ------------------------------------------------------------
router.get('/mensagens', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('mensagens_contato')
            .select('*')
            .order('data_envio', { ascending: false })
            .limit(50);
        if (error) throw error;
        return res.json({ sucesso: true, mensagens: data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar mensagens.' });
    }
});

module.exports = router;
