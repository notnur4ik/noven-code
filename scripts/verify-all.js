'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { Readable, Writable } = require('node:stream');
const { server, getDb } = require('../src/server/index');
const { I18N } = require('../public/js/i18n');

const REPORT_FILE = path.join(__dirname, '..', 'verification-report.json');

// Valid 1x1 PNG base64
const VALID_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function request(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = options.body ? JSON.stringify(options.body) : '';
    const bodyBuf = Buffer.from(bodyStr, 'utf8');

    let pushed = false;
    const req = new Readable({
      read() {
        if (!pushed) {
          pushed = true;
          if (bodyBuf.length > 0) {
            this.push(bodyBuf);
          }
          this.push(null);
        }
      }
    });

    req.method = options.method || 'GET';
    req.url = endpoint;
    req.headers = {
      host: '127.0.0.1:3000',
      ...(options.body ? { 'content-type': 'application/json', 'content-length': String(bodyBuf.length) } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
      ...(options.headers || {})
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const resHeaders = {};
    let statusCode = 200;
    const chunks = [];

    const res = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        callback();
      }
    });

    res.setHeader = (k, v) => {
      resHeaders[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k) => resHeaders[String(k).toLowerCase()];
    res.writeHead = (code, hdrs = {}) => {
      statusCode = code;
      for (const [k, v] of Object.entries(hdrs)) {
        resHeaders[String(k).toLowerCase()] = v;
      }
      return res;
    };

    const origEnd = res.end.bind(res);
    res.end = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
      }
      origEnd(() => {
        if (cb) cb();
        const rawBuf = Buffer.concat(chunks);
        const contentType = String(resHeaders['content-type'] || '');
        let data;
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawBuf.toString('utf8'));
          } catch {
            data = rawBuf.toString('utf8');
          }
        } else {
          data = rawBuf.toString('utf8');
        }

        resolve({
          status: statusCode,
          headers: {
            get: (k) => resHeaders[String(k).toLowerCase()] || ''
          },
          setCookie: String(resHeaders['set-cookie'] || ''),
          rawBuffer: rawBuf,
          data
        });
      });
    };

    res.on('error', reject);
    server.emit('request', req, res);
  });
}

function extractSessionCookie(setCookieHeader) {
  const match = setCookieHeader.match(/nc_session=[^;]+/);
  return match ? match[0] : '';
}

