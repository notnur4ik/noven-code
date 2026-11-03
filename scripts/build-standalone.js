'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const seedData = require('../src/data/seed-data');
const { ROLE_PERMISSIONS } = require('../src/server/security');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// 1. Read CSS and Assets
const mainCss = fs.readFileSync(path.join(PUBLIC_DIR, 'css', 'styles.css'), 'utf8');
const adminHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'admin.html'), 'utf8');
const crmCssMatch = adminHtml.match(/<style>([\s\S]*?)<\/style>/i);
const crmCss = crmCssMatch ? crmCssMatch[1].replace(/body\s*\{[\s\S]*?\}/, '') : '';

// Convert SVG portfolio previews to base64 Data URIs so standalone index.html works offline or on any host
function svgToDataUri(relPath) {
  const fullPath = path.join(PUBLIC_DIR, relPath.replace(/^\//, ''));
  if (!fs.existsSync(fullPath)) return relPath;
  const svgContent = fs.readFileSync(fullPath, 'utf8');
  return 'data:image/svg+xml;base64,' + Buffer.from(svgContent, 'utf8').toString('base64');
}

const embeddedPortfolio = seedData.INITIAL_PORTFOLIO.map((p) => ({
  ...p,
  preview_image: svgToDataUri(p.preview_image)
}));

// Compute salted SHA-256 digest of initial owner credentials at build time
// so plaintext password is NEVER stored in client-side source code
const OWNER_SALT = 'nc_v1_8f94a2b7c1e3d506';
const OWNER_USER = process.env.INITIAL_OWNER_USERNAME || 'Notnur4ikGg';
const OWNER_PASS = process.env.INITIAL_OWNER_PASSWORD || 'Nurik1107!)';
const OWNER_HASH = crypto
  .createHash('sha256')
  .update(`${OWNER_SALT}:${OWNER_USER}:${OWNER_PASS}`)
  .digest('hex');

const i18nJs = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'i18n.js'), 'utf8');
const scene3dSoundJs = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'scene3d-sound.js'), 'utf8');
const publicAppJs = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'public-app.js'), 'utf8');
const adminAppJs = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'admin-app.js'), 'utf8');

const initialSeedPayload = {
  roles: seedData.INITIAL_ROLES,
  rolePermissions: ROLE_PERMISSIONS,
  services: seedData.INITIAL_SERVICES,
  pricingPlans: seedData.INITIAL_PRICING_PLANS,
  portfolio: embeddedPortfolio,
  faqs: seedData.INITIAL_FAQS,
  settings: seedData.INITIAL_SETTINGS,
  ownerSalt: OWNER_SALT,
  ownerUsername: OWNER_USER,
  ownerDigest: OWNER_HASH
};

