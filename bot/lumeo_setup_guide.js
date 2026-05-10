/**
 * bot/lumeo_setup_guide.js — ID Discovery Helper
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 *
 * This registers a /myid command and a /groupid command
 * so you can discover your Telegram user ID and group IDs
 * directly from Telegram without any external tools.
 */
"use strict";

function registerSetupCommands(bot) {

  // /myid — tells you your personal Telegram user ID
  bot.command("myid", async (ctx) => {
    const id       = ctx.from?.id;
    const username = ctx.from?.username ? `@${ctx.from.username}` : "no username set";
    const name     = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
    const isGroup  = ctx.chat?.type !== "private";

    await ctx.reply(
      `*Your Telegram Info*\n\n` +
      `User ID: \`${id}\`\n` +
      `Name: ${name}\n` +
      `Username: ${username}\n` +
      (isGroup ? `\nChat ID: \`${ctx.chat?.id}\`\nChat Name: ${ctx.chat?.title}` : ""),
      { parse_mode: "Markdown" }
    );

    // Also log to Render console
    console.log(`[Setup] /myid → User: ${id} (${name} / ${username})`);
  });

  // /groupid — use this inside any group to get its ID
  bot.command("groupid", async (ctx) => {
    const chatId   = ctx.chat?.id;
    const chatName = ctx.chat?.title || "Unknown";
    const chatType = ctx.chat?.type || "unknown";

    if (ctx.chat?.type === "private") {
      await ctx.reply(
        `This command is for groups.\n\nAdd me to a group, then send \`/groupid\` there to see the group's ID.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      `*Group Info*\n\n` +
      `Group Name: ${chatName}\n` +
      `Group ID: \`${chatId}\`\n` +
      `Type: ${chatType}\n\n` +
      `Copy this ID and set it in your Render environment:\n` +
      `\`ALGIVIX_GROUP_ID=${chatId}\`\n\n` +
      `_(This message will self-destruct in your memory 😄)_`,
      { parse_mode: "Markdown" }
    );

    console.log(`[Setup] /groupid → Group: "${chatName}" ID: ${chatId}`);
  });

  // /whoami — Lumeo explains himself
  bot.command("whoami", async (ctx) => {
    await ctx.reply(
      `I'm **Lumeo AI** — version 3.0\n\n` +
      `Built by **Emmanuel.A**\n` +
      `CEO, *EMEMZYVISUALS DIGITALS*\n\n` +
      `📧 ememzyvisualsdigitals@gmail.com\n` +
      `📞 +234 904 711 5612\n\n` +
      `I'm a natural language AI assistant living on Telegram. I handle chat, image generation, media downloads, voice notes, PDFs, group moderation, marketing campaigns and more.\n\n` +
      `I was built with:\n` +
      `• Groq API (LLaMA 4 Scout + Orpheus TTS)\n` +
      `• HuggingFace (FLUX image + MusicGen)\n` +
      `• Grammy (Telegram bot framework)\n` +
      `• Supabase (database + memory)\n` +
      `• Node.js on Render\n\n` +
      `_Always remember where you came from — EMEMZYVISUALS DIGITALS 🚀_`,
      { parse_mode: "Markdown" }
    );
  });
}

module.exports = { registerSetupCommands };
