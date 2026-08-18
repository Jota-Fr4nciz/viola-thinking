// scripts/autorizar-youtube.js — Rode UMA VEZ para autorizar o canal do
// YouTube do projeto e obter o refresh token que vai para o .env.
//
// Uso:
//   1. Preencha YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET e
//      YOUTUBE_REDIRECT_URI no backend/.env (ver README).
//   2. Rode: npm run autorizar-youtube
//   3. Abra a URL impressa no terminal, logado com a conta Google DONA
//      do canal do projeto, e aceite as permissões.
//   4. O navegador será redirecionado de volta para este script, que vai
//      imprimir o YOUTUBE_REFRESH_TOKEN — copie-o para o .env.
require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { criarClienteOAuth } = require('../services/youtube');

const ESCOPO = ['https://www.googleapis.com/auth/youtube.upload'];

function validarConfiguracao() {
    const faltando = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REDIRECT_URI'].filter(
        (chave) => !process.env[chave]
    );
    if (faltando.length) {
        console.error(`\n❌ Faltam variáveis no .env: ${faltando.join(', ')}`);
        console.error('Preencha o backend/.env antes de rodar este script (veja o README).\n');
        process.exit(1);
    }
}

async function main() {
    validarConfiguracao();

    const oauth2Client = criarClienteOAuth();
    const urlAutorizacao = oauth2Client.generateAuthUrl({
        access_type: 'offline', // necessário para vir o refresh_token
        prompt: 'consent', // força reemissão do refresh_token mesmo se já autorizou antes
        scope: ESCOPO,
    });

    const redirectUrl = new URL(process.env.YOUTUBE_REDIRECT_URI);
    const porta = Number(redirectUrl.port) || 3000;

    const servidor = http.createServer(async (req, res) => {
        try {
            const urlRecebida = new URL(req.url, `http://localhost:${porta}`);
            if (urlRecebida.pathname !== redirectUrl.pathname) {
                res.writeHead(404); res.end(); return;
            }

            const code = urlRecebida.searchParams.get('code');
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>Faltou o parâmetro "code" na resposta do Google.</h1>');
                return;
            }

            const { tokens } = await oauth2Client.getToken(code);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Autorizado! ✅</h1><p>Pode fechar esta aba e voltar ao terminal.</p>');

            console.log('\n✅ Autorização concluída!\n');
            if (tokens.refresh_token) {
                console.log('Copie a linha abaixo para o seu backend/.env:\n');
                console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
            } else {
                console.log(
                    '⚠️  O Google não devolveu um refresh_token desta vez (geralmente porque este app já\n' +
                    'havia sido autorizado antes). Revogue o acesso em https://myaccount.google.com/permissions\n' +
                    'e rode este script de novo.'
                );
            }
            servidor.close();
            process.exit(0);
        } catch (erro) {
            console.error('Erro ao trocar o código por tokens:', erro.message);
            res.writeHead(500); res.end('Erro — veja o terminal.');
            servidor.close();
            process.exit(1);
        }
    });

    servidor.listen(porta, () => {
        console.log(`\nServidor local de autorização ouvindo em ${process.env.YOUTUBE_REDIRECT_URI}`);
        console.log('\n1) Abra esta URL no navegador (logado com a conta DONA do canal do projeto):\n');
        console.log(urlAutorizacao);
        console.log('\n2) Aceite as permissões e aguarde o redirecionamento de volta.\n');
    });
}

main();
