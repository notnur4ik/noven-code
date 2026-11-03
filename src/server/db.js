'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');
const {
  INITIAL_ROLES,
  INITIAL_SERVICES,
  INITIAL_PRICING_PLANS,
  INITIAL_PORTFOLIO,
  INITIAL_FAQS,
  INITIAL_SETTINGS
} = require('../data/seed-data');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
const DB_PATH = path.join(DB_DIR, 'noven_code.sqlite');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  dbInstance = new DatabaseSync(DB_PATH);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  initSchemaAndSeed(dbInstance);
  return dbInstance;
}

function initSchemaAndSeed(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name_ru TEXT NOT NULL,
      name_kk TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ru TEXT,
      description_kk TEXT,
      description_en TEXT,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL REFERENCES roles(id),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_name TEXT,
      business_type TEXT,
      industry TEXT,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      preferred_contact TEXT DEFAULT 'whatsapp',
      website TEXT,
      social_links TEXT,
      internal_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_plans (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ru TEXT NOT NULL,
      name_kk TEXT NOT NULL,
      name_en TEXT NOT NULL,
      desc_ru TEXT NOT NULL,
      desc_kk TEXT NOT NULL,
      desc_en TEXT NOT NULL,
      price_label_ru TEXT NOT NULL,
      price_label_kk TEXT NOT NULL,
      price_label_en TEXT NOT NULL,
      numeric_price REAL,
      currency TEXT DEFAULT 'KZT',
      is_custom_quote INTEGER NOT NULL DEFAULT 1,
      is_recommended INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      cta_ru TEXT NOT NULL DEFAULT 'Выбрать тариф',
      cta_kk TEXT NOT NULL DEFAULT 'Тарифті таңдау',
      cta_en TEXT NOT NULL DEFAULT 'Choose Plan',
      optional_addons_ru TEXT DEFAULT '',
      optional_addons_kk TEXT DEFAULT '',
      optional_addons_en TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_features (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
      text_ru TEXT NOT NULL,
      text_kk TEXT NOT NULL,
      text_en TEXT NOT NULL,
      is_included INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      number_code TEXT NOT NULL,
      title_ru TEXT NOT NULL,
      title_kk TEXT NOT NULL,
      title_en TEXT NOT NULL,
      desc_ru TEXT NOT NULL,
      desc_kk TEXT NOT NULL,
      desc_en TEXT NOT NULL,
      benefits_ru TEXT NOT NULL DEFAULT '[]',
      benefits_kk TEXT NOT NULL DEFAULT '[]',
      benefits_en TEXT NOT NULL DEFAULT '[]',
      cta_ru TEXT NOT NULL,
      cta_kk TEXT NOT NULL,
      cta_en TEXT NOT NULL,
      icon_name TEXT NOT NULL DEFAULT 'globe',
      visual_type TEXT NOT NULL DEFAULT 'grid',
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_projects (
      id TEXT PRIMARY KEY,
      title_ru TEXT NOT NULL,
      title_kk TEXT NOT NULL,
      title_en TEXT NOT NULL,
      category_ru TEXT NOT NULL,
      category_kk TEXT NOT NULL,
      category_en TEXT NOT NULL,
      desc_ru TEXT NOT NULL,
      desc_kk TEXT NOT NULL,
      desc_en TEXT NOT NULL,
      live_url TEXT NOT NULL,
      preview_image TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'general',
      q_ru TEXT NOT NULL,
      q_kk TEXT NOT NULL,
      q_en TEXT NOT NULL,
      a_ru TEXT NOT NULL,
      a_kk TEXT NOT NULL,
      a_en TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_code TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      selected_services TEXT NOT NULL DEFAULT '[]',
      selected_package TEXT,
      business_name TEXT NOT NULL,
      business_type TEXT NOT NULL,
      custom_business_type TEXT,
      industry TEXT,
      business_description TEXT NOT NULL,
      target_audience TEXT,
      project_goals TEXT NOT NULL,
      existing_website TEXT,
      social_media TEXT,
      reference_notes TEXT,
      reference_avoid TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      background_color TEXT,
      hex_codes TEXT,
      existing_branding TEXT,
      preferred_style TEXT,
      colors_to_avoid TEXT,
      required_features TEXT NOT NULL DEFAULT '[]',
      custom_features TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_whatsapp TEXT,
      customer_email TEXT,
      preferred_contact TEXT NOT NULL DEFAULT 'whatsapp',
      estimated_budget TEXT,
      desired_deadline TEXT,
      priority TEXT DEFAULT 'standard',
      additional_requirements TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      internal_notes TEXT DEFAULT '',
      locale TEXT DEFAULT 'ru',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_attachments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      category TEXT DEFAULT 'reference',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Planning',
      progress INTEGER NOT NULL DEFAULT 0,
      deadline TEXT,
      assigned_employees TEXT NOT NULL DEFAULT '[]',
      internal_notes TEXT DEFAULT '',
      design_files TEXT NOT NULL DEFAULT '[]',
      technical_notes TEXT DEFAULT '',
      design_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'development',
      status TEXT NOT NULL DEFAULT 'To Do',
      priority TEXT NOT NULL DEFAULT 'Medium',
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      deadline TEXT,
      technical_notes TEXT DEFAULT '',
      design_notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      telegram_sent INTEGER NOT NULL DEFAULT 0,
      telegram_status TEXT NOT NULL DEFAULT 'pending',
      telegram_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  // Seed Roles
  const roleCount = db.prepare('SELECT COUNT(*) AS c FROM roles').get().c;
  if (roleCount === 0) {
    const insRole = db.prepare(`
      INSERT INTO roles (id, name_ru, name_kk, name_en, description_ru, description_kk, description_en, permissions_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of INITIAL_ROLES) {
      insRole.run(r.id, r.name_ru, r.name_kk, r.name_en, r.description_ru, r.description_kk, r.description_en, r.permissions_json, now);
    }
  }

  // Seed Initial Setup Owner Account ("Notnur4ikGg")
  const ownerUsername = process.env.INITIAL_OWNER_USERNAME || 'Notnur4ikGg';
  const ownerInitialPassword = process.env.INITIAL_OWNER_PASSWORD || 'Nurik1107!)';
  const existingOwner = db.prepare('SELECT id FROM users WHERE username = ?').get(ownerUsername);
  if (!existingOwner) {
    const { hash, salt } = hashPassword(ownerInitialPassword);
    const ownerId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, full_name, role, password_hash, password_salt, must_change_password, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'OWNER', ?, ?, 0, 1, ?, ?)
    `).run(ownerId, ownerUsername, 'Noven.code Owner', hash, salt, now, now);

    db.prepare(`
      INSERT INTO activity_logs (id, actor_id, actor_username, actor_role, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, ?, 'OWNER', 'system_init', 'users', ?, 'Initial owner account configured on server setup', '127.0.0.1', ?)
    `).run(crypto.randomUUID(), ownerId, ownerUsername, ownerId, now);
  }

  // Seed Services
  const srvCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
  if (srvCount === 0) {
    const insSrv = db.prepare(`
      INSERT INTO services (id, slug, number_code, title_ru, title_kk, title_en, desc_ru, desc_kk, desc_en, benefits_ru, benefits_kk, benefits_en, cta_ru, cta_kk, cta_en, icon_name, visual_type, is_visible, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of INITIAL_SERVICES) {
      insSrv.run(
        s.id, s.slug, s.number_code,
        s.title_ru, s.title_kk, s.title_en,
        s.desc_ru, s.desc_kk, s.desc_en,
        s.benefits_ru, s.benefits_kk, s.benefits_en,
        s.cta_ru, s.cta_kk, s.cta_en,
        s.icon_name, s.visual_type, s.is_visible, s.sort_order, now
      );
    }
  }

  // Seed Pricing Plans & Features
  const planCount = db.prepare('SELECT COUNT(*) AS c FROM pricing_plans').get().c;
  if (planCount === 0) {
    const insPlan = db.prepare(`
      INSERT INTO pricing_plans (id, code, name_ru, name_kk, name_en, desc_ru, desc_kk, desc_en, price_label_ru, price_label_kk, price_label_en, numeric_price, currency, is_custom_quote, is_recommended, is_visible, sort_order, cta_ru, cta_kk, cta_en, optional_addons_ru, optional_addons_kk, optional_addons_en, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insFeat = db.prepare(`
      INSERT INTO pricing_features (id, plan_id, text_ru, text_kk, text_en, is_included, sort_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    for (const p of INITIAL_PRICING_PLANS) {
      insPlan.run(
        p.id, p.code,
        p.name_ru, p.name_kk, p.name_en,
        p.desc_ru, p.desc_kk, p.desc_en,
        p.price_label_ru, p.price_label_kk, p.price_label_en,
        p.numeric_price, p.currency,
        p.is_custom_quote, p.is_recommended, p.is_visible, p.sort_order,
        p.cta_ru, p.cta_kk, p.cta_en,
        p.optional_addons_ru, p.optional_addons_kk, p.optional_addons_en,
        now
      );
      p.features.forEach((f, idx) => {
        insFeat.run(crypto.randomUUID(), p.id, f.ru, f.kk, f.en, idx + 1);
      });
    }
  }

  // Seed Portfolio Projects
  const portCount = db.prepare('SELECT COUNT(*) AS c FROM portfolio_projects').get().c;
  if (portCount === 0) {
    const insPort = db.prepare(`
      INSERT INTO portfolio_projects (id, title_ru, title_kk, title_en, category_ru, category_kk, category_en, desc_ru, desc_kk, desc_en, live_url, preview_image, is_visible, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const pr of INITIAL_PORTFOLIO) {
      insPort.run(
        pr.id,
        pr.title_ru, pr.title_kk, pr.title_en,
        pr.category_ru, pr.category_kk, pr.category_en,
        pr.desc_ru, pr.desc_kk, pr.desc_en,
        pr.live_url, pr.preview_image,
        pr.is_visible, pr.sort_order, now
      );
    }
  }

  // Seed FAQs
  const faqCount = db.prepare('SELECT COUNT(*) AS c FROM faqs').get().c;
  if (faqCount === 0) {
    const insFaq = db.prepare(`
      INSERT INTO faqs (id, category, q_ru, q_kk, q_en, a_ru, a_kk, a_en, is_visible, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const fq of INITIAL_FAQS) {
      insFaq.run(
        fq.id, fq.category,
        fq.q_ru, fq.q_kk, fq.q_en,
        fq.a_ru, fq.a_kk, fq.a_en,
        fq.is_visible, fq.sort_order, now
      );
    }
  }

  // Seed Settings
  const setIns = db.prepare('INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)');
  for (const [k, v] of Object.entries(INITIAL_SETTINGS)) {
    setIns.run(k, JSON.stringify(v), now);
  }
}

function logActivity(db, actor, action, entityType, entityId, details, ipAddress = '127.0.0.1') {
  try {
    db.prepare(`
      INSERT INTO activity_logs (id, actor_id, actor_username, actor_role, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      actor ? actor.id : null,
      actor ? actor.username : 'public_visitor',
      actor ? actor.role : 'PUBLIC',
      action,
      entityType,
      entityId ? String(entityId) : null,
      details ? String(details).slice(0, 1000) : '',
      ipAddress,
      new Date().toISOString()
    );
  } catch {
    // Non-blocking audit log fallback
  }
}

module.exports = {
  getDb,
  logActivity,
  DB_PATH
};
