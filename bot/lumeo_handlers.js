/**
 * bot/lumeo_handlers.js — All Telegram Command Handlers
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";

const { InlineKeyboard, InputFile } = require("grammy");

// Voice mode tracker
const _voiceMode = new Set();

// Safe Markdown reply — falls back to plain text if parse fails
async function safeReply(ctx, text, replyMarkup) {
  const opts = { reply_markup: replyMarkup || undefined };
  try {
    await ctx.reply(text, { ...opts, parse_mode: "Markdown" });
  } catch {
    const plain = (text || "").replace(/[*_`[\]]/g, "").replace(/\\n/g, "\n");
    await ctx.reply(plain, opts).catch(() => {});
  }
}

const { askGroq, generateImage, generateVoice, generateMusic, analyzeImage, transcribeAudio } = require("./lumeo_ai");
const { getUser, upsertUser, getAllUsers, saveMemory, getMemory, clearMemory, saveCampaign } = require("./lumeo_db");
const _credits = require("./lumeo_credits");
const { isAdmin: _isAdm } = require("./lumeo_personality");

// Dev never pays — unlimited credits
async function canAfford(tgId, action) {
  if (_isAdm(tgId)) return { canAfford: true, balance: 99999, cost: _credits.COSTS[action] || 0 };
  return _credits.canAfford(tgId, action);
}
async function spend(tgId, action) {
  if (_isAdm(tgId)) return { success: true, balance: 99999, cost: 0 };
  return _credits.spend(tgId, action);
}
const { buildInvoice, buildDonationInvoice, PACKAGES, FREE_CREDITS, COSTS } = _credits;
const { isAdmin, getSystemPrompt, getWelcomeMessage, getHelpText, VERSION } = require("./lumeo_personality");
const { downloadMedia } = require("./lumeo_downloader");

// ─── User setup ───────────────────────────────────────────────────────────────
async function ensureUser(ctx) {
  const id   = ctx.from?.id;
  const user = await getUser(id).catch(() => null);
  if (!user) {
    await upsertUser({
      tg_id:      String(id),
      username:   ctx.from?.username || null,
      first_name: ctx.from?.first_name || null,
      credits:    FREE_CREDITS,
      banned:     false,
    }).catch(() => {});
    return { credits: FREE_CREDITS, isNew: true };
  }
  return { ...user, isNew: false };
}

// ─── History helper ───────────────────────────────────────────────────────────
async function getHistory(tgId) {
  return Promise.race([
    getMemory(tgId, 30).then(rows => rows.map(r => ({ role: r.role, content: r.content }))),
    new Promise(r => setTimeout(() => r([]), 3000)),
  ]).catch(() => []);
}

// ─── Credit check helper ──────────────────────────────────────────────────────
async function checkCredits(ctx, action) {
  const { canAfford: has, balance, cost } = await canAfford(ctx.from.id, action);
  if (!has) {
    const kb = new InlineKeyboard()
      .text("⭐ Buy Credits", "buy_credits")
      .text("💳 View Packages", "view_packages");
    await ctx.reply(`❌ Not enough credits!\n\n**Needed:** ${cost} credits\n**Your balance:** ${balance} credits\n\nPurchase more credits with Telegram Stars ⭐`, { parse_mode: "Markdown", reply_markup: kb });
    return false;
  }
  return true;
}

// ─── /start ───────────────────────────────────────────────────────────────────
async function handleStart(ctx) {
  const user = await ensureUser(ctx);
  const MINI_APP_URL = process.env.MINI_APP_URL || "https://lumeo-ai-bxga.onrender.com/app";

  const kb = new InlineKeyboard()
    .webApp("🚀 Open Lumeo App", MINI_APP_URL).row()
    .text("🎨 Generate Image", "cmd_image")
    .text("🎵 Download Music", "cmd_download").row()
    .text("📄 Create PDF", "cmd_pdf")
    .text("🎤 Voice Note", "cmd_voice").row()
    .text("💰 Credits: " + (user.credits ?? FREE_CREDITS), "cmd_credits")
    .text("❓ Help", "cmd_help");

  await ctx.reply(getWelcomeMessage(ctx.from?.first_name), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

// ─── /help ────────────────────────────────────────────────────────────────────
async function handleHelp(ctx) {
  const kb = new InlineKeyboard()
    .text("🚀 Quick Start", "cmd_quickstart")
    .text("💰 Buy Credits", "buy_credits");
  await ctx.reply(getHelpText(), { parse_mode: "Markdown", reply_markup: kb });
}

// ─── /image [prompt] ─────────────────────────────────────────────────────────
async function handleImage(ctx, prompt) {
  if (!prompt) {
    await ctx.reply("🎨 What image should I create?\n\nExamples:\n• `/image sunset over Lagos skyline`\n• `/image futuristic Nigerian city at night`\n• `/image portrait of a powerful African queen`", { parse_mode: "Markdown" });
    return;
  }
  if (!await checkCredits(ctx, "image")) return;

  const thinking = await ctx.reply("🎨 Generating your image...");
  const buf = await generateImage(prompt);

  if (!buf) {
    await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, "❌ Image generation failed. Please try again in a moment!");
    return;
  }

  const { cost, balance } = await spend(ctx.from.id, "image");
  saveMemory(String(ctx.from.id), "user",      `[Image request]: ${prompt}`).catch(() => {});
  saveMemory(String(ctx.from.id), "assistant", `[Image generated]: ${prompt}`).catch(() => {});

  await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
  const kb = new InlineKeyboard()
    .text("Regenerate", "regen_img_" + prompt.slice(0,50))
    .text("New Image", "cmd_image");

  await ctx.replyWithPhoto(new InputFile(buf, "lumeo_image.jpg"), {
    caption: `✨ *${prompt.slice(0, 100)}*\n\n_-${cost} credits • Balance: ${balance} credits_`,
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

// ─── Voice mode on/off ─────────────────────────────────────────────────────────
async function handleVoiceModeOn(ctx) {
  _voiceMode.add(String(ctx.from.id));
  await ctx.reply("Voice mode ON — I will reply with voice notes from now on. Say /voiceoff to go back to text.");
}
async function handleVoiceModeOff(ctx) {
  _voiceMode.delete(String(ctx.from.id));
  await ctx.reply("Voice mode OFF — back to text replies.");
}

// ─── /voice [text] ───────────────────────────────────────────────────────────
async function handleVoice(ctx, text) {
  if (!text) {
    await ctx.reply("🎤 What should I say?\n\nUsage: `/voice Hello! How are you doing today?`", { parse_mode: "Markdown" });
    return;
  }
  const thinking = await ctx.reply("🎤 Generating voice note...");
  const buf = await generateVoice(text);

  await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
  if (!buf) {
    await ctx.reply("❌ Voice generation failed. Make sure Groq Orpheus terms are accepted at console.groq.com");
    return;
  }
  await spend(ctx.from.id, "voice");
  await ctx.replyWithAudio(new InputFile(buf, "lumeo_voice.mp3"), { title: "Lumeo Voice Note", performer: "Lumeo AI" });
}

// ─── /download [query] ───────────────────────────────────────────────────────
async function handleDownload(ctx, query) {
  if (!query) {
    await ctx.reply("📥 What would you like to download?\n\nExamples:\n• `/download Rema Calm Down`\n• `/download https://youtu.be/...`\n• `/download https://www.tiktok.com/...`", { parse_mode: "Markdown" });
    return;
  }

  const isVid = /video|movie|clip|reel|tiktok|instagram|youtube\.com|youtu\.be/i.test(query) || /https?:\/\//i.test(query);
  await ctx.api.sendChatAction(ctx.chat.id, isVid ? "upload_video" : "upload_audio").catch(() => {});
  const thinking = await ctx.reply(isVid ? "Downloading video..." : 'Searching for "' + query.slice(0,40) + '"...');

  const result = await downloadMedia(query, isVid ? "video" : "music");
  await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id);

  if (!result?.success) {
    await ctx.reply("❌ " + (result?.error || "Download failed. Try a direct link!"));
    return;
  }

  if (result.videoBuf) {
    await ctx.replyWithVideo(new InputFile(result.videoBuf, "video.mp4"), {
      caption: (result.title || "Video").slice(0, 1024),
    }).catch(async e => {
      console.log("[Download] Video send failed:", e.message?.slice(0,60));
      await ctx.reply("Downloaded but couldn't send (may be too large). Try a shorter clip.");
    });
  } else if (result.audioBuf) {
    // Cover art thumbnail first
    if (result.thumbBuf && result.thumbBuf.length > 500) {
      await ctx.replyWithPhoto(new InputFile(result.thumbBuf, "cover.jpg"), {
        caption: (result.title || query).slice(0, 200),
      }).catch(() => {});
    }
    // Audio file
    await ctx.replyWithAudio(new InputFile(result.audioBuf, ((result.title || query).replace(/[^a-z0-9 ]/gi,"_").slice(0,40) || "track") + ".mp3"), {
      title:     (result.title || query).slice(0, 64),
      performer: "via Lumeo AI",
      duration:  0,
    }).catch(async e => {
      console.log("[Download] Audio send failed:", e.message?.slice(0,60));
      await ctx.reply("Downloaded but send failed. Try again!");
    });
    // Lyrics link
    const searchQuery = encodeURIComponent((result.title || query) + " lyrics");
    const lyricsKb = new InlineKeyboard().url("View Lyrics", "https://www.google.com/search?q=" + searchQuery);
    await ctx.reply((result.title || query).slice(0, 200), { reply_markup: lyricsKb }).catch(() => {});
  }
  if (result.cleanup) result.cleanup();
}

// ─── /pdf [description] ───────────────────────────────────────────────────────
async function handlePDF(ctx, description) {
  if (!description) {
    await ctx.reply("📄 What document should I create?\n\nExamples:\n• `/pdf receipt for web development services ₦50,000`\n• `/pdf formal letter to apply for a business grant`\n• `/pdf CV for a software developer with 3 years experience`\n• `/pdf certificate of completion for Python course`", { parse_mode: "Markdown" });
    return;
  }
  await ctx.api.sendChatAction(ctx.chat.id, "upload_document").catch(() => {});
  const thinking = await ctx.reply("Creating your PDF...");
  const safeEdit = async (t) => ctx.api.editMessageText(ctx.chat.id, thinking.message_id, t).catch(() => {});
  try {
    const { createPDF } = require("./lumeo_pdf");
    const history = await getHistory(ctx.from.id);
    await safeEdit("Generating content...");
    const docContent = await askGroq(
      "You are a professional document writer. Thorough, detailed. Plain text only.",
      description, history
    );
    const rawTitle = await askGroq("Return ONLY a 3-5 word document title, nothing else.", "Title for: " + description.slice(0,80), []);
    const title = (rawTitle || "Document").trim();
    await safeEdit("Formatting PDF...");
    const result = await createPDF(docContent || description, title);
    await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
    if (result?.success && result.buffer?.length > 500) {
      await spend(ctx.from.id, "pdf");
      await ctx.replyWithDocument(new InputFile(result.buffer, result.filename || "document.pdf"), {
        caption: title + " — Lumeo AI",
      }).catch(async () => { await ctx.reply("PDF ready but failed to send. Try again!"); });
    } else {
      await ctx.reply("PDF creation failed. Try again!");
    }
  } catch (e) {
    console.error("[PDF]", e.message);
    await ctx.reply("PDF error. Try again!").catch(() => {});
  }
}

// ─── /screenshot ──────────────────────────────────────────────────────────────
async function handleScreenshot(ctx, input) {
  if (!input) {
    await ctx.reply('Send me the conversation:\n\n```\nJohn: Hey!\nMe: Hi!\nJohn: What\'s up?\n```\n\nUsage: `/screenshot [conversation]` or `/screenshot dark John: Hey! Me: Hi!`', { parse_mode: "Markdown" });
    return;
  }
  await ctx.api.sendChatAction(ctx.chat.id, "upload_photo").catch(() => {});
  const thinking = await ctx.reply("Generating screenshot...");
  try {
    const { generateWhatsAppScreenshot, parseScreenshotRequest } = require("./lumeo_screenshot");
    const dark = /dark/i.test(input);
    const cleaned = input.replace(/^dark\s*/i, "");
    const formatted = await askGroq("Format as WhatsApp conversation. Return ONLY lines: Name: message or Me: message", cleaned, []);
    const { messages, contact } = parseScreenshotRequest(formatted || cleaned);
    if (!messages.length) {
      await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
      await ctx.reply('Format: `John: Hello\nMe: Hi!`', { parse_mode: "Markdown" });
      return;
    }
    const result = await generateWhatsAppScreenshot(messages, { theme: dark ? "dark" : "light", contact });
    await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
    if (result?.success) {
      await ctx.replyWithPhoto(new InputFile(result.buffer, "screenshot.png"), { caption: "WhatsApp Screenshot — Lumeo AI" });
    } else {
      await ctx.reply("Screenshot failed. Try again!");
    }
  } catch (e) {
    await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
    await ctx.reply("Screenshot error. Try again!");
  }
}

