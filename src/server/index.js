'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const { getDb, logActivity } = require('./db');
const {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  ROLE_PERMISSIONS,
  hasPermission,
  checkRateLimit,
  resetRateLimit,
  sanitizeString,
  parseCookies,
  validateFileAttachment
} = require('./security');
const {
  sendTelegramNotification,
  formatNewOrderTelegramMessage
} = require('./telegram');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  setSecurityHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        if (!str) return resolve({});
        resolve(JSON.parse(str));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function getAuthenticatedSession(db, req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies.nc_session;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  // Purge expired sessions
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);

  const session = db.prepare(`
    SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at,
           u.username, u.full_name, u.role, u.is_active, u.must_change_password
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash, now);

  if (!session || !session.is_active) return null;

  return {
    tokenHash: session.token_hash,
    csrfToken: session.csrf_token,
    expiresAt: session.expires_at,
    user: {
      id: session.user_id,
      username: session.username,
      fullName: session.full_name,
      role: session.role,
      mustChangePassword: Boolean(session.must_change_password),
      permissions: ROLE_PERMISSIONS[session.role] || []
    }
  };
}

function verifyCsrfIfMutating(req, auth) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    if (!headerToken || headerToken !== auth.csrfToken) {
      return false;
    }
  }
  return true;
}

function generateNextOrderCode(db) {
  const rows = db.prepare('SELECT order_code FROM orders').all();
  let maxNum = 0;
  for (const r of rows) {
    const m = String(r.order_code || '').match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `#NC-${String(next).padStart(4, '0')}`;
}

