/**
 * bot/lumeo_credits.js — Credits & Telegram Stars System
 * EMEMZYVISUALS DIGITALS | Emmanuel.A
 */
"use strict";

const { getCredits, deductCredits, addCredits, saveTransaction } = require("./lumeo_db");

// ─── Credit costs ─────────────────────────────────────────────────────────────
// Only image and video generation cost credits — everything else is FREE
const COSTS = {
  image:  3,   // per image generation
  video:  8,   // per video generation
  // Everything else (music, voice, pdf, screenshot, sticker, downloads) = FREE
};

// ─── Stars → Credits packages ─────────────────────────────────────────────────
const PACKAGES = [
  { id: "starter",  stars: 25,  credits: 30,  label: "Starter",   badge: "" },
  { id: "popular",  stars: 75,  credits: 100, label: "Popular",   badge: "🔥 Best Value" },
  { id: "pro",      stars: 150, credits: 220, label: "Pro",       badge: "⚡ +47 Bonus" },
  { id: "ultimate", stars: 300, credits: 500, label: "Ultimate",  badge: "💎 +200 Bonus" },
];

// ─── Free credits for new users ───────────────────────────────────────────────
const FREE_CREDITS = 20;

// ─── Check + deduct ───────────────────────────────────────────────────────────
async function canAfford(tgId, action) {
  const cost    = COSTS[action] || 1;
  const balance = await getCredits(tgId);
  return { canAfford: balance >= cost, balance, cost };
}

async function spend(tgId, action) {
  const cost = COSTS[action] || 1;
  const bal  = await deductCredits(tgId, cost);
  if (bal === false) return { success: false };
  await saveTransaction({ tg_id: String(tgId), type: "spend", action, amount: -cost, balance_after: bal }).catch(() => {});
  return { success: true, balance: bal, cost };
}

// ─── Process Stars payment ────────────────────────────────────────────────────
async function processStarsPayment(tgId, starsAmount, packageId) {
  const pkg = PACKAGES.find(p => p.id === packageId);
  if (!pkg) return { success: false, error: "Invalid package" };
  if (starsAmount < pkg.stars) return { success: false, error: "Insufficient stars" };

  const newBal = await addCredits(tgId, pkg.credits);
  await saveTransaction({ tg_id: String(tgId), type: "purchase", action: "stars_" + packageId, amount: pkg.credits, stars_paid: starsAmount, balance_after: newBal }).catch(() => {});
  return { success: true, credits: pkg.credits, balance: newBal, pkg };
}

// ─── Process donation ─────────────────────────────────────────────────────────
async function processDonation(tgId, starsAmount) {
  // Donors get 1 credit per 5 stars donated as a thank-you
  const bonusCredits = Math.floor(starsAmount / 5);
  let newBal = await getCredits(tgId);
  if (bonusCredits > 0) {
    newBal = await addCredits(tgId, bonusCredits);
  }
  await saveTransaction({ tg_id: String(tgId), type: "donation", action: "donate", amount: bonusCredits, stars_paid: starsAmount, balance_after: newBal }).catch(() => {});
  return { success: true, bonusCredits, balance: newBal };
}

// ─── Build invoice payload ────────────────────────────────────────────────────
function buildInvoice(pkg) {
  return {
    title:          `${pkg.label} Pack — ${pkg.credits} Credits`,
    description:    `Get ${pkg.credits} Lumeo AI credits${pkg.badge ? " • " + pkg.badge : ""}. Use for image generation, voice notes, PDFs and more!`,
    payload:        JSON.stringify({ type: "credits", packageId: pkg.id }),
    currency:       "XTR",  // Telegram Stars currency code
    prices:         [{ label: pkg.label + " Credits", amount: pkg.stars }],
    start_parameter: "buy_" + pkg.id,
  };
}

function buildDonationInvoice(amount = 10) {
  return {
    title:       "Support Lumeo AI ❤️",
    description: "Help keep Lumeo AI running! Every star keeps the lights on. You'll receive bonus credits as a thank-you 🙏",
    payload:     JSON.stringify({ type: "donation" }),
    currency:    "XTR",
    prices:      [{ label: "Donation", amount }],
    start_parameter: "donate",
  };
}

module.exports = { COSTS, PACKAGES, FREE_CREDITS, canAfford, spend, processStarsPayment, processDonation, buildInvoice, buildDonationInvoice };
