// routes/youtube.js — Recebe o arquivo de vídeo do professor e o envia ao
// canal do YouTube do projeto. Requer o backend rodando + credenciais
// configuradas (ver backend/services/youtube.js e o README).
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { verificarToken, exigirPapel } = require('../middleware/auth');
const { enviarVideoParaCanal, estaConfigurado } = require('../services/youtube');

const router = express.Router();

// Salva em disco (não em memória) para não estourar RAM com vídeos grandes.
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

router.post('/upload', verificarToken, exigirPapel('professor'), upload.single('video'), async (req, res) => {
    if (!estaConfigurado()) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(501).json({
            sucesso: false,
            mensagem: 'Upload para o YouTube não está configurado neste servidor (ver README).',
        });
    }

    if (!req.file) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nenhum arquivo de vídeo recebido.' });
    }

    try {
        const resultado = await enviarVideoParaCanal(req.file.path, {
            titulo: req.body.titulo,
            descricao: req.body.descricao,
        });
        return res.json({ sucesso: true, ...resultado });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ sucesso: false, mensagem: err.message || 'Falha ao enviar o vídeo para o YouTube.' });
    } finally {
        fs.unlink(req.file.path, () => {}); // sempre limpa o arquivo temporário
    }
});

module.exports = router;