// ─── /music [prompt] ──────────────────────────────────────────────────────────
async function handleMusicGen(ctx, prompt) {
  if (!prompt) { await ctx.reply("Describe the music:\n\nUsage: `/music upbeat Afrobeats track with drums`", { parse_mode: "Markdown" }); return; }
  await ctx.api.sendChatAction(ctx.chat.id, "upload_audio").catch(() => {});
  const thinking = await ctx.reply("Composing your track...");
  const buf = await generateMusic(prompt);
  await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
  if (!buf) { await ctx.reply("Music generation failed. Try again in a minute!"); return; }
  await ctx.replyWithAudio(new InputFile(buf, "lumeo_music.mp3"), { title: prompt.slice(0,60), performer: "Lumeo AI" })
    .catch(async () => { await ctx.reply("Music generated but failed to send. Try again!"); });
}

// ─── /credits ─────────────────────────────────────────────────────────────────
async function handleCredits(ctx) {
  const user = await ensureUser(ctx);
  const isDevUser = _isAdm(ctx.from.id);
  const bal = isDevUser ? 99999 : (user?.credits ?? FREE_CREDITS);
  const kb  = new InlineKeyboard().text("Buy Credits", "buy_credits").text("Donate Stars", "donate_stars");
  await ctx.reply(
    (isDevUser ? "Developer account — unlimited credits\n\n" : "") +
    "Your balance: " + (isDevUser ? "unlimited" : bal + " credits") + "\n\n" +
    "Image generation: " + COSTS.image + " credits\nVideo generation: " + COSTS.video + " credits\n\nEverything else is FREE.",
    { reply_markup: kb }
  );
}

