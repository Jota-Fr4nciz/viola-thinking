// server.js — Servidor de Integração da Viola Thinking (compatível com Supabase)
//
// Este servidor NÃO cuida mais de login/senha nem de CRUD simples: isso é
// feito diretamente pelo frontend via supabase-js + Row Level Security.
// Ele existe para as operações que precisam da Service Role Key (bypass de
// RLS), como o painel agregado do professor, e para o upload de vídeo-aulas
// ao canal do YouTube do projeto (requer credenciais OAuth — ver README).
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const professorRoutes = require('./routes/professor');
const youtubeRoutes = require('./routes/youtube');

const app = express();

app.use(cors());
app.use(express.json());

// Serve o frontend estático (login, dashboards, contato, história)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ------------------------------------------------------------
// Rotas da API
// ------------------------------------------------------------
app.use('/api/professor', professorRoutes);
app.use('/api/youtube', youtubeRoutes);

app.get('/api/status', (req, res) => {
    res.json({ sucesso: true, mensagem: 'Servidor da Viola Thinking orquestrado e afinado com Supabase. 🎻' });
});

// 404 para rotas de API não encontradas
app.use('/api', (req, res) => {
    res.status(404).json({ sucesso: false, mensagem: 'Endpoint não encontrado.' });
});

// Handler de erro genérico
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ sucesso: false, mensagem: 'Erro interno inesperado no servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🎻 Servidor da Viola Thinking orquestrado na porta ${PORT}!`);
});
