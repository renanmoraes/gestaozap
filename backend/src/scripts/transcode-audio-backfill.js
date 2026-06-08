/**
 * One-off: converte áudios .ogg (Opus do WhatsApp) para .mp3 para compatibilidade universal.
 * Atualiza media_url e media_mime no banco.
 *
 * Uso: docker exec gestaozap-backend-1 node src/scripts/transcode-audio-backfill.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const { connectDB } = require('../config/db');
const { getDb } = require('../db');
const { sql } = require('drizzle-orm');

async function main() {
  await connectDB();
  const db = getDb();

  const result = await db.execute(sql`
    SELECT id, media_url FROM messages
    WHERE media_type = 'audio' AND media_url LIKE '%.ogg'
  `);

  const items = result.rows || [];
  console.log(`Encontrados ${items.length} áudio(s) .ogg para converter`);

  let ok = 0, fail = 0;

  for (const row of items) {
    const relPath = row.media_url.replace(/^\/+/, '');
    const inputPath = path.join('/app', relPath);
    const outputPath = inputPath.replace(/\.ogg$/, '.mp3');

    if (!fs.existsSync(inputPath)) {
      console.warn(`[skip] arquivo não existe: ${inputPath}`);
      fail++;
      continue;
    }

    await new Promise((resolve) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('64k')
        .format('mp3')
        .on('end', async () => {
          try { fs.unlinkSync(inputPath); } catch (_) {}
          const newUrl = row.media_url.replace(/\.ogg$/, '.mp3');
          await db.execute(sql`
            UPDATE messages
            SET media_url = ${newUrl}, media_mime = 'audio/mpeg'
            WHERE id = ${row.id}::uuid
          `);
          console.log(`✓ ${row.id} → ${newUrl}`);
          ok++;
          resolve();
        })
        .on('error', (err) => {
          console.warn(`✗ ${row.id}: ${err.message}`);
          fail++;
          resolve();
        })
        .save(outputPath);
    });
  }

  console.log(`\nConcluído: ${ok} convertidos, ${fail} falhas`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