// ─── /buy ─────────────────────────────────────────────────────────────────────
async function handleBuy(ctx) {
  const kb = new InlineKeyboard();
  PACKAGES.forEach((pkg, i) => {
    kb.text(pkg.label + ": " + pkg.credits + "cr for " + pkg.stars + " Stars", "buy_pkg_" + pkg.id);
    if (i < PACKAGES.length - 1) kb.row();
  });
  await ctx.reply(
    "Purchase Credits with Telegram Stars\n\n" +
    PACKAGES.map(p => p.label + " — " + p.credits + " credits for " + p.stars + " Stars" + (p.badge ? " (" + p.badge + ")" : "")).join("\n"),
    { reply_markup: kb }
  );
}

// ─── /donate ─────────────────────────────────────────────────────────────────
async function handleDonate(ctx) {
  const kb = new InlineKeyboard()
    .text("10 Stars", "donate_10").text("25 Stars", "donate_25").text("50 Stars", "donate_50").row()
    .text("100 Stars", "donate_100").text("Custom", "donate_custom");
  await ctx.reply("Support Lumeo AI\n\nYour stars keep Lumeo running! You get +1 bonus credit per 5 stars donated.", { reply_markup: kb });
}

// ─── /budget [input] ─────────────────────────────────────────────────────────
async function handleBudget(ctx, input) {
  if (!input) {
    await ctx.reply("Budget Calculator\n\nSend income and expenses:\n\nExample:\n/budget Income: 150000, Rent: 40000, Food: 25000, Transport: 15000", { parse_mode: "Markdown" });
    return;
  }
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  const reply = await askGroq(
    "You are a Nigerian personal finance assistant. Analyze expenses. Give: total spent, % of income, savings potential, top 3 cuts, practical advice. Use NGN. Max 300 words.",
    input, []
  );
  const kb = new InlineKeyboard().text("Save as PDF", "budget_to_pdf");
  await safeReply(ctx, reply || "Couldn't analyze. Try again!", kb);
}

