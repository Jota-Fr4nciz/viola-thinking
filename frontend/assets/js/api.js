/* ==========================================================
   VIOLA THINKING — Camada de acesso a dados
   ----------------------------------------------------------
   HTML/JS puro: nenhuma biblioteca externa é carregada. Toda
   comunicação com o Supabase é feita com `fetch()` nativo,
   direto contra a API REST (PostgREST) e a API de Auth (GoTrue)
   do projeto. A segurança continua garantida pelo Row Level
   Security configurado em supabase-schema.sql.
   ========================================================== */

const URL_BASE = window.VIOLA_CONFIG.SUPABASE_URL;
const ANON_KEY = window.VIOLA_CONFIG.SUPABASE_ANON_KEY;
const AUTH_URL = `${URL_BASE}/auth/v1`;
const REST_URL = `${URL_BASE}/rest/v1`;
const CHAVE_SESSAO = 'viola_sessao';

/** Traduz as mensagens mais comuns da API de Auth do Supabase para português. */
function traduzErroSupabase(mensagem) {
    const mapa = {
        'Invalid login credentials': 'E-mail ou senha incorretos.',
        'User already registered': 'Este e-mail já está cadastrado.',
        'Email not confirmed': 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).',
        'Password should be at least 6 characters': 'A senha precisa de ao menos 6 caracteres.',
    };
    return mapa[mensagem] || mensagem;
}

/** POST genérico para a API de Auth (GoTrue), sempre com a anon key. */
async function chamarAuth(caminho, corpo) {
    const resposta = await fetch(`${AUTH_URL}${caminho}`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        throw new Error(traduzErroSupabase(dados.error_description || dados.msg || dados.message || 'Erro de autenticação.'));
    }
    return dados;
}

/**
 * Chamada genérica para a API REST (PostgREST). `caminho` já deve incluir a
 * query string (ex.: "/alunos?id=eq.123&select=nome"). Sem `sessao`, usa a
 * anon key (respeitando o RLS de acesso público, como o insert de contato).
 */
async function chamarRest(caminho, { metodo = 'GET', corpo = null, sessao = null, cabecalhosExtras = {} } = {}) {
    const token = sessao ? sessao.access_token : ANON_KEY;
    const resposta = await fetch(`${REST_URL}${caminho}`, {
        method: metodo,
        headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...cabecalhosExtras,
        },
        body: corpo ? JSON.stringify(corpo) : null,
    });

    if (metodo === 'HEAD') {
        if (!resposta.ok) throw new Error('Erro ao consultar o banco de dados.');
        return resposta; // quem chamou lê o cabeçalho content-range
    }

    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (!resposta.ok) {
        throw new Error(dados?.message || dados?.hint || 'Erro ao consultar o banco de dados.');
    }
    return dados;
}

const ViolaSessao = {
    /** Normaliza e persiste a sessão devolvida pelo GoTrue (login, signup ou refresh). */
    salvar(sessaoBruta) {
        const registro = {
            access_token: sessaoBruta.access_token,
            refresh_token: sessaoBruta.refresh_token,
            expires_at: sessaoBruta.expires_at || Math.floor(Date.now() / 1000) + (sessaoBruta.expires_in || 3600),
            user: sessaoBruta.user,
        };
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify(registro));
        return registro;
    },

    ler() {
        const bruto = localStorage.getItem(CHAVE_SESSAO);
        return bruto ? JSON.parse(bruto) : null;
    },

    limpar() {
        localStorage.removeItem(CHAVE_SESSAO);
    },

    /** Devolve uma sessão válida, renovando o access_token se estiver perto de expirar. */
    async obterSessaoValida() {
        const sessao = this.ler();
        if (!sessao) return null;

        const agora = Math.floor(Date.now() / 1000);
        if (sessao.expires_at - agora > 30) return sessao; // ainda válida por > 30s

        try {
            const dados = await chamarAuth('/token?grant_type=refresh_token', { refresh_token: sessao.refresh_token });
            return this.salvar(dados);
        } catch {
            this.limpar();
            return null;
        }
    },

    /** Garante sessão válida do tipo esperado; redireciona ao login caso contrário. */
    async exigir(tipoEsperado) {
        const sessao = await this.obterSessaoValida();
        if (!sessao) {
            window.location.href = tipoEsperado === 'professor' ? 'login-professor.html' : 'login-aluno.html';
            return null;
        }

        if (tipoEsperado === 'professor') {
            const linhas = await chamarRest(`/professores?id=eq.${sessao.user.id}&select=id`, { sessao }).catch(() => []);
            if (!linhas || !linhas.length) {
                window.location.href = 'login-professor.html';
                return null;
            }
        }
        return sessao;
    },

    async sair() {
        const sessao = this.ler();
        if (sessao) {
            await fetch(`${AUTH_URL}/logout`, {
                method: 'POST',
                headers: { apikey: ANON_KEY, Authorization: `Bearer ${sessao.access_token}` },
            }).catch(() => {});
        }
        this.limpar();
    },
};