const hybridEngineScript = `
(function() {
  const SEED = ${JSON.stringify(initialSeedPayload)};
  const STORAGE_KEY = 'nc_standalone_database_v2';
  const SESSION_KEY = 'nc_standalone_session_v2';

  function ensureArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim()) {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // Pure JS SHA-256 implementation (works even on file:// where crypto.subtle may be restricted)
  function sha256Hex(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const utf8 = unescape(encodeURIComponent(ascii));
    const asciiBitLength = utf8[lengthProperty] * 8;
    let hash = sha256Hex.h = sha256Hex.h || [];
    const k = sha256Hex.k = sha256Hex.k || [];
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    let str = utf8 + '\\x80';
    while ((str[lengthProperty] % 64) - 56) str += '\\x00';
    for (i = 0; i < str[lengthProperty]; i++) {
      j = str.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    let h = hash.slice(0, 8);
    for (j = 0; j < words[lengthProperty]; ) {
      const w = words.slice(j, (j += 16));
      const oldHash = h.slice(0);
      h = h.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const i2 = i + j;
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = h[0], e = h[4];
        const temp1 =
          h[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & h[5]) ^ (~e & h[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(temp1 + temp2) | 0].concat(h);
        h[4] = (h[4] + temp1) | 0;
        h.pop();
      }
      for (i = 0; i < 8; i++) {
        h[i] = (h[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  function loadLocalDb() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.services)) {
          parsed.services = parsed.services.map((s) => ({
            ...s,
            benefits_ru: ensureArray(s.benefits_ru),
            benefits_kk: ensureArray(s.benefits_kk),
            benefits_en: ensureArray(s.benefits_en)
          }));
          return parsed;
        }
      }
    } catch {}
    const now = new Date().toISOString();
    const initialDb = {
      users: [
        {
          id: 'owner-001',
          username: SEED.ownerUsername,
          full_name: 'Noven.code Studio Owner',
          role: 'OWNER',
          digest: SEED.ownerDigest,
          must_change_password: false,
          is_active: true,
          last_login_at: null,
          created_at: now,
          updated_at: now
        }
      ],
      roles: SEED.roles.map((r) => ({
        ...r,
        permissions: ensureArray(r.permissions_json)
      })),
      services: SEED.services.map((s) => ({
        ...s,
        benefits_ru: ensureArray(s.benefits_ru),
        benefits_kk: ensureArray(s.benefits_kk),
        benefits_en: ensureArray(s.benefits_en),
        is_visible: Boolean(s.is_visible)
      })),
      pricingPlans: SEED.pricingPlans.map((p) => ({
        ...p,
        is_custom_quote: Boolean(p.is_custom_quote),
        is_recommended: Boolean(p.is_recommended),
        is_visible: Boolean(p.is_visible),
        features: (p.features || []).map((f, idx) => ({
          id: 'feat-' + p.id + '-' + idx,
          plan_id: p.id,
          text_ru: f.ru,
          text_kk: f.kk,
          text_en: f.en,
          is_included: true,
          sort_order: idx + 1
        }))
      })),
      portfolio: SEED.portfolio.map((pr) => ({
        ...pr,
        is_visible: Boolean(pr.is_visible)
      })),
      faqs: SEED.faqs.map((fq) => ({
        ...fq,
        is_visible: Boolean(fq.is_visible)
      })),
      settings: JSON.parse(JSON.stringify(SEED.settings)),
      orders: [],
      clients: [],
      projects: [],
      tasks: [],
      activityLogs: [],
      notifications: []
    };
    saveLocalDb(initialDb);
    return initialDb;
  }

  function saveLocalDb(db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {}
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(sess) {
    try {
      if (!sess) {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
      } else {
        const s = JSON.stringify(sess);
        sessionStorage.setItem(SESSION_KEY, s);
        localStorage.setItem(SESSION_KEY, s);
      }
    } catch {}
  }

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function dispatchTelegramIfConfigured(db, eventType, title, messageText) {
    const tg = db.settings.telegram_config || {};
    const now = new Date().toISOString();
    const notif = {
      id: 'ntf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      event_type: eventType,
      title,
      message: messageText,
      telegram_sent: false,
      telegram_status: 'queued_missing_credentials',
      created_at: now
    };

    if (tg.botToken && tg.chatId) {
      try {
        const res = await origFetch('https://api.telegram.org/bot' + encodeURIComponent(tg.botToken) + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tg.chatId, text: messageText })
        });
        notif.telegram_sent = res.ok;
        notif.telegram_status = res.ok ? 'delivered' : 'http_' + res.status;
      } catch (e) {
        notif.telegram_status = 'network_error';
      }
    }
    db.notifications.unshift(notif);
    saveLocalDb(db);
    return { sent: notif.telegram_sent, status: notif.telegram_status };
  }

  const origFetch = window.fetch.bind(window);
  let backendAvailable = null;

  async function handleVirtualApi(urlStr, options = {}) {
    const u = new URL(urlStr, 'http://127.0.0.1:3000');
    const pathname = u.pathname;
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const db = loadLocalDb();
    const now = new Date().toISOString();

    if (pathname === '/api/public/bootstrap' && method === 'GET') {
      return jsonResponse(200, {
        services: db.services.filter((s) => s.is_visible),
        pricingPlans: db.pricingPlans.filter((p) => p.is_visible),
        portfolio: db.portfolio.filter((p) => p.is_visible),
        faqs: db.faqs.filter((f) => f.is_visible),
        settings: {
          company_contacts: db.settings.company_contacts,
          homepage_content: db.settings.homepage_content,
          language_settings: db.settings.language_settings
        }
      });
    }

    if (pathname === '/api/public/orders' && method === 'POST') {
      const selectedServices = Array.isArray(body.selectedServices) ? body.selectedServices : [];
      if (selectedServices.length === 0) return jsonResponse(400, { error: 'Please select at least one service.' });
      if (!body.businessName || !body.businessType || !body.businessDescription || !body.projectGoals) {
        return jsonResponse(400, { error: 'Please complete all required business information fields.' });
      }
      if (!body.customerName || !body.customerPhone) {
        return jsonResponse(400, { error: 'Customer name and phone number are required.' });
      }

      if (body.idempotencyKey) {
        const dup = db.orders.find((o) => o.idempotency_key === body.idempotencyKey);
        if (dup) {
          return jsonResponse(200, { ok: true, duplicatePrevented: true, orderId: dup.id, orderCode: dup.order_code, createdAt: dup.created_at });
        }
      }

      const nextNum = db.orders.length + 1;
      const orderCode = '#NC-' + String(nextNum).padStart(4, '0');
      const orderId = 'ord-' + Date.now();

      let client = db.clients.find((c) => c.phone === body.customerPhone);
      if (!client) {
        client = {
          id: 'cli-' + Date.now(),
          name: body.customerName,
          business_name: body.businessName,
          business_type: body.businessType,
          industry: body.industry || '',
          phone: body.customerPhone,
          whatsapp: body.customerWhatsapp || '',
          email: body.customerEmail || '',
          preferred_contact: body.preferredContact || 'whatsapp',
          website: body.existingWebsite || '',
          social_links: body.socialMedia || '',
          internal_notes: '',
          created_at: now,
          updated_at: now
        };
        db.clients.unshift(client);
      }

      const attachments = Array.isArray(body.attachments)
        ? body.attachments.slice(0, 10).map((a, idx) => ({
            id: 'att-' + Date.now() + '-' + idx,
            order_id: orderId,
            original_name: a.name || 'reference.png',
            mime_type: a.type || 'image/png',
            size_bytes: a.size || 1024,
            dataBase64: a.dataBase64 || '',
            created_at: now
          }))
        : [];

      const orderRecord = {
        id: orderId,
        order_code: orderCode,
        idempotency_key: body.idempotencyKey || null,
        client_id: client.id,
        selected_services: selectedServices,
        selected_package: body.selectedPackage || '',
        business_name: body.businessName,
        business_type: body.businessType,
        custom_business_type: body.customBusinessType || '',
        industry: body.industry || '',
        business_description: body.businessDescription,
        target_audience: body.targetAudience || '',
        project_goals: body.projectGoals,
        existing_website: body.existingWebsite || '',
        social_media: body.socialMedia || '',
        reference_notes: body.referenceNotes || '',
        reference_avoid: body.referenceAvoid || '',
        primary_color: body.primaryColor || '#681D32',
        secondary_color: body.secondaryColor || '#A63854',
        background_color: body.backgroundColor || '#F8F7F5',
        hex_codes: body.hexCodes || '',
        existing_branding: body.existingBranding || '',
        preferred_style: body.preferredStyle || '',
        colors_to_avoid: body.colorsToAvoid || '',
        required_features: Array.isArray(body.requiredFeatures) ? body.requiredFeatures : [],
        custom_features: body.customFeatures || '',
        customer_name: body.customerName,
        customer_phone: body.customerPhone,
        customer_whatsapp: body.customerWhatsapp || '',
        customer_email: body.customerEmail || '',
        preferred_contact: body.preferredContact || 'whatsapp',
        estimated_budget: body.estimatedBudget || '',
        desired_deadline: body.desiredDeadline || '',
        priority: body.priority || 'standard',
        additional_requirements: body.additionalRequirements || '',
        status: 'New',
        assigned_to: null,
        internal_notes: '',
        attachments,
        created_at: now,
        updated_at: now
      };

      db.orders.unshift(orderRecord);
      db.activityLogs.unshift({
        id: 'log-' + Date.now(),
        actor_username: 'PUBLIC_ORDER',
        actor_role: 'CLIENT',
        action: 'order_created',
        entity_type: 'orders',
        entity_id: orderCode,
        details: 'New project order ' + orderCode + ' submitted by ' + body.customerName,
        created_at: now
      });
      saveLocalDb(db);

      const tgText = [
        'NEW NOVEN.CODE ORDER',
        '',
        'Order ID: ' + orderCode,
        '',
        'Customer: ' + orderRecord.customer_name,
        '',
        'Service: ' + selectedServices.join(', '),
        '',
        'Package: ' + (orderRecord.selected_package || 'Custom'),
        '',
        'Budget: ' + (orderRecord.estimated_budget || 'Not specified'),
        '',
        'Deadline: ' + (orderRecord.desired_deadline || 'Flexible'),
        '',
        'Contact: ' + orderRecord.customer_phone + ' [' + orderRecord.preferred_contact + ']',
        '',
        'Open CRM to view the complete order.'
      ].join('\\n');

      await dispatchTelegramIfConfigured(db, 'order_created', 'New Order ' + orderCode, tgText);

      return jsonResponse(201, {
        ok: true,
        orderId,
        orderCode,
        createdAt: now,
        summary: {
          orderCode,
          customerName: orderRecord.customer_name,
          businessName: orderRecord.business_name,
          selectedServices,
          selectedPackage: orderRecord.selected_package,
          estimatedBudget: orderRecord.estimated_budget,
          desiredDeadline: orderRecord.desired_deadline,
          attachmentsCount: attachments.length
        }
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const uname = String(body.username || '').trim();
      const pass = String(body.password || '');
      const user = db.users.find((u) => u.username === uname && u.is_active);
      const candidateDigest = sha256Hex(SEED.ownerSalt + ':' + uname + ':' + pass);
      if (!user || user.digest !== candidateDigest) {
        return jsonResponse(401, { error: 'Invalid username or password.' });
      }
      user.last_login_at = now;
      const sess = {
        csrfToken: 'csrf_' + Date.now(),
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          mustChangePassword: Boolean(user.must_change_password),
          permissions: SEED.rolePermissions[user.role] || []
        }
      };
      setSession(sess);
      db.activityLogs.unshift({
        id: 'log-' + Date.now(),
        actor_username: user.username,
        actor_role: user.role,
        action: 'login_success',
        entity_type: 'auth',
        entity_id: user.id,
        details: 'Employee signed in to CRM',
        created_at: now
      });
      saveLocalDb(db);
      return jsonResponse(200, { ok: true, csrfToken: sess.csrfToken, expiresAt: sess.expiresAt, user: sess.user });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      setSession(null);
      return jsonResponse(200, { ok: true });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const sess = getSession();
      if (!sess) return jsonResponse(401, { authenticated: false });
      return jsonResponse(200, { authenticated: true, csrfToken: sess.csrfToken, expiresAt: sess.expiresAt, user: sess.user });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const sess = getSession();
      if (!sess) return jsonResponse(401, { error: 'Authentication required.' });
      const user = db.users.find((u) => u.id === sess.user.id);
      const currentDigest = sha256Hex(SEED.ownerSalt + ':' + user.username + ':' + String(body.currentPassword || ''));
      if (!user || user.digest !== currentDigest) {
        return jsonResponse(400, { error: 'Current password is incorrect.' });
      }
      if (String(body.newPassword || '').length < 8) {
        return jsonResponse(400, { error: 'New password must be at least 8 characters.' });
      }
      user.digest = sha256Hex(SEED.ownerSalt + ':' + user.username + ':' + String(body.newPassword));
      user.updated_at = now;
      saveLocalDb(db);
      return jsonResponse(200, { ok: true });
    }

    if (pathname.startsWith('/api/admin/')) {
      const sess = getSession();
      if (!sess) return jsonResponse(401, { error: 'Unauthorized' });

      if (pathname === '/api/admin/overview' && method === 'GET') {
        const tg = db.settings.telegram_config || {};
        return jsonResponse(200, {
          stats: {
            totalOrders: db.orders.length,
            newOrders: db.orders.filter((o) => o.status === 'New').length,
            activeProjects: db.projects.filter((p) => !['Completed', 'Cancelled'].includes(p.status)).length,
            completedProjects: db.projects.filter((p) => p.status === 'Completed').length,
            cancelledOrders: db.orders.filter((o) => o.status === 'Cancelled').length,
            totalClients: db.clients.length
          },
          orders: db.orders,
          clients: db.clients,
          projects: db.projects,
          tasks: db.tasks,
          employees: db.users.map((u) => ({
            id: u.id,
            username: u.username,
            full_name: u.full_name,
            role: u.role,
            is_active: u.is_active,
            last_login_at: u.last_login_at,
            created_at: u.created_at
          })),
          roles: db.roles,
          pricingPlans: db.pricingPlans,
          services: db.services,
          portfolio: db.portfolio,
          faqs: db.faqs,
          activityLogs: db.activityLogs,
          notifications: db.notifications,
          settings: {
            ...db.settings,
            telegram_config: {
              contactUsername: '@notnormale',
              chatId: tg.chatId || '',
              hasBotToken: Boolean(tg.botToken),
              enabledEvents: tg.enabledEvents || []
            }
          }
        });
      }

      const ordMatch = pathname.match(/^\\/api\\/admin\\/orders\\/([^/]+)$/);
      if (ordMatch && method === 'PATCH') {
        const ord = db.orders.find((o) => o.id === ordMatch[1]);
        if (!ord) return jsonResponse(404, { error: 'Order not found' });
        if (body.status !== undefined) ord.status = body.status;
        if (body.assigned_to !== undefined) ord.assigned_to = body.assigned_to;
        if (body.internal_notes !== undefined) ord.internal_notes = body.internal_notes;
        if (body.estimated_budget !== undefined) ord.estimated_budget = body.estimated_budget;
        if (body.desired_deadline !== undefined) ord.desired_deadline = body.desired_deadline;
        ord.updated_at = now;
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (ordMatch && method === 'DELETE') {
        db.orders = db.orders.filter((o) => o.id !== ordMatch[1]);
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/clients' && method === 'POST') {
        db.clients.unshift({
          id: 'cli-' + Date.now(),
          name: body.name,
          business_name: body.business_name || '',
          business_type: body.business_type || '',
          industry: body.industry || '',
          phone: body.phone,
          whatsapp: body.whatsapp || '',
          email: body.email || '',
          preferred_contact: body.preferred_contact || 'whatsapp',
          website: body.website || '',
          social_links: body.social_links || '',
          internal_notes: body.internal_notes || '',
          created_at: now,
          updated_at: now
        });
        saveLocalDb(db);
        return jsonResponse(201, { ok: true });
      }

      if (pathname === '/api/admin/projects' && method === 'POST') {
        const pCode = '#PRJ-' + String(db.projects.length + 1).padStart(3, '0');
        db.projects.unshift({
          id: 'prj-' + Date.now(),
          project_code: pCode,
          title: body.title,
          description: body.description || '',
          client_id: body.client_id || null,
          order_id: body.order_id || null,
          status: body.status || 'In Progress',
          progress: Number(body.progress || 10),
          deadline: body.deadline || '',
          assigned_employees: Array.isArray(body.assigned_employees) ? body.assigned_employees : [],
          internal_notes: body.internal_notes || '',
          technical_notes: '',
          design_notes: '',
          created_at: now,
          updated_at: now
        });
        saveLocalDb(db);
        return jsonResponse(201, { ok: true, projectCode: pCode });
      }

      const prjMatch = pathname.match(/^\\/api\\/admin\\/projects\\/([^/]+)$/);
      if (prjMatch && method === 'PATCH') {
        const prj = db.projects.find((p) => p.id === prjMatch[1]);
        if (!prj) return jsonResponse(404, { error: 'Project not found' });
        Object.assign(prj, body, { updated_at: now });
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/tasks' && method === 'POST') {
        db.tasks.unshift({
          id: 'tsk-' + Date.now(),
          project_id: body.project_id || null,
          title: body.title,
          description: body.description || '',
          task_type: body.task_type || 'development',
          status: body.status || 'To Do',
          priority: body.priority || 'Medium',
          assigned_to: body.assigned_to || null,
          deadline: body.deadline || '',
          technical_notes: '',
          design_notes: '',
          created_at: now,
          updated_at: now
        });
        saveLocalDb(db);
        return jsonResponse(201, { ok: true });
      }

      const tskMatch = pathname.match(/^\\/api\\/admin\\/tasks\\/([^/]+)$/);
      if (tskMatch && method === 'PATCH') {
        const tsk = db.tasks.find((t) => t.id === tskMatch[1]);
        if (!tsk) return jsonResponse(404, { error: 'Task not found' });
        Object.assign(tsk, body, { updated_at: now });
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/employees' && method === 'POST') {
        if (sess.user.role !== 'OWNER') return jsonResponse(403, { error: 'Only OWNER can create employee accounts.' });
        db.users.push({
          id: 'usr-' + Date.now(),
          username: body.username,
          full_name: body.full_name,
          role: body.role,
          digest: sha256Hex(SEED.ownerSalt + ':' + body.username + ':' + body.password),
          is_active: true,
          created_at: now,
          updated_at: now
        });
        saveLocalDb(db);
        return jsonResponse(201, { ok: true });
      }

      const empMatch = pathname.match(/^\\/api\\/admin\\/employees\\/([^/]+)$/);
      if (empMatch && method === 'PATCH') {
        const emp = db.users.find((u) => u.id === empMatch[1]);
        if (!emp) return jsonResponse(404, { error: 'Not found' });
        if (body.role) emp.role = body.role;
        if (body.is_active !== undefined) emp.is_active = Boolean(body.is_active);
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/pricing' && method === 'POST') {
        const id = 'plan-' + Date.now();
        db.pricingPlans.push({
          id,
          code: String(body.code || 'CUSTOM').toUpperCase(),
          name_ru: body.name_ru || body.code,
          name_kk: body.name_kk || body.code,
          name_en: body.name_en || body.code,
          desc_ru: body.desc_ru || '',
          desc_kk: body.desc_kk || '',
          desc_en: body.desc_en || '',
          price_label_ru: body.price_label_ru || 'По запросу',
          price_label_kk: body.price_label_kk || 'Сұраныс бойынша',
          price_label_en: body.price_label_en || 'Custom Quote',
          is_custom_quote: true,
          is_recommended: Boolean(body.is_recommended),
          is_visible: true,
          sort_order: Number(body.sort_order || 99),
          cta_ru: 'Выбрать тариф',
          cta_kk: 'Тарифті таңдау',
          cta_en: 'Choose Plan',
          features: (body.features || []).map((f, idx) => ({
            id: 'ft-' + Date.now() + '-' + idx,
            text_ru: f.text_ru || '',
            text_kk: f.text_kk || f.text_ru || '',
            text_en: f.text_en || f.text_ru || '',
            is_included: true
          }))
        });
        saveLocalDb(db);
        return jsonResponse(201, { ok: true, id });
      }

      const planMatch = pathname.match(/^\\/api\\/admin\\/pricing\\/([^/]+)$/);
      if (planMatch && method === 'PATCH') {
        const plan = db.pricingPlans.find((p) => p.id === planMatch[1]);
        if (!plan) return jsonResponse(404, { error: 'Not found' });
        Object.assign(plan, body);
        if (Array.isArray(body.features)) {
          plan.features = body.features.map((f, idx) => ({
            id: 'ft-' + Date.now() + '-' + idx,
            text_ru: f.text_ru || '',
            text_kk: f.text_kk || f.text_ru || '',
            text_en: f.text_en || f.text_ru || '',
            is_included: true
          }));
        }
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      const srvMatch = pathname.match(/^\\/api\\/admin\\/services\\/([^/]+)$/);
      if (srvMatch && method === 'PATCH') {
        const srv = db.services.find((s) => s.id === srvMatch[1]);
        if (srv) Object.assign(srv, body);
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      const portMatch = pathname.match(/^\\/api\\/admin\\/portfolio\\/([^/]+)$/);
      if (portMatch && method === 'PATCH') {
        const pr = db.portfolio.find((p) => p.id === portMatch[1]);
        if (pr) Object.assign(pr, body);
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      const faqMatch = pathname.match(/^\\/api\\/admin\\/faqs\\/([^/]+)$/);
      if (faqMatch && method === 'PATCH') {
        const fq = db.faqs.find((f) => f.id === faqMatch[1]);
        if (fq) Object.assign(fq, body);
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/settings' && method === 'PATCH') {
        if (body.homepage_content) db.settings.homepage_content = body.homepage_content;
        if (body.telegram_config) {
          db.settings.telegram_config = {
            ...db.settings.telegram_config,
            botToken: body.telegram_config.botToken || db.settings.telegram_config?.botToken || '',
            chatId: body.telegram_config.chatId ?? db.settings.telegram_config?.chatId ?? ''
          };
        }
        saveLocalDb(db);
        return jsonResponse(200, { ok: true });
      }

      if (pathname === '/api/admin/telegram/test' && method === 'POST') {
        const result = await dispatchTelegramIfConfigured(
          db,
          'critical_event',
          'Telegram Integration Verification',
          'NOVEN.CODE CRM — INTEGRATION CHECK\\nTriggered by: ' + sess.user.username
        );
        return jsonResponse(200, { ok: true, result });
      }
    }

    return jsonResponse(404, { error: 'Not found' });
  }

  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : input.url;
    if (urlStr.startsWith('/api/')) {
      if (window.location.protocol === 'file:') {
        return handleVirtualApi(urlStr, init);
      }
      if (backendAvailable === false) {
        return handleVirtualApi(urlStr, init);
      }
      try {
        const res = await origFetch(input, init);
        if (res.status === 404 && !res.headers.get('content-type')?.includes('application/json')) {
          backendAvailable = false;
          return handleVirtualApi(urlStr, init);
        }
        backendAvailable = true;
        return res;
      } catch {
        backendAvailable = false;
        return handleVirtualApi(urlStr, init);
      }
    }
    return origFetch(input, init);
  };

  // Safe History pushState wrapper so standalone file:// doesn't throw SecurityError
  const origPushState = window.history.pushState.bind(window.history);
  window.history.pushState = function(stateObj, title, url) {
    try {
      origPushState(stateObj, title, url);
    } catch {
      window.__ncVirtualPath = url;
    }
  };
})();
`;