function generateNextProjectCode(db) {
  const rows = db.prepare('SELECT project_code FROM projects').all();
  let maxNum = 0;
  for (const r of rows) {
    const m = String(r.project_code || '').match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `PRJ-${String(next).padStart(3, '0')}`;
}

function buildPublicBootstrap(db) {
  const services = db.prepare('SELECT * FROM services WHERE is_visible = 1 ORDER BY sort_order ASC').all().map((s) => ({
    ...s,
    benefits_ru: JSON.parse(s.benefits_ru || '[]'),
    benefits_kk: JSON.parse(s.benefits_kk || '[]'),
    benefits_en: JSON.parse(s.benefits_en || '[]'),
    is_visible: Boolean(s.is_visible)
  }));

  const plansRaw = db.prepare('SELECT * FROM pricing_plans WHERE is_visible = 1 ORDER BY sort_order ASC').all();
  const allFeatures = db.prepare('SELECT * FROM pricing_features ORDER BY sort_order ASC').all();
  const pricingPlans = plansRaw.map((p) => ({
    ...p,
    is_custom_quote: Boolean(p.is_custom_quote),
    is_recommended: Boolean(p.is_recommended),
    is_visible: Boolean(p.is_visible),
    features: allFeatures.filter((f) => f.plan_id === p.id).map((f) => ({
      ...f,
      is_included: Boolean(f.is_included)
    }))
  }));

  const portfolio = db.prepare('SELECT * FROM portfolio_projects WHERE is_visible = 1 ORDER BY sort_order ASC').all().map((pr) => ({
    ...pr,
    is_visible: Boolean(pr.is_visible)
  }));

  const faqs = db.prepare('SELECT * FROM faqs WHERE is_visible = 1 ORDER BY sort_order ASC').all().map((fq) => ({
    ...fq,
    is_visible: Boolean(fq.is_visible)
  }));

  const settingsRows = db.prepare('SELECT key, value_json FROM settings').all();
  const publicSettings = {};
  for (const row of settingsRows) {
    if (row.key === 'telegram_config') continue; // Never expose telegram config to public
    try {
      publicSettings[row.key] = JSON.parse(row.value_json);
    } catch {
      publicSettings[row.key] = {};
    }
  }

  return {
    services,
    pricingPlans,
    portfolio,
    faqs,
    settings: publicSettings
  };
}

function serveStaticFile(res, filePath, contentTypeOverride = null) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypeOverride || MIME_MAP[ext] || 'application/octet-stream';
  setSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const db = getDb();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const ip = getClientIp(req);

  try {
    // ========================================================================
    // SEO ROUTES: robots.txt & sitemap.xml
    // ========================================================================
    if (pathname === '/robots.txt' && req.method === 'GET') {
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end([
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api/admin/',
        `Sitemap: http://${req.headers.host || 'localhost:3000'}/sitemap.xml`
      ].join('\n'));
      return;
    }

    if (pathname === '/sitemap.xml' && req.method === 'GET') {
      const base = `http://${req.headers.host || 'localhost:3000'}`;
      const pages = ['/', '/services', '/pricing', '/portfolio', '/about', '/process', '/faq', '/contact', '/start-project'];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...pages.map((p) => `  <url><loc>${base}${p}</loc><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.8'}</priority></url>`),
        '</urlset>'
      ].join('\n');
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(xml);
      return;
    }

    // ========================================================================
    // BLOCK DIRECT PUBLIC ACCESS TO /uploads/*
    // Uploaded files must only be accessed via authenticated /api/admin/attachments/:id
    // ========================================================================
    if (pathname.startsWith('/uploads/')) {
      sendJson(res, 403, { error: 'Direct access to uploaded attachments is forbidden. Authenticate via CRM.' });
      return;
    }

    // ========================================================================
    // PUBLIC API ENDPOINTS
    // ========================================================================
    if (pathname === '/api/public/bootstrap' && req.method === 'GET') {
      const data = buildPublicBootstrap(db);
      sendJson(res, 200, data);
      return;
    }

    // Submit a new Project Order (Step 9 of Project Order Builder)
    if (pathname === '/api/public/orders' && req.method === 'POST') {
      const rate = checkRateLimit(`order_submit_${ip}`, 10, 60 * 1000);
      if (!rate.allowed) {
        sendJson(res, 429, { error: 'Too many order submissions. Please wait a moment and try again.', retryAfterSec: rate.retryAfterSec });
        return;
      }

      const body = await readJsonBody(req);

      // Duplicate submission prevention via idempotency key
      const idempotencyKey = sanitizeString(body.idempotencyKey || '', 120);
      if (idempotencyKey) {
        const existingOrder = db.prepare('SELECT order_code, id, created_at FROM orders WHERE idempotency_key = ?').get(idempotencyKey);
        if (existingOrder) {
          sendJson(res, 200, {
            ok: true,
            duplicatePrevented: true,
            orderId: existingOrder.id,
            orderCode: existingOrder.order_code,
            createdAt: existingOrder.created_at
          });
          return;
        }
      }

      // Server-side validation of required fields
      const selectedServices = Array.isArray(body.selectedServices)
        ? body.selectedServices.map((s) => sanitizeString(s, 100)).filter(Boolean)
        : [];
      const businessName = sanitizeString(body.businessName, 200);
      const businessType = sanitizeString(body.businessType, 100);
      const businessDescription = sanitizeString(body.businessDescription, 3000);
      const projectGoals = sanitizeString(body.projectGoals, 3000);
      const customerName = sanitizeString(body.customerName, 150);
      const customerPhone = sanitizeString(body.customerPhone, 60);

      if (selectedServices.length === 0) {
        sendJson(res, 400, { error: 'Please select at least one service.' });
        return;
      }
      if (!businessName || !businessType || !businessDescription || !projectGoals) {
        sendJson(res, 400, { error: 'Please complete all required business information fields.' });
        return;
      }
      if (!customerName || !customerPhone) {
        sendJson(res, 400, { error: 'Customer name and phone number are required.' });
        return;
      }

      // Validate attachments before saving order
      const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
      const validatedAttachments = [];
      for (const att of rawAttachments) {
        const check = validateFileAttachment(att);
        if (!check.valid) {
          sendJson(res, 400, { error: `Attachment validation failed (${att.name || 'file'}): ${check.reason}` });
          return;
        }
        validatedAttachments.push({
          ...check,
          category: sanitizeString(att.category || 'reference', 50)
        });
      }

      const now = new Date().toISOString();
      const orderId = crypto.randomUUID();
      const orderCode = generateNextOrderCode(db);

      // Find or create Client record in CRM
      let clientRow = db.prepare('SELECT id FROM clients WHERE phone = ?').get(customerPhone);
      let clientId;
      if (clientRow) {
        clientId = clientRow.id;
        db.prepare(`
          UPDATE clients
          SET name = ?, business_name = ?, business_type = ?, industry = ?,
              whatsapp = COALESCE(NULLIF(?, ''), whatsapp),
              email = COALESCE(NULLIF(?, ''), email),
              website = COALESCE(NULLIF(?, ''), website),
              social_links = COALESCE(NULLIF(?, ''), social_links),
              updated_at = ?
          WHERE id = ?
        `).run(
          customerName,
          businessName,
          businessType,
          sanitizeString(body.industry, 150),
          sanitizeString(body.customerWhatsapp, 60),
          sanitizeString(body.customerEmail, 150),
          sanitizeString(body.existingWebsite, 255),
          sanitizeString(body.socialMedia, 255),
          now,
          clientId
        );
      } else {
        clientId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO clients (id, name, business_name, business_type, industry, phone, whatsapp, email, preferred_contact, website, social_links, internal_notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
        `).run(
          clientId,
          customerName,
          businessName,
          businessType,
          sanitizeString(body.industry, 150),
          customerPhone,
          sanitizeString(body.customerWhatsapp, 60),
          sanitizeString(body.customerEmail, 150),
          sanitizeString(body.preferredContact || 'whatsapp', 50),
          sanitizeString(body.existingWebsite, 255),
          sanitizeString(body.socialMedia, 255),
          now,
          now
        );
      }

      const requiredFeatures = Array.isArray(body.requiredFeatures)
        ? body.requiredFeatures.map((f) => sanitizeString(f, 100)).filter(Boolean)
        : [];

      const orderRecord = {
        id: orderId,
        order_code: orderCode,
        idempotency_key: idempotencyKey || null,
        client_id: clientId,
        selected_services: selectedServices,
        selected_package: sanitizeString(body.selectedPackage || '', 64),
        business_name: businessName,
        business_type: businessType,
        custom_business_type: sanitizeString(body.customBusinessType, 150),
        industry: sanitizeString(body.industry, 150),
        business_description: businessDescription,
        target_audience: sanitizeString(body.targetAudience, 1500),
        project_goals: projectGoals,
        existing_website: sanitizeString(body.existingWebsite, 255),
        social_media: sanitizeString(body.socialMedia, 255),
        reference_notes: sanitizeString(body.referenceNotes, 3000),
        reference_avoid: sanitizeString(body.referenceAvoid, 2000),
        primary_color: sanitizeString(body.primaryColor, 32),
        secondary_color: sanitizeString(body.secondaryColor, 32),
        background_color: sanitizeString(body.backgroundColor, 32),
        hex_codes: sanitizeString(body.hexCodes, 500),
        existing_branding: sanitizeString(body.existingBranding, 150),
        preferred_style: sanitizeString(body.preferredStyle, 150),
        colors_to_avoid: sanitizeString(body.colorsToAvoid, 500),
        required_features: requiredFeatures,
        custom_features: sanitizeString(body.customFeatures, 2000),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_whatsapp: sanitizeString(body.customerWhatsapp, 60),
        customer_email: sanitizeString(body.customerEmail, 150),
        preferred_contact: sanitizeString(body.preferredContact || 'whatsapp', 50),
        estimated_budget: sanitizeString(body.estimatedBudget, 120),
        desired_deadline: sanitizeString(body.desiredDeadline, 100),
        priority: sanitizeString(body.priority || 'standard', 50),
        additional_requirements: sanitizeString(body.additionalRequirements, 3000),
        status: 'New',
        locale: sanitizeString(body.locale || 'ru', 10),
        created_at: now,
        updated_at: now
      };

      db.prepare(`
        INSERT INTO orders (
          id, order_code, idempotency_key, client_id, selected_services, selected_package,
          business_name, business_type, custom_business_type, industry, business_description,
          target_audience, project_goals, existing_website, social_media,
          reference_notes, reference_avoid, primary_color, secondary_color, background_color,
          hex_codes, existing_branding, preferred_style, colors_to_avoid,
          required_features, custom_features, customer_name, customer_phone, customer_whatsapp,
          customer_email, preferred_contact, estimated_budget, desired_deadline, priority,
          additional_requirements, status, assigned_to, internal_notes, locale, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 'New', NULL, '', ?, ?, ?
        )
      `).run(
        orderRecord.id,
        orderRecord.order_code,
        orderRecord.idempotency_key,
        orderRecord.client_id,
        JSON.stringify(orderRecord.selected_services),
        orderRecord.selected_package,
        orderRecord.business_name,
        orderRecord.business_type,
        orderRecord.custom_business_type,
        orderRecord.industry,
        orderRecord.business_description,
        orderRecord.target_audience,
        orderRecord.project_goals,
        orderRecord.existing_website,
        orderRecord.social_media,
        orderRecord.reference_notes,
        orderRecord.reference_avoid,
        orderRecord.primary_color,
        orderRecord.secondary_color,
        orderRecord.background_color,
        orderRecord.hex_codes,
        orderRecord.existing_branding,
        orderRecord.preferred_style,
        orderRecord.colors_to_avoid,
        JSON.stringify(orderRecord.required_features),
        orderRecord.custom_features,
        orderRecord.customer_name,
        orderRecord.customer_phone,
        orderRecord.customer_whatsapp,
        orderRecord.customer_email,
        orderRecord.preferred_contact,
        orderRecord.estimated_budget,
        orderRecord.desired_deadline,
        orderRecord.priority,
        orderRecord.additional_requirements,
        orderRecord.locale,
        orderRecord.created_at,
        orderRecord.updated_at
      );

      // Save validated file attachments securely to disk & database
      const insAtt = db.prepare(`
        INSERT INTO order_attachments (id, order_id, original_name, stored_name, mime_type, size_bytes, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const vAtt of validatedAttachments) {
        const attId = crypto.randomUUID();
        const storedName = `${attId}${vAtt.ext}`;
        const destPath = path.join(UPLOADS_DIR, storedName);
        fs.writeFileSync(destPath, vAtt.buffer);
        insAtt.run(attId, orderId, vAtt.cleanName, storedName, vAtt.mime, vAtt.sizeBytes, vAtt.category, now);
      }

      // Record in Activity Log
      logActivity(
        db,
        null,
        'order_created',
        'orders',
        orderCode,
        `New project order ${orderCode} submitted by ${customerName} (${businessName})`,
        ip
      );

      // Dispatch Telegram notification (non-blocking if Telegram credentials are not yet set)
      const tgText = formatNewOrderTelegramMessage(orderRecord);
      await sendTelegramNotification(db, 'order_created', `New Order ${orderCode}`, tgText);

      sendJson(res, 201, {
        ok: true,
        orderId,
        orderCode,
        createdAt: now,
        summary: {
          orderCode,
          customerName,
          businessName,
          selectedServices,
          selectedPackage: orderRecord.selected_package,
          estimatedBudget: orderRecord.estimated_budget,
          desiredDeadline: orderRecord.desired_deadline,
          attachmentsCount: validatedAttachments.length
        }
      });
      return;
    }

    // ========================================================================
    // AUTHENTICATION API ENDPOINTS
    // ========================================================================
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const rate = checkRateLimit(`login_${ip}`, 6, 60 * 1000);
      if (!rate.allowed) {
        sendJson(res, 429, {
          error: 'Too many login attempts. Please wait before trying again.',
          retryAfterSec: rate.retryAfterSec
        });
        return;
      }

      const body = await readJsonBody(req);
      const username = sanitizeString(body.username, 100);
      const password = String(body.password || '');

      if (!username || !password) {
        sendJson(res, 400, { error: 'Invalid username or password.' });
        return;
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      // Generic error message so we never expose whether a username exists
      if (!user || !user.is_active || !verifyPassword(password, user.password_hash, user.password_salt)) {
        logActivity(db, { id: null, username: username || 'unknown', role: 'UNAUTHENTICATED' }, 'login_failed', 'auth', null, 'Failed login attempt', ip);
        sendJson(res, 401, { error: 'Invalid credentials.' });
        return;
      }

      // Login succeeded
      resetRateLimit(`login_${ip}`);
      const rawSessionToken = generateSecureToken(32);
      const tokenHash = hashToken(rawSessionToken);
      const csrfToken = generateSecureToken(24);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours session

      db.prepare(`
        INSERT INTO sessions (token_hash, user_id, csrf_token, ip_address, user_agent, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        tokenHash,
        user.id,
        csrfToken,
        ip,
        sanitizeString(req.headers['user-agent'] || '', 250),
        expiresAt,
        now.toISOString()
      );

      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now.toISOString(), user.id);

      logActivity(
        db,
        { id: user.id, username: user.username, role: user.role },
        'login',
        'auth',
        user.id,
        `User ${user.username} (${user.role}) logged into CRM`,
        ip
      );

      const isSecure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
      const cookieParts = [
        `nc_session=${encodeURIComponent(rawSessionToken)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        `Max-Age=${12 * 60 * 60}`
      ];
      if (isSecure) cookieParts.push('Secure');

      sendJson(
        res,
        200,
        {
          ok: true,
          csrfToken,
          expiresAt,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            mustChangePassword: Boolean(user.must_change_password),
            permissions: ROLE_PERMISSIONS[user.role] || []
          }
        },
        { 'Set-Cookie': cookieParts.join('; ') }
      );
      return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const auth = getAuthenticatedSession(db, req);
      if (auth) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(auth.tokenHash);
        logActivity(db, auth.user, 'logout', 'auth', auth.user.id, `User ${auth.user.username} logged out`, ip);
      }
      sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': 'nc_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0' }
      );
      return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = getAuthenticatedSession(db, req);
      if (!auth) {
        sendJson(res, 401, { authenticated: false });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        csrfToken: auth.csrfToken,
        expiresAt: auth.expiresAt,
        user: auth.user
      });
      return;
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      const auth = getAuthenticatedSession(db, req);
      if (!auth) return sendJson(res, 401, { error: 'Authentication required.' });
      if (!verifyCsrfIfMutating(req, auth)) return sendJson(res, 403, { error: 'Invalid CSRF token.' });

      const body = await readJsonBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');

      if (newPassword.length < 8) {
        return sendJson(res, 400, { error: 'New password must be at least 8 characters long.' });
      }

      const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id);
      if (!userRow || !verifyPassword(currentPassword, userRow.password_hash, userRow.password_salt)) {
        return sendJson(res, 400, { error: 'Current password is incorrect.' });
      }

      const { hash, salt } = hashPassword(newPassword);
      const now = new Date().toISOString();
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
        .run(hash, salt, now, auth.user.id);

      logActivity(db, auth.user, 'password_changed', 'users', auth.user.id, 'User changed their own password', ip);
      sendJson(res, 200, { ok: true });
      return;
    }

    // ========================================================================
    // PROTECTED CRM API ENDPOINTS (/api/admin/*)
    // ========================================================================
    if (pathname.startsWith('/api/admin/')) {
      const auth = getAuthenticatedSession(db, req);
      if (!auth) {
        sendJson(res, 401, { error: 'Unauthorized. Please log in to access CRM data.' });
        return;
      }
      if (!verifyCsrfIfMutating(req, auth)) {
        sendJson(res, 403, { error: 'CSRF validation failed.' });
        return;
      }

      const user = auth.user;

      // 1. Complete CRM Bootstrap Data (Filtered by RBAC Role)
      if (pathname === '/api/admin/overview' && req.method === 'GET') {
        // Orders (filtered for Developer/Designer if not permitted, or assigned for Manager)
        let orders = [];
        if (hasPermission(user.role, 'orders:view')) {
          const rawOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
          const allAtts = db.prepare('SELECT id, order_id, original_name, mime_type, size_bytes, category, created_at FROM order_attachments').all();
          orders = rawOrders.map((o) => ({
            ...o,
            selected_services: JSON.parse(o.selected_services || '[]'),
            required_features: JSON.parse(o.required_features || '[]'),
            attachments: allAtts.filter((a) => a.order_id === o.id)
          }));
        }

        // Clients
        let clients = [];
        if (hasPermission(user.role, 'clients:view')) {
          clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
        }

        // Projects
        const rawProjects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map((p) => ({
          ...p,
          assigned_employees: JSON.parse(p.assigned_employees || '[]'),
          design_files: JSON.parse(p.design_files || '[]')
        }));
        const projects = ['DEVELOPER', 'DESIGNER'].includes(user.role)
          ? rawProjects.filter((p) => p.assigned_employees.includes(user.id) || p.assigned_employees.includes(user.username))
          : rawProjects;

        // Tasks
        const rawTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
        const tasks = ['DEVELOPER', 'DESIGNER'].includes(user.role)
          ? rawTasks.filter((t) => !t.assigned_to || t.assigned_to === user.id)
          : rawTasks;

        // Employees list (safe projection: NEVER expose password_hash or password_salt)
        const employees = db.prepare(`
          SELECT id, username, full_name, role, must_change_password, is_active, last_login_at, created_at, updated_at
          FROM users
          ORDER BY created_at ASC
        `).all().map((u) => ({
          ...u,
          must_change_password: Boolean(u.must_change_password),
          is_active: Boolean(u.is_active)
        }));

        const roles = db.prepare('SELECT * FROM roles').all().map((r) => ({
          ...r,
          permissions: JSON.parse(r.permissions_json || '[]')
        }));

        // Pricing plans (all, including hidden)
        const plansRaw = db.prepare('SELECT * FROM pricing_plans ORDER BY sort_order ASC').all();
        const allFeatures = db.prepare('SELECT * FROM pricing_features ORDER BY sort_order ASC').all();
        const pricingPlans = plansRaw.map((p) => ({
          ...p,
          is_custom_quote: Boolean(p.is_custom_quote),
          is_recommended: Boolean(p.is_recommended),
          is_visible: Boolean(p.is_visible),
          features: allFeatures.filter((f) => f.plan_id === p.id).map((f) => ({
            ...f,
            is_included: Boolean(f.is_included)
          }))
        }));

        // Services (all, including hidden)
        const services = db.prepare('SELECT * FROM services ORDER BY sort_order ASC').all().map((s) => ({
          ...s,
          benefits_ru: JSON.parse(s.benefits_ru || '[]'),
          benefits_kk: JSON.parse(s.benefits_kk || '[]'),
          benefits_en: JSON.parse(s.benefits_en || '[]'),
          is_visible: Boolean(s.is_visible)
        }));

        // Portfolio (all, including hidden)
        const portfolio = db.prepare('SELECT * FROM portfolio_projects ORDER BY sort_order ASC').all().map((pr) => ({
          ...pr,
          is_visible: Boolean(pr.is_visible)
        }));

        // FAQs (all, including hidden)
        const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC').all().map((fq) => ({
          ...fq,
          is_visible: Boolean(fq.is_visible)
        }));

        // Activity Logs & Notifications
        const activityLogs = hasPermission(user.role, 'logs:view')
          ? db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 250').all()
          : [];

        const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all().map((n) => ({
          ...n,
          telegram_sent: Boolean(n.telegram_sent)
        }));

        // Settings
        const settingsRows = db.prepare('SELECT key, value_json FROM settings').all();
        const settings = {};
        for (const r of settingsRows) {
          try {
            const parsed = JSON.parse(r.value_json);
            if (r.key === 'telegram_config') {
              // Mask botToken if present
              settings[r.key] = {
                contactUsername: parsed.contactUsername || '@notnormale',
                chatId: parsed.chatId || process.env.TELEGRAM_CHAT_ID || '',
                hasBotToken: Boolean(parsed.botToken || process.env.TELEGRAM_BOT_TOKEN),
                enabledEvents: parsed.enabledEvents || []
              };
            } else {
              settings[r.key] = parsed;
            }
          } catch {
            settings[r.key] = {};
          }
        }

        // Real database dashboard statistics
        const totalOrdersCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
        const newOrdersCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'New'").get().c;
        const cancelledOrdersCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'Cancelled'").get().c;
        const activeProjectsCount = db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status NOT IN ('Completed', 'Cancelled')").get().c;
        const completedProjectsCount = db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status = 'Completed'").get().c;
        const totalClientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;

        sendJson(res, 200, {
          stats: {
            totalOrders: totalOrdersCount,
            newOrders: newOrdersCount,
            activeProjects: activeProjectsCount,
            completedProjects: completedProjectsCount,
            cancelledOrders: cancelledOrdersCount,
            totalClients: totalClientsCount
          },
          orders,
          clients,
          projects,
          tasks,
          employees,
          roles,
          pricingPlans,
          services,
          portfolio,
          faqs,
          activityLogs,
          notifications,
          settings
        });
        return;
      }

      // 2. Protected Attachment Download / View
      const attMatch = pathname.match(/^\/api\/admin\/attachments\/([a-zA-Z0-9-]+)$/);
      if (attMatch && req.method === 'GET') {
        if (!hasPermission(user.role, 'orders:view') && !hasPermission(user.role, 'projects:view')) {
          return sendJson(res, 403, { error: 'Forbidden' });
        }
        const att = db.prepare('SELECT * FROM order_attachments WHERE id = ?').get(attMatch[1]);
        if (!att) return sendJson(res, 404, { error: 'Attachment not found' });
        const filePath = path.join(UPLOADS_DIR, att.stored_name);
        if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Attachment file missing on disk' });

        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': att.mime_type,
          'Content-Disposition': `inline; filename="${encodeURIComponent(att.original_name)}"`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // 3. Orders Management
      const orderIdMatch = pathname.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)$/);
      if (orderIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'orders:edit') && !hasPermission(user.role, 'orders:status') && !hasPermission(user.role, 'orders:notes')) {
          return sendJson(res, 403, { error: 'Permission denied to update orders.' });
        }
        const orderId = orderIdMatch[1];
        const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        const newStatus = body.status ? sanitizeString(body.status, 50) : existing.status;
        const newAssigned = body.assigned_to !== undefined
          ? (body.assigned_to ? sanitizeString(body.assigned_to, 100) : null)
          : existing.assigned_to;
        const newNotes = body.internal_notes !== undefined
          ? sanitizeString(body.internal_notes, 5000)
          : existing.internal_notes;
        const newBudget = body.estimated_budget !== undefined
          ? sanitizeString(body.estimated_budget, 120)
          : existing.estimated_budget;
        const newDeadline = body.desired_deadline !== undefined
          ? sanitizeString(body.desired_deadline, 100)
          : existing.desired_deadline;

        db.prepare(`
          UPDATE orders
          SET status = ?, assigned_to = ?, internal_notes = ?, estimated_budget = ?, desired_deadline = ?, updated_at = ?
          WHERE id = ?
        `).run(newStatus, newAssigned, newNotes, newBudget, newDeadline, now, orderId);

        const actionType = newStatus !== existing.status ? 'order_status_changed' : 'order_updated';
        logActivity(
          db,
          user,
          actionType,
          'orders',
          existing.order_code,
          `Order ${existing.order_code} updated (status: ${existing.status} -> ${newStatus})`,
          ip
        );

        await sendTelegramNotification(
          db,
          'order_updated',
          `Order Updated: ${existing.order_code}`,
          `NOVEN.CODE ORDER UPDATED\n\nOrder ID: ${existing.order_code}\nStatus: ${newStatus}\nUpdated by: ${user.username}`
        );

        sendJson(res, 200, { ok: true });
        return;
      }

      if (orderIdMatch && req.method === 'DELETE') {
        if (!hasPermission(user.role, 'orders:delete')) {
          return sendJson(res, 403, { error: 'Only Owner or Admin can delete orders.' });
        }
        const orderId = orderIdMatch[1];
        const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });

        const atts = db.prepare('SELECT stored_name FROM order_attachments WHERE order_id = ?').all();
        for (const a of atts) {
          const p = path.join(UPLOADS_DIR, a.stored_name);
          if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch {}
          }
        }
        db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
        logActivity(db, user, 'order_deleted', 'orders', existing.order_code, `Deleted order ${existing.order_code}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 4. Clients Management
      if (pathname === '/api/admin/clients' && req.method === 'POST') {
        if (!hasPermission(user.role, 'clients:create')) {
          return sendJson(res, 403, { error: 'Permission denied to create clients.' });
        }
        const body = await readJsonBody(req);
        const name = sanitizeString(body.name, 150);
        const phone = sanitizeString(body.phone, 60);
        if (!name || !phone) return sendJson(res, 400, { error: 'Client name and phone are required.' });

        const now = new Date().toISOString();
        const clientId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO clients (id, name, business_name, business_type, industry, phone, whatsapp, email, preferred_contact, website, social_links, internal_notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          clientId,
          name,
          sanitizeString(body.business_name, 200),
          sanitizeString(body.business_type, 100),
          sanitizeString(body.industry, 100),
          phone,
          sanitizeString(body.whatsapp, 60),
          sanitizeString(body.email, 150),
          sanitizeString(body.preferred_contact || 'whatsapp', 50),
          sanitizeString(body.website, 255),
          sanitizeString(body.social_links, 255),
          sanitizeString(body.internal_notes, 3000),
          now,
          now
        );

        logActivity(db, user, 'client_created', 'clients', clientId, `Created client ${name}`, ip);
        sendJson(res, 201, { ok: true, id: clientId });
        return;
      }

      const clientIdMatch = pathname.match(/^\/api\/admin\/clients\/([a-zA-Z0-9-]+)$/);
      if (clientIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'clients:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit clients.' });
        }
        const clientId = clientIdMatch[1];
        const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
        if (!existing) return sendJson(res, 404, { error: 'Client not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE clients
          SET name = ?, business_name = ?, business_type = ?, industry = ?,
              phone = ?, whatsapp = ?, email = ?, preferred_contact = ?,
              website = ?, social_links = ?, internal_notes = ?, updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.name ?? existing.name, 150),
          sanitizeString(body.business_name ?? existing.business_name, 200),
          sanitizeString(body.business_type ?? existing.business_type, 100),
          sanitizeString(body.industry ?? existing.industry, 100),
          sanitizeString(body.phone ?? existing.phone, 60),
          sanitizeString(body.whatsapp ?? existing.whatsapp, 60),
          sanitizeString(body.email ?? existing.email, 150),
          sanitizeString(body.preferred_contact ?? existing.preferred_contact, 50),
          sanitizeString(body.website ?? existing.website, 255),
          sanitizeString(body.social_links ?? existing.social_links, 255),
          sanitizeString(body.internal_notes ?? existing.internal_notes, 3000),
          now,
          clientId
        );

        logActivity(db, user, 'client_updated', 'clients', clientId, `Updated client ${existing.name}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 5. Projects Management (Create project from order or standalone, update progress/notes/files)
      if (pathname === '/api/admin/projects' && req.method === 'POST') {
        if (!hasPermission(user.role, 'projects:create')) {
          return sendJson(res, 403, { error: 'Permission denied to create projects.' });
        }
        const body = await readJsonBody(req);
        const title = sanitizeString(body.title, 200);
        if (!title) return sendJson(res, 400, { error: 'Project title is required.' });

        const now = new Date().toISOString();
        const projectId = crypto.randomUUID();
        const projectCode = generateNextProjectCode(db);
        const assignedEmployees = Array.isArray(body.assigned_employees)
          ? body.assigned_employees.map((e) => sanitizeString(e, 100)).filter(Boolean)
          : [];

        db.prepare(`
          INSERT INTO projects (
            id, project_code, title, description, client_id, order_id, status, progress,
            deadline, assigned_employees, internal_notes, design_files, technical_notes, design_notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '', '', ?, ?)
        `).run(
          projectId,
          projectCode,
          title,
          sanitizeString(body.description, 3000),
          body.client_id ? sanitizeString(body.client_id, 100) : null,
          body.order_id ? sanitizeString(body.order_id, 100) : null,
          sanitizeString(body.status || 'In Progress', 50),
          Math.max(0, Math.min(100, Number(body.progress || 10))),
          sanitizeString(body.deadline, 100),
          JSON.stringify(assignedEmployees),
          sanitizeString(body.internal_notes, 3000),
          now,
          now
        );

        if (body.order_id) {
          db.prepare("UPDATE orders SET status = 'In Progress', updated_at = ? WHERE id = ?").run(now, body.order_id);
        }

        logActivity(db, user, 'project_created', 'projects', projectCode, `Created project ${projectCode}: ${title}`, ip);
        await sendTelegramNotification(
          db,
          'project_created',
          `New Project ${projectCode}`,
          `NEW NOVEN.CODE PROJECT CREATED\n\nProject: ${projectCode} — ${title}\nDeadline: ${body.deadline || 'TBD'}\nCreated by: ${user.username}`
        );

        sendJson(res, 201, { ok: true, id: projectId, projectCode });
        return;
      }

      const projectIdMatch = pathname.match(/^\/api\/admin\/projects\/([a-zA-Z0-9-]+)$/);
      if (projectIdMatch && req.method === 'PATCH') {
        const projectId = projectIdMatch[1];
        const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!existing) return sendJson(res, 404, { error: 'Project not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        // Role-specific update enforcement
        if (user.role === 'DEVELOPER') {
          if (!hasPermission(user.role, 'projects:tech_notes')) return sendJson(res, 403, { error: 'Forbidden' });
          db.prepare('UPDATE projects SET technical_notes = ?, updated_at = ? WHERE id = ?')
            .run(sanitizeString(body.technical_notes ?? existing.technical_notes, 5000), now, projectId);
          logActivity(db, user, 'project_tech_notes_updated', 'projects', existing.project_code, `Developer updated technical notes on ${existing.project_code}`, ip);
          return sendJson(res, 200, { ok: true });
        }

        if (user.role === 'DESIGNER') {
          if (!hasPermission(user.role, 'projects:design_notes')) return sendJson(res, 403, { error: 'Forbidden' });
          const designFiles = Array.isArray(body.design_files)
            ? JSON.stringify(body.design_files)
            : existing.design_files;
          db.prepare('UPDATE projects SET design_notes = ?, design_files = ?, updated_at = ? WHERE id = ?')
            .run(sanitizeString(body.design_notes ?? existing.design_notes, 5000), designFiles, now, projectId);
          logActivity(db, user, 'project_design_updated', 'projects', existing.project_code, `Designer updated design notes/files on ${existing.project_code}`, ip);
          return sendJson(res, 200, { ok: true });
        }

        if (!hasPermission(user.role, 'projects:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit project.' });
        }

        const assignedEmployees = Array.isArray(body.assigned_employees)
          ? JSON.stringify(body.assigned_employees.map((e) => sanitizeString(e, 100)))
          : existing.assigned_employees;

        db.prepare(`
          UPDATE projects
          SET title = ?, description = ?, status = ?, progress = ?, deadline = ?,
              assigned_employees = ?, internal_notes = ?, technical_notes = ?, design_notes = ?, updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.title ?? existing.title, 200),
          sanitizeString(body.description ?? existing.description, 3000),
          sanitizeString(body.status ?? existing.status, 50),
          Math.max(0, Math.min(100, Number(body.progress ?? existing.progress))),
          sanitizeString(body.deadline ?? existing.deadline, 100),
          assignedEmployees,
          sanitizeString(body.internal_notes ?? existing.internal_notes, 4000),
          sanitizeString(body.technical_notes ?? existing.technical_notes, 4000),
          sanitizeString(body.design_notes ?? existing.design_notes, 4000),
          now,
          projectId
        );

        logActivity(db, user, 'project_updated', 'projects', existing.project_code, `Updated project ${existing.project_code}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 6. Tasks Management
      if (pathname === '/api/admin/tasks' && req.method === 'POST') {
        if (!hasPermission(user.role, 'tasks:create')) {
          return sendJson(res, 403, { error: 'Permission denied to create tasks.' });
        }
        const body = await readJsonBody(req);
        const title = sanitizeString(body.title, 200);
        if (!title) return sendJson(res, 400, { error: 'Task title is required.' });

        const now = new Date().toISOString();
        const taskId = crypto.randomUUID();
        const assignedTo = body.assigned_to ? sanitizeString(body.assigned_to, 100) : null;

        db.prepare(`
          INSERT INTO tasks (id, project_id, title, description, task_type, status, priority, assigned_to, deadline, technical_notes, design_notes, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?)
        `).run(
          taskId,
          body.project_id ? sanitizeString(body.project_id, 100) : null,
          title,
          sanitizeString(body.description, 3000),
          sanitizeString(body.task_type || 'development', 50),
          sanitizeString(body.status || 'To Do', 50),
          sanitizeString(body.priority || 'Medium', 50),
          assignedTo,
          sanitizeString(body.deadline, 100),
          user.id,
          now,
          now
        );

        logActivity(db, user, 'task_created', 'tasks', taskId, `Created task "${title}"`, ip);
        if (assignedTo) {
          await sendTelegramNotification(
            db,
            'task_assigned',
            `Task Assigned: ${title}`,
            `NOVEN.CODE TASK ASSIGNED\n\nTask: ${title}\nPriority: ${body.priority || 'Medium'}\nDeadline: ${body.deadline || 'TBD'}`
          );
        }

        sendJson(res, 201, { ok: true, id: taskId });
        return;
      }

      const taskIdMatch = pathname.match(/^\/api\/admin\/tasks\/([a-zA-Z0-9-]+)$/);
      if (taskIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'tasks:status') && !hasPermission(user.role, 'tasks:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to update tasks.' });
        }
        const taskId = taskIdMatch[1];
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!existing) return sendJson(res, 404, { error: 'Task not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        const newStatus = sanitizeString(body.status ?? existing.status, 50);

        if (hasPermission(user.role, 'tasks:edit')) {
          db.prepare(`
            UPDATE tasks
            SET title = ?, description = ?, task_type = ?, status = ?, priority = ?,
                assigned_to = ?, deadline = ?, technical_notes = ?, design_notes = ?, updated_at = ?
            WHERE id = ?
          `).run(
            sanitizeString(body.title ?? existing.title, 200),
            sanitizeString(body.description ?? existing.description, 3000),
            sanitizeString(body.task_type ?? existing.task_type, 50),
            newStatus,
            sanitizeString(body.priority ?? existing.priority, 50),
            body.assigned_to !== undefined ? (body.assigned_to || null) : existing.assigned_to,
            sanitizeString(body.deadline ?? existing.deadline, 100),
            sanitizeString(body.technical_notes ?? existing.technical_notes, 3000),
            sanitizeString(body.design_notes ?? existing.design_notes, 3000),
            now,
            taskId
          );
        } else {
          // Developer / Designer / Manager updating status and notes
          db.prepare(`
            UPDATE tasks
            SET status = ?, technical_notes = ?, design_notes = ?, updated_at = ?
            WHERE id = ?
          `).run(
            newStatus,
            sanitizeString(body.technical_notes ?? existing.technical_notes, 3000),
            sanitizeString(body.design_notes ?? existing.design_notes, 3000),
            now,
            taskId
          );
        }

        logActivity(db, user, 'task_updated', 'tasks', taskId, `Task "${existing.title}" updated (status: ${newStatus})`, ip);
        if (newStatus === 'Done' && existing.status !== 'Done') {
          await sendTelegramNotification(
            db,
            'task_completed',
            `Task Completed: ${existing.title}`,
            `NOVEN.CODE TASK COMPLETED\n\nTask: ${existing.title}\nCompleted by: ${user.username}`
          );
        }

        sendJson(res, 200, { ok: true });
        return;
      }

      // 7. Team / Employees Management (OWNER ONLY)
      if (pathname === '/api/admin/employees' && req.method === 'POST') {
        if (user.role !== 'OWNER') {
          return sendJson(res, 403, { error: 'Only OWNER can create employee accounts.' });
        }
        const body = await readJsonBody(req);
        const username = sanitizeString(body.username, 100);
        const fullName = sanitizeString(body.full_name, 150);
        const role = sanitizeString(body.role, 50);
        const password = String(body.password || '');

        if (!username || !fullName || !ROLE_PERMISSIONS[role] || password.length < 8) {
          return sendJson(res, 400, { error: 'Valid username, full name, role, and password (min 8 chars) are required.' });
        }

        const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (dup) return sendJson(res, 400, { error: 'Username already exists.' });

        const { hash, salt } = hashPassword(password);
        const empId = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO users (id, username, full_name, role, password_hash, password_salt, must_change_password, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(empId, username, fullName, role, hash, salt, now, now);

        logActivity(db, user, 'employee_created', 'users', empId, `Created employee ${username} with role ${role}`, ip);
        sendJson(res, 201, { ok: true, id: empId });
        return;
      }

      const empIdMatch = pathname.match(/^\/api\/admin\/employees\/([a-zA-Z0-9-]+)$/);
      if (empIdMatch && req.method === 'PATCH') {
        if (user.role !== 'OWNER') {
          return sendJson(res, 403, { error: 'Only OWNER can modify employee accounts and permissions.' });
        }
        const empId = empIdMatch[1];
        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(empId);
        if (!existing) return sendJson(res, 404, { error: 'Employee not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        const newRole = body.role && ROLE_PERMISSIONS[body.role] ? body.role : existing.role;
        const newActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
        const newFullName = sanitizeString(body.full_name ?? existing.full_name, 150);

        db.prepare('UPDATE users SET full_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?')
          .run(newFullName, newRole, newActive, now, empId);

        if (body.new_password && String(body.new_password).length >= 8) {
          const { hash, salt } = hashPassword(String(body.new_password));
          db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
            .run(hash, salt, now, empId);
        }

        if (!newActive) {
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(empId);
        }

        logActivity(db, user, 'employee_updated', 'users', empId, `Updated employee ${existing.username} (role: ${newRole}, active: ${Boolean(newActive)})`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 8. Pricing Plans Management
      if (pathname === '/api/admin/pricing' && req.method === 'POST') {
        if (!hasPermission(user.role, 'pricing:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to manage pricing plans.' });
        }
        const body = await readJsonBody(req);
        const code = sanitizeString(body.code, 50).toUpperCase();
        if (!code) return sendJson(res, 400, { error: 'Package code is required.' });

        const now = new Date().toISOString();
        const planId = `plan-${code.toLowerCase()}-${Date.now().toString(36)}`;
        db.prepare(`
          INSERT INTO pricing_plans (
            id, code, name_ru, name_kk, name_en, desc_ru, desc_kk, desc_en,
            price_label_ru, price_label_kk, price_label_en, numeric_price, currency,
            is_custom_quote, is_recommended, is_visible, sort_order,
            cta_ru, cta_kk, cta_en, optional_addons_ru, optional_addons_kk, optional_addons_en, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KZT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          planId,
          code,
          sanitizeString(body.name_ru || code, 120),
          sanitizeString(body.name_kk || code, 120),
          sanitizeString(body.name_en || code, 120),
          sanitizeString(body.desc_ru || '', 1000),
          sanitizeString(body.desc_kk || '', 1000),
          sanitizeString(body.desc_en || '', 1000),
          sanitizeString(body.price_label_ru || 'По запросу', 150),
          sanitizeString(body.price_label_kk || 'Сұраныс бойынша', 150),
          sanitizeString(body.price_label_en || 'Custom Quote', 150),
          body.numeric_price ? Number(body.numeric_price) : null,
          body.is_custom_quote !== false ? 1 : 0,
          body.is_recommended ? 1 : 0,
          body.is_visible !== false ? 1 : 0,
          Number(body.sort_order || 99),
          sanitizeString(body.cta_ru || 'Выбрать тариф', 100),
          sanitizeString(body.cta_kk || 'Тарифті таңдау', 100),
          sanitizeString(body.cta_en || 'Choose Plan', 100),
          sanitizeString(body.optional_addons_ru || '', 500),
          sanitizeString(body.optional_addons_kk || '', 500),
          sanitizeString(body.optional_addons_en || '', 500),
          now
        );

        if (Array.isArray(body.features)) {
          const insF = db.prepare('INSERT INTO pricing_features (id, plan_id, text_ru, text_kk, text_en, is_included, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)');
          body.features.forEach((f, idx) => {
            insF.run(
              crypto.randomUUID(),
              planId,
              sanitizeString(f.text_ru || f.ru || '', 300),
              sanitizeString(f.text_kk || f.kk || '', 300),
              sanitizeString(f.text_en || f.en || '', 300),
              idx + 1
            );
          });
        }

        logActivity(db, user, 'pricing_created', 'pricing_plans', planId, `Created pricing package ${code}`, ip);
        sendJson(res, 201, { ok: true, id: planId });
        return;
      }

      const planIdMatch = pathname.match(/^\/api\/admin\/pricing\/([a-zA-Z0-9-]+)$/);
      if (planIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'pricing:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit pricing plans.' });
        }
        const planId = planIdMatch[1];
        const existing = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(planId);
        if (!existing) return sendJson(res, 404, { error: 'Pricing plan not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE pricing_plans
          SET name_ru = ?, name_kk = ?, name_en = ?,
              desc_ru = ?, desc_kk = ?, desc_en = ?,
              price_label_ru = ?, price_label_kk = ?, price_label_en = ?,
              numeric_price = ?, is_custom_quote = ?, is_recommended = ?, is_visible = ?, sort_order = ?,
              cta_ru = ?, cta_kk = ?, cta_en = ?,
              optional_addons_ru = ?, optional_addons_kk = ?, optional_addons_en = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.name_ru ?? existing.name_ru, 120),
          sanitizeString(body.name_kk ?? existing.name_kk, 120),
          sanitizeString(body.name_en ?? existing.name_en, 120),
          sanitizeString(body.desc_ru ?? existing.desc_ru, 1000),
          sanitizeString(body.desc_kk ?? existing.desc_kk, 1000),
          sanitizeString(body.desc_en ?? existing.desc_en, 1000),
          sanitizeString(body.price_label_ru ?? existing.price_label_ru, 150),
          sanitizeString(body.price_label_kk ?? existing.price_label_kk, 150),
          sanitizeString(body.price_label_en ?? existing.price_label_en, 150),
          body.numeric_price !== undefined ? (body.numeric_price === '' || body.numeric_price === null ? null : Number(body.numeric_price)) : existing.numeric_price,
          body.is_custom_quote !== undefined ? (body.is_custom_quote ? 1 : 0) : existing.is_custom_quote,
          body.is_recommended !== undefined ? (body.is_recommended ? 1 : 0) : existing.is_recommended,
          body.is_visible !== undefined ? (body.is_visible ? 1 : 0) : existing.is_visible,
          Number(body.sort_order ?? existing.sort_order),
          sanitizeString(body.cta_ru ?? existing.cta_ru, 100),
          sanitizeString(body.cta_kk ?? existing.cta_kk, 100),
          sanitizeString(body.cta_en ?? existing.cta_en, 100),
          sanitizeString(body.optional_addons_ru ?? existing.optional_addons_ru, 500),
          sanitizeString(body.optional_addons_kk ?? existing.optional_addons_kk, 500),
          sanitizeString(body.optional_addons_en ?? existing.optional_addons_en, 500),
          now,
          planId
        );

        if (Array.isArray(body.features)) {
          db.prepare('DELETE FROM pricing_features WHERE plan_id = ?').run(planId);
          const insF = db.prepare('INSERT INTO pricing_features (id, plan_id, text_ru, text_kk, text_en, is_included, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)');
          body.features.forEach((f, idx) => {
            insF.run(
              crypto.randomUUID(),
              planId,
              sanitizeString(f.text_ru || '', 300),
              sanitizeString(f.text_kk || f.text_ru || '', 300),
              sanitizeString(f.text_en || f.text_ru || '', 300),
              idx + 1
            );
          });
        }

        logActivity(db, user, 'pricing_updated', 'pricing_plans', existing.code, `Updated pricing package ${existing.code}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 9. Content Management: Services, Portfolio, FAQs, Settings
      const srvIdMatch = pathname.match(/^\/api\/admin\/services\/([a-zA-Z0-9-]+)$/);
      if (srvIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'content:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit services.' });
        }
        const srvId = srvIdMatch[1];
        const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(srvId);
        if (!existing) return sendJson(res, 404, { error: 'Service not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE services
          SET title_ru = ?, title_kk = ?, title_en = ?,
              desc_ru = ?, desc_kk = ?, desc_en = ?,
              is_visible = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.title_ru ?? existing.title_ru, 150),
          sanitizeString(body.title_kk ?? existing.title_kk, 150),
          sanitizeString(body.title_en ?? existing.title_en, 150),
          sanitizeString(body.desc_ru ?? existing.desc_ru, 2000),
          sanitizeString(body.desc_kk ?? existing.desc_kk, 2000),
          sanitizeString(body.desc_en ?? existing.desc_en, 2000),
          body.is_visible !== undefined ? (body.is_visible ? 1 : 0) : existing.is_visible,
          Number(body.sort_order ?? existing.sort_order),
          now,
          srvId
        );

        logActivity(db, user, 'service_updated', 'services', srvId, `Updated service ${existing.title_en}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      const portIdMatch = pathname.match(/^\/api\/admin\/portfolio\/([a-zA-Z0-9-]+)$/);
      if (portIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'content:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit portfolio.' });
        }
        const portId = portIdMatch[1];
        const existing = db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(portId);
        if (!existing) return sendJson(res, 404, { error: 'Portfolio project not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE portfolio_projects
          SET title_ru = ?, title_kk = ?, title_en = ?,
              category_ru = ?, category_kk = ?, category_en = ?,
              desc_ru = ?, desc_kk = ?, desc_en = ?,
              live_url = ?, preview_image = ?, is_visible = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.title_ru ?? existing.title_ru, 150),
          sanitizeString(body.title_kk ?? existing.title_kk, 150),
          sanitizeString(body.title_en ?? existing.title_en, 150),
          sanitizeString(body.category_ru ?? existing.category_ru, 150),
          sanitizeString(body.category_kk ?? existing.category_kk, 150),
          sanitizeString(body.category_en ?? existing.category_en, 150),
          sanitizeString(body.desc_ru ?? existing.desc_ru, 2000),
          sanitizeString(body.desc_kk ?? existing.desc_kk, 2000),
          sanitizeString(body.desc_en ?? existing.desc_en, 2000),
          sanitizeString(body.live_url ?? existing.live_url, 500),
          sanitizeString(body.preview_image ?? existing.preview_image, 500),
          body.is_visible !== undefined ? (body.is_visible ? 1 : 0) : existing.is_visible,
          Number(body.sort_order ?? existing.sort_order),
          now,
          portId
        );

        logActivity(db, user, 'portfolio_updated', 'portfolio_projects', portId, `Updated portfolio item ${existing.title_en}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/admin/faqs' && req.method === 'POST') {
        if (!hasPermission(user.role, 'content:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to create FAQs.' });
        }
        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        const faqId = `faq-${Date.now().toString(36)}`;
        db.prepare(`
          INSERT INTO faqs (id, category, q_ru, q_kk, q_en, a_ru, a_kk, a_en, is_visible, sort_order, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          faqId,
          sanitizeString(body.category || 'general', 64),
          sanitizeString(body.q_ru, 500),
          sanitizeString(body.q_kk || body.q_ru, 500),
          sanitizeString(body.q_en || body.q_ru, 500),
          sanitizeString(body.a_ru, 3000),
          sanitizeString(body.a_kk || body.a_ru, 3000),
          sanitizeString(body.a_en || body.a_ru, 3000),
          Number(body.sort_order || 20),
          now
        );
        logActivity(db, user, 'faq_created', 'faqs', faqId, 'Created new FAQ entry', ip);
        sendJson(res, 201, { ok: true, id: faqId });
        return;
      }

      const faqIdMatch = pathname.match(/^\/api\/admin\/faqs\/([a-zA-Z0-9-]+)$/);
      if (faqIdMatch && req.method === 'PATCH') {
        if (!hasPermission(user.role, 'content:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to edit FAQs.' });
        }
        const faqId = faqIdMatch[1];
        const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(faqId);
        if (!existing) return sendJson(res, 404, { error: 'FAQ not found.' });

        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE faqs
          SET q_ru = ?, q_kk = ?, q_en = ?, a_ru = ?, a_kk = ?, a_en = ?, is_visible = ?, updated_at = ?
          WHERE id = ?
        `).run(
          sanitizeString(body.q_ru ?? existing.q_ru, 500),
          sanitizeString(body.q_kk ?? existing.q_kk, 500),
          sanitizeString(body.q_en ?? existing.q_en, 500),
          sanitizeString(body.a_ru ?? existing.a_ru, 3000),
          sanitizeString(body.a_kk ?? existing.a_kk, 3000),
          sanitizeString(body.a_en ?? existing.a_en, 3000),
          body.is_visible !== undefined ? (body.is_visible ? 1 : 0) : existing.is_visible,
          now,
          faqId
        );
        logActivity(db, user, 'faq_updated', 'faqs', faqId, `Updated FAQ ${faqId}`, ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      // 10. Settings & Telegram Configuration
      if (pathname === '/api/admin/settings' && req.method === 'PATCH') {
        if (user.role !== 'OWNER' && !hasPermission(user.role, 'content:edit')) {
          return sendJson(res, 403, { error: 'Permission denied to modify settings.' });
        }
        const body = await readJsonBody(req);
        const now = new Date().toISOString();

        if (body.homepage_content) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
            .run('homepage_content', JSON.stringify(body.homepage_content), now);
        }

        if (body.company_contacts) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
            .run('company_contacts', JSON.stringify(body.company_contacts), now);
        }

        if (body.telegram_config && user.role === 'OWNER') {
          const existingRow = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('telegram_config');
          const prev = existingRow ? JSON.parse(existingRow.value_json) : {};
          const updatedTg = {
            contactUsername: '@notnormale',
            botToken: body.telegram_config.botToken !== undefined && body.telegram_config.botToken !== ''
              ? sanitizeString(body.telegram_config.botToken, 200)
              : (prev.botToken || ''),
            chatId: body.telegram_config.chatId !== undefined
              ? sanitizeString(body.telegram_config.chatId, 100)
              : (prev.chatId || ''),
            enabledEvents: Array.isArray(body.telegram_config.enabledEvents)
              ? body.telegram_config.enabledEvents
              : (prev.enabledEvents || [])
          };
          db.prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
            .run('telegram_config', JSON.stringify(updatedTg), now);
        }

        logActivity(db, user, 'settings_updated', 'settings', 'global', 'Updated platform settings', ip);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/admin/telegram/test' && req.method === 'POST') {
        if (user.role !== 'OWNER') {
          return sendJson(res, 403, { error: 'Only OWNER can trigger integration tests.' });
        }
        const result = await sendTelegramNotification(
          db,
          'critical_event',
          'Telegram Integration Verification',
          `NOVEN.CODE CRM — INTEGRATION CHECK\n\nTriggered by: ${user.username}\nTimestamp: ${new Date().toISOString()}\nContact: @notnormale`
        );
        logActivity(db, user, 'telegram_test', 'integrations', 'telegram', `Tested Telegram Bot delivery (${result.status})`, ip);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      sendJson(res, 404, { error: 'Admin API endpoint not found.' });
      return;
    }

    // ========================================================================
    // STATIC ASSETS & FRONTEND ROUTES
    // ========================================================================
    if (pathname.startsWith('/assets/') || pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
      const safeRel = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullAssetPath = path.join(PUBLIC_DIR, safeRel);
      if (serveStaticFile(res, fullAssetPath)) return;
      sendJson(res, 404, { error: 'Asset not found' });
      return;
    }

    // Serve Admin CRM Interface at /admin
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const adminHtmlPath = path.join(PUBLIC_DIR, 'admin.html');
      if (serveStaticFile(res, adminHtmlPath, 'text/html; charset=utf-8')) return;
    }

    // Serve Public Website SPA / Multi-route views
    const validPublicRoutes = new Set([
      '/',
      '/services',
      '/pricing',
      '/portfolio',
      '/about',
      '/process',
      '/faq',
      '/contact',
      '/start-project',
      '/order-confirmation'
    ]);

    if (validPublicRoutes.has(pathname)) {
      const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
      if (serveStaticFile(res, indexHtmlPath, 'text/html; charset=utf-8')) return;
    }

    // 404 Fallback to index.html with client-side route handling or 404 state
    const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
    if (serveStaticFile(res, indexHtmlPath, 'text/html; charset=utf-8')) return;

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    sendJson(res, 500, {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Noven.code Full-Stack Server listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { server, getDb };
