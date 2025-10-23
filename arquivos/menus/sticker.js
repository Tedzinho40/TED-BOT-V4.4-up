const fs = require('fs');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const webp = require('node-webpmux');

module.exports = {
  name: 'sticker',
  alias: ['s', 'stickergifp', 'figura', 'f', 'figu', 'st', 'stk', 'fgif', 'fsticker'],
  description: 'Cria figurinha a partir de imagem ou vídeo com metadados EXIF',
  category: 'Utilidades',
  
  async execute(sock, from, Info, args, command, prefix) {
    try {
      const quoted = Info.message?.extendedTextMessage?.contextInfo?.quotedMessage || {};
      const msgContent = Info.message || {};

      // Identificação do usuário e bot
      const pushname = Info.pushName || 'Usuário';
      const nomebot = prefix.NomeDoBot || prefix.nomebot || 'Bot';

      // 🔹 Obtém o nome real do grupo
      let groupName = 'Grupo';
      try {
        if (from.endsWith('@g.us')) {
          const groupMetadata = await sock.groupMetadata(from);
          if (groupMetadata && groupMetadata.subject) {
            groupName = groupMetadata.subject;
          } else {
            console.warn('⚠️ Não foi possível obter o nome do grupo.');
          }
        } else {
          groupName = 'Privado';
        }
      } catch (e) {
        console.error('❌ Erro ao obter nome do grupo:', e);
        groupName = 'Grupo';
      }

      // 🔹 CORREÇÃO: Monta o texto do pack SEM repetição do nome do bot
      let packName = `📛 Bot: ${nomebot}\n👤 Solicitante: ${pushname}\n👑 Grupo: ${groupName}`;

      // 🔹 Personalização (caso o usuário use "|" ou "/")
      if (args.length > 0) {
        const text = args.join(" ");
        if (text.includes("|")) {
          const parts = text.split("|");
          const botPart = parts[0].trim() || nomebot;
          const userPart = parts[1].trim() || pushname;
          const groupPart = parts[2] ? parts[2].trim() : groupName;
          packName = `📛 Bot: ${botPart}\n👤 Solicitante: ${userPart}\n👑 Grupo: ${groupPart}`;
        } else if (text.includes("/")) {
          const parts = text.split("/");
          const botPart = parts[0].trim() || nomebot;
          const userPart = parts[1].trim() || pushname;
          const groupPart = parts[2] ? parts[2].trim() : groupName;
          packName = `📛 Bot: ${botPart}\n👤 Solicitante: ${userPart}\n👑 Grupo: ${groupPart}`;
        } else {
          // CORREÇÃO: Quando só passa um argumento, não repete o nome do bot
          packName = `📛 Bot: ${text}\n👤 Solicitante: ${pushname}\n👑 Grupo: ${groupName}`;
        }
      }

      // 🔹 Autor do pack (mantém o nome do bot)
      let authorName = `🤖 ${nomebot}`;

      // 🔹 Limita o tamanho dos textos
      packName = packName.substring(0, 80);
      authorName = authorName.substring(0, 30);

      // 🔹 Detecta o tipo de mídia
      const isImage = !!msgContent.imageMessage || !!quoted.imageMessage;
      const isVideo = !!msgContent.videoMessage || !!quoted.videoMessage;

      if (!isImage && !isVideo) {
        return sock.sendMessage(from, { 
          text: `❌ Você precisa enviar ou marcar uma imagem ou vídeo (até 10s).\n\n💡 *Dica:* Use \`!sticker NomeBot | NomeUsuário | NomeGrupo\` para personalizar.\n\n*📛 Padrão automático:*\n📛 Bot: ${nomebot}\n👤 Solicitante: ${pushname}\n👑 Grupo: ${groupName}` 
        }, { quoted: Info });
      }

      const mediaType = isImage ? "image" : "video";
      const mediaObj = isImage 
        ? (msgContent.imageMessage || quoted.imageMessage)
        : (msgContent.videoMessage || quoted.videoMessage);

      // 🔹 Verifica duração do vídeo
      if (mediaType === "video" && mediaObj.seconds && (mediaObj.seconds > 10)) {
        return sock.sendMessage(from, { text: "❌ O vídeo precisa ter no máximo 10 segundos." }, { quoted: Info });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: Info.key } });

      // 🔹 Baixa a mídia
      const stream = await downloadContentFromMessage(mediaObj, mediaType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      const timestamp = Date.now();
      const tempInput = `./temp/temp_${timestamp}.${mediaType === "image" ? "jpg" : "mp4"}`;
      const tempWebp = `./temp/sticker_${timestamp}.webp`;
      const finalWebp = `./temp/sticker_final_${timestamp}.webp`;

      if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
      fs.writeFileSync(tempInput, buffer);

      try {
        let ffmpegCommand;
        
        if (mediaType === "image") {
          ffmpegCommand = `ffmpeg -i "${tempInput}" -vf "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -vcodec libwebp -qscale 80 -preset picture -an -vsync 0 -y "${tempWebp}"`;
        } else {
          ffmpegCommand = `ffmpeg -i "${tempInput}" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -vcodec libwebp -qscale 75 -preset default -loop 0 -an -vsync 0 -t 10 -y "${tempWebp}"`;
        }

        await execAsync(ffmpegCommand);
        if (!fs.existsSync(tempWebp)) throw new Error('Sticker não foi criado');

        // 🔹 Cria EXIF personalizado
        const img = new webp.Image();
        await img.load(tempWebp);

        const exifData = {
          "sticker-pack-id": `pack-${timestamp}`,
          "sticker-pack-name": packName,
          "sticker-pack-publisher": authorName,
          "emojis": ["🔥"],
          "android-app-store-link": "https://play.google.com/store/apps/details?id=com.whatsapp",
          "ios-app-store-link": "https://itunes.apple.com/app/whatsapp-messenger/id310633997"
        };

        const exifHeader = Buffer.from([
          0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00, 0x00, 0x00
        ]);
        const jsonBuffer = Buffer.from(JSON.stringify(exifData), 'utf8');
        exifHeader.writeUInt32LE(jsonBuffer.length, 14);
        const fullExif = Buffer.concat([exifHeader, jsonBuffer]);

        try {
          img.exif = fullExif;
          await img.save(finalWebp);
        } catch (errExif) {
          console.warn('⚠️ Falha ao aplicar EXIF:', errExif);
          fs.copyFileSync(tempWebp, finalWebp);
        }

        if (!fs.existsSync(finalWebp) || fs.statSync(finalWebp).size === 0)
          throw new Error('Figurinha criada está vazia');

        // 🔹 Envia figurinha final
        await sock.sendMessage(from, { sticker: fs.readFileSync(finalWebp) }, { quoted: Info });
        await sock.sendMessage(from, { react: { text: "✅", key: Info.key } });

      } catch (stickerError) {
        console.error("Erro ao criar sticker:", stickerError);
        await sock.sendMessage(from, { react: { text: "❌", key: Info.key } });
        await sock.sendMessage(from, { text: "❌ Ocorreu um erro ao gerar a figurinha." }, { quoted: Info });
      } finally {
        try {
          if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
          if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
          if (fs.existsSync(finalWebp)) fs.unlinkSync(finalWebp);
        } catch (cleanupError) {
          console.error("Erro na limpeza:", cleanupError);
        }
      }

    } catch (e) {
      console.error("Erro no comando sticker:", e);
      await sock.sendMessage(from, { react: { text: "❌", key: Info.key } });
      await sock.sendMessage(from, { text: "❌ Ocorreu um erro ao processar a mídia." }, { quoted: Info });
    }
  }
};