// View switcher between Public Site (#nc-app) and CRM (#nc-crm-root) inside single index.html
const viewSwitcherScript = `
(function() {
  function openAdminMode() {
    document.getElementById('nc-app').style.display = 'none';
    document.getElementById('nc-crm-root').style.display = 'block';
    document.body.classList.add('crm-mode-active');
    if (window.refreshNovenCrm) window.refreshNovenCrm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openPublicMode() {
    document.getElementById('nc-crm-root').style.display = 'none';
    document.getElementById('nc-app').style.display = 'block';
    document.body.classList.remove('crm-mode-active');
    if (window.refreshNovenPublicSite) window.refreshNovenPublicSite();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', (e) => {
    const adminLink = e.target.closest('a[href="/admin"]');
    if (adminLink) {
      e.preventDefault();
      openAdminMode();
      return;
    }
    const backHomeLink = e.target.closest('#nc-crm-root a[href="/"]');
    if (backHomeLink) {
      e.preventDefault();
      openPublicMode();
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  if (window.location.pathname === '/admin' || window.location.pathname.endsWith('/admin') || window.location.hash === '#admin') {
    window.addEventListener('DOMContentLoaded', openAdminMode);
  }
})();
`;

const standaloneHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Noven.code — Студия цифровой разработки | Веб-сайты, 3D, CRM и Автоматизация</title>
  <meta name="description" content="Noven.code создает современные цифровые продукты, премиальные веб-сайты, интерактивные 3D-решения и индивидуальные CRM-системы для роста бизнеса." />
  <meta property="og:title" content="Noven.code — Modern Digital Development Studio" />
  <meta property="og:description" content="WE BUILD DIGITAL. YOU GROW. Custom websites, interactive 3D experiences, CRM systems and business automation." />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Noven.code",
    "description": "Digital development studio creating premium websites, interactive 3D experiences, CRM systems and business automation solutions.",
    "telephone": "+77066421107",
    "sameAs": [
      "https://www.instagram.com/noven.code/",
      "https://wa.me/77066421107",
      "https://t.me/notnormale"
    ]
  }
  </script>
  <style>
