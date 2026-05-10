/**
 * bot/lumeo_groups.js — Group Management System
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 *
 * Lumeo works differently in groups vs DMs:
 * - Only responds when @mentioned or replied to (not every message — avoids spam)
 * - Welcome new members with a personalized message
 * - Detects and warns about spam/scam patterns
 * - Per-group settings stored in Supabase
 * - Admin commands: mute, unmute, kick, pin, warn, ban
 * - Scheduled posts per group
 * - ALGIVIX DEV TEAM gets special dev-focused behavior
 */
"use strict";

require("dotenv").config();
const { askGroq }    = require("./lumeo_ai");
const { isAdmin }    = require("./lumeo_personality");
const { supaReq }    = require("./lumeo_db");

// ─── Known group configs ──────────────────────────────────────────────────────
// These are loaded from DB — in-memory cache
const _groupCache = new Map();

// Special group IDs from env
const ALGIVIX_ID = process.env.ALGIVIX_GROUP_ID || "";

// ─── Group settings from DB ───────────────────────────────────────────────────
async function getGroupSettings(chatId) {
  if (_groupCache.has(chatId)) return _groupCache.get(chatId);

  const defaults = {
    chat_id:        String(chatId),
    name:           "Group",
    welcome:        true,
    auto_moderate:  true,
    respond_to_all: false,   // If false, only replies when @mentioned or replied to
    language:       "english",
    personality:    "professional",  // 'professional' | 'casual' | 'dev' | 'muted'
    warn_spam:      true,
    daily_greeting: false,
    topic_focus:    null,   // e.g. "software development and programming"
  };

  // Try to load from DB
  try {
    const { supaReq: sr } = require("./lumeo_db");
    const data = await sr("GET", `/tg_groups?chat_id=eq.${chatId}&limit=1`);
    if (Array.isArray(data) && data[0]) {
      const merged = { ...defaults, ...data[0] };
      _groupCache.set(chatId, merged);
      return merged;
    }
  } catch {}

  _groupCache.set(chatId, defaults);
  return defaults;
}

async function saveGroupSettings(chatId, fields) {
  try {
    const { supaReq: sr } = require("./lumeo_db");
    await sr("POST", "/tg_groups", { chat_id: String(chatId), ...fields });
    // Update cache
    const current = _groupCache.get(chatId) || {};
    _groupCache.set(chatId, { ...current, ...fields });
  } catch {}
}

// ─── Warn tracker ─────────────────────────────────────────────────────────────
const _warns = new Map(); // `${chatId}_${userId}` → count

function addWarn(chatId, userId) {
  const key   = `${chatId}_${userId}`;
  const count = (_warns.get(key) || 0) + 1;
  _warns.set(key, count);
  return count;
}
function getWarns(chatId, userId) { return _warns.get(`${chatId}_${userId}`) || 0; }
function clearWarns(chatId, userId) { _warns.delete(`${chatId}_${userId}`); }

// ─── Should Lumeo respond? ────────────────────────────────────────────────────
function shouldRespond(ctx, settings) {
  const msg = ctx.message;
  if (!msg) return false;

  // Always respond if mentioned by username
  const botUsername = process.env.BOT_USERNAME || "LumeoAIBot";
  const text = msg.text || msg.caption || "";
  if (text.includes("@" + botUsername) || text.includes("@" + botUsername.toLowerCase())) return true;

  // Always respond if it's a direct reply to one of Lumeo's messages
  const replyTo = msg.reply_to_message;
  if (replyTo?.from?.is_bot && replyTo?.from?.username?.toLowerCase() === botUsername.toLowerCase()) return true;

  // If group is set to respond to all messages
  if (settings?.respond_to_all) return true;

  // Don't respond otherwise (too spammy)
  return false;
}

// ─── Clean mention from text ──────────────────────────────────────────────────
function cleanMention(text, botUsername) {
  return (text || "")
    .replace(new RegExp("@" + botUsername, "gi"), "")
    .replace(new RegExp("@" + botUsername.toLowerCase(), "gi"), "")
    .trim();
}

// ─── Welcome new member ───────────────────────────────────────────────────────
async function welcomeMember(ctx) {
  const members = ctx.message?.new_chat_members || [];
  if (!members.length) return;

  const settings = await getGroupSettings(ctx.chat.id);
  if (!settings.welcome) return;

  for (const member of members) {
    if (member.is_bot) continue; // Don't welcome bots
    const name  = member.first_name || "there";
    const group = ctx.chat.title || "this group";
    const msg   = await buildWelcome(name, group, settings);
    await ctx.reply(msg, { parse_mode: "Markdown" });
  }
}