// ─── /scam [text] ─────────────────────────────────────────────────────────────
async function handleScam(ctx, input) {
  if (!input) { await ctx.reply("Usage: `/scam [suspicious message or link to check]`", { parse_mode: "Markdown" }); return; }
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  const reply = await askGroq(
    "You are a Nigerian cybersecurity expert. Analyze for scam signals. Give verdict: SCAM / SUSPICIOUS / LEGIT and explain why. Max 200 words.",
    input, []
  );
  await safeReply(ctx, reply || "Analysis failed.", null);
}

// ─── /cv [description] ───────────────────────────────────────────────────────
async function handleCV(ctx, description) {
  if (!description) {
    await ctx.reply("Build your CV:\n\nUsage: `/cv Full-Stack Developer, 3 years Node.js, React, built e-commerce app`", { parse_mode: "Markdown" });
    return;
  }
  await ctx.api.sendChatAction(ctx.chat.id, "upload_document").catch(() => {});
  const thinking = await ctx.reply("Building your CV...");
  try {
    const { createPDF } = require("./lumeo_pdf");
    const content = await askGroq("Generate a complete professional CV in plain text. All standard CV sections.", description, []);
    const result  = await createPDF(content || description, "Professional CV");
    await ctx.api.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
    if (result?.success) {
      await spend(ctx.from.id, "pdf");
      await ctx.replyWithDocument(new InputFile(result.buffer, "CV_Lumeo_AI.pdf"), {
        caption: "Your Professional CV — Built by Lumeo AI (EMEMZYVISUALS DIGITALS)",
      });
    } else { await ctx.reply("CV creation failed. Try again!"); }
  } catch { await ctx.reply("CV error. Try again!"); }
}

