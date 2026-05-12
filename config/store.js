// config/store.js
// ─────────────────────────────────────────────────────────────
//  MEDUSA — File-based JSON data store
// ─────────────────────────────────────────────────────────────
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const CONFIG_FILE   = path.join(DATA_DIR, 'ivr-config.json');
const CALLLOG_FILE  = path.join(DATA_DIR, 'call-log.json');

fs.ensureDirSync(DATA_DIR);

// ─── Default IVR Config ───────────────────────────────────────
const DEFAULT_CONFIG = {
  welcomeMessage: 'Welcome to MEDUSA. Please listen carefully to the following options.',
  menuPrompt: 'For account information, press 1.',
  accountPrompt: 'Please enter your account number followed by the pound key.',
  pinPrompt: 'Please enter your PIN followed by the pound key.',
  invalidAccountMessage: 'We could not find that account number. Please try again.',
  invalidPinMessage: 'Incorrect PIN. Please try again.',
  invalidFinalMessage: 'We were unable to verify your information. Please call back during business hours. Goodbye.',
  maxAttempts: 3,
};

// ─── Helpers ──────────────────────────────────────────────────
function readJson(file, fallback) {
  if (!fs.existsSync(file)) { fs.writeJsonSync(file, fallback, { spaces: 2 }); return fallback; }
  return fs.readJsonSync(file);
}
function writeJson(file, data) { fs.writeJsonSync(file, data, { spaces: 2 }); }

// ═══════════════════════════════════════════════════════════════
//  ADMIN USERS
// ═══════════════════════════════════════════════════════════════
function getUsers() { return readJson(USERS_FILE, []); }
function saveUsers(users) { writeJson(USERS_FILE, users); }

async function seedSuperAdmin() {
  const users = getUsers();
  if (users.find(u => u.role === 'superadmin')) return;
  const hash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || 'Medusa@2024!', 10);
  users.push({
    id: uuidv4(),
    username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
    passwordHash: hash,
    role: 'superadmin',
    createdAt: new Date().toISOString(),
  });
  saveUsers(users);
  console.log('[MEDUSA] Super admin account created.');
}

async function createUser({ username, password, role = 'admin' }) {
  const users = getUsers();
  if (users.find(u => u.username === username)) throw new Error('Username already exists');
  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username, passwordHash: hash, role, createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

async function verifyUser(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, username: user.username, role: user.role };
}

async function updateUserPassword(id, newPassword) {
  const users = getUsers();
  const u = users.find(u => u.id === id);
  if (!u) throw new Error('User not found');
  u.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
}

function deleteUser(id) {
  let users = getUsers();
  const u = users.find(u => u.id === id);
  if (!u) throw new Error('User not found');
  if (u.role === 'superadmin') throw new Error('Cannot delete super admin');
  users = users.filter(u => u.id !== id);
  saveUsers(users);
}

function listUsers() {
  return getUsers().map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
}

// ═══════════════════════════════════════════════════════════════
//  CALLER PROFILES
// ═══════════════════════════════════════════════════════════════
function getProfiles() { return readJson(PROFILES_FILE, []); }
function saveProfiles(p) { writeJson(PROFILES_FILE, p); }

function addProfile({ name, accountNumber, pin, messages = [] }) {
  const profiles = getProfiles();
  if (profiles.find(p => p.accountNumber === accountNumber)) throw new Error('Account number already exists');
  if (profiles.find(p => p.pin === pin)) throw new Error('PIN already in use by another profile');
  const profile = {
    id: uuidv4(),
    name: name || 'Unknown',
    accountNumber,
    pin,
    messages, // [{ id, label, text }]
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  profiles.push(profile);
  saveProfiles(profiles);
  return profile;
}

function updateProfile(id, updates) {
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Profile not found');
  // Uniqueness checks if changing account/pin
  if (updates.accountNumber && updates.accountNumber !== profiles[idx].accountNumber) {
    if (profiles.find(p => p.accountNumber === updates.accountNumber)) throw new Error('Account number already exists');
  }
  if (updates.pin && updates.pin !== profiles[idx].pin) {
    if (profiles.find(p => p.pin === updates.pin)) throw new Error('PIN already in use');
  }
  profiles[idx] = { ...profiles[idx], ...updates, updatedAt: new Date().toISOString() };
  saveProfiles(profiles);
  return profiles[idx];
}

function deleteProfile(id) {
  let profiles = getProfiles();
  if (!profiles.find(p => p.id === id)) throw new Error('Profile not found');
  profiles = profiles.filter(p => p.id !== id);
  saveProfiles(profiles);
}

function findProfileByAccount(accountNumber) {
  return getProfiles().find(p => p.accountNumber === accountNumber) || null;
}

// Messages within a profile
function addMessage(profileId, { label, text }) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (!p) throw new Error('Profile not found');
  const msg = { id: uuidv4(), label, text };
  p.messages = p.messages || [];
  p.messages.push(msg);
  p.updatedAt = new Date().toISOString();
  saveProfiles(profiles);
  return msg;
}

function updateMessage(profileId, messageId, updates) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (!p) throw new Error('Profile not found');
  const mIdx = p.messages.findIndex(m => m.id === messageId);
  if (mIdx === -1) throw new Error('Message not found');
  p.messages[mIdx] = { ...p.messages[mIdx], ...updates };
  p.updatedAt = new Date().toISOString();
  saveProfiles(profiles);
  return p.messages[mIdx];
}

function deleteMessage(profileId, messageId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (!p) throw new Error('Profile not found');
  p.messages = p.messages.filter(m => m.id !== messageId);
  p.updatedAt = new Date().toISOString();
  saveProfiles(profiles);
}

// ═══════════════════════════════════════════════════════════════
//  IVR CONFIG
// ═══════════════════════════════════════════════════════════════
function getConfig() { return readJson(CONFIG_FILE, DEFAULT_CONFIG); }
function saveConfig(updates) {
  const cfg = { ...getConfig(), ...updates };
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

// ═══════════════════════════════════════════════════════════════
//  CALL LOG
// ═══════════════════════════════════════════════════════════════
function addCallLog(entry) {
  let log = fs.existsSync(CALLLOG_FILE) ? fs.readJsonSync(CALLLOG_FILE) : [];
  log.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > 500) log = log.slice(0, 500);
  writeJson(CALLLOG_FILE, log);
}

function getCallLog(limit = 100) {
  return readJson(CALLLOG_FILE, []).slice(0, limit);
}

module.exports = {
  seedSuperAdmin,
  createUser, verifyUser, updateUserPassword, deleteUser, listUsers,
  addProfile, updateProfile, deleteProfile, findProfileByAccount, getProfiles,
  addMessage, updateMessage, deleteMessage,
  getConfig, saveConfig,
  addCallLog, getCallLog,
};
