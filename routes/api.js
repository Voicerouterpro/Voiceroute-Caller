// routes/api.js
// ─────────────────────────────────────────────────────────────
//  MEDUSA — Admin REST API
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const store = require('../config/store');
const { signToken, requireAuth, requireSuperAdmin } = require('../config/auth');

// ── Auth ──────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await store.verifyUser(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ── Admin Users (super admin only) ───────────────────────────
router.get('/users', requireSuperAdmin, (req, res) => {
  res.json(store.listUsers());
});

router.post('/users', requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = await store.createUser({ username, password, role: role || 'admin' });
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/users/:id/password', requireSuperAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    await store.updateUserPassword(req.params.id, password);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/users/:id', requireSuperAdmin, (req, res) => {
  try {
    store.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Caller Profiles ───────────────────────────────────────────
router.get('/profiles', requireAuth, (req, res) => {
  res.json(store.getProfiles());
});

router.post('/profiles', requireAuth, (req, res) => {
  try {
    const { name, accountNumber, pin, messages } = req.body;
    if (!accountNumber) return res.status(400).json({ error: 'Account number is required' });
    if (!pin) return res.status(400).json({ error: 'PIN is required' });
    const profile = store.addProfile({ name, accountNumber, pin, messages: messages || [] });
    res.status(201).json(profile);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/profiles/:id', requireAuth, (req, res) => {
  const profiles = store.getProfiles();
  const p = profiles.find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Profile not found' });
  res.json(p);
});

router.put('/profiles/:id', requireAuth, (req, res) => {
  try {
    const updated = store.updateProfile(req.params.id, req.body);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/profiles/:id', requireAuth, (req, res) => {
  try {
    store.deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Messages within a profile ─────────────────────────────────
router.post('/profiles/:id/messages', requireAuth, (req, res) => {
  try {
    const { label, text } = req.body;
    if (!text) return res.status(400).json({ error: 'Message text is required' });
    const msg = store.addMessage(req.params.id, { label: label || 'Message', text });
    res.status(201).json(msg);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/profiles/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    const msg = store.updateMessage(req.params.id, req.params.msgId, req.body);
    res.json(msg);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/profiles/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    store.deleteMessage(req.params.id, req.params.msgId);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── IVR Config ────────────────────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
  res.json(store.getConfig());
});

router.put('/config', requireAuth, (req, res) => {
  try {
    res.json(store.saveConfig(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Call Log ──────────────────────────────────────────────────
router.get('/calls', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(store.getCallLog(limit));
});

// ── Stats ─────────────────────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  const calls = store.getCallLog(500);
  const profiles = store.getProfiles();
  res.json({
    totalProfiles: profiles.length,
    totalCalls: calls.filter(c => c.event === 'inbound').length,
    verified: calls.filter(c => c.event === 'pin_verified').length,
    failed: calls.filter(c => c.event === 'pin_failed').length,
    accountNotFound: calls.filter(c => c.event === 'account_not_found').length,
  });
});

module.exports = router;