const ViolaAPI = {
    // ---------------------------------------------------------
    // Autenticação (API de Auth do Supabase, via fetch puro)
    // ---------------------------------------------------------
    async registrarAluno({ nome, email, senha, nivel, instrumento }) {
        const dados = await chamarAuth('/signup', {
            email,
            password: senha,
            data: { tipo: 'aluno', nome, nivel, instrumento },
        });
        if (dados.access_token) ViolaSessao.salvar(dados);
        return dados; // access_token presente = sessão já ativa; ausente = aguardando confirmação de e-mail
    },

    async registrarProfessor({ nome, email, senha, especialidade, bio, portfolio_url }) {
        const dados = await chamarAuth('/signup', {
            email,
            password: senha,
            data: { tipo: 'professor', nome, especialidade, bio, portfolio_url },
        });
        if (dados.access_token) ViolaSessao.salvar(dados);
        return dados;
    },

    async login(email, senha) {
        const dados = await chamarAuth('/token?grant_type=password', { email, password: senha });
        ViolaSessao.salvar(dados);
        return dados;
    },

    // ---------------------------------------------------------
    // Catálogo de módulos (público) — usado nos selects de cadastro/postagem
    // ---------------------------------------------------------
    async listarModulos() {
        return chamarRest('/modulos?select=id,instrumento,nivel,titulo,descricao,icone,ordem&order=ordem.asc');
    },

    // ---------------------------------------------------------
    // Portal do Aluno — só os módulos em que o aluno está matriculado
    // ---------------------------------------------------------
    async dashboardAluno() {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');
        const alunoId = sessao.user.id;

        const alunos = await chamarRest(
            `/alunos?id=eq.${alunoId}&select=id,nome,email,nivel,instrumento,avatar_url`,
            { sessao }
        );
        const aluno = alunos[0];
        if (!aluno) throw new Error('Perfil de aluno não encontrado.');

        // Só traz os módulos em que o aluno está matriculado (aluno_modulos),
        // já com o progresso e a contagem de aulas de cada um.
        const matriculas = await chamarRest(
            `/aluno_modulos?aluno_id=eq.${alunoId}&select=modulo_id,modulos(id,instrumento,nivel,titulo,descricao,icone,ordem)`,
            { sessao }
        );

        const progressos = await chamarRest(
            `/progresso_aluno?aluno_id=eq.${alunoId}&select=modulo_id,percentual_concluido`,
            { sessao }
        );

        const modulos = matriculas
            .filter((m) => m.modulos)
            .map((m) => ({
                id: m.modulos.id,
                titulo: m.modulos.titulo,
                descricao: m.modulos.descricao,
                icone: m.modulos.icone,
                instrumento: m.modulos.instrumento,
                nivel: m.modulos.nivel,
                percentual_concluido: progressos.find((p) => p.modulo_id === m.modulos.id)?.percentual_concluido ?? 0,
            }))
            .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

        return { aluno, modulos };
    },

    /** Lista as aulas postadas em um módulo, com o status de conclusão do aluno logado. */
    async aulasDoModulo(moduloId) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const vinculos = await chamarRest(
            `/aula_modulos?modulo_id=eq.${moduloId}&select=ordem,aulas(id,titulo,descricao,conteudo,video_url,material_url,duracao_min,publicada_em)&order=ordem.asc`,
            { sessao }
        );

        const concluidas = await chamarRest(
            `/aula_concluida?aluno_id=eq.${sessao.user.id}&select=aula_id`,
            { sessao }
        );
        const idsConcluidas = new Set(concluidas.map((c) => c.aula_id));

        return vinculos
            .filter((v) => v.aulas)
            .map((v) => ({ ...v.aulas, concluida: idsConcluidas.has(v.aulas.id) }));
    },

    /** Marca (ou desmarca) uma aula como concluída e recalcula o progresso do módulo. */
    async alternarConclusaoAula(aulaId, moduloId, concluida) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');
        const alunoId = sessao.user.id;

        if (concluida) {
            await chamarRest('/aula_concluida', {
                metodo: 'POST',
                sessao,
                corpo: { aluno_id: alunoId, aula_id: aulaId },
                cabecalhosExtras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            });
        } else {
            await chamarRest(`/aula_concluida?aluno_id=eq.${alunoId}&aula_id=eq.${aulaId}`, {
                metodo: 'DELETE',
                sessao,
                cabecalhosExtras: { Prefer: 'return=minimal' },
            });
        }

        // Recalcula o percentual do módulo com base em aulas concluídas / total.
        const totalVinculos = await chamarRest(`/aula_modulos?modulo_id=eq.${moduloId}&select=aula_id`, { sessao });
        const idsAulasDoModulo = totalVinculos.map((v) => v.aula_id);

        let concluidasNoModulo = 0;
        if (idsAulasDoModulo.length) {
            const concluidas = await chamarRest(
                `/aula_concluida?aluno_id=eq.${alunoId}&aula_id=in.(${idsAulasDoModulo.join(',')})&select=aula_id`,
                { sessao }
            );
            concluidasNoModulo = concluidas.length;
        }

        const percentual = idsAulasDoModulo.length
            ? Math.round((concluidasNoModulo / idsAulasDoModulo.length) * 100)
            : 0;

        await chamarRest('/progresso_aluno', {
            metodo: 'POST',
            sessao,
            corpo: {
                aluno_id: alunoId,
                modulo_id: moduloId,
                percentual_concluido: percentual,
                ultima_atualizacao: new Date().toISOString(),
            },
            cabecalhosExtras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });

        return percentual;
    },

    // ---------------------------------------------------------
    // Fale Conosco — insert público (RLS permite insert para qualquer um)
    // ---------------------------------------------------------
    async enviarContato({ nome, email, whatsapp, nivel, mensagem }) {
        await chamarRest('/mensagens_contato', {
            metodo: 'POST',
            corpo: {
                nome_completo: nome,
                email,
                whatsapp: whatsapp || null,
                nivel_atual: nivel || null,
                mensagem,
            },
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
        return { mensagem: 'Sua mensagem foi entregue aos nossos mestres! Em breve entraremos em contato.' };
    },

    // ---------------------------------------------------------
    // Portal do Professor — leitura direta, protegida por RLS
    // ---------------------------------------------------------
    async dashboardProfessor() {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');
        const professorId = sessao.user.id;

        const professores = await chamarRest(
            `/professores?id=eq.${professorId}&select=id,nome,email,especialidade,bio,portfolio_url`,
            { sessao }
        );
        const professor = professores[0];
        if (!professor) throw new Error('Perfil de professor não encontrado.');

        const modulos = await chamarRest('/modulos?select=id,instrumento,nivel,titulo&order=ordem.asc', { sessao });
        const matriculas = await chamarRest('/aluno_modulos?select=modulo_id,aluno_id', { sessao });
        const vinculosAula = await chamarRest('/aula_modulos?select=modulo_id,aula_id', { sessao });

        const modulosResumo = modulos.map((m) => ({
            id: m.id,
            titulo: m.titulo,
            instrumento: m.instrumento,
            nivel: m.nivel,
            total_alunos: matriculas.filter((x) => x.modulo_id === m.id).length,
            total_aulas: new Set(vinculosAula.filter((x) => x.modulo_id === m.id).map((x) => x.aula_id)).size,
        }));

        const alunosBrutos = await chamarRest(
            '/alunos?select=id,nome,nivel,instrumento,progresso_aluno(percentual_concluido)',
            { sessao }
        );
        const alunos = alunosBrutos
            .map((a) => {
                const percentuais = (a.progresso_aluno || []).map((p) => p.percentual_concluido);
                const media = percentuais.length
                    ? Math.round(percentuais.reduce((soma, p) => soma + p, 0) / percentuais.length)
                    : 0;
                return { id: a.id, nome: a.nome, nivel: a.nivel, instrumento: a.instrumento, progresso_medio: media };
            })
            .sort((a, b) => b.progresso_medio - a.progresso_medio);

        const respostaLeads = await fetch(`${REST_URL}/mensagens_contato?respondida=eq.false&select=id`, {
            method: 'HEAD',
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${sessao.access_token}`, Prefer: 'count=exact' },
        });
        const faixa = respostaLeads.headers.get('content-range'); // ex.: "0-0/12"
        const leadsPendentes = faixa ? Number(faixa.split('/')[1] || 0) : 0;

        return { professor, modulos: modulosResumo, alunos, leadsPendentes };
    },

    // ---------------------------------------------------------
    // Gestão de aulas (aba "Aulas" do professor) — listar, criar,
    // editar, reordenar, vincular a outros módulos e excluir.
    // ---------------------------------------------------------

    /** Lista as aulas de um módulo, na ordem definida, para o professor gerenciar. */
    async aulasDoModuloProfessor(moduloId) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const vinculos = await chamarRest(
            `/aula_modulos?modulo_id=eq.${moduloId}&select=ordem,aulas(id,titulo,descricao,conteudo,video_url,material_url,duracao_min,publicada_em)&order=ordem.asc`,
            { sessao }
        );
        return vinculos.filter((v) => v.aulas).map((v) => ({ ...v.aulas, ordem: v.ordem }));
    },

    /** Cria uma aula nova já vinculada a um único módulo (o selecionado na aba Aulas). */
    async criarAulaNoModulo(moduloId, { titulo, descricao, conteudo, video_url, material_url, duracao_min }) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const vinculosAtuais = await chamarRest(`/aula_modulos?modulo_id=eq.${moduloId}&select=ordem`, { sessao });
        const proximaOrdem = vinculosAtuais.length ? Math.max(...vinculosAtuais.map((v) => v.ordem)) + 1 : 0;

        const aulasCriadas = await chamarRest('/aulas', {
            metodo: 'POST',
            sessao,
            corpo: {
                professor_id: sessao.user.id,
                titulo,
                descricao: descricao || null,
                conteudo: conteudo || null,
                video_url: video_url || null,
                material_url: material_url || null,
                duracao_min: duracao_min || 15,
            },
            cabecalhosExtras: { Prefer: 'return=representation' },
        });
        const aula = aulasCriadas[0];

        await chamarRest('/aula_modulos', {
            metodo: 'POST',
            sessao,
            corpo: { aula_id: aula.id, modulo_id: moduloId, ordem: proximaOrdem },
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });

        return aula;
    },

    /** Atualiza os campos de uma aula já existente. */
    async atualizarAula(aulaId, { titulo, descricao, conteudo, video_url, material_url, duracao_min }) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        await chamarRest(`/aulas?id=eq.${aulaId}`, {
            metodo: 'PATCH',
            sessao,
            corpo: {
                titulo,
                descricao: descricao || null,
                conteudo: conteudo || null,
                video_url: video_url || null,
                material_url: material_url || null,
                duracao_min: duracao_min || 15,
            },
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
    },

    /** Devolve os ids dos módulos em que a aula está publicada hoje. */
    async modulosDaAula(aulaId) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const vinculos = await chamarRest(`/aula_modulos?aula_id=eq.${aulaId}&select=modulo_id`, { sessao });
        return vinculos.map((v) => v.modulo_id);
    },

    /** Ajusta em quais módulos a aula aparece (adiciona/remove vínculos conforme a nova lista). */
    async definirModulosDaAula(aulaId, moduloIdsDesejados) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');
        if (!moduloIdsDesejados.length) throw new Error('A aula precisa ficar em pelo menos um módulo.');

        const atuais = await this.modulosDaAula(aulaId);
        const paraAdicionar = moduloIdsDesejados.filter((id) => !atuais.includes(id));
        const paraRemover = atuais.filter((id) => !moduloIdsDesejados.includes(id));

        if (paraRemover.length) {
            await chamarRest(`/aula_modulos?aula_id=eq.${aulaId}&modulo_id=in.(${paraRemover.join(',')})`, {
                metodo: 'DELETE',
                sessao,
                cabecalhosExtras: { Prefer: 'return=minimal' },
            });
        }

        for (const moduloId of paraAdicionar) {
            const vinculosAtuais = await chamarRest(`/aula_modulos?modulo_id=eq.${moduloId}&select=ordem`, { sessao });
            const proximaOrdem = vinculosAtuais.length ? Math.max(...vinculosAtuais.map((v) => v.ordem)) + 1 : 0;
            await chamarRest('/aula_modulos', {
                metodo: 'POST',
                sessao,
                corpo: { aula_id: aulaId, modulo_id: moduloId, ordem: proximaOrdem },
                cabecalhosExtras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            });
        }
    },

    /** Troca a posição de uma aula com a vizinha ('cima' ou 'baixo') dentro do módulo. */
    async moverAulaNoModulo(moduloId, aulaId, direcao) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const vinculos = await chamarRest(
            `/aula_modulos?modulo_id=eq.${moduloId}&select=aula_id,ordem&order=ordem.asc`,
            { sessao }
        );
        const indice = vinculos.findIndex((v) => v.aula_id === Number(aulaId));
        const indiceVizinho = direcao === 'cima' ? indice - 1 : indice + 1;
        if (indice === -1 || indiceVizinho < 0 || indiceVizinho >= vinculos.length) return; // já está na ponta

        const atual = vinculos[indice];
        const vizinho = vinculos[indiceVizinho];

        await chamarRest(`/aula_modulos?aula_id=eq.${atual.aula_id}&modulo_id=eq.${moduloId}`, {
            metodo: 'PATCH',
            sessao,
            corpo: { ordem: vizinho.ordem },
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
        await chamarRest(`/aula_modulos?aula_id=eq.${vizinho.aula_id}&modulo_id=eq.${moduloId}`, {
            metodo: 'PATCH',
            sessao,
            corpo: { ordem: atual.ordem },
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
    },

    /** Remove a aula da vinculação com o módulo atual (não afeta outros módulos em que ela apareça). */
    async removerAulaDoModulo(moduloId, aulaId) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        await chamarRest(`/aula_modulos?aula_id=eq.${aulaId}&modulo_id=eq.${moduloId}`, {
            metodo: 'DELETE',
            sessao,
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
    },

    /** Exclui a aula por completo (remove de todos os módulos em que aparece). */
    async excluirAula(aulaId) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        await chamarRest(`/aulas?id=eq.${aulaId}`, {
            metodo: 'DELETE',
            sessao,
            cabecalhosExtras: { Prefer: 'return=minimal' },
        });
    },

    // ---------------------------------------------------------
    // Upload de vídeo direto para o YouTube (opcional — exige o
    // backend Express configurado com as credenciais do canal;
    // ver backend/routes/youtube.js e o README).
    // ---------------------------------------------------------
    async enviarVideoParaYoutube(arquivo, { titulo, descricao }, aoProgredir) {
        const sessao = await ViolaSessao.obterSessaoValida();
        if (!sessao) throw new Error('Sessão expirada. Faça login novamente.');

        const formData = new FormData();
        formData.append('video', arquivo);
        formData.append('titulo', titulo || arquivo.name);
        formData.append('descricao', descricao || '');

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${window.VIOLA_CONFIG.API_BASE}/youtube/upload`);
            xhr.setRequestHeader('Authorization', `Bearer ${sessao.access_token}`);

            xhr.upload.addEventListener('progress', (evento) => {
                if (evento.lengthComputable && aoProgredir) {
                    aoProgredir(Math.round((evento.loaded / evento.total) * 100));
                }
            });

            xhr.onload = () => {
                let dados = {};
                try { dados = JSON.parse(xhr.responseText); } catch { /* resposta vazia */ }
                if (xhr.status >= 200 && xhr.status < 300) resolve(dados);
                else reject(new Error(dados.mensagem || 'Falha ao enviar o vídeo para o YouTube.'));
            };
            xhr.onerror = () => reject(new Error('Não foi possível conectar ao servidor de upload.'));
            xhr.send(formData);
        });
    },
};