async function buildWelcome(name, group, settings) {
  if (settings.personality === "dev" || group.toLowerCase().includes("algivix") || group.toLowerCase().includes("dev")) {
    return `Welcome to the team, **${name}**! 🚀\n\nYou've joined **${group}** — where builders build.\n\nI'm Lumeo AI, the group assistant. Mention me anytime with @LumeoAIBot for help, code reviews, tech questions, or just a chat.\n\nGlad to have you here. 🤝`;
  }
  return `Welcome **${name}** to **${group}**! 👋\n\nI'm Lumeo AI, the group assistant. Mention me with @LumeoAIBot anytime you need help.\n\nHope you enjoy your time here!`;
}

// ─── Spam/Scam detection ──────────────────────────────────────────────────────
const SCAM_PATTERNS = [
  /\b(free money|click here to earn|100% profit|guaranteed returns|investment opportunity|double your|crypto giveaway)\b/i,
  /(t\.me\/\+|join.*channel.*link|telegram.*group.*link)/i,
  /(\$\d+\s*(?:per day|daily|weekly)|earn.*from home|work from home.*\d+\$)/i,
];

function isSpam(text) {
  if (!text) return false;
  return SCAM_PATTERNS.some(p => p.test(text));
}

// ─── Group-aware system prompt ────────────────────────────────────────────────
function buildGroupPrompt(settings, groupName, isUserAdmin) {
  const isAlgivix = groupName?.toLowerCase().includes("algivix") || settings.personality === "dev";
  const topicCtx  = settings.topic_focus ? `\n\nGroup focus: ${settings.topic_focus}` : "";

  if (isAlgivix) {
    return `You are Lumeo AI, the assistant for the ALGIVIX DEV TEAM group — a software development team.
You were built by Emmanuel.A, CEO of EMEMZYVISUALS DIGITALS, who is in this group.

In this group:
- Speak like a senior developer — technical, precise, direct
- When someone shares code, review it thoughtfully
- Suggest better patterns, catch bugs, explain tradeoffs
- Share relevant tech news, tips, or best practices when appropriate
- Help coordinate tasks, answer architecture questions
- You can be casual and joke with the team — this is a dev team, not a board meeting
- Respond in English always
- Keep responses focused — don't pad with unnecessary text

You know: Node.js, React, Python, SQL, Supabase, HuggingFace, Groq, Tailwind, REST APIs, WhatsApp automation, Telegram bots, deployment on Render, Git workflow.${topicCtx}`;
  }

  const personMap = {
    professional: "professional and helpful. Speak clearly, stay on topic, be respectful.",
    casual:       "casual and friendly. Match the group's energy. Be warm and conversational.",
    muted:        "brief and minimal. Only respond when directly asked something. 1-2 sentences max.",
  };

  return `You are Lumeo AI, group assistant for "${groupName || "this group"}".
Personality: ${personMap[settings.personality] || personMap.professional}
Language: ${settings.language || "English"}.
Always respond in English unless the group explicitly uses another language.${topicCtx}

Rules:
- Stay on topic for the group
- Don't spam — be concise
- Be helpful, accurate, and professional
- If someone asks something off-topic, answer briefly and redirect`;
}

