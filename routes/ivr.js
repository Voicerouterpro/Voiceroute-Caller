// routes/ivr.js
// ─────────────────────────────────────────────────────────────
//  MEDUSA — SignalWire IVR Webhooks
//
//  Call Flow:
//  1. /ivr/welcome       → Greeting + "Press 1 for account info"
//  2. /ivr/menu          → Pressed 1 → ask for Account Number
//  3. /ivr/verify-account → Account found → ask for PIN
//  4. /ivr/verify-pin    → PIN correct → play all messages
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const store = require('../config/store');

// In-memory session store (callSid → session data)
const sessions = {};

function xml(res, body) {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`);
}

function escXml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 1. Welcome ────────────────────────────────────────────────
router.post('/welcome', (req, res) => {
  const { CallSid, From } = req.body;
  const cfg = store.getConfig();

  sessions[CallSid] = { from: From, accountAttempts: 0, pinAttempts: 0 };
  store.addCallLog({ callSid: CallSid, from: From, event: 'inbound', status: 'answered' });

  console.log(`[MEDUSA IVR] Inbound: ${CallSid} from ${From}`);

  xml(res, `
    <Gather numDigits="1" action="/ivr/menu" method="POST" timeout="10">
      <Say voice="woman">${escXml(cfg.welcomeMessage)}</Say>
      <Say voice="woman">${escXml(cfg.menuPrompt)}</Say>
    </Gather>
    <Say voice="woman">We did not receive your input. Goodbye.</Say>
    <Hangup/>
  `);
});

// ── 2. Menu (digit pressed) ───────────────────────────────────
router.post('/menu', (req, res) => {
  const { Digits, CallSid } = req.body;
  const cfg = store.getConfig();

  if (Digits === '1') {
    xml(res, `
      <Gather numDigits="20" action="/ivr/verify-account" method="POST" timeout="15" finishOnKey="#">
        <Say voice="woman">${escXml(cfg.accountPrompt)}</Say>
      </Gather>
      <Say voice="woman">We did not receive your account number. Goodbye.</Say>
      <Hangup/>
    `);
  } else {
    xml(res, `
      <Gather numDigits="1" action="/ivr/menu" method="POST" timeout="10">
        <Say voice="woman">That is not a valid option. ${escXml(cfg.menuPrompt)}</Say>
      </Gather>
      <Hangup/>
    `);
  }
});

// ── 3. Verify Account Number ──────────────────────────────────
router.post('/verify-account', (req, res) => {
  const { Digits, CallSid } = req.body;
  const cfg = store.getConfig();
  const session = sessions[CallSid] || { accountAttempts: 0, pinAttempts: 0 };

  const accountNumber = (Digits || '').replace('#', '').trim();
  const profile = store.findProfileByAccount(accountNumber);

  if (profile) {
    // Account found — save to session and ask for PIN
    session.profileId = profile.id;
    session.profileName = profile.name;
    sessions[CallSid] = session;

    store.addCallLog({ callSid: CallSid, from: session.from, event: 'account_found', status: `Account: ${accountNumber}` });

    xml(res, `
      <Gather numDigits="20" action="/ivr/verify-pin" method="POST" timeout="15" finishOnKey="#">
        <Say voice="woman">${escXml(cfg.pinPrompt)}</Say>
      </Gather>
      <Say voice="woman">We did not receive your PIN. Goodbye.</Say>
      <Hangup/>
    `);
  } else {
    // Account not found
    session.accountAttempts = (session.accountAttempts || 0) + 1;
    sessions[CallSid] = session;
    const max = cfg.maxAttempts || 3;

    store.addCallLog({ callSid: CallSid, from: session.from, event: 'account_not_found', status: `Attempt ${session.accountAttempts}/${max}` });

    if (session.accountAttempts >= max) {
      delete sessions[CallSid];
      xml(res, `
        <Say voice="woman">${escXml(cfg.invalidFinalMessage)}</Say>
        <Hangup/>
      `);
    } else {
      xml(res, `
        <Gather numDigits="20" action="/ivr/verify-account" method="POST" timeout="15" finishOnKey="#">
          <Say voice="woman">${escXml(cfg.invalidAccountMessage)}</Say>
        </Gather>
        <Hangup/>
      `);
    }
  }
});

// ── 4. Verify PIN ─────────────────────────────────────────────
router.post('/verify-pin', (req, res) => {
  const { Digits, CallSid } = req.body;
  const cfg = store.getConfig();
  const session = sessions[CallSid] || { pinAttempts: 0 };

  const pin = (Digits || '').replace('#', '').trim();
  const profiles = store.getProfiles();
  const profile = profiles.find(p => p.id === session.profileId);

  if (profile && profile.pin === pin) {
    // ✅ PIN correct — play all messages
    store.addCallLog({
      callSid: CallSid,
      from: session.from,
      callerName: profile.name,
      accountNumber: profile.accountNumber,
      event: 'pin_verified',
      status: 'success',
    });
    delete sessions[CallSid];

    console.log(`[MEDUSA IVR] Verified: ${profile.name} (${profile.accountNumber})`);

    // Build Say blocks for each message
    const messages = (profile.messages || []);
    const messageSays = messages.length > 0
      ? messages.map(m => `<Say voice="woman">${escXml(m.text)}</Say>`).join('\n')
      : `<Say voice="woman">No information is available for your account at this time.</Say>`;

    xml(res, `
      ${messageSays}
      <Say voice="woman">Thank you for calling. Goodbye.</Say>
      <Hangup/>
    `);

  } else {
    // ❌ Wrong PIN
    session.pinAttempts = (session.pinAttempts || 0) + 1;
    sessions[CallSid] = session;
    const max = cfg.maxAttempts || 3;

    store.addCallLog({
      callSid: CallSid,
      from: session.from,
      event: 'pin_failed',
      status: `Attempt ${session.pinAttempts}/${max}`,
    });

    if (session.pinAttempts >= max) {
      delete sessions[CallSid];
      xml(res, `
        <Say voice="woman">${escXml(cfg.invalidFinalMessage)}</Say>
        <Hangup/>
      `);
    } else {
      xml(res, `
        <Gather numDigits="20" action="/ivr/verify-pin" method="POST" timeout="15" finishOnKey="#">
          <Say voice="woman">${escXml(cfg.invalidPinMessage)}</Say>
        </Gather>
        <Hangup/>
      `);
    }
  }
});

module.exports = router;