${mainCss}
${crmCss}
body.crm-mode-active {
  background: var(--near-black);
  color: var(--off-white);
}
  </style>
</head>
<body>
  <div id="nc-app">
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #171316; color: #F8F7F5; font-family: sans-serif; gap: 0.75rem;">
      <div style="font-size: 0.85rem; letter-spacing: 0.16em; color: #E9DDE0;">✻ NOVEN.CODE</div>
      <div style="font-size: 1.25rem; font-weight: 800; letter-spacing: 0.04em;">WE BUILD DIGITAL. YOU GROW.</div>
    </div>
  </div>
  <div id="nc-crm-root" style="display: none;"></div>

  <script>
${hybridEngineScript}
  </script>
  <script>
${i18nJs}
  </script>
  <script>
${scene3dSoundJs}
  </script>
  <script>
${publicAppJs}
  </script>
  <script>
${adminAppJs}
  </script>
  <script>
${viewSwitcherScript}
  </script>
</body>
</html>
`;

const outRootIndex = path.join(ROOT, 'index.html');
const outRoot404 = path.join(ROOT, '404.html');
const outNoJekyll = path.join(ROOT, '.nojekyll');
fs.writeFileSync(outRootIndex, standaloneHtml, 'utf8');
fs.writeFileSync(outRoot404, standaloneHtml, 'utf8');
fs.writeFileSync(outNoJekyll, '', 'utf8');
console.log('Standalone index.html & 404.html built successfully:', outRootIndex, 'Size:', Buffer.byteLength(standaloneHtml), 'bytes');
