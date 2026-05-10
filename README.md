# 🤖 Lumeo AI — Telegram Bot

> A full-featured AI assistant for Telegram with image generation, media downloads, voice notes, PDF creation, group management, a Mini App with games, and a Telegram Stars payment system.
>
> Built by **Emmanuel.A** — CEO, [EMEMZYVISUALS DIGITALS](mailto:ememzyvisualsdigitals@gmail.com)

[![Deploy on Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![Grammy](https://img.shields.io/badge/Grammy-1.26-blue)](https://grammy.dev)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## What Lumeo can do

### Free for everyone
| Feature | Command |
|---|---|
| AI chat with persistent memory | Just type anything |
| Music download with cover art + lyrics | `/download Rema Calm Down` |
| Video download (YouTube, TikTok, Instagram, Facebook, Twitter) | `/download https://...` |
| AI voice notes (male voice, Groq Orpheus TTS) | `/voice Hello there!` |
| AI music generation (HuggingFace MusicGen) | `/music upbeat Afrobeats track` |
| Professional PDF creator (receipt, CV, letter, certificate, exam) | `/pdf invoice for ₦80,000 web design` |
| WhatsApp-style screenshot generator | `/screenshot John: Hey! Me: Hi!` |
| CV / Resume builder | `/cv Full-Stack Developer, 3 years experience` |
| Budget & expense calculator | `/budget income ₦150k rent ₦40k food ₦25k` |
| Scam & fraud detector | `/scam [suspicious message]` |
| Image analysis (send any photo) | Send a photo |
| Voice note transcription (send voice) | Send a voice note |
| File analysis (code, text, PDF) | Send any file |

### Credit-based (image & video only)
| Feature | Cost |
|---|---|
| AI image generation (FLUX.1-schnell) | 3 credits |
| AI video generation | 8 credits |

New users receive **20 free credits** automatically on `/start`.

### Group management
| Feature | How |
|---|---|
| Responds when @mentioned or replied to | Mention the bot |
| Welcomes new members | Automatic |
| Spam/scam detection | Automatic |
| Warn users | `/warn` (reply to message) |
| Mute users | `/mute 60` (reply to message) |
| Kick/ban users | `/kick` or `/ban` |
| Configure bot behavior | `/groupset personality dev` |
| ALGIVIX DEV TEAM mode | Auto-detected by group name |

### Admin only (bot owner)
| Feature | Command |
|---|---|
| Broadcast to all users | `/broadcast [message]` |
| Marketing campaign | `/promote [project description]` |
| Email outreach | `/email client@company.com about [project]` |
| Bot statistics | `/stats` |

### Mini App
Open with `/app` or the menu button:
- **Home** — Quick action tiles
- **Chat** — Full AI conversation with typing indicators
- **Tools** — Image generator, downloader, voice, PDF, sticker maker, screenshot
- **Games** — Tic-Tac-Toe (vs unbeatable AI), Memory Match (4×4 and 6×6), Snake, Number Blitz, Word Scramble, Reflex Test
- **Store** — Donate Stars, buy credit packages
- **Profile** — Account info and settings

---

## Tech Stack

| Layer | Technology |
|---|---|
| Bot framework | [Grammy](https://grammy.dev/) v1.26 |
| AI chat + vision | Groq API (LLaMA 4 Scout) |
| Image generation | HuggingFace FLUX.1-schnell |
| Voice (TTS) | Groq Orpheus `canopylabs/orpheus-v1-english` — male voice |
| Audio transcription | Groq Whisper large-v3-turbo |
| Music generation | HuggingFace MusicGen Stereo Small |
| Media downloads | @distube/ytdl-core + Cobalt API + yt-dlp (SoundCloud) |
| PDF generation | PDFKit |
| Screenshot generation | Sharp (SVG → PNG) |
| Database + memory | Supabase (PostgreSQL, REST API) |
| Payments | Telegram Stars (native) |
| Mini App | Vanilla JS, Nunito + Syne + JetBrains Mono fonts |
| Scheduled jobs | node-cron (WAT timezone) |
| Hosting | Render.com |
| Email outreach | Nodemailer + Gmail SMTP |

---

## Project Structure

```
lumeo-telegram/
├── bot/
│   ├── index.js              # Main entry: all commands, handlers, Express server
│   ├── lumeo_ai.js           # Groq + HuggingFace: chat, TTS, image, music, vision
│   ├── lumeo_db.js           # Supabase database layer
│   ├── lumeo_credits.js      # Credits system + Telegram Stars payments
│   ├── lumeo_handlers.js     # All command handlers (image, voice, download, etc.)
│   ├── lumeo_groups.js       # Group management, moderation, welcome, anti-spam
│   ├── lumeo_personality.js  # System prompts, character, admin detection
│   ├── lumeo_setup_guide.js  # /myid, /groupid, /whoami helper commands
│   ├── lumeo_downloader.js   # Multi-platform media downloader
│   ├── lumeo_pdf.js          # PDF generation (6 document templates)
│   └── lumeo_screenshot.js   # WhatsApp-style screenshot generator
├── webapp/
│   └── index.html            # Telegram Mini App (single file, no build step)
├── supabase_setup.sql        # Run this in Supabase SQL Editor before deploying
├── render.yaml               # Render deployment configuration
├── package.json
├── .env.example              # All environment variables with descriptions
├── .gitignore
└── README.md
```

---

## Self-Hosting Guide

### Prerequisites
- Node.js 18 or higher
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- A Groq API key (from [console.groq.com](https://console.groq.com))
- A HuggingFace account and API token
- A Supabase project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/Ememzyvisuals/Lumeo-tel-bot.git
cd Lumeo-tel-bot
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Paste the full contents of `supabase_setup.sql` and click **Run**
4. Copy your **Project URL** and **service_role key** from Settings → API

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your values:

```env
# Required
BOT_TOKEN=your_bot_token_from_botfather
ADMIN_IDS=your_telegram_user_id
GROQ_API_KEY=gsk_...
HF_TOKEN=hf_...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...
BOT_USERNAME=YourBotUsername

# Optional
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
HF_TOKEN_2=hf_...
HF_TOKEN_3=hf_...
EMAIL_USER=your@gmail.com
EMAIL_PASS=gmail_app_password_16_chars
GENIUS_KEY=genius_api_client_access_token
CHANNEL_ID=@yourchannel
ALGIVIX_GROUP_ID=-100xxxxxxxxxx
EXTRA_GROUP_IDS=-100xxxxxxxxxx,-100xxxxxxxxxx
MINI_APP_URL=https://your-deployment-url.onrender.com/app
PORT=3000
YTDL_NO_UPDATE=1
```

### 4. Get your Telegram User ID (ADMIN_IDS)

Message [@userinfobot](https://t.me/userinfobot) on Telegram. It replies with your user ID.

### 5. Run locally

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

### 6. Get Group IDs

After the bot is running:
1. Add the bot to your group and make it admin
2. Send `/groupid` in the group
3. Copy the ID from the bot's reply and add to your `.env`

### 7. Enable Voice Notes

Go to [console.groq.com](https://console.groq.com) → find `canopylabs/orpheus-v1-english` → Accept Terms of Service. Without this, voice notes will silently fail with a 400 error.

---

## Deploy to Render

### One-click from GitHub

1. Fork this repo
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your forked repo
4. Render reads `render.yaml` automatically
5. Add all environment variables in the Render dashboard
6. Click **Create Web Service**

The `render.yaml` build command automatically installs `yt-dlp` via pip3 for media downloads alongside the npm dependencies.

### Keep alive (free tier)

Render's free tier spins down after 15 minutes of inactivity. To keep it alive:

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free)
2. Create an HTTP monitor pointing to `https://your-service.onrender.com`
3. Set interval to 5 minutes

Or upgrade to Render's Starter plan ($7/month) for always-on service.

---

## Configure the Mini App

After deployment:

1. Open [@BotFather](https://t.me/BotFather) → `/mybots` → your bot
2. **Bot Settings** → **Menu Button** → **Configure menu button**
3. URL: `https://your-service.onrender.com/app`
4. Button text: `Open Lumeo App`

---

## Credit Packages (Telegram Stars)

| Package | Stars | Credits | Notes |
|---|---|---|---|
| Starter | 25 ⭐ | 30 cr | — |
| Popular | 75 ⭐ | 100 cr | Best value |
| Pro | 150 ⭐ | 220 cr | +47 bonus |
| Ultimate | 300 ⭐ | 500 cr | +200 bonus |

Users can also **donate Stars** to support the bot — they receive 1 bonus credit per 5 stars donated.

Credits cost:
- Image generation: 3 credits
- Video generation: 8 credits
- Everything else: FREE

---

## Scheduled Auto-Posts (Cron)

All times in **WAT (Africa/Lagos, UTC+1)**:

| Time | Content |
|---|---|
| 7:00 AM | Morning message to Telegram channel |
| 12:00 PM | AI-generated image posted to channel |
| 6:00 PM | Tech tip or insight posted to channel |
| 8:00 AM | Daily greeting to configured groups |

Requires `CHANNEL_ID` and/or group IDs to be set.

---

## Group Management

### How Lumeo behaves in groups

By default, Lumeo **only responds when @mentioned or replied to**. This prevents spam in active groups.

Configure with `/groupset`:

```
/groupset personality dev         → Developer-focused mode (for coding groups)
/groupset personality casual      → Friendly and casual
/groupset personality professional → (default) Clear and professional
/groupset personality muted       → Minimal — only when directly asked
/groupset welcome on|off          → Toggle welcome messages for new members
/groupset moderate on|off         → Toggle auto spam detection
/groupset respondall on|off       → Reply to every message (use carefully)
/groupset topic software development → Set the group's focus topic
/groupset dailygreeting on|off    → Daily morning message to this group
```

### ALGIVIX DEV TEAM mode

When Lumeo detects the group name contains "algivix" or `ALGIVIX_GROUP_ID` matches, he switches to senior developer mode:
- Technical, precise language
- Automatic code review when code is shared
- Architecture and best practices advice
- Knows the full EMEMZYVISUALS DIGITALS stack

### Moderation commands (group admins only)

```
/warn              → Warn a user (reply to their message)
/mute 60           → Mute for 60 minutes (reply to their message)
/unmute            → Unmute a user
/kick              → Remove from group (can rejoin)
/ban [reason]      → Permanently ban
/clearwarns        → Clear all warnings for a user
/groupstats        → Show group info and Lumeo settings
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Bot not responding | Check Render logs for startup errors |
| Token invalid error | Re-copy token from BotFather, no spaces or newlines |
| Voice notes return error | Accept Orpheus terms at console.groq.com |
| Images fail to generate | Verify HF_TOKEN at huggingface.co/settings/tokens |
| Supabase connection error | Confirm supabase_setup.sql was run, check URL and key |
| Bot goes offline | Add UptimeRobot monitor or upgrade to Render paid |
| Can't get group ID | Bot must be IN the group before /groupid works |
| Email sending fails | Enable Gmail 2FA first, use App Password not regular password |
| Downloads fail | yt-dlp is installed by render.yaml build command automatically |
| Mini App not loading | Set MINI_APP_URL to your actual Render URL |

---

## API Reference

The bot exposes a small HTTP API used by the Mini App:

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | GET | Health check — returns "Lumeo AI vX.X — ONLINE" |
| `GET /api/user/:tgId` | GET | Get user info and credits |
| `GET /api/leaderboard` | GET | Top 10 users by credits |
| `POST /api/chat` | POST | In-app chat endpoint used by Mini App |

---

## Contributing

This is a private project by EMEMZYVISUALS DIGITALS. If you fork it:

1. Keep attribution to EMEMZYVISUALS DIGITALS in the codebase and README
2. Do not impersonate the original bot or use the same branding
3. Change the bot name and contact details to your own

---

## License

© 2025 EMEMZYVISUALS DIGITALS. All rights reserved.

Built by **Emmanuel.A** | CEO, EMEMZYVISUALS DIGITALS
📧 ememzyvisualsdigitals@gmail.com
📞 +234 904 711 5612
🐙 [github.com/Ememzyvisuals](https://github.com/Ememzyvisuals)

---

*Lumeo AI — Intelligent. Personal. Built Nigerian.*
