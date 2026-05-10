/**
 * bot/lumeo_downloader.js — Media Downloader
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const https = require("https");
const http  = require("http");

const TMP = "/tmp";

function detectPlatform(q) {
  const url = (q.match(/https?:\/\/[^\s]+/) || [])[0];
  if (url) {
    if (/youtube\.com|youtu\.be/i.test(url))  return { isUrl: true, url, platform: "youtube" };
    if (/tiktok\.com/i.test(url))             return { isUrl: true, url, platform: "tiktok" };
    if (/instagram\.com/i.test(url))          return { isUrl: true, url, platform: "instagram" };
    if (/twitter\.com|x\.com/i.test(url))     return { isUrl: true, url, platform: "twitter" };
    if (/facebook\.com|fb\.watch/i.test(url)) return { isUrl: true, url, platform: "facebook" };
    if (/soundcloud\.com/i.test(url))         return { isUrl: true, url, platform: "soundcloud" };
    return { isUrl: true, url, platform: "generic" };
  }
  return { isUrl: false, url: null, platform: "search" };
}

function cleanQuery(raw) {
  const url = (raw.match(/https?:\/\/[^\s]+/) || [])[0];
  if (url) return url;
  return raw.replace(/\b(download|play|get|find|search for)\b/gi, "").replace(/\bon (youtube|soundcloud|instagram|tiktok)\b/gi, "").replace(/\s+/g, " ").trim();
}

const COBALT = ["https://dwnld.nichind.dev","https://cobalt.canine.tools","https://cobalt.meowing.de","https://co.wuk.sh"];

async function cobaltGet(url, audioOnly = false) {
  for (const inst of COBALT) {
    try {
      const body = JSON.stringify({ url, videoQuality: "720", downloadMode: audioOnly ? "audio" : "auto", audioFormat: audioOnly ? "mp3" : "best", filenameStyle: "basic" });
      const u    = new URL(inst);
      const res  = await new Promise((resolve, reject) => {
        const req = https.request({ hostname: u.hostname, path: "/", method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "LumeoTG/3.0", "Content-Length": Buffer.byteLength(body) },
          timeout: 12000,
        }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => { try { resolve({ ok: r.statusCode === 200, data: JSON.parse(d) }); } catch { resolve({ ok: false }); } }); });
        req.on("error", reject); req.on("timeout", () => { req.destroy(); reject(new Error("to")); });
        req.write(body); req.end();
      });
      if (res.ok && res.data?.url) return res.data.url;
      if (res.data?.picker?.[0]?.url) return res.data.picker[0].url;
    } catch {}
  }
  return null;
}

function streamToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    function get(u, hops = 0) {
      if (hops > 6) return reject(new Error("Too many redirects"));
      const proto = u.startsWith("https") ? https : http;
      proto.get(u, { headers: { "User-Agent": "Mozilla/5.0 LumeoBot/3.0" }, timeout: 120000 }, res => {
        if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return get(res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, u).href, hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
        const ws = fs.createWriteStream(outPath);
        res.pipe(ws); ws.on("finish", resolve); ws.on("error", reject);
      }).on("error", reject).on("timeout", function() { this.destroy(); reject(new Error("timeout")); });
    }
    get(url);
  });
}

function ytdlp() { try { return require("youtube-dl-exec"); } catch { return null; } }
function findFile(ts, ...exts) {
  for (const ext of exts) { const f = path.join(TMP, `lumtg_${ts}${ext}`); if (fs.existsSync(f) && fs.statSync(f).size > 500) return f; }
  return null;
}

async function downloadAudio(rawQuery) {
  const query   = cleanQuery(rawQuery);
  const { isUrl, url, platform } = detectPlatform(rawQuery);
  const ts      = Date.now();
  const yt      = ytdlp();
  console.log(`[Download] 🎵 "${query.slice(0,60)}" platform=${platform}`);

  if (isUrl && url) {
    const cobaltUrl = await cobaltGet(url, true);
    if (cobaltUrl) {
      const out = path.join(TMP, `lumtg_${ts}.mp3`);
      try {
        await streamToFile(cobaltUrl, out);
        if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
          return { success: true, audioBuf: fs.readFileSync(out), thumbBuf: null, title: query, cleanup: () => { try { fs.unlinkSync(out); } catch {} } };
        }
      } catch {}
    }
  }

  if (yt) {
    const clean = query.replace(/\b(remix|cover|mix)\b.*/i,"").trim();
    for (const q of clean !== query ? [clean, query] : [query]) {
      const ts2 = Date.now(); const tm2 = path.join(TMP, `lumtg_${ts2}.%(ext)s`);
      try {
        await yt.exec(`scsearch1:${q}`, {
          noPlaylist: true, extractAudio: true, audioFormat: "mp3", audioQuality: 5,
          embedThumbnail: true, writeThumbnail: true, convertThumbnails: "jpg",
          output: tm2, noWarnings: true, ignoreErrors: true,
        }, { timeout: 120000 });
        const f = findFile(ts2, ".mp3",".m4a",".webm",".opus");
        const j = findFile(ts2, ".jpg",".jpeg");
        if (f) {
          console.log(`[Download] ✅ SoundCloud: ${(fs.statSync(f).size/1024).toFixed(0)}KB`);
          return { success: true, audioBuf: fs.readFileSync(f), thumbBuf: j ? fs.readFileSync(j) : null, title: q,
            cleanup: () => { [f,j].filter(Boolean).forEach(x => { try { fs.unlinkSync(x); } catch {} }); } };
        }
      } catch (e) { console.log("[SC]", (e.stderr||e.message||"").slice(0,80)); }
    }
  }
  return { success: false, error: "Couldn't find that song. Try adding the artist name!" };
}

