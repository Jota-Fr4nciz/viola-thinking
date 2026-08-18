// middleware/auth.js — Valida o access_token emitido pelo Supabase Auth
// e identifica se quem fala é aluno ou professor.
const supabaseAdmin = require('../db/supabaseAdmin');

async function verificarToken(req, res, next) {
    const cabecalho = req.headers['authorization'];
    const token = cabecalho && cabecalho.split(' ')[1]; // "Bearer <access_token>"

    if (!token) {
        return res.status(401).json({ sucesso: false, mensagem: 'Token de acesso não informado.' });
    }

    // getUser valida o JWT do Supabase Auth e devolve o usuário correspondente.
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(403).json({ sucesso: false, mensagem: 'Token inválido ou expirado. Faça login novamente.' });
    }

    const { data: professor } = await supabaseAdmin
        .from('professores')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

    req.usuario = {
        id: data.user.id,
        email: data.user.email,
        tipo: professor ? 'professor' : 'aluno',
    };
    next();
}

function exigirPapel(papel) {
    return (req, res, next) => {
        if (req.usuario?.tipo !== papel) {
            return res.status(403).json({ sucesso: false, mensagem: `Acesso restrito a ${papel}es.` });
        }
        next();
    };
}

module.exports = { verificarToken, exigirPapel };
