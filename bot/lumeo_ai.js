/**
 * bot/lumeo_ai.js — AI Layer (Groq + HuggingFace)
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";
require("dotenv").config();
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const { exec } = require("child_process");

const GROQ_KEY   = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL   || "meta-llama/llama-4-scout-17b-16e-instruct";

// ─── HuggingFace token rotation ───────────────────────────────────────────────
let _hfIdx = 0;
function getHFToken() {
  const tokens = [process.env.HF_TOKEN, process.env.HF_TOKEN_2, process.env.HF_TOKEN_3]
    .map(t => (t || "").trim()).filter(Boolean);
  return tokens.length ? tokens[_hfIdx % tokens.length] : null;
}

// ─── Groq chat ────────────────────────────────────────────────────────────────
async function askGroq(systemPrompt, userMsg, history = [], maxTokens = 1200) {
  if (!GROQ_KEY) return null;
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-20),
    { role: "user", content: userMsg },
  ];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.85 });
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: "api.groq.com", path: "/openai/v1/chat/completions", method: "POST",
          headers: { "Authorization": "Bearer " + GROQ_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
          timeout: 30000,
        }, res => {
          let raw = "";
          res.on("data", c => raw += c);
          res.on("end", () => {
            try {
              const d = JSON.parse(raw);
              if (res.statusCode === 429) resolve({ rateLimited: true });
              else resolve(d);
            } catch { resolve(null); }
          });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        req.write(body); req.end();
      });
      if (result?.rateLimited) { await new Promise(r => setTimeout(r, 4000 * attempt)); continue; }
      return result?.choices?.[0]?.message?.content || null;
    } catch { if (attempt === 3) return null; await new Promise(r => setTimeout(r, 2000)); }
  }
  return null;
}

// ─── Vision ───────────────────────────────────────────────────────────────────
async function analyzeImage(imageBase64, mimeType = "image/jpeg", question = "Describe this image.") {
  if (!GROQ_KEY) return null;
  const body = JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    { type: "text", text: question },
  ]}], max_tokens: 800 });
  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.groq.com", path: "/openai/v1/chat/completions", method: "POST",
        headers: { "Authorization": "Bearer " + GROQ_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 30000,
      }, res => { let raw = ""; res.on("data", c => raw += c); res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } }); });
      req.on("error", reject); req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.write(body); req.end();
    });
    return result?.choices?.[0]?.message?.content || null;
  } catch { return null; }
}

// ─── Image generation ─────────────────────────────────────────────────────────
const HF_MODELS = ["black-forest-labs/FLUX.1-schnell", "stabilityai/stable-diffusion-xl-base-1.0"];

async function generateImage(prompt) {
  const token = getHFToken();
  if (!token) return null;
  for (const model of HF_MODELS) {
    try {
      const body = JSON.stringify({ inputs: prompt.slice(0, 500) });
      const result = await new Promise((resolve) => {
        const req = https.request({
          hostname: "router.huggingface.co", path: `/hf-inference/models/${model}`,
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "x-wait-for-model": "true" },
          timeout: 60000,
        }, (res) => {
          const chunks = [];
          res.on("data", c => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            if (res.statusCode === 200 && buf.length > 1000) resolve(buf);
            else { if (res.statusCode === 402) _hfIdx++; resolve(null); }
          });
        });
        req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); });
        req.write(body); req.end();
      });
      if (result) { console.log(`[ImageGen] ✅ ${model} (${(result.length/1024).toFixed(0)}KB)`); return result; }
    } catch {}
  }
  return null;
}

// ─── Audio transcription ──────────────────────────────────────────────────────
async function transcribeAudio(audioBuffer, mimeType = "audio/ogg") {
  if (!GROQ_KEY || !audioBuffer) return null;
  try {
    const ext      = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "ogg";
    const boundary = "----LumeoFormBoundary" + Math.random().toString(36).slice(2);
    const part1    = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const part2    = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n--${boundary}--\r\n`);
    const body     = Buffer.concat([part1, audioBuffer, part2]);
    const result   = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.groq.com", path: "/openai/v1/audio/transcriptions", method: "POST",
        headers: { "Authorization": "Bearer " + GROQ_KEY, "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
        timeout: 30000,
      }, res => { let raw = ""; res.on("data", c => raw += c); res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } }); });
      req.on("error", reject); req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.write(body); req.end();
    });
    return result?.text || null;
  } catch { return null; }
}

// ─── TTS (Groq Orpheus) ───────────────────────────────────────────────────────
// ─── Smart text chunking for TTS (no length limit on full output) ─────────────
function chunkForTTS(text, maxChars = 185) {
  // Strip markdown, normalize whitespace
  const clean = text
    .replace(/[*_~`#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxChars) return [clean];

  // Split by sentence boundaries first
  const sentences = clean.match(/[^.!?]+(?:[.!?]+(?:\s|$))|[^.!?]+$/g) || [clean];
  const chunks = [];
  let cur = "";

  for (const s of sentences) {
    const candidate = cur ? cur + " " + s.trim() : s.trim();
    if (candidate.length > maxChars && cur) {
      chunks.push(cur.trim());
      cur = s.trim();
    } else {
      cur = candidate;
    }
    // If single sentence is too long, split at word boundary
    while (cur.length > maxChars) {
      const cutAt = cur.lastIndexOf(" ", maxChars);
      if (cutAt < 10) { chunks.push(cur.slice(0, maxChars).trim()); cur = cur.slice(maxChars).trim(); }
      else { chunks.push(cur.slice(0, cutAt).trim()); cur = cur.slice(cutAt).trim(); }
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(c => c.length > 0);
}

// ─── Single Orpheus TTS request ────────────────────────────────────────────────
async function ttsChunk(text, key) {
  const body = JSON.stringify({
    model: "canopylabs/orpheus-v1-english",
    input: text.slice(0, 200),
    voice: "austin",
    response_format: "wav",
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.groq.com", path: "/openai/v1/audio/speech", method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 45000,
    }, res => {
      const ch = [];
      res.on("data", c => ch.push(c));
      res.on("end", () => {
        const b = Buffer.concat(ch);
        if (res.statusCode === 200 && b.length > 300) { resolve(b); }
        else {
          const err = b.toString().slice(0, 150);
          console.log("[Voice] Orpheus HTTP " + res.statusCode + ":", err);
          resolve(null);
        }
      });
    });
    req.on("error",   () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// ─── Generate voice note — no length limit ─────────────────────────────────────
// Splits long text into chunks, generates each, concatenates WAV, exports MP3
async function generateVoice(text) {
  if (!GROQ_KEY || !text?.trim()) return null;

  const chunks = chunkForTTS(text);
  console.log(`[Voice] Generating ${chunks.length} chunk(s), total ${text.length} chars`);

  const ts       = Date.now();
  const wavPaths = [];

  // Generate chunks sequentially (Groq rate limit friendly)
  for (let i = 0; i < chunks.length; i++) {
    const buf = await ttsChunk(chunks[i], GROQ_KEY);
    if (!buf) {
      console.log(`[Voice] Chunk ${i+1}/${chunks.length} failed`);
      // Clean up and fail
      wavPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
      return null;
    }
    const wp = `/tmp/lumeo_wav_${ts}_${i}.wav`;
    fs.writeFileSync(wp, buf);
    wavPaths.push(wp);
    console.log(`[Voice] Chunk ${i+1}/${chunks.length} ✅ (${(buf.length/1024).toFixed(0)}KB)`);
    // Small delay between chunks to avoid 429
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 250));
  }

  if (wavPaths.length === 0) return null;

  const concatWav = `/tmp/lumeo_concat_${ts}.wav`;
  const outMp3    = `/tmp/lumeo_voice_${ts}.mp3`;

  try {
    // Concatenate all WAVs
    if (wavPaths.length === 1) {
      fs.copyFileSync(wavPaths[0], concatWav);
    } else {
      const listPath = `/tmp/lumeo_list_${ts}.txt`;
      fs.writeFileSync(listPath, wavPaths.map(p => "file '" + p + "'").join("\n"));
      await new Promise((resolve, reject) => {
        exec(`ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${concatWav}" -y 2>/dev/null`, (err) => {
          try { fs.unlinkSync(listPath); } catch {}
          err ? reject(err) : resolve();
        });
      });
    }

    // Convert to MP3 with good quality
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${concatWav}" -codec:a libmp3lame -qscale:a 3 -y "${outMp3}" 2>/dev/null`, (err) => {
        err ? reject(err) : resolve();
      });
    });

    if (!fs.existsSync(outMp3) || fs.statSync(outMp3).size < 100) return null;

    const finalBuf = fs.readFileSync(outMp3);
    console.log(`[Voice] ✅ Total: ${(finalBuf.length / 1024).toFixed(0)}KB (${chunks.length} chunks)`);
    return finalBuf;

  } catch (e) {
    console.error("[Voice] FFmpeg error:", e.message);
    return null;
  } finally {
    // Clean up temp files
    [...wavPaths, concatWav, outMp3].forEach(p => { try { fs.unlinkSync(p); } catch {} });
  }
}

// ─── Music generation ─────────────────────────────────────────────────────────
async function generateMusic(prompt) {
  const token = getHFToken();
  if (!token) return null;
  const body = JSON.stringify({ inputs: prompt.slice(0, 300) });
  try {
    const result = await new Promise((resolve) => {
      const req = https.request({
        hostname: "router.huggingface.co", path: "/hf-inference/models/facebook/musicgen-stereo-small",
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "x-wait-for-model": "true" },
        timeout: 120000,
      }, (res) => {
        const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => { const b = Buffer.concat(ch); resolve(res.statusCode === 200 && b.length > 1000 ? b : null); });
      });
      req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); });
      req.write(body); req.end();
    });
    return result;
  } catch { return null; }
}

module.exports = { askGroq, analyzeImage, generateImage, transcribeAudio, generateVoice, generateMusic };