// ─── Admin: /broadcast ────────────────────────────────────────────────────────
async function handleBroadcast(ctx, message) {
  if (!_isAdm(ctx.from.id)) { await ctx.reply("Admin only."); return; }
  if (!message) { await ctx.reply("Usage: `/broadcast [message]`", { parse_mode: "Markdown" }); return; }
  const users   = await getAllUsers();
  const thinking = await ctx.reply("Broadcasting to " + users.length + " users...");
  let sent = 0, failed = 0;
  for (const user of users) {
    try { await ctx.api.sendMessage(user.tg_id, message, { parse_mode: "Markdown" }); sent++; } catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, "Done! Sent: " + sent + " Failed: " + failed).catch(() => {});
}

// ─── Admin: /promote ─────────────────────────────────────────────────────────
async function handlePromote(ctx, projectInfo) {
  if (!_isAdm(ctx.from.id)) { await ctx.reply("Admin only."); return; }
  if (!projectInfo) { await ctx.reply("Usage: `/promote [project description]`", { parse_mode: "Markdown" }); return; }
  const promoMsg = await askGroq(
    "Write a compelling Telegram promotional message for EMEMZYVISUALS DIGITALS. Max 200 words. End with contact: ememzyvisualsdigitals@gmail.com",
    "Write promo for: " + projectInfo, []
  );
  const users    = await getAllUsers();
  const thinking = await ctx.reply("Promoting to " + users.length + " users...");
  let sent = 0, failed = 0;
  for (const user of users) {
    try { await ctx.api.sendMessage(user.tg_id, promoMsg || projectInfo); sent++; } catch { failed++; }
    await new Promise(r => setTimeout(r, 100));
  }
  await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, "Campaign done! Sent: " + sent + " Failed: " + failed).catch(() => {});
  const { saveCampaign } = require("./lumeo_db");
  await saveCampaign({ type: "telegram", project: projectInfo.slice(0,200), sent, failed }).catch(() => {});
}

