-- ════════════════════════════════════════════════════════════
-- LUMEO AI — Telegram Bot Database Schema
-- EMEMZYVISUALS DIGITALS | Emmanuel.A
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════

-- Users
CREATE TABLE IF NOT EXISTS tg_users (
  tg_id       TEXT PRIMARY KEY,
  username    TEXT,
  first_name  TEXT,
  last_name   TEXT,
  credits     INTEGER DEFAULT 20,
  banned      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation memory
CREATE TABLE IF NOT EXISTS tg_memory (
  id         BIGSERIAL PRIMARY KEY,
  tg_id      TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tg_memory_user ON tg_memory(tg_id, created_at DESC);

-- Credit transactions
CREATE TABLE IF NOT EXISTS tg_transactions (
  id           BIGSERIAL PRIMARY KEY,
  tg_id        TEXT NOT NULL,
  type         TEXT,       -- 'spend' | 'purchase' | 'donation'
  action       TEXT,       -- 'image' | 'stars_popular' etc.
  amount       INTEGER,
  stars_paid   INTEGER,
  balance_after INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Marketing campaigns
CREATE TABLE IF NOT EXISTS tg_campaigns (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT DEFAULT 'telegram',
  project     TEXT,
  sent        INTEGER DEFAULT 0,
  failed      INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE tg_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_memory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_campaigns    ENABLE ROW LEVEL SECURITY;

-- service_role has full access (bot uses service key)
CREATE POLICY "svc_tg_users"   ON tg_users        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc_tg_memory"  ON tg_memory       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc_tg_tx"      ON tg_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc_tg_camp"    ON tg_campaigns    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon key blocked
CREATE POLICY "block_anon_users"  ON tg_users        FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_mem"    ON tg_memory       FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_tx"     ON tg_transactions FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_camp"   ON tg_campaigns    FOR ALL TO anon USING (false);

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'tg_%';

-- Group settings (added for group management)
CREATE TABLE IF NOT EXISTS tg_groups (
  chat_id        TEXT PRIMARY KEY,
  name           TEXT,
  welcome        BOOLEAN DEFAULT TRUE,
  auto_moderate  BOOLEAN DEFAULT TRUE,
  respond_to_all BOOLEAN DEFAULT FALSE,
  language       TEXT DEFAULT 'english',
  personality    TEXT DEFAULT 'professional',
  warn_spam      BOOLEAN DEFAULT TRUE,
  daily_greeting BOOLEAN DEFAULT FALSE,
  topic_focus    TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tg_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_tg_groups" ON tg_groups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "block_anon_groups" ON tg_groups FOR ALL TO anon USING (false);
