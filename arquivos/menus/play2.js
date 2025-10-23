const axios = require("axios");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function play2Command(sock, from, Info, args, prefix, API_KEY_TED) {
    const reply = (texto) => sock.sendMessage(from, { text: texto }, { quoted: Info });

    try {
        const query = args.join(" ");
        if (!query) {
            return reply(`❌ Cadê o nome ou link do YouTube?\nExemplo: ${prefix}play2 tz da coronel`);
        }

        let finalUrl = query;

        // 🔎 Pesquisa no YouTube caso não seja link
        if (!query.includes("youtu")) {
            const searchUrl = `https://tedzinho.com.br/api/pesquisa/youtube?apikey=${API_KEY_TED}&query=${encodeURIComponent(query)}`;
            const pesquisa = await axios.get(searchUrl);

            const resultados = pesquisa.data?.resultado;
            if (!resultados || resultados.length === 0) {
                return reply("❌ Nenhum resultado encontrado para sua busca.");
            }

            finalUrl = resultados[0].url;
        }

        // 🎧 Download do áudio via API do Tedzinho
        const apiUrl = `https://tedzinho.com.br/api/download/play_audio/v9?apikey=${API_KEY_TED}&nome_url=${encodeURIComponent(finalUrl)}`;

        const inicio = Date.now();
        let dados = null;
        const maxTentativas = 4;
        const intervalo = 5000;

        for (let i = 0; i < maxTentativas; i++) {
            const res = await axios.get(apiUrl);
            if (res.data?.status === "OK" && res.data?.resultado?.status === true) {
                dados = res.data.resultado;
                break;
            }
            await sleep(intervalo);
        }

        if (!dados) {
            return reply("❌ Não foi possível obter o áudio após várias tentativas. Tente novamente em alguns segundos.");
        }

        const title = dados.video_id || "Sem título";
        const thumbnail = `https://i.ytimg.com/vi/${dados.video_id}/hqdefault.jpg`;
        const legenda = `🎵 *${title}*\n📡 *Rota:* Tedzinho API\n💾 *Cache:* ${dados.cached ? "Sim" : "Não"}\n⏱️ *Tempo:* ${(Date.now() - inicio) / 1000}s`;

        // 🔽 Baixa o áudio
        const audioResponse = await axios.get(dados.download_url, { responseType: "arraybuffer" });
        const audioBuffer = Buffer.from(audioResponse.data);

        // 🖼️ Envia thumbnail com legenda
        await sock.sendMessage(from, { image: { url: thumbnail }, caption: legenda }, { quoted: Info });

        // 🎶 Envia áudio
        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`,
            ptt: false
        }, { quoted: Info });

    } catch (e) {
        console.error("Erro no play2Command:", e);
        reply("❌ Erro ao processar sua música. Verifique o link ou nome e tente novamente.");
    }
};