// ─── Admin: /stats ────────────────────────────────────────────────────────────
async function handleStats(ctx) {
  if (!_isAdm(ctx.from.id)) { await ctx.reply("Admin only."); return; }
  const users = await getAllUsers();
  const mem   = process.memoryUsage();
  await ctx.reply(
    "Lumeo AI Stats\n\nTotal users: " + users.length +
    "\nMemory: " + (mem.rss/1024/1024).toFixed(0) + "MB" +
    "\nUptime: " + Math.floor(process.uptime()/3600) + "h " + Math.floor((process.uptime()%3600)/60) + "m" +
    "\nVersion: 3.0"
  );
}

// ─── General chat ─────────────────────────────────────────────────────────────
async function handleChat(ctx, text) {
  const tgId    = ctx.from.id;
  const admin   = _isAdm(tgId);
  const history = await getHistory(tgId);
  const recentCtx = history.slice(-10).map(m => (m.role === "user" ? (ctx.from?.first_name || "User") : "Lumeo") + ": " + (m.content||"").slice(0,150)).join("\n");
  const sysPrompt = getSystemPrompt({ isAdmin: admin, firstName: ctx.from?.first_name, history: recentCtx, isGroup: ctx.chat?.type !== "private" });

  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  const reply = await askGroq(sysPrompt, text, history);
  if (!reply) { await ctx.reply("Say that again?"); return; }

  saveMemory(String(tgId), "user",      text.slice(0,1000)).catch(() => {});
  saveMemory(String(tgId), "assistant", reply.slice(0,1000)).catch(() => {});

  // Voice mode — reply as audio
  if (_voiceMode.has(String(tgId))) {
    await ctx.api.sendChatAction(ctx.chat.id, "record_voice").catch(() => {});
    const vBuf = await generateVoice(reply.replace(/[*_`#]/g, "").slice(0, 1000));
    if (vBuf) {
      await ctx.replyWithAudio(new InputFile(vBuf, "lumeo_reply.mp3"), { title: "Lumeo", performer: "Lumeo AI" }).catch(() => safeReply(ctx, reply, null));
      return;
    }
  }

  const suggKb = getSuggestions(text, reply);
  await safeReply(ctx, reply, suggKb);

  // Occasional animated sticker (30% chance, DM only)
  const chatIsGroup = ctx.chat?.type !== "private";
  if (!chatIsGroup && Math.random() < 0.30) {
    const emotion = detectStickerEmotion(reply);
    if (emotion) {
      await new Promise(r => setTimeout(r, 600));
      await sendAnimatedSticker(ctx, emotion);
    }
  }
}

function getSuggestions(inputText, replyText) {
  const t = (inputText + " " + replyText).toLowerCase();
  const kb = new InlineKeyboard();
  if (/music|song|audio|afrobeats|download/i.test(t)) { kb.text("Download Music", "cmd_download").text("Generate Music", "cmd_musicgen"); return kb; }
  if (/image|photo|art|design|picture/i.test(t))       { kb.text("Generate Image", "cmd_image").text("Buy Credits", "buy_credits"); return kb; }
  if (/pdf|document|letter|invoice|cv|certificate/i.test(t)) { kb.text("Create PDF", "cmd_pdf").text("Build CV", "cmd_cv"); return kb; }
  return null;
}

// ─── Handle photo ─────────────────────────────────────────────────────────────
async function handlePhoto(ctx) {
  const caption = ctx.message?.caption || "";
  const photo   = ctx.message?.photo?.pop();
  if (!photo) return;
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  try {
    const fileLink = await ctx.api.getFile(photo.file_id);
    const fileUrl  = "https://api.telegram.org/file/bot" + process.env.BOT_TOKEN + "/" + fileLink.file_path;
    const imgBuf = await new Promise((resolve, reject) => {
      require("https").get(fileUrl, res => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve(Buffer.concat(ch))); }).on("error", reject);
    });
    const analysis = await analyzeImage(imgBuf.toString("base64"), "image/jpeg", caption || "Describe and analyze this image in detail.");
    await safeReply(ctx, analysis || "Interesting image! Tell me more about it.", null);
  } catch { await ctx.reply("Couldn't analyze that image. Try again!"); }
}

// ─── Handle voice message ─────────────────────────────────────────────────────
async function handleVoiceMessage(ctx) {
  const voice = ctx.message?.voice;
  if (!voice) return;
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  try {
    const fileLink = await ctx.api.getFile(voice.file_id);
    const fileUrl  = "https://api.telegram.org/file/bot" + process.env.BOT_TOKEN + "/" + fileLink.file_path;
    const audioBuf = await new Promise((resolve, reject) => {
      require("https").get(fileUrl, res => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve(Buffer.concat(ch))); }).on("error", reject);
    });
    const transcribed = await transcribeAudio(audioBuf, "audio/ogg");
    if (transcribed?.length > 2) {
      await ctx.reply('You said: "' + transcribed + '"');
      await handleChat(ctx, transcribed);
    } else { await ctx.reply("Didn't catch that. Try again?"); }
  } catch { await ctx.reply("Couldn't process voice note."); }
}

// ─── Animated stickers ────────────────────────────────────────────────────────
const ANIMATED_STICKERS = {
  laugh:    ["CAACAgIAAxkBAAEBdZ5lPjMF0kWnIzT3sGYgHFLOaLfKLwACxwADO2AkFHEBSNaUVmblHgQ"],
  fire:     ["CAACAgIAAxkBAAEBdaFlPjMOpOfzFV9bNSSo5JxZFuN_hgACGAADFXBpCsGfZKBwFrplHgQ"],
  thinking: ["CAACAgIAAxkBAAEBdaNlPjMRz2YkL1Yw3SkYQpJRr0LUKAAC4AADFXBpCiaVlV-6YGlhHgQ"],
  cool:     ["CAACAgIAAxkBAAEBdadlPjMYdCAZ0vcMTa5Mv5O7Mk1LygAC0AADFXBpCugzXC4jnSloHgQ"],
  ok:       ["CAACAgIAAxkBAAEBdaVlPjMUvxsFkPj0CJhXv3MQxnNkLgACHgADFXBpCpCJAAGAbmWDXx4E"],
};
async function sendAnimatedSticker(ctx, emotion) {
  const pack = ANIMATED_STICKERS[emotion] || ANIMATED_STICKERS.ok;
  const id   = pack[Math.floor(Math.random() * pack.length)];
  await ctx.replyWithSticker(id).catch(() => {});
}
function detectStickerEmotion(text) {
  const t = (text || "").toLowerCase();
  if (/lol|haha|funny|😂|😭|💀|laugh|joke/i.test(t))     return "laugh";
  if (/fire|hot|amazing|incredible|🔥|lit|banger/i.test(t)) return "fire";
  if (/hmm|think|consider|ponder|🤔|wonder/i.test(t))       return "thinking";
  if (/cool|nice|dope|smooth|😎|elegant/i.test(t))           return "cool";
  return null;
}

module.exports = { ensureUser, handleStart, handleHelp, handleImage, handleVoice, handleVoiceModeOn, handleVoiceModeOff, handleDownload, handlePDF, handleScreenshot, handleMusicGen, handleCredits, handleBuy, handleDonate, handleBudget, handleScam, handleCV, handleBroadcast, handlePromote, handleStats, handleChat, handlePhoto, handleVoiceMessage, getSuggestions, sendAnimatedSticker, detectStickerEmotion };
