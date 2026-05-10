/**
 * bot/index.js — Lumeo AI Telegram Bot
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";

require("dotenv").config();
const { Bot, InlineKeyboard, InputFile } = require("grammy");
const cron    = require("node-cron");
const express = require("express");
const path    = require("path");

const {
  ensureUser, handleStart, handleHelp, handleImage, handleVoice,
  handleVoiceModeOn, handleVoiceModeOff,
  handleDownload, handlePDF, handleScreenshot, handleMusicGen,
  handleCredits, handleBuy, handleDonate, handleBudget,
  handleScam, handleCV, handleBroadcast, handlePromote,
  handleStats, handleChat, handlePhoto, handleVoiceMessage,
} = require("./lumeo_handlers");
const { canAfford: _canAfford, spend: _spend, buildInvoice, buildDonationInvoice, PACKAGES, FREE_CREDITS, COSTS } = require('./lumeo_credits');
const { isAdmin: _isAdminCheck } = require('./lumeo_personality');
// Dev gets unlimited credits
async function canAfford(tgId, action) {
  if (_isAdminCheck(tgId)) return { canAfford: true, balance: 99999, cost: COSTS[action] || 0 };
  return _canAfford(tgId, action);
}
async function spend(tgId, action) {
  if (_isAdminCheck(tgId)) return { success: true, balance: 99999, cost: 0 };
  return _spend(tgId, action);
}
// Stars payment (keep processStarsPayment, processDonation)
const { isAdmin, getSystemPrompt, VERSION } = require("./lumeo_personality");
const { generateImage, askGroq } = require("./lumeo_ai");
const { registerSetupCommands } = require('./lumeo_setup_guide');
const {
  handleGroupMessage, welcomeMember, GROUP_COMMANDS,
  sendDailyGroupGreeting, isChatAdmin,
} = require('./lumeo_groups');
const { getUser, getAllUsers, saveCampaign } = require("./lumeo_db");

const BOT_TOKEN = process.env.BOT_TOKEN || "";
if (!BOT_TOKEN) { console.error("❌ BOT_TOKEN not set"); process.exit(1); }

const bot = new Bot(BOT_TOKEN);

// ─── Middleware: ensure user exists ───────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from?.id) {
    ensureUser(ctx).catch(() => {});
  }
  await next();
});

// ─── Commands ─────────────────────────────────────────────────────────────────
bot.command("start",      ctx => handleStart(ctx));
bot.command("help",       ctx => handleHelp(ctx));
bot.command("credits",    ctx => handleCredits(ctx));
bot.command("buy",        ctx => handleBuy(ctx));
bot.command("donate",     ctx => handleDonate(ctx));
bot.command("support",    ctx => handleDonate(ctx));  // alias
bot.command("stats",      ctx => handleStats(ctx));
bot.command("broadcast",  ctx => handleBroadcast(ctx, ctx.match));
bot.command("promote",    ctx => handlePromote(ctx, ctx.match));
bot.command("budget",     ctx => handleBudget(ctx, ctx.match));
bot.command("scam",       ctx => handleScam(ctx, ctx.match));
bot.command("cv",         ctx => handleCV(ctx, ctx.match));
bot.command("image",      ctx => handleImage(ctx, ctx.match));
bot.command("img",        ctx => handleImage(ctx, ctx.match));
bot.command("voice",      ctx => handleVoice(ctx, ctx.match));
bot.command("say",        ctx => handleVoice(ctx, ctx.match));
bot.command("download",   ctx => handleDownload(ctx, ctx.match));
bot.command("dl",         ctx => handleDownload(ctx, ctx.match));
bot.command("music",      ctx => handleMusicGen(ctx, ctx.match));
bot.command("pdf",        ctx => handlePDF(ctx, ctx.match));
bot.command("doc",        ctx => handlePDF(ctx, ctx.match));
bot.command("screenshot", ctx => handleScreenshot(ctx, ctx.match));
bot.command("ss",         ctx => handleScreenshot(ctx, ctx.match));
bot.command("clear",      async ctx => {
  const { clearMemory } = require("./lumeo_db");
  await clearMemory(String(ctx.from.id));
  await ctx.reply("✅ Conversation memory cleared!");
bot.command("voiceon",    ctx => handleVoiceModeOn(ctx));
bot.command("voiceoff",   ctx => handleVoiceModeOff(ctx));
bot.command("textmode",   ctx => handleVoiceModeOff(ctx));
});
bot.command("ping", async ctx => {
  const mem = process.memoryUsage();
  await ctx.reply(`🟢 Lumeo v${VERSION} is online!\nUptime: ${Math.floor(process.uptime()/60)}m\nMemory: ${(mem.rss/1024/1024).toFixed(0)}MB`);
});

// ─── Group admin commands ──────────────────────────────────────────────────
bot.command("warn",       ctx => GROUP_COMMANDS.warn(ctx, bot));
bot.command("mute",       ctx => GROUP_COMMANDS.mute(ctx, bot));
bot.command("unmute",     ctx => GROUP_COMMANDS.unmute(ctx, bot));
bot.command("kick",       ctx => GROUP_COMMANDS.kick(ctx, bot));
bot.command("ban",        ctx => GROUP_COMMANDS.ban(ctx, bot));
bot.command("clearwarns", ctx => GROUP_COMMANDS.clearwarns(ctx, bot));
bot.command("groupset",   ctx => GROUP_COMMANDS.groupset(ctx, bot));
bot.command("groupstats", ctx => GROUP_COMMANDS.groupstats(ctx, bot));
bot.command("setgroup",   ctx => GROUP_COMMANDS.groupset(ctx, bot)); // alias

// ─── New member join ───────────────────────────────────────────────────────
bot.on("message:new_chat_members", ctx => welcomeMember(ctx));
bot.command("app", async ctx => {
  const MINI_APP_URL = process.env.MINI_APP_URL || "https://lumeo-ai-bxga.onrender.com/app";
  const kb = new InlineKeyboard().webApp("🚀 Open Lumeo App", MINI_APP_URL);
  await ctx.reply("🎮 Open the Lumeo Mini App for games, credits store, and more!", { reply_markup: kb });
});
bot.command("email", async ctx => {
  if (!isAdmin(ctx.from.id)) { await ctx.reply("🔒 Admin only."); return; }
  const text = ctx.match;
  const emailMatch = (text || "").match(/[\w.+-]+@[\w.-]+\.\w{2,}/i);
  if (!emailMatch) { await ctx.reply("Usage: `/email client@company.com About my project X`", { parse_mode: "Markdown" }); return; }
  const to      = emailMatch[0];
  const subject_info = text.replace(to, "").trim();
  try {
    const nodemailer  = require("nodemailer");
    const GMAIL_USER  = process.env.EMAIL_USER || "";
    const GMAIL_PASS  = process.env.EMAIL_PASS || "";
    if (!GMAIL_USER || !GMAIL_PASS) { await ctx.reply("❌ EMAIL_USER and EMAIL_PASS not set in env."); return; }
    const body = await askGroq(
      "Write a professional business development email for EMEMZYVISUALS DIGITALS. From: Emmanuel.A, CEO. ememzyvisualsdigitals@gmail.com | +234 904 711 5612. Max 250 words. Compelling and warm.",
      "Email about: " + subject_info + " To: " + to, []
    );
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,          // 587 STARTTLS — Render allows this, 465 SSL is blocked
        secure: false,
        requireTLS: true,
        auth: { user: GMAIL_USER, pass: GMAIL_PASS },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
      });
    await transporter.sendMail({ from: `"Emmanuel.A | EMEMZYVISUALS DIGITALS" <${GMAIL_USER}>`, to, subject: "Partnership Opportunity — EMEMZYVISUALS DIGITALS", text: body || subject_info });
    await ctx.reply(`✅ Email sent to *${to}*\n\n_Preview:_\n${(body||"").slice(0,200)}...`, { parse_mode: "Markdown" });
  } catch (e) { await ctx.reply("❌ Email failed: " + e.message?.slice(0,100)); }
});

// ─── Callback queries ─────────────────────────────────────────────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  // Quick menu buttons
  if (data === "cmd_image")    { await ctx.reply("🎨 What image should I create?\n\nUsage: `/image [your prompt]`\n\nExample: `/image futuristic Lagos skyline at night`", { parse_mode: "Markdown" }); return; }
  if (data === "cmd_download") { await ctx.reply("📥 What would you like to download?\n\nUsage: `/download [song name or URL]`", { parse_mode: "Markdown" }); return; }
  if (data === "cmd_pdf")      { await ctx.reply("📄 Describe the document:\n\nUsage: `/pdf [description]`\n\nExample: `/pdf invoice for web design services ₦80,000`", { parse_mode: "Markdown" }); return; }
  if (data === "cmd_voice")    { await ctx.reply("🎤 What should I say?\n\nUsage: `/voice [text]`", { parse_mode: "Markdown" }); return; }
  if (data === "cmd_credits")  { await handleCredits(ctx); return; }
  if (data === "cmd_help")     { await handleHelp(ctx); return; }
  if (data === "cmd_budget")   { await handleBudget(ctx, ""); return; }
  if (data === "cmd_cv")       { await handleCV(ctx, ""); return; }
  if (data === "cmd_musicgen") { await handleMusicGen(ctx, ""); return; }
  if (data === "cmd_quickstart") {
    await ctx.reply("*🚀 Quick Start Guide*\n\n1️⃣ Just type anything to chat with me\n2️⃣ `/image sunset over Lagos` to generate images\n3️⃣ `/download Rema Calm Down` to get music\n4️⃣ `/pdf receipt for ₦50,000 web design` to create docs\n5️⃣ `/voice Hello there!` for voice notes\n6️⃣ `/budget ₦150k income, rent ₦40k, food ₦25k` for finance help\n\nAll features except image & video gen are **completely free!** 🎉", { parse_mode: "Markdown" }); return;
  }

  // Buy credits
  if (data === "buy_credits")  { await handleBuy(ctx); return; }
  if (data === "view_packages") { await handleBuy(ctx); return; }
  if (data.startsWith("buy_pkg_")) {
    const pkgId = data.replace("buy_pkg_", "");
    const pkg   = PACKAGES.find(p => p.id === pkgId);
    if (!pkg) { await ctx.reply("❌ Package not found."); return; }
    const invoice = buildInvoice(pkg);
    await ctx.replyWithInvoice(invoice.title, invoice.description, invoice.payload, invoice.currency, invoice.prices);
    return;
  }

  // Donate
  if (data === "donate_stars")  { await handleDonate(ctx); return; }
  if (data.startsWith("donate_") && data !== "donate_custom") {
    const amount = parseInt(data.replace("donate_", ""));
    if (!isNaN(amount)) {
      const inv = buildDonationInvoice(amount);
      await ctx.replyWithInvoice(inv.title, inv.description, inv.payload, inv.currency, inv.prices);
    }
    return;
  }
  if (data === "donate_custom") {
    await ctx.reply("💝 To donate a custom amount, use:\n`/donate [amount]`\n\nExample: `/donate 50` for 50 Stars", { parse_mode: "Markdown" });
    return;
  }

  // Regen image
  if (data.startsWith("regen_img_")) {
    const prompt = data.replace("regen_img_", "");
    await handleImage(ctx, prompt);
    return;
  }

  // Budget to PDF
  if (data === "budget_to_pdf") {
    await ctx.reply("📄 Send me your budget details and I'll create a PDF report!\n\nUsage: `/pdf budget report for [month]`", { parse_mode: "Markdown" });
    return;
  }
});

// ─── Pre-checkout query (must answer within 10s) ──────────────────────────────
bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// ─── Successful payment ───────────────────────────────────────────────────────
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  const starsAmount = payment.total_amount;
  const payload     = JSON.parse(payment.invoice_payload || "{}");
  const tgId        = ctx.from.id;

  if (payload.type === "credits") {
    const { success, credits, balance, pkg } = await processStarsPayment(tgId, starsAmount, payload.packageId);
    if (success) {
      await ctx.reply(
        `⭐ *Payment Successful!*\n\n🎉 +${credits} credits added to your account!\n💰 New balance: **${balance} credits**\n\n${pkg?.badge ? pkg.badge + "\n\n" : ""}Thank you for supporting Lumeo AI! 🙏\n_EMEMZYVISUALS DIGITALS_`,
        { parse_mode: "Markdown" }
      );
    }
  } else if (payload.type === "donation") {
    const { bonusCredits, balance } = await processDonation(tgId, starsAmount);
    await ctx.reply(
      `❤️ *Thank you for your support!*\n\nYou donated **${starsAmount} Stars** to Lumeo AI! Every star helps keep the servers running and new features coming.\n\n${bonusCredits > 0 ? `🎁 Bonus: +${bonusCredits} credits added to your account!\n💰 Balance: ${balance} credits\n\n` : ""}You're amazing! — Emmanuel.A & the EMEMZYVISUALS DIGITALS team 🙏`,
      { parse_mode: "Markdown" }
    );
  }
});

// ─── Photos ───────────────────────────────────────────────────────────────────
bot.on("message:photo", ctx => handlePhoto(ctx));

// ─── Voice messages ───────────────────────────────────────────────────────────
bot.on("message:voice", ctx => handleVoiceMessage(ctx));


// ─── Sticker received → Lumeo reacts and optionally replies ─────────────────
bot.on("message:sticker", async (ctx) => {
  const sticker = ctx.message?.sticker;
  const isGroup = ctx.chat?.type !== "private";
  // In groups only respond if it's animated/premium (engaging) or bot is mentioned
  if (isGroup && !sticker?.is_animated && !sticker?.is_video) return;
  const emoji   = sticker?.emoji || "😄";
  const isAnimated = sticker?.is_animated || sticker?.is_video;
  const reactions = ["Nice sticker!", "Ha! Love it 😂", "That's a good one!", "Hahaha", "Omo 💀", "Facts!", "Big mood"];
  const reply   = reactions[Math.floor(Math.random() * reactions.length)];
  await ctx.reply(isAnimated ? `${reply} (animated stickers are elite 🔥)` : reply);
});

// ─── Document / file received → analyze or help with it ─────────────────────
bot.on("message:document", async (ctx) => {
  const doc      = ctx.message?.document;
  const caption  = ctx.message?.caption || "";
  const mimeType = doc?.mime_type || "";
  const fileName = doc?.file_name || "file";
  const isGroup  = ctx.chat?.type !== "private";
  if (isGroup) return; // Only handle files in DMs for now

  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  // PDF: extract and summarize
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    await ctx.reply(
      `📄 Received *${fileName}*\n\nI can see this is a PDF. Send me a specific question about it and I'll help analyze it based on the context you give me.\n\n_For example: "What is this document about?" or "Summarize this receipt"_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Text/code files
  if (mimeType.startsWith("text/") || /\.(js|ts|py|json|csv|md|txt|html|css|sql|env|yaml|yml)$/i.test(fileName)) {
    try {
      const https  = require("https");
      const fileLink = await ctx.api.getFile(doc.file_id);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileLink.file_path}`;
      const buf = await new Promise((resolve, reject) => {
        https.get(fileUrl, res => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve(Buffer.concat(ch))); }).on("error", reject);
      });
      const text = buf.toString("utf8").slice(0, 3000);
      const question = caption || "Analyze this file. Explain what it does, identify any issues, and suggest improvements.";
      const analysis = await askGroq(
        "You are an expert code and file analyzer. Be thorough, specific, and practical in your analysis.",
        `File: ${fileName}\n\nContent:\n\`\`\`\n${text}\n\`\`\`\n\nTask: ${question}`,
        []
      );
      await ctx.reply(analysis || "Couldn't analyze — try asking a specific question.", { parse_mode: "Markdown" });
    } catch (e) {
      await ctx.reply(`Received *${fileName}* — send a specific question about it and I'll help!`, { parse_mode: "Markdown" });
    }
    return;
  }

  // Image files
  if (mimeType.startsWith("image/")) {
    await ctx.reply(`📷 Received image file *${fileName}*.\n\nSend it as a photo (not a file) for me to analyze it.`, { parse_mode: "Markdown" });
    return;
  }

  // Generic file
  const prompt = caption || `Tell me what ${fileName} is and what it's typically used for.`;
  const resp   = await askGroq(
    "You are a helpful assistant. Answer concisely and practically.",
    prompt, []
  );
  await ctx.reply(resp || `Received *${fileName}*. What would you like to do with it?`, { parse_mode: "Markdown" });
});

// ─── Audio file received (music, mp3 etc.) ───────────────────────────────────
bot.on("message:audio", async (ctx) => {
  const audio   = ctx.message?.audio;
  const caption = ctx.message?.caption || "";
  const title   = audio?.title || audio?.file_name || "audio file";
  if (!caption) {
    await ctx.reply(
      `🎵 Received *${title}*\n\nI can't play audio directly, but I can:\n• Find lyrics for this song — just tell me the song name\n• Help identify the song if you tell me some lyrics\n• Download a fresh copy from SoundCloud: \`/download ${title}\``,
      { parse_mode: "Markdown" }
    );
    return;
  }
  // If they sent with a question
  const resp = await askGroq("You are a music-aware assistant.", caption + "\n\nContext: User sent an audio file called: " + title, []);
  await ctx.reply(resp || "Got it!", { parse_mode: "Markdown" });
});

// ─── Video note (round video) ─────────────────────────────────────────────────
bot.on("message:video_note", async (ctx) => {
  await ctx.reply("Cute video note! 📹 I can't process video notes yet, but I can see them. What's up?");
});

// ─── Animation / GIF received ─────────────────────────────────────────────────
bot.on("message:animation", async (ctx) => {
  const isGroup = ctx.chat?.type !== "private";
  if (isGroup) return;
  const gifs = ["Lol 😂", "Okay okay I see you 😂", "Facts 💀", "This is sending me 😭", "Accurate 😂"];
  await ctx.reply(gifs[Math.floor(Math.random() * gifs.length)]);
});

// ─── Contact shared ────────────────────────────────────────────────────────────
bot.on("message:contact", async (ctx) => {
  const contact = ctx.message?.contact;
  const name    = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ");
  await ctx.reply(
    `📇 Received contact: *${name}*\n\nWould you like me to:\n• Draft a message to send them\n• Create a business profile for them\n• Help you follow up professionally`,
    { parse_mode: "Markdown" }
  );
});

// ─── Location received ─────────────────────────────────────────────────────────
bot.on("message:location", async (ctx) => {
  const loc  = ctx.message?.location;
  const lat  = loc?.latitude?.toFixed(4);
  const lon  = loc?.longitude?.toFixed(4);
  await ctx.reply(
    `📍 Got your location (${lat}, ${lon})\n\nWhat would you like? I can:\n• Help you describe this area\n• Draft directions to here\n• Suggest what to do nearby (tell me more context)`,
    { parse_mode: "Markdown" }
  );
});

// ─── Text messages — route by chat type ───────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text    = ctx.message?.text?.trim();
  const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  if (!text || text.startsWith("/")) return;

  if (isGroup) {
    // In groups: pass to group handler (only responds when mentioned/replied to)
    await handleGroupMessage(ctx, bot);
    return;
  }

  // DM: detect inline download links
  if (/https?:\/\//i.test(text) && /tiktok|instagram|youtube|youtu\.be|facebook|fb\.watch/i.test(text)) {
    await handleDownload(ctx, text);
    return;
  }
  await handleChat(ctx, text);
});

// ─── Error handler ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error("[Bot Error]", err.message?.slice(0, 150));
});

// ─── Cron: auto-posts ─────────────────────────────────────────────────────────
let _cronStarted = false;
function setupCron() {
  if (_cronStarted) return;
  _cronStarted = true;

  const CHANNEL = process.env.CHANNEL_ID; // e.g. @lumeoaichannel or -100xxxxxxxxxx

  // Morning greeting to channel — 7AM WAT
  cron.schedule("0 7 * * *", async () => {
    if (!CHANNEL) return;
    try {
      const msgs = [
        "🌅 *Good morning!*\n\nStart your day right — I'm Lumeo AI, ready to help with images, music, documents, and more.\n\nType /start to begin! 🚀\n\n_EMEMZYVISUALS DIGITALS_",
        "☀️ *Morning check-in!*\n\nNew day, new possibilities. What can Lumeo help you build today?\n\n🎨 Images • 🎵 Music • 📄 PDFs • 💬 Chat\n\n_Powered by EMEMZYVISUALS DIGITALS_",
        "🌄 *Rise and grind!*\n\nLumeo AI is live and ready. All features free — just image and video gen need credits.\n\n👉 /start to get your 20 free credits!\n\n_EMEMZYVISUALS DIGITALS_",
      ];
      await bot.api.sendMessage(CHANNEL, msgs[Math.floor(Math.random() * msgs.length)], { parse_mode: "Markdown" });
    } catch {}
  }, { timezone: "Africa/Lagos" });

  // AI image post to channel — 12PM WAT
  cron.schedule("0 12 * * *", async () => {
    if (!CHANNEL) return;
    try {
      const prompts = [
        "futuristic Nigerian city skyline at night, neon lights, Afrofuturism style",
        "African woman coding on a laptop, vibrant colors, professional, modern office",
        "abstract AI brain digital neural network blue green glowing",
        "Lagos harbor at golden hour, warm colors, cinematic",
        "young Nigerian entrepreneur presenting tech startup, vibrant energetic",
      ];
      const prompt = prompts[Math.floor(Math.random() * prompts.length)];
      const imgBuf = await generateImage(prompt);
      if (!imgBuf) return;
      const captions = [
        "🎨 Daily art by Lumeo AI\n\n_Generate your own images FREE at @LumeoAIBot_ 🚀\n\n*EMEMZYVISUALS DIGITALS*",
        "✨ AI-generated today\n\n_Want your own? Type /image [prompt] at @LumeoAIBot_\n\n*EMEMZYVISUALS DIGITALS*",
        "🖼 From Lumeo's creative engine\n\n_Try it yourself — @LumeoAIBot_ 🎨\n\n*EMEMZYVISUALS DIGITALS*",
      ];
      await bot.api.sendPhoto(CHANNEL, new InputFile(imgBuf), {
        caption: captions[Math.floor(Math.random() * captions.length)],
        parse_mode: "Markdown",
      });
    } catch (e) { console.error("[Cron] Image post:", e.message); }
  }, { timezone: "Africa/Lagos" });

  // Tech tip post — 6PM WAT
  cron.schedule("0 18 * * *", async () => {
    if (!CHANNEL) return;
    try {
      const tip = await askGroq(
        "Write a short engaging tech tip or AI insight for a Telegram channel. Max 150 words. Include 1-2 relevant emojis. End with EMEMZYVISUALS DIGITALS. Use Telegram markdown (**bold**, _italic_).",
        "Generate today's tech tip for Lumeo AI channel", []
      );
      if (tip) {
        await bot.api.sendMessage(CHANNEL, tip + "\n\n👉 Chat with Lumeo: @LumeoAIBot", { parse_mode: "Markdown" });
      }
    } catch {}
  }, { timezone: "Africa/Lagos" });

  // Daily greeting to configured groups — 8AM WAT
  cron.schedule("0 8 * * *", async () => {
    // ALGIVIX DEV TEAM
    const algivixId = process.env.ALGIVIX_GROUP_ID;
    if (algivixId) {
      await sendDailyGroupGreeting(bot, algivixId, "ALGIVIX DEV TEAM");
    }
    // Any other group IDs in env
    const extraGroups = (process.env.EXTRA_GROUP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
    for (const gid of extraGroups) {
      try { await sendDailyGroupGreeting(bot, gid, "Group"); } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }, { timezone: "Africa/Lagos" });

  console.log("[Cron] ✅ Scheduled posts active");
}

// ─── Express server (Mini App + keep-alive) ───────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../webapp")));

// Keep-alive
app.get("/", (req, res) => res.send("Lumeo AI v" + VERSION + " — ONLINE"));

// Mini App API endpoints

// In-app chat endpoint (used by Mini App)
app.post('/api/chat', async (req, res) => {
  try {
    const { tg_id, message, history = [] } = req.body;
    if (!message) { res.json({ reply: 'Say something!' }); return; }
    const admin = isAdmin(tg_id);
    const recentCtx = history.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Lumeo'}: ${(m.content||'').slice(0,150)}`).join('\n');
    const sysP = getSystemPrompt({ isAdmin: admin, history: recentCtx });
    const reply = await askGroq(sysP, message, history.slice(-10));
    res.json({ reply: reply || "I couldn't generate a response. Try again!" });
  } catch (e) { res.json({ reply: 'Error: ' + (e.message||'').slice(0,80) }); }
});

app.get("/api/user/:tgId", async (req, res) => {
  try { const user = await getUser(req.params.tgId); res.json(user || {}); }
  catch { res.json({}); }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const users = await getAllUsers(20);
    res.json(users.sort((a,b) => (b.credits||0) - (a.credits||0)).slice(0,10));
  } catch { res.json([]); }
});

// Mini App action endpoint — handles all bot actions from the webapp
app.post("/api/action", async (req, res) => {
  const { tg_id, action, data } = req.body || {};
  if (!tg_id || !action) { res.json({ ok: false, error: "Missing params" }); return; }
  const chatId = String(tg_id);

  try {
    if (action === "image") {
      const prompt = data?.prompt;
      if (!prompt) { res.json({ ok: false, error: "No prompt" }); return; }
      // Check credits
      const { canAfford, spend } = require("./lumeo_credits");
      const { isAdmin: isAdm } = require("./lumeo_personality");
      if (!isAdm(tg_id)) {
        const check = await canAfford(tg_id, "image");
        if (!check.canAfford) { res.json({ ok: false, error: "Not enough credits. Balance: " + check.balance }); return; }
      }
      res.json({ ok: true, message: "Generating image — check Telegram!" });
      setImmediate(async () => {
        try {
          const { generateImage } = require("./lumeo_ai");
          const { InputFile } = require("grammy");
          const buf = await generateImage(prompt);
          if (buf) {
            if (!isAdm(tg_id)) await spend(tg_id, "image");
            await bot.api.sendPhoto(chatId, new InputFile(buf, "lumeo_image.jpg"), { caption: prompt.slice(0,200) + " — Lumeo AI" });
          } else {
            await bot.api.sendMessage(chatId, "Image generation failed. Try again!");
          }
        } catch (e) { await bot.api.sendMessage(chatId, "Image error: " + e.message?.slice(0,80)).catch(() => {}); }
      });
      return;
    }

    if (action === "download") {
      const query = data?.query;
      if (!query) { res.json({ ok: false, error: "No query" }); return; }
      res.json({ ok: true, message: "Downloading — check Telegram!" });
      setImmediate(async () => {
        try {
          const { downloadMedia } = require("./lumeo_downloader");
          const { InputFile } = require("grammy");
          const isVid = /https?:\/\//i.test(query) && /youtube|tiktok|instagram|facebook/i.test(query);
          const result = await downloadMedia(query, isVid ? "video" : "music");
          if (!result?.success) { await bot.api.sendMessage(chatId, result?.error || "Download failed."); return; }
          if (result.videoBuf) {
            await bot.api.sendVideo(chatId, new InputFile(result.videoBuf, "video.mp4"), { caption: result.title || "Video" });
          } else if (result.audioBuf) {
            if (result.thumbBuf) await bot.api.sendPhoto(chatId, new InputFile(result.thumbBuf, "cover.jpg"), { caption: result.title || "" });
            await bot.api.sendAudio(chatId, new InputFile(result.audioBuf, "track.mp3"), { title: result.title || query, performer: "Lumeo AI" });
          }
          if (result.cleanup) result.cleanup();
        } catch (e) { await bot.api.sendMessage(chatId, "Download error: " + e.message?.slice(0,80)).catch(() => {}); }
      });
      return;
    }

    if (action === "voice") {
      const text = data?.text;
      if (!text) { res.json({ ok: false, error: "No text" }); return; }
      res.json({ ok: true, message: "Generating voice — check Telegram!" });
      setImmediate(async () => {
        try {
          const { generateVoice } = require("./lumeo_ai");
          const { InputFile } = require("grammy");
          const buf = await generateVoice(text);
          if (buf) await bot.api.sendAudio(chatId, new InputFile(buf, "voice.mp3"), { title: "Lumeo Voice Note", performer: "Lumeo AI" });
          else await bot.api.sendMessage(chatId, "Voice generation failed. Accept Orpheus terms at console.groq.com");
        } catch (e) { await bot.api.sendMessage(chatId, "Voice error.").catch(() => {}); }
      });
      return;
    }

    if (action === "pdf") {
      const { content: pdfContent, docType } = data || {};
      if (!pdfContent) { res.json({ ok: false, error: "No content" }); return; }
      res.json({ ok: true, message: "Creating PDF — check Telegram!" });
      setImmediate(async () => {
        try {
          const { createPDF } = require("./lumeo_pdf");
          const { InputFile } = require("grammy");
          const { askGroq } = require("./lumeo_ai");
          const title = (await askGroq("Return ONLY a 3-5 word title.", "Title for: " + pdfContent.slice(0,80), []) || "Document").trim();
          const result = await createPDF(pdfContent, title);
          if (result?.success) {
            await bot.api.sendDocument(chatId, new InputFile(result.buffer, result.filename || "document.pdf"), { caption: title + " — Lumeo AI" });
          } else { await bot.api.sendMessage(chatId, "PDF creation failed."); }
        } catch (e) { await bot.api.sendMessage(chatId, "PDF error.").catch(() => {}); }
      });
      return;
    }

    if (action === "screenshot") {
      const { convo, theme } = data || {};
      if (!convo) { res.json({ ok: false, error: "No conversation" }); return; }
      res.json({ ok: true, message: "Generating screenshot — check Telegram!" });
      setImmediate(async () => {
        try {
          const { generateWhatsAppScreenshot, parseScreenshotRequest } = require("./lumeo_screenshot");
          const { InputFile } = require("grammy");
          const { askGroq } = require("./lumeo_ai");
          const formatted = await askGroq("Format as WhatsApp conversation. Return ONLY lines: Name: message or Me: message", convo, []);
          const { messages, contact } = parseScreenshotRequest(formatted || convo);
          if (!messages.length) { await bot.api.sendMessage(chatId, "Invalid format. Use: Name: message"); return; }
          const result = await generateWhatsAppScreenshot(messages, { theme: theme || "dark", contact });
          if (result?.success) await bot.api.sendPhoto(chatId, new InputFile(result.buffer, "screenshot.png"), { caption: "WhatsApp Screenshot — Lumeo AI" });
          else await bot.api.sendMessage(chatId, "Screenshot failed.");
        } catch (e) { await bot.api.sendMessage(chatId, "Screenshot error.").catch(() => {}); }
      });
      return;
    }

    if (action === "sticker") {
      const text = data?.text;
      if (!text) { res.json({ ok: false, error: "No text" }); return; }
      res.json({ ok: true, message: "Creating sticker — check Telegram!" });
      // For text stickers, we generate an image of the text
      setImmediate(async () => {
        try {
          const { generateImage } = require("./lumeo_ai");
          const { InputFile } = require("grammy");
          const buf = await generateImage("Sticker with bold text saying: " + text + ", clean background, minimal design, high contrast");
          if (buf) await bot.api.sendPhoto(chatId, new InputFile(buf, "sticker_preview.jpg"), { caption: "Your sticker text: " + text });
          else await bot.api.sendMessage(chatId, "Sticker creation failed.");
        } catch {}
      });
      return;
    }

    res.json({ ok: false, error: "Unknown action: " + action });
  } catch (e) {
    res.json({ ok: false, error: e.message?.slice(0,100) });
  }
});

// Serve Mini App for any /app route
app.get("/app*", (req, res) => {
  res.sendFile(path.join(__dirname, "../webapp/index.html"), err => {
    if (err) { console.error("[MiniApp]", err.message); res.send("<h1>Lumeo AI Mini App</h1><p>Setting up...</p>"); }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("[Server] ✅ Port " + PORT));

// ─── Boot ─────────────────────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════╗");
console.log("║       LUMEO AI — Telegram v" + VERSION + "          ║");
console.log("║   Built by EMEMZYVISUALS DIGITALS        ║");
console.log("╠══════════════════════════════════════════╣");
console.log("║  🎨 Image gen (credits)                  ║");
console.log("║  🎬 Video gen (credits)                  ║");
console.log("║  🎵 Music, Voice, PDF — FREE             ║");
console.log("║  📥 Downloads — FREE                     ║");
console.log("║  ⭐ Stars payments                       ║");
console.log("║  🎮 Mini App                             ║");
console.log("╚══════════════════════════════════════════╝");

bot.api.setMyCommands([
  { command: "start",      description: "Start Lumeo AI" },
  { command: "image",      description: "Generate an image (3 credits)" },
  { command: "voice",      description: "Get a voice note reply" },
  { command: "download",   description: "Download music or video — FREE" },
  { command: "music",      description: "Generate music — FREE" },
  { command: "pdf",        description: "Create PDF document — FREE" },
  { command: "screenshot", description: "WhatsApp screenshot — FREE" },
  { command: "cv",         description: "Build a professional CV — FREE" },
  { command: "budget",     description: "Budget calculator — FREE" },
  { command: "scam",       description: "Check if something is a scam" },
  { command: "credits",    description: "Check your credit balance" },
  { command: "buy",        description: "Buy credits with Telegram Stars ⭐" },
  { command: "donate",     description: "Support Lumeo AI ❤️" },
  { command: "app",        description: "Open Lumeo Mini App 🎮" },
  { command: "clear",      description: "Clear conversation memory" },
  { command: "whoami",  description: "About Lumeo AI" },
  { command: "groupid", description: "Get this group ID" },
  { command: "myid",    description: "Get your Telegram user ID" },
  { command: "voiceon",    description: "Switch to voice note replies" },
  { command: "voiceoff",   description: "Switch back to text replies" },
  { command: "help",       description: "Show all commands" },
]).catch(() => {});

registerSetupCommands(bot);
setupCron();

// ─── Internal self-pinger — keeps Render free tier alive ──────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.MINI_APP_URL?.replace("/app", "") || "";
if (SELF_URL) {
  const pingModule = SELF_URL.startsWith("https") ? require("https") : require("http");
  setInterval(() => {
    try {
      const u = new URL(SELF_URL);
      pingModule.get({ hostname: u.hostname, path: "/", timeout: 8000 }, (res) => {
        res.resume();
        console.log("[Ping] Self-ping HTTP", res.statusCode);
      }).on("error", () => {});
    } catch {}
  }, 4 * 60 * 1000); // every 4 minutes
  console.log("[Ping] ✅ Self-pinger active →", SELF_URL);
} else {
  console.log("[Ping] Set RENDER_EXTERNAL_URL env var to enable self-ping");
}

bot.start({ onStart: () => console.log("[Bot] ✅ Lumeo AI is live on Telegram!") });
