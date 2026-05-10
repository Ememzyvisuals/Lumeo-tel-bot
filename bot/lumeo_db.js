/**
 * bot/lumeo_db.js — Supabase Database Layer
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";

require("dotenv").config();
const https = require("https");

const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || "";

function supaReq(method, path, body = null) {
  return new Promise((resolve) => {
    if (!SUPA_URL || !SUPA_KEY) return resolve(null);
    try {
      const u    = new URL(SUPA_URL + "/rest/v1" + path);
      const data = body ? JSON.stringify(body) : null;
      const req  = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method,
        headers: {
          "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY,
          "Content-Type": "application/json",
          "Prefer": method === "POST" ? "return=minimal" : "return=representation",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
        timeout: 5000,
      }, (res) => {
        let raw = "";
        res.on("data", c => raw += c);
        res.on("end", () => { try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); } });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
      if (data) req.write(data);
      req.end();
    } catch { resolve(null); }
  });
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function getUser(tgId) {
  const data = await supaReq("GET", `/tg_users?tg_id=eq.${tgId}&limit=1`);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function upsertUser(user) {
  return supaReq("POST", "/tg_users", user);
}

async function updateUser(tgId, fields) {
  return supaReq("PATCH", `/tg_users?tg_id=eq.${tgId}`, fields);
}

async function getAllUsers(limit = 1000) {
  const data = await supaReq("GET", `/tg_users?select=tg_id,username,first_name,credits,banned&limit=${limit}`);
  return Array.isArray(data) ? data : [];
}

// ─── Credits ──────────────────────────────────────────────────────────────────
async function getCredits(tgId) {
  const user = await getUser(tgId);
  return user?.credits ?? 0;
}

async function deductCredits(tgId, amount) {
  const user = await getUser(tgId);
  if (!user) return false;
  const newBal = Math.max(0, (user.credits || 0) - amount);
  await updateUser(tgId, { credits: newBal });
  return newBal;
}

async function addCredits(tgId, amount) {
  const user = await getUser(tgId);
  if (!user) return false;
  const newBal = (user.credits || 0) + amount;
  await updateUser(tgId, { credits: newBal });
  return newBal;
}

// ─── Memory ───────────────────────────────────────────────────────────────────
async function saveMemory(tgId, role, content) {
  return supaReq("POST", "/tg_memory", { tg_id: String(tgId), role, content: String(content).slice(0, 2000) });
}

async function getMemory(tgId, limit = 30) {
  const data = await supaReq("GET", `/tg_memory?tg_id=eq.${tgId}&order=created_at.desc&limit=${limit}`);
  if (!Array.isArray(data)) return [];
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return data.filter(m => new Date(m.created_at).getTime() > cutoff).reverse();
}

async function clearMemory(tgId) {
  return supaReq("DELETE", `/tg_memory?tg_id=eq.${tgId}`);
}

// ─── Transactions ─────────────────────────────────────────────────────────────
async function saveTransaction(tx) {
  return supaReq("POST", "/tg_transactions", tx);
}

async function getTransactions(tgId) {
  const data = await supaReq("GET", `/tg_transactions?tg_id=eq.${tgId}&order=created_at.desc&limit=20`);
  return Array.isArray(data) ? data : [];
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
async function saveCampaign(c) {
  return supaReq("POST", "/tg_campaigns", c);
}

module.exports = {
  supaReq,
  getUser, upsertUser, updateUser, getAllUsers,
  getCredits, deductCredits, addCredits,
  saveMemory, getMemory, clearMemory,
  saveTransaction, getTransactions,
  saveCampaign,
};
