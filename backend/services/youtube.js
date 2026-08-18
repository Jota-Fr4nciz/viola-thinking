// services/youtube.js — Upload de vídeo-aulas para o canal do YouTube do projeto.
//
// Usa OAuth 2.0 (não uma API key) porque enviar vídeo para um canal exige
// autorização do dono do canal — é a mesma lógica de "logar uma vez e guardar
// o refresh token", como qualquer app que posta em nome de uma conta.
require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');

function criarClienteOAuth() {
    const cliente = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI
    );
    if (process.env.YOUTUBE_REFRESH_TOKEN) {
        cliente.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
    }
    return cliente;
}

function estaConfigurado() {
    return Boolean(
        process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET &&
        process.env.YOUTUBE_REFRESH_TOKEN
    );
}

/**
 * Envia um arquivo de vídeo (salvo em disco pelo multer) para o canal do
 * YouTube configurado, como "Não listado" — acessível só por quem tem o link,
 * exatamente o que a plataforma precisa para os alunos matriculados.
 */
async function enviarVideoParaCanal(caminhoArquivo, { titulo, descricao }) {
    if (!estaConfigurado()) {
        throw new Error(
            'Upload para o YouTube não está configurado neste servidor. Preencha YOUTUBE_CLIENT_ID, ' +
            'YOUTUBE_CLIENT_SECRET e YOUTUBE_REFRESH_TOKEN no .env (veja o README).'
        );
    }

    const auth = criarClienteOAuth();
    const youtube = google.youtube({ version: 'v3', auth });

    const resposta = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
            snippet: {
                title: titulo?.slice(0, 100) || 'Aula Viola Thinking',
                description: descricao || 'Vídeo-aula publicada pela plataforma Viola Thinking.',
                categoryId: '27', // Educação
            },
            status: {
                privacyStatus: 'unlisted', // só quem tem o link acessa — não aparece em buscas
                selfDeclaredMadeForKids: false,
            },
        },
        media: {
            body: fs.createReadStream(caminhoArquivo),
        },
    });

    const videoId = resposta.data.id;
    return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
    };
}

module.exports = { criarClienteOAuth, enviarVideoParaCanal, estaConfigurado };
