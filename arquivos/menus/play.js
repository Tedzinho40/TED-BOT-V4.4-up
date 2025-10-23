const axios = require("axios");

module.exports = async function playCommand(sock, from, Info, args, prefix, API_KEY_TED) {
    const reply = (texto) => sock.sendMessage(from, { text: texto }, { quoted: Info });

    try {
        const query = args.join(" ");
        if (!query) return reply(`❌ Cadê o nome da música?\nExemplo: ${prefix}play Casa do Seu Zé`);

        const formatarNumero = (num) => {
            if (!num) return "0";
            num = typeof num === "string" ? parseInt(num.replace(/\D/g, "")) : num;
            if (isNaN(num)) return "0";
            if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2).replace(/\.0+$/, "") + "B";
            if (num >= 1_000_000) return (num / 1_000_000).toFixed(2).replace(/\.0+$/, "") + "M";
            if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0+$/, "") + "K";
            return num.toString();
        };

        const enviarMusica = async (dados, apiName, versao, arquivoField = "arquivo") => {
            const title = dados.title || dados.titulo || "Sem título";
            const author = dados.channel || dados.autor || dados.author?.name || "Desconhecido";
            const duration = dados.timestamp || dados.duracao || dados.duration?.timestamp || "Desconhecida";
            const thumbnail = dados.thumbnails?.[0] || dados.thumbnail || dados.image || "https://files.catbox.moe/427zyd.jpg";
            const views = formatarNumero(dados.viewsCount || dados.views || 0);
            const publicado = dados.uploadDate || dados.publicado || dados.ago || "Desconhecido";
            const linkVideo = dados.externalUrls?.video || dados.videoUrl || dados.url || "N/A";
            const arquivo = dados[arquivoField] || dados.audioUrl;

            const legenda = `🎵 *${title}*\n👤 *Canal:* ${author}\n⏱️ *Duração:* ${duration}\n👀 *Visualizações:* ${views}\n📅 *Publicado:* ${publicado}\n🔗 *Link:* ${linkVideo}\n📡 *Rota usada: ${versao}*`;

            await sock.sendMessage(from, { image: { url: thumbnail }, caption: legenda, headerType: 4 }, { quoted: Info });

            const audioBuffer = await axios.get(arquivo, { responseType: "arraybuffer" }).then(r => r.data).catch(() => null);
            if (!audioBuffer) return reply("❌ Falha ao baixar o áudio.");

            await sock.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mpeg", fileName: `${title}.mp3`, ptt: false }, { quoted: Info });
        };

        // Rotas na ordem: V5 → V8 → V3
        const rotas = [
            { nome: "V5", url: `https://tedzinho.com.br/api/download/play_audio/v5?apikey=${API_KEY_TED}&nome_url=${encodeURIComponent(query)}`, emoji: "1️⃣" },
            { nome: "V8", url: `https://tedzinho.com.br/api/download/play_audio/v8?apikey=${API_KEY_TED}&nome_url=${encodeURIComponent(query)}`, emoji: "2️⃣" },
            { nome: "V3", url: `https://tedzinho.com.br/api/download/play_audio/v3?apikey=${API_KEY_TED}&nome_url=${encodeURIComponent(query)}`, emoji: "3️⃣" },
        ];

        let rotaUsada = null;

        for (let i = 0; i < rotas.length; i++) {
            const r = rotas[i];

            // Envia reação da rota atual
            await sock.sendMessage(from, { react: { text: r.emoji, key: Info.key } });

            try {
                const res = await axios.get(r.url);
                const resultado = res.data.resultado;

                if (resultado && (resultado.arquivo || resultado.dl_link)) {
                    rotaUsada = r.nome;
                    const campoArquivo = resultado.arquivo ? "arquivo" : "dl_link";
                    await enviarMusica(resultado, "Tedzinho API", r.nome, campoArquivo);
                    break; // Para na primeira rota bem-sucedida
                }
            } catch (e) {
                console.error(`Erro na rota ${r.nome}:`, e.message);
            }
        }

        if (!rotaUsada) return reply("❌ Nenhuma rota funcionou.");

    } catch (e) {
        console.error(e);
        await reply("❌ Erro ao processar sua música.");
    }
};