/** Exibe uma mensagem de erro/sucesso em um elemento do DOM por seletor. */
function exibirMensagem(seletor, texto, tipo = 'erro') {
    const el = document.querySelector(seletor);
    if (!el) return;
    el.textContent = texto;
    el.className = tipo === 'erro' ? 'mensagem-erro ativo' : 'mensagem-sucesso ativo';
}

function ocultarMensagens(...seletores) {
    seletores.forEach((s) => {
        const el = document.querySelector(s);
        if (el) el.className = el.className.replace('ativo', '').trim();
    });
}

/** Escapa HTML de texto vindo do usuário antes de injetar via innerHTML. */
function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

/**
 * Se o link for do YouTube (watch, youtu.be ou já /embed/), devolve a URL de
 * embed pronta para um <iframe>. Para qualquer outro link, devolve null —
 * quem chamou deve então renderizar como link normal ("Assistir vídeo").
 */
function extrairEmbedYoutube(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace('www.', '');

        if (host === 'youtu.be') {
            const id = u.pathname.slice(1);
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (u.pathname === '/watch') {
                const id = u.searchParams.get('v');
                return id ? `https://www.youtube.com/embed/${id}` : null;
            }
            if (u.pathname.startsWith('/embed/')) return url;
            if (u.pathname.startsWith('/shorts/')) {
                const id = u.pathname.split('/')[2];
                return id ? `https://www.youtube.com/embed/${id}` : null;
            }
        }
        return null;
    } catch {
        return null;
    }
}
