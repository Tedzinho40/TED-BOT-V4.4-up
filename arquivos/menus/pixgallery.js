const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const FormData = require('form-data');

module.exports = {
    comando: ['pixgallery', 'pixgal'],
    exec: async (sock, from, Info, args, prefix, sasah) => {
        try {
            const reply = (texto) => sock.sendMessage(from, { text: texto }, { quoted: sasah });

            const isQuotedImage = Info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            const isImage = Info.message?.imageMessage;

            if (!isQuotedImage && !isImage) {
                return reply("❌ Envie ou marque uma imagem com o comando. Exemplo: #gerarlink");
            }

            const galleryName = args.join(' ') || 'WhatsApp Gallery';
            await reply("⏳ Criando galeria e fazendo upload...");

            const galleryResponse = await axios.post('https://api.pixhost.to/galleries',
                `gallery_name=${encodeURIComponent(galleryName)}`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                        'Accept': 'application/json'
                    }
                }
            );

            const galleryData = galleryResponse.data;
            const galleryHash = galleryData.gallery_hash;
            const galleryUploadHash = galleryData.gallery_upload_hash;

            const imageMessage = isQuotedImage
                ? Info.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
                : Info.message.imageMessage;

            const stream = await downloadContentFromMessage(imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const form = new FormData();
            form.append('img', buffer, {
                filename: 'whatsapp_image.jpg',
                contentType: 'image/jpeg'
            });
            form.append('content_type', '0');
            form.append('max_th_size', '420');
            form.append('gallery_hash', galleryHash);
            form.append('gallery_upload_hash', galleryUploadHash);

            const uploadResponse = await axios.post('https://api.pixhost.to/images', form, {
                headers: {
                    ...form.getHeaders(),
                    'Accept': 'application/json'
                }
            });

            const imageData = uploadResponse.data;
            const imageName = imageData.name;
            const showUrl = imageData.show_url;
            const thumbUrl = imageData.th_url;

            if (!showUrl) throw new Error("Não foi possível obter o link da imagem Pixhost.");

            await axios.post(`https://api.pixhost.to/galleries/${galleryHash}/finalize`,
                `gallery_upload_hash=${galleryUploadHash}`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                        'Accept': 'application/json'
                    }
                }
            );

            let imageBuffer;
            try {
                const imageResponse = await axios.get(thumbUrl, { responseType: 'arraybuffer' });
                imageBuffer = Buffer.from(imageResponse.data);
            } catch {
                try {
                    const imageResponse = await axios.get(showUrl, { responseType: 'arraybuffer' });
                    imageBuffer = Buffer.from(imageResponse.data);
                } catch {
                    imageBuffer = null;
                }
            }

            const mensagemFinal = `✅ *Galeria criada com sucesso!*\n\n`  +
                `🔗 *Miniatura:* ${thumbUrl}\n\n`;

            if (imageBuffer) {
                await sock.sendMessage(from, { image: imageBuffer, caption: mensagemFinal }, { quoted: sasah });
            } else {
                await sock.sendMessage(from, { text: mensagemFinal }, { quoted: sasah });
            }

        } catch (e) {
            let errorMsg = "❌ Erro ao criar galeria.";

            if (e.response) {
                switch (e.response.status) {
                    case 400: errorMsg = "❌ Requisição inválida. Verifique os dados."; break;
                    case 413: errorMsg = "❌ Imagem muito grande! Tamanho máximo: 10 MB."; break;
                    case 414: errorMsg = "❌ Formato de arquivo não suportado. Use JPG, PNG ou GIF."; break;
                    case 415: errorMsg = "❌ Galeria não existe."; break;
                    case 416: errorMsg = "❌ Hash de upload da galeria incorreto."; break;
                    case 417: errorMsg = "❌ Não foi possível finalizar a galeria."; break;
                    case 500: errorMsg = "❌ Erro no servidor do Pixhost. Tente novamente mais tarde."; break;
                }
            }

            await sock.sendMessage(from, { text: errorMsg }, { quoted: sasah });
        }
    }
};