// ─── Group admin commands ─────────────────────────────────────────────────────
const GROUP_COMMANDS = {
  // /warn @user [reason]
  async warn(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can warn users."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to a message to warn that user."); return; }
    const reason = (ctx.match || "").replace(/@\w+\s?/, "").trim() || "No reason specified";
    const count  = addWarn(ctx.chat.id, target.id);
    await ctx.reply(`⚠️ **${target.first_name}** has been warned. (${count}/3)\n\nReason: ${reason}\n\n${count >= 3 ? "_3 warnings reached — consider removing this user._" : ""}`, { parse_mode: "Markdown" });
  },

  // /mute @user [duration in minutes]
  async mute(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can mute."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to a message to mute that user."); return; }
    const mins = parseInt((ctx.match || "").replace(/@\w+\s?/, "")) || 60;
    try {
      await ctx.restrictChatMember(target.id, {
        permissions: { can_send_messages: false },
        until_date:  Math.floor(Date.now()/1000) + mins * 60,
      });
      await ctx.reply(`🔇 **${target.first_name}** muted for ${mins} minute${mins !== 1 ? "s" : ""}.`, { parse_mode: "Markdown" });
    } catch (e) {
      await ctx.reply("❌ Couldn't mute — make sure I'm an admin with restrict permissions.");
    }
  },

  // /unmute @user
  async unmute(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can unmute."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to a message to unmute that user."); return; }
    try {
      await ctx.restrictChatMember(target.id, {
        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
      });
      await ctx.reply(`🔊 **${target.first_name}** unmuted.`, { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Couldn't unmute."); }
  },

  // /kick @user
  async kick(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can kick."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to a message to kick that user."); return; }
    try {
      await ctx.banChatMember(target.id);
      await ctx.unbanChatMember(target.id); // Unban so they can rejoin
      await ctx.reply(`👢 **${target.first_name}** was kicked from the group.`, { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Couldn't kick — check my admin permissions."); }
  },

  // /ban @user [reason]
  async ban(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can ban."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to a message to ban that user."); return; }
    const reason = (ctx.match || "").trim() || "No reason";
    try {
      await ctx.banChatMember(target.id);
      await ctx.reply(`🚫 **${target.first_name}** banned.\nReason: ${reason}`, { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Couldn't ban — check my admin permissions."); }
  },

  // /clearwarns @user
  async clearwarns(ctx, bot) {
    if (!await isChatAdmin(ctx, ctx.from.id)) { await ctx.reply("Only group admins can clear warns."); return; }
    const target = ctx.message?.reply_to_message?.from;
    if (!target) { await ctx.reply("Reply to the user whose warns you want to clear."); return; }
    clearWarns(ctx.chat.id, target.id);
    await ctx.reply(`✅ Warnings cleared for **${target.first_name}**.`, { parse_mode: "Markdown" });
  },

  // /groupset [setting] [value]
  async groupset(ctx, bot) {
    if (!isAdmin(ctx.from.id) && !await isChatAdmin(ctx, ctx.from.id)) {
      await ctx.reply("Only group admins can change settings."); return;
    }
    const args   = (ctx.match || "").trim().split(" ");
    const key    = args[0]?.toLowerCase();
    const value  = args.slice(1).join(" ");
    const chatId = ctx.chat.id;

    const settingMap = {
      welcome:        (v) => ({ welcome: v === "on" }),
      moderate:       (v) => ({ auto_moderate: v === "on" }),
      respondall:     (v) => ({ respond_to_all: v === "on" }),
      personality:    (v) => ({ personality: ["professional","casual","dev","muted"].includes(v) ? v : null }),
      topic:          (v) => ({ topic_focus: v || null }),
      dailygreeting:  (v) => ({ daily_greeting: v === "on" }),
    };

    if (!key || !settingMap[key]) {
      await ctx.reply(
        `*Group Settings*\n\n\`/groupset welcome on|off\` — Welcome new members\n\`/groupset moderate on|off\` — Auto spam detection\n\`/groupset respondall on|off\` — Reply to every message\n\`/groupset personality professional|casual|dev|muted\`\n\`/groupset topic [topic]\` — Set group focus\n\`/groupset dailygreeting on|off\` — Daily group message`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const update = settingMap[key](value);
    if (update && !Object.values(update).includes(null)) {
      await saveGroupSettings(chatId, update);
      await ctx.reply(`✅ \`${key}\` updated to \`${value}\``, { parse_mode: "Markdown" });
    } else {
      await ctx.reply("❌ Invalid value. Check the command options.");
    }
  },

  // /groupstats
  async groupstats(ctx, bot) {
    const settings = await getGroupSettings(ctx.chat.id);
    const chat     = ctx.chat;
    let memberCount = "?";
    try { memberCount = await ctx.getChatMemberCount(); } catch {}

    await ctx.reply(
      `*Group Info*\n\n` +
      `Name: ${chat.title}\n` +
      `Members: ${memberCount}\n` +
      `Type: ${chat.type}\n\n` +
      `*Lumeo Settings*\n` +
      `Personality: ${settings.personality}\n` +
      `Welcome: ${settings.welcome ? "on" : "off"}\n` +
      `Auto-moderate: ${settings.auto_moderate ? "on" : "off"}\n` +
      `Respond to all: ${settings.respond_to_all ? "on" : "off"}\n` +
      `Topic: ${settings.topic_focus || "none"}\n` +
      `Daily greeting: ${settings.daily_greeting ? "on" : "off"}`,
      { parse_mode: "Markdown" }
    );
  },
};

// ─── Check if user is chat admin ──────────────────────────────────────────────
async function isChatAdmin(ctx, userId) {
  if (isAdmin(userId)) return true; // Bot owner is always admin
  try {
    const member = await ctx.getChatMember(userId);
    return ["administrator","creator"].includes(member.status);
  } catch { return false; }
}

// ─── Handle group message ─────────────────────────────────────────────────────
async function handleGroupMessage(ctx, bot) {
  const msg      = ctx.message;
  const chatId   = ctx.chat.id;
  const text     = msg?.text || msg?.caption || "";
  const settings = await getGroupSettings(chatId);
  const botUsername = process.env.BOT_USERNAME || "LumeoAIBot";
  const groupName   = ctx.chat?.title || "Group";

  // ── New member join ──────────────────────────────────────────────────────
  if (msg?.new_chat_members) {
    await welcomeMember(ctx);
    return;
  }

  // ── Spam detection ───────────────────────────────────────────────────────
  if (settings.auto_moderate && text && isSpam(text)) {
    const warns = addWarn(chatId, ctx.from.id);
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(
      `⚠️ @${ctx.from.username || ctx.from.first_name} — that message was flagged as potential spam and removed. (Warning ${warns}/3)`,
    );
    return;
  }

  // ── Should Lumeo respond? ────────────────────────────────────────────────
  if (!shouldRespond(ctx, settings)) return;

  // ── Build response ───────────────────────────────────────────────────────
  const cleanText = cleanMention(text, botUsername);
  if (!cleanText) { await ctx.reply("Yes? How can I help?"); return; }

  // Check for special commands within mention
  if (/^help$/i.test(cleanText)) {
    await ctx.reply(
      `*Lumeo AI — Group Commands*\n\n` +
      `Mention me or reply to get help.\n\n` +
      `@${botUsername} [question] — ask anything\n` +
      `@${botUsername} summarize — summarize last discussion\n` +
      `@${botUsername} translate [text] — translate to English\n` +
      `@${botUsername} code review — review replied code\n` +
      `@${botUsername} explain — explain a concept\n\n` +
      `*Admin Commands*\n` +
      `/warn — warn a user (reply to their message)\n` +
      `/mute [minutes] — mute a user\n` +
      `/kick — remove a user\n` +
      `/groupset — configure Lumeo's behavior\n` +
      `/groupstats — group information`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Code review — if replying to a code message
  if (/code review|review (this|the) code/i.test(cleanText)) {
    const replyText = msg?.reply_to_message?.text || "";
    if (replyText) {
      await ctx.api.sendChatAction(chatId, "typing");
      const review = await askGroq(
        "You are an expert code reviewer. Review this code thoroughly. Check for: bugs, security issues, performance, best practices, readability. Be specific with line references where possible. Format with Markdown.",
        `Code to review:\n\`\`\`\n${replyText}\n\`\`\``,
        []
      );
      await ctx.reply(review || "Couldn't review — make sure the code is in the replied message.", { parse_mode: "Markdown" });
      return;
    }
  }

  // Summarize recent messages — hard but doable with context
  if (/^summarize$/i.test(cleanText)) {
    await ctx.reply("_Summarizing recent discussion..._", { parse_mode: "Markdown" });
    const summary = await askGroq(
      `You are summarizing a group chat discussion in "${groupName}". Give a concise 3-5 bullet point summary of what was being discussed. Be neutral and accurate.`,
      "Please provide a discussion summary for this group — I don't have the full message history, but summarize based on what you know about active group conversations.",
      []
    );
    await ctx.reply(summary || "Couldn't summarize — I need context from the conversation.", { parse_mode: "Markdown" });
    return;
  }

  // General response
  await ctx.api.sendChatAction(chatId, "typing");
  const sysPrompt = buildGroupPrompt(settings, groupName, false);
  const reply = await askGroq(sysPrompt, cleanText, []);
  if (reply) {
    await ctx.reply(reply, { parse_mode: "Markdown" });
  }
}

// ─── Daily group greeting (called by cron) ────────────────────────────────────
async function sendDailyGroupGreeting(bot, chatId, groupName) {
  const settings = await getGroupSettings(chatId);
  if (!settings.daily_greeting) return;

  const isAlgivix = groupName?.toLowerCase().includes("algivix") || settings.personality === "dev";
  const h = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false });
  const hour = parseInt(h);
  const greeting = hour < 12 ? "morning" : "afternoon";

  let msg;
  if (isAlgivix) {
    const tips = [
      `Good ${greeting} team! Daily tip: Always validate inputs on the server side, never trust the client. 💻`,
      `Good ${greeting} devs! Remember: premature optimization is the root of all evil. Build it right first, optimize later. 🚀`,
      `Good ${greeting} team! Code review culture matters. A second pair of eyes catches what you can't see. 👀`,
      `Good ${greeting}! Today's reminder: commit early, commit often. Small PRs are easier to review than big ones. 🔀`,
      `Good ${greeting} team! Read error messages carefully. 80% of bugs solve themselves when you actually read the error. 🐛`,
    ];
    msg = tips[Math.floor(Math.random() * tips.length)];
  } else {
    msg = `Good ${greeting} everyone! 👋 Lumeo AI here — mention me @LumeoAIBot anytime you need help. Have a productive day!`;
  }

  try {
    await bot.api.sendMessage(chatId, msg);
  } catch (e) {
    console.error(`[Groups] Daily greeting failed for ${chatId}:`, e.message);
  }
}

module.exports = {
  getGroupSettings, saveGroupSettings,
  handleGroupMessage, welcomeMember,
  shouldRespond, cleanMention, isChatAdmin,
  GROUP_COMMANDS, sendDailyGroupGreeting,
  addWarn, getWarns, clearWarns, isSpam,
};