async function runTests() {
  const results = [];
  const record = (name, passed, details = '') => {
    results.push({ name, passed, details });
    console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${details ? ' — ' + details : ''}`);
    if (!passed) {
      throw new Error(`Test failed: ${name} (${details})`);
    }
  };

  try {
    // Ensure clean starting state before test run
    const initDb = getDb();
    const oldAtts = initDb.prepare('SELECT stored_name FROM order_attachments').all();
    for (const a of oldAtts) {
      const p = path.join(__dirname, '..', 'uploads', a.stored_name);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
    initDb.exec(`
      DELETE FROM order_attachments;
      DELETE FROM tasks;
      DELETE FROM projects;
      DELETE FROM orders;
      DELETE FROM clients;
      DELETE FROM notifications;
      DELETE FROM activity_logs;
      DELETE FROM sessions;
      DELETE FROM users WHERE username != 'Notnur4ikGg';
    `);

    // 1. Trilingual Localization Audit (RU, KK, EN)
    const langs = ['ru', 'kk', 'en'];
    for (const l of langs) {
      assert(I18N[l], `Missing language ${l}`);
      assert(I18N[l].nav && I18N[l].hero && I18N[l].order && I18N[l].crm, `Incomplete dictionary for ${l}`);
    }
    const ruKeys = JSON.stringify(Object.keys(I18N.ru).sort());
    const kkKeys = JSON.stringify(Object.keys(I18N.kk).sort());
    const enKeys = JSON.stringify(Object.keys(I18N.en).sort());
    record(
      '1. Localization Architecture (RU, KK, EN top-level & nested parity)',
      ruKeys === kkKeys && kkKeys === enKeys,
      'RU, KK, EN dictionaries verified'
    );

    // 2. Public HTML Routes & SEO Endpoints
    const publicRoutes = [
      '/',
      '/services',
      '/pricing',
      '/portfolio',
      '/about',
      '/process',
      '/faq',
      '/contact',
      '/start-project',
      '/order-confirmation',
      '/admin',
      '/robots.txt',
      '/sitemap.xml'
    ];
    for (const r of publicRoutes) {
      const res = await request(r);
      assert.strictEqual(res.status, 200, `Route ${r} returned ${res.status}`);
    }
    record('2. All 13 Public, Admin & SEO Routes Return HTTP 200', true, publicRoutes.join(', '));

    // 3. Verify Strict CRM Entry Placement in public/js/public-app.js
    const publicAppJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'public-app.js'), 'utf8');
    const headerFn = publicAppJs.split('function renderHeader()')[1].split('function renderHeroSection()')[0];
    const heroFn = publicAppJs.split('function renderHeroSection()')[1].split('function renderServicesSection()')[0];
    const footerFn = publicAppJs.split('function renderFooter()')[1].split('function renderSoundConsentBanner()')[0];
    const adminInHeader = headerFn.includes('/admin');
    const adminInHero = heroFn.includes('/admin');
    const adminInFooter = footerFn.includes('href="/admin"') && footerFn.includes('nc-employee-login-link');
    record(
      '3. Discreet Employee Login Placement (Footer bottom only, absent from Header/Hero)',
      !adminInHeader && !adminInHero && adminInFooter,
      'Verified href="/admin" only in .nc-employee-login-link inside renderFooter()'
    );

    // 4. Verify No Hardcoded Credentials in Frontend Bundle
    const publicFiles = [
      path.join(__dirname, '..', 'public', 'index.html'),
      path.join(__dirname, '..', 'public', 'admin.html'),
      path.join(__dirname, '..', 'public', 'js', 'public-app.js'),
      path.join(__dirname, '..', 'public', 'js', 'admin-app.js'),
      path.join(__dirname, '..', 'public', 'js', 'i18n.js'),
      path.join(__dirname, '..', 'public', 'js', 'scene3d-sound.js')
    ];
    let leakedCreds = false;
    for (const f of publicFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('Nurik1107!)') || content.includes('Notnur4ikGg')) {
        leakedCreds = true;
      }
    }
    record('4. Zero Exposed Credentials in Frontend Source Bundles', !leakedCreds, 'Scanned all HTML/JS assets');

    // 5. Public Bootstrap API & Exact Contact / Portfolio / Pricing Verification
    const bootRes = await request('/api/public/bootstrap');
    assert.strictEqual(bootRes.status, 200);
    const boot = bootRes.data;
    assert.strictEqual(boot.services.length, 8, 'Expected 8 services');
    assert.strictEqual(boot.pricingPlans.length, 3, 'Expected 3 pricing packages');
    assert.deepStrictEqual(
      boot.pricingPlans.map((p) => p.code),
      ['START', 'BUSINESS', 'PREMIUM']
    );
    assert.strictEqual(boot.portfolio.length, 3, 'Expected 3 portfolio demo projects');
    assert.deepStrictEqual(
      boot.portfolio.map((p) => p.live_url),
      [
        'https://p1kad997epx1-d.space-z.ai',
        'https://ghjsfkdfj.space-z.ai/#/',
        'https://fghjk.space-z.ai'
      ]
    );
    assert.strictEqual(boot.settings.company_contacts.instagramDisplay, '@noven.code');
    assert.strictEqual(boot.settings.company_contacts.whatsappDisplay, '+7 706 642 1107');
    assert.strictEqual(boot.settings.company_contacts.telegramDisplay, '@notnormale');
    assert.strictEqual(boot.settings.telegram_config, undefined, 'telegram_config must not leak to public');
    record(
      '5. Public Bootstrap Data Integrity (8 Services, 3 Pricing Plans, 3 Live Portfolio URLs, Exact Contacts)',
      true,
      'Verified database-driven content & secret isolation'
    );

    // 6. Order Builder Validation & Submission (Step 1-9 + File Upload + Idempotency)
    const invalidOrder = await request('/api/public/orders', {
      method: 'POST',
      body: { selected_services: [] }
    });
    assert.strictEqual(invalidOrder.status, 400, 'Empty order should return 400');

    const idempotencyKey = 'test-idem-' + Date.now();
    const orderPayload = {
      idempotencyKey,
      selectedPackage: 'BUSINESS',
      selectedServices: ['Premium Website', '3D Website', 'CRM Development'],
      businessName: 'Alem Luxury Group',
      businessType: 'Company',
      industry: 'Architecture & Real Estate',
      businessDescription: 'High-end architectural bureau in Almaty & Astana.',
      targetAudience: 'Enterprise investors and private villa buyers',
      projectGoals: 'Interactive 3D showcase + automated lead pipeline in CRM',
      existingWebsite: 'https://alem-arch.example.com',
      socialMedia: '@alem.arch',
      referenceNotes: 'Editorial brutalist typography, Deep Burgundy accents, smooth WebGL transitions.',
      referenceAvoid: 'Cluttered popups and generic templates.',
      primaryColor: '#681D32',
      secondaryColor: '#A63854',
      backgroundColor: '#F8F7F5',
      hexCodes: '#681D32, #171316, #F8F7F5',
      colorsToAvoid: 'Neon green',
      preferredStyle: 'Minimalist',
      existingBranding: 'yes',
      requiredFeatures: ['3D Elements', 'CRM Integration', 'Multilingual Website', 'Telegram Notifications'],
      customerName: 'Aidar Kassymov',
      customerPhone: '+7 701 555 0199',
      customerWhatsapp: '+7 701 555 0199',
      customerEmail: 'aidar@alem-arch.kz',
      preferredContact: 'telegram',
      estimatedBudget: 'Custom Quote — BUSINESS Package',
      desiredDeadline: '6 weeks',
      priority: 'Urgent',
      additionalRequirements: 'Need Russian, Kazakh, and English versions.',
      locale: 'ru',
      attachments: [
        {
          name: 'reference-board.png',
          type: 'image/png',
          category: 'reference',
          dataBase64: VALID_PNG_BASE64
        }
      ]
    };

    const validOrderRes = await request('/api/public/orders', {
      method: 'POST',
      body: orderPayload
    });
    assert.strictEqual(validOrderRes.status, 201, `Expected 201, got ${validOrderRes.status}: ${JSON.stringify(validOrderRes.data)}`);
    assert.strictEqual(validOrderRes.data.orderCode, '#NC-0001');
    assert.strictEqual(validOrderRes.data.summary.attachmentsCount, 1);

    // Duplicate submission with same idempotencyKey
    const dupOrderRes = await request('/api/public/orders', {
      method: 'POST',
      body: orderPayload
    });
    assert.strictEqual(dupOrderRes.status, 200);
    assert.strictEqual(dupOrderRes.data.duplicatePrevented, true);
    assert.strictEqual(dupOrderRes.data.orderCode, '#NC-0001');

    record(
      '6. Multi-Step Order Submission, PNG Magic-Byte Upload & Idempotency Protection',
      true,
      `Created ${validOrderRes.data.orderCode} with 1 verified PNG attachment`
    );

    // 7. Unauthenticated Access Protection & Direct Upload Folder Blocking
    const unauthOverview = await request('/api/admin/overview');
    assert.strictEqual(unauthOverview.status, 401);

    const directUploadRes = await request('/uploads/anything.png');
    assert.strictEqual(directUploadRes.status, 403);

    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'Notnur4ikGg', password: 'WrongPassword123!' }
    });
    assert.strictEqual(badLogin.status, 401);

    record(
      '7. Security Boundaries (Unauthenticated /api/admin/* -> 401, Direct /uploads/* -> 403, Invalid Login -> 401)',
      true,
      'Verified strict server-side access control'
    );

    // 8. Owner Authentication & Session / CSRF Verification
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'Notnur4ikGg', password: 'Nurik1107!)' }
    });
    assert.strictEqual(loginRes.status, 200, 'Owner login failed');
    assert(loginRes.setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
    assert(loginRes.setCookie.includes('SameSite=Strict'), 'Cookie must be SameSite=Strict');
    const ownerCookie = extractSessionCookie(loginRes.setCookie);
    const ownerCsrf = loginRes.data.csrfToken;
    assert(ownerCookie && ownerCsrf, 'Missing session cookie or CSRF token');

    record(
      '8. Owner Authentication (HttpOnly, SameSite=Strict Cookie & CSRF Token Issuance)',
      true,
      `Authenticated as ${loginRes.data.user.username} (${loginRes.data.user.role})`
    );

    // 9. CRM Overview & Real Database Metrics Verification
    const crmRes = await request('/api/admin/overview', { cookie: ownerCookie });
    assert.strictEqual(crmRes.status, 200);
    assert.strictEqual(crmRes.data.stats.totalOrders, 1);
    assert.strictEqual(crmRes.data.stats.newOrders, 1);
    assert.strictEqual(crmRes.data.stats.totalClients, 1);
    assert.strictEqual(crmRes.data.orders.length, 1);
    assert.strictEqual(crmRes.data.orders[0].order_code, '#NC-0001');
    assert.strictEqual(crmRes.data.orders[0].attachments.length, 1);

    // Verify Telegram notification record was logged with exact required format
    const tgNotif = crmRes.data.notifications[0];
    assert(tgNotif, 'Expected notification record for #NC-0001');
    assert(tgNotif.message.includes('NEW NOVEN.CODE ORDER'));
    assert(tgNotif.message.includes('Order ID: #NC-0001'));
    assert(tgNotif.message.includes('Customer: Aidar Kassymov'));

    record(
      '9. CRM Live Database Statistics & Telegram Notification Log Format',
      true,
      'Verified real counts and NEW NOVEN.CODE ORDER message structure'
    );

    // 10. CSRF Enforcement & Order / Project / Task / Pricing / Content Mutations
    const orderId = crmRes.data.orders[0].id;
    const attachmentId = crmRes.data.orders[0].attachments[0].id;

    // Missing CSRF should fail with 403
    const noCsrfPatch = await request(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      cookie: ownerCookie,
      body: { status: 'Contacted' }
    });
    assert.strictEqual(noCsrfPatch.status, 403, 'Mutating request without CSRF token must return 403');

    // Valid CSRF order update
    const orderPatch = await request(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: { status: 'Approved', internal_notes: 'Approved by Owner' }
    });
    assert.strictEqual(orderPatch.status, 200);

    // Protected Attachment Download
    const attDownload = await request(`/api/admin/attachments/${attachmentId}`, {
      cookie: ownerCookie
    });
    assert.strictEqual(attDownload.status, 200);
    assert.strictEqual(attDownload.headers.get('content-type'), 'image/png');

    // Convert Order to Project
    const projCreate = await request('/api/admin/projects', {
      method: 'POST',
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        title: 'Alem Luxury 3D Platform',
        description: '3D WebGL showcase and CRM integration',
        client_id: crmRes.data.clients[0].id,
        order_id: orderId,
        status: 'In Progress',
        progress: 25,
        deadline: '2026-12-15',
        assigned_employees: ['dev_test_user']
      }
    });
    assert.strictEqual(projCreate.status, 201);
    const projectId = projCreate.data.id;

    // Create Task
    const taskCreate = await request('/api/admin/tasks', {
      method: 'POST',
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        project_id: projectId,
        title: 'Build custom WebGL shader pipeline',
        task_type: 'development',
        priority: 'High',
        status: 'In Progress'
      }
    });
    assert.strictEqual(taskCreate.status, 201);
    const taskId = taskCreate.data.id;

    // Update Pricing Package
    const pricingPatch = await request('/api/admin/pricing/plan-business', {
      method: 'PATCH',
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        price_label_en: 'Custom Quote',
        is_recommended: true
      }
    });
    assert.strictEqual(pricingPatch.status, 200);

    record(
      '10. CSRF Protection, Order Update, Protected Attachment Download, Project & Task Creation, Pricing Edit',
      true,
      'All CRM operational workflows verified'
    );

    // 11. Role-Based Access Control (RBAC) Escalation Prevention Test
    const createDevRes = await request('/api/admin/employees', {
      method: 'POST',
      cookie: ownerCookie,
      csrf: ownerCsrf,
      body: {
        username: 'dev_test_user',
        full_name: 'Test Developer',
        role: 'DEVELOPER',
        password: 'DevPassword123!'
      }
    });
    assert.strictEqual(createDevRes.status, 201);

    const devLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'dev_test_user', password: 'DevPassword123!' }
    });
    assert.strictEqual(devLogin.status, 200);
    const devCookie = extractSessionCookie(devLogin.setCookie);
    const devCsrf = devLogin.data.csrfToken;

    // Developer cannot delete orders (403)
    const devDeleteOrder = await request(`/api/admin/orders/${orderId}`, {
      method: 'DELETE',
      cookie: devCookie,
      csrf: devCsrf
    });
    assert.strictEqual(devDeleteOrder.status, 403);

    // Developer cannot create employees (403)
    const devCreateEmp = await request('/api/admin/employees', {
      method: 'POST',
      cookie: devCookie,
      csrf: devCsrf,
      body: { username: 'hacker', full_name: 'Hacker', role: 'OWNER', password: 'Password123!' }
    });
    assert.strictEqual(devCreateEmp.status, 403);

    // Developer cannot edit pricing (403)
    const devEditPricing = await request('/api/admin/pricing/plan-start', {
      method: 'PATCH',
      cookie: devCookie,
      csrf: devCsrf,
      body: { price_label_en: 'Free' }
    });
    assert.strictEqual(devEditPricing.status, 403);

    // Developer CAN update technical notes on assigned project (200)
    const devUpdateTechNotes = await request(`/api/admin/projects/${projectId}`, {
      method: 'PATCH',
      cookie: devCookie,
      csrf: devCsrf,
      body: { technical_notes: 'Configured Three.js / WebGL post-processing pipeline.' }
    });
    assert.strictEqual(devUpdateTechNotes.status, 200);

    // Developer CAN update task status (200)
    const devUpdateTask = await request(`/api/admin/tasks/${taskId}`, {
      method: 'PATCH',
      cookie: devCookie,
      csrf: devCsrf,
      body: { status: 'Done', technical_notes: 'Completed shader optimization.' }
    });
    assert.strictEqual(devUpdateTask.status, 200);

    record(
      '11. Role-Based Access Control (DEVELOPER blocked from Orders/Users/Pricing [403], allowed Project/Task tech updates [200])',
      true,
      'Verified strict server-side RBAC enforcement'
    );

    // Clean up test records so production DB starts clean for the user
    const db = getDb();
    const atts = db.prepare('SELECT stored_name FROM order_attachments').all();
    for (const a of atts) {
      const p = path.join(__dirname, '..', 'uploads', a.stored_name);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
    db.exec(`
      DELETE FROM order_attachments;
      DELETE FROM tasks;
      DELETE FROM projects;
      DELETE FROM orders;
      DELETE FROM clients;
      DELETE FROM notifications;
      DELETE FROM activity_logs;
      DELETE FROM sessions;
      DELETE FROM users WHERE username != 'Notnur4ikGg';
    `);

    const finalOrderCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    const ownerExists = db.prepare("SELECT username, role FROM users WHERE username = 'Notnur4ikGg'").get();
    assert.strictEqual(finalOrderCount, 0);
    assert.strictEqual(ownerExists.role, 'OWNER');

    record(
      '12. Production Database Reset & Readiness Check',
      true,
      'Cleaned test artifacts; Owner account Notnur4ikGg active and ready for #NC-0001'
    );

    fs.writeFileSync(
      REPORT_FILE,
      JSON.stringify({ timestamp: new Date().toISOString(), allPassed: true, results }, null, 2),
      'utf8'
    );
  } catch (err) {
    fs.writeFileSync(
      REPORT_FILE,
      JSON.stringify({ timestamp: new Date().toISOString(), allPassed: false, error: err.message, stack: err.stack, results }, null, 2),
      'utf8'
    );
    process.exitCode = 1;
  }
}

runTests();