async function downloadVideo(rawQuery) {
  const query   = cleanQuery(rawQuery);
  const { isUrl, url, platform } = detectPlatform(rawQuery);
  const ts      = Date.now();
  const yt      = ytdlp();
  const MAX     = 50 * 1024 * 1024; // 50MB Telegram bot limit

  function pkg(f, j) {
    if (!f) return null;
    const size = fs.statSync(f).size;
    if (size > MAX) { try { fs.unlinkSync(f); } catch {} return { success: false, error: "Video too large (max 50MB). Try a shorter clip!" }; }
    return { success: true, videoBuf: fs.readFileSync(f), thumbBuf: j ? fs.readFileSync(j) : null, title: query,
      cleanup: () => { [f,j].filter(Boolean).forEach(x => { try { fs.unlinkSync(x); } catch {} }); } };
  }

  if (isUrl && url) {
    // Try @distube/ytdl-core for YouTube
    if (platform === "youtube") {
      try {
        const ytdl    = require("@distube/ytdl-core");
        const outPath = path.join(TMP, `lumtg_${ts}.mp4`);
        const info    = await ytdl.getBasicInfo(url).catch(() => null);
        const title   = info?.videoDetails?.title || query;
        await new Promise((resolve, reject) => {
          const stream = ytdl(url, { quality: "highest", filter: f => f.container === "mp4" && f.hasAudio && f.hasVideo });
          const ws     = fs.createWriteStream(outPath);
          stream.on("error", e => { console.log("[ytdl]", e.message?.slice(0,60)); resolve(); });
          ws.on("finish", resolve); ws.on("error", resolve);
          stream.pipe(ws);
        });
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) return pkg(outPath, null) || { success: false, error: "Too large" };
      } catch (e) { console.log("[ytdl-core]", e.message?.slice(0,60)); }
    }

    const cobaltUrl = await cobaltGet(url, false);
    if (cobaltUrl) {
      const out = path.join(TMP, `lumtg_${ts}.mp4`);
      try {
        await streamToFile(cobaltUrl, out);
        const r = pkg(fs.existsSync(out) && fs.statSync(out).size > 1000 ? out : null, null);
        if (r) return r;
      } catch {}
    }

    if (yt) {
      const tmpl = path.join(TMP, `lumtg_${ts}.%(ext)s`);
      try {
        await yt.exec(url, { noPlaylist: true, format: "bestvideo[height<=720][ext=mp4]+bestaudio/best[ext=mp4]/best", mergeOutputFormat: "mp4", output: tmpl, noWarnings: true, ignoreErrors: true, noCheckCertificates: true }, { timeout: 240000 });
        const f = findFile(ts, ".mp4",".webm",".mkv");
        if (f) return pkg(f, null) || { success: false };
      } catch {}
    }
    return { success: false, error: "Couldn't download. Make sure the link is public!" };
  }

  if (yt) {
    const tmpl = path.join(TMP, `lumtg_${ts}.%(ext)s`);
    try {
      await yt.exec(`ytsearch1:${query}`, { noPlaylist: true, format: "bestvideo[height<=480][ext=mp4]+bestaudio/best[ext=mp4]/best", mergeOutputFormat: "mp4", output: tmpl, noWarnings: true, ignoreErrors: true }, { timeout: 180000 });
      const f = findFile(ts, ".mp4",".webm",".mkv");
      if (f) return pkg(f, null) || { success: false };
    } catch {}
  }
  return { success: false, error: "Paste the direct link from TikTok, Instagram or YouTube!" };
}

async function downloadMedia(rawQuery, type = "music") {
  if (/https?:\/\//i.test(rawQuery) && /youtube\.com|youtu\.be|tiktok|instagram|twitter|facebook|fb\.watch/i.test(rawQuery)) return downloadVideo(rawQuery);
  if (!/https?:\/\//i.test(rawQuery) && /\b(tiktok|youtube|instagram|facebook)\b/i.test(rawQuery)) return downloadVideo(rawQuery);
  return type === "video" ? downloadVideo(rawQuery) : downloadAudio(rawQuery);
}

module.exports = { downloadMedia, downloadAudio, downloadVideo, cleanQuery, detectPlatform };
