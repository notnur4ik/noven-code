'use strict';

(function () {
  const savedLang = localStorage.getItem('nc_lang') || 'ru';
  const crmState = {
    lang: ['ru', 'kk', 'en'].includes(savedLang) ? savedLang : 'ru',
    authenticated: false,
    loading: true,
    csrfToken: '',
    user: null,
    loginError: '',
    activeTab: 'dashboard',
    contentSubTab: 'services',
    toast: '',
    searchQuery: '',
    orderStatusFilter: 'ALL',
    orderPackageFilter: 'ALL',
    selectedOrderModal: null,
    selectedPlanModal: null,
    data: {
      stats: { totalOrders: 0, newOrders: 0, activeProjects: 0, completedProjects: 0, cancelledOrders: 0, totalClients: 0 },
      orders: [],
      clients: [],
      projects: [],
      tasks: [],
      employees: [],
      roles: [],
      pricingPlans: [],
      services: [],
      portfolio: [],
      faqs: [],
      activityLogs: [],
      notifications: [],
      settings: {}
    }
  };

  const CRM_UI_TEXT = {
    ru: {
      searchPlaceholder: 'Поиск по заказам, клиентам, бизнесу или ID...',
      allStatuses: 'Все статусы',
      allPackages: 'Все пакеты',
      orderId: 'Код заказа',
      customer: 'Клиент / Бизнес',
      services: 'Услуги / Тариф',
      budgetDeadline: 'Бюджет / Дедлайн',
      status: 'Статус',
      assignedTo: 'Ответственный',
      actions: 'Действия',
      openBtn: 'Открыть',
      createProjectBtn: 'В проект',
      deleteBtn: 'Удалить',
      saveBtn: 'Сохранить',
      cancelBtn: 'Закрыть',
      addBtn: '+ Добавить',
      unassigned: 'Не назначен',
      noRecords: 'Записей в базе данных пока нет.',
      attachmentsTitle: 'Загруженные дизайн-референсы и файлы',
      internalNotes: 'Внутренние заметки команды',
      clientCreateTitle: 'Добавить клиента',
      projectCreateTitle: 'Создать новый проект',
      taskCreateTitle: 'Создать задачу',
      employeeCreateTitle: 'Добавить сотрудника (RBAC)',
      passwordChangeTitle: 'Смена пароля аккаунта',
      telegramSettingsTitle: 'Интеграция Telegram Bot API (@notnormale)',
      testTelegramBtn: 'Отправить тестовое уведомление'
    },
    kk: {
      searchPlaceholder: 'Тапсырыстар, клиенттер, бизнес немесе ID бойынша іздеу...',
      allStatuses: 'Барлық мәртебелер',
      allPackages: 'Барлық пакеттер',
      orderId: 'Тапсырыс коды',
      customer: 'Клиент / Бизнес',
      services: 'Қызметтер / Тариф',
      budgetDeadline: 'Бюджет / Дедлайн',
      status: 'Мәртебесі',
      assignedTo: 'Жауапты',
      actions: 'Әрекеттер',
      openBtn: 'Ашу',
      createProjectBtn: 'Жоба құру',
      deleteBtn: 'Өшіру',
      saveBtn: 'Сақтау',
      cancelBtn: 'Жабу',
      addBtn: '+ Қосу',
      unassigned: 'Тағайындалмаған',
      noRecords: 'Дерекқорда әзірге жазбалар жоқ.',
      attachmentsTitle: 'Жүктелген дизайн-референстер мен файлдар',
      internalNotes: 'Команданың ішкі жазбалары',
      clientCreateTitle: 'Клиент қосу',
      projectCreateTitle: 'Жаңа жоба құру',
      taskCreateTitle: 'Тапсырма құру',
      employeeCreateTitle: 'Қызметкер қосу (RBAC)',
      passwordChangeTitle: 'Аккаунт құпиясөзін өзгерту',
      telegramSettingsTitle: 'Telegram Bot API интеграциясы (@notnormale)',
      testTelegramBtn: 'Тестілік хабарлама жіберу'
    },
    en: {
      searchPlaceholder: 'Search orders, clients, business name, or ID...',
      allStatuses: 'All Statuses',
      allPackages: 'All Packages',
      orderId: 'Order Code',
      customer: 'Customer / Business',
      services: 'Services / Package',
      budgetDeadline: 'Budget / Deadline',
      status: 'Status',
      assignedTo: 'Assigned To',
      actions: 'Actions',
      openBtn: 'Inspect',
      createProjectBtn: 'Convert to Project',
      deleteBtn: 'Delete',
      saveBtn: 'Save Changes',
      cancelBtn: 'Close',
      addBtn: '+ Create New',
      unassigned: 'Unassigned',
      noRecords: 'No database records found.',
      attachmentsTitle: 'Uploaded Design References & Attachments',
      internalNotes: 'Internal Team Notes',
      clientCreateTitle: 'Create New Client',
      projectCreateTitle: 'Create New Project',
      taskCreateTitle: 'Create New Task',
      employeeCreateTitle: 'Add Team Member (RBAC)',
      passwordChangeTitle: 'Change Account Password',
      telegramSettingsTitle: 'Telegram Bot API Integration (@notnormale)',
      testTelegramBtn: 'Send Test Notification'
    }
  };

  function t() {
    return window.NOVEN_I18N[crmState.lang] || window.NOVEN_I18N.ru;
  }

  function ui() {
    return CRM_UI_TEXT[crmState.lang] || CRM_UI_TEXT.ru;
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function safeCrmTab(tabName, renderFn) {
    try {
      return renderFn();
    } catch (err) {
      console.error(`[Noven.code CRM Tab Error Boundary: ${tabName}]`, err);
      return `
        <div class="crm-panel" role="alert" style="border-color: var(--crimson); text-align: center; padding: 2.5rem;">
          <span class="nc-bracket-tag" style="color: var(--soft-rose);">[ CRM MODULE RECOVERY / ${esc(tabName.toUpperCase())} ]</span>
          <h3 style="font-family: var(--font-display); font-size: 1.35rem; margin: 0.65rem 0;">Не удалось отобразить вкладку</h3>
          <p style="font-size: 0.88rem; opacity: 0.78; margin-bottom: 1.25rem;">Произошла ошибка при форматировании данных вкладки. Остальные модули CRM доступны.</p>
          <button type="button" class="nc-btn nc-btn-primary" onclick="window.refreshNovenCrm && window.refreshNovenCrm()">Повторить попытку ↻</button>
        </div>
      `;
    }
  }

  function hasPerm(perm) {
    if (!crmState.user) return false;
    const perms = crmState.user.permissions || [];
    return perms.includes('*') || perms.includes(perm);
  }

  function showToast(msg) {
    crmState.toast = msg;
    renderCrm();
    setTimeout(() => {
      if (crmState.toast === msg) {
        crmState.toast = '';
        renderCrm();
      }
    }, 3500);
  }

  async function apiRequest(url, method = 'GET', bodyObj = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (crmState.csrfToken) {
      headers['X-CSRF-Token'] = crmState.csrfToken;
    }
    const opts = { method, headers, credentials: 'same-origin' };
    if (bodyObj) opts.body = JSON.stringify(bodyObj);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      crmState.authenticated = false;
      crmState.user = null;
      renderCrm();
      throw new Error(data.error || 'Session expired');
    }
    if (!res.ok) {
      throw new Error(data.error || 'Operation failed');
    }
    return data;
  }

  async function checkSessionAndLoad() {
    crmState.loading = true;
    renderCrm();
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!meRes.ok) {
        crmState.authenticated = false;
        crmState.loading = false;
        renderCrm();
        return;
      }
      const meData = await meRes.json();
      crmState.authenticated = true;
      crmState.csrfToken = meData.csrfToken;
      crmState.user = meData.user;
      await refreshOverviewData();
    } catch {
      crmState.authenticated = false;
    } finally {
      crmState.loading = false;
      renderCrm();
    }
  }

  async function refreshOverviewData() {
    const overview = await apiRequest('/api/admin/overview', 'GET');
    crmState.data = overview;
  }

  function setLang(newLang) {
    if (!['ru', 'kk', 'en'].includes(newLang)) return;
    crmState.lang = newLang;
    localStorage.setItem('nc_lang', newLang);
    document.documentElement.lang = newLang;
    renderCrm();
  }

  // ==========================================================================
  // LOGIN VIEW
  // ==========================================================================
  function renderLoginView() {
    const tr = t().crm;
    return `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: radial-gradient(circle at 50% 25%, rgba(104, 29, 50, 0.45) 0%, #171316 70%);">
        <div style="width: 100%; max-width: 440px; background: #1E181D; border: 1px solid var(--crimson); border-radius: 18px; padding: 2.5rem 2.25rem; box-shadow: 0 24px 60px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.75rem;">
            <span class="nc-logo">
              <span class="nc-logo-mark">✻</span>
              <span>NOVEN.CODE</span>
            </span>
            <div class="nc-lang-switcher">
              <button type="button" class="nc-lang-btn ${crmState.lang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
              <button type="button" class="nc-lang-btn ${crmState.lang === 'kk' ? 'active' : ''}" data-lang="kk">KK</button>
              <button type="button" class="nc-lang-btn ${crmState.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
            </div>
          </div>

          <h1 style="font-family: var(--font-display); font-size: 1.55rem; font-weight: 800; margin-bottom: 0.35rem;">${esc(tr.loginTitle)}</h1>
          <p style="font-size: 0.88rem; color: rgba(248, 247, 245, 0.68); margin-bottom: 1.75rem;">${esc(tr.loginSubtitle)}</p>

          ${crmState.loginError ? `
            <div role="alert" style="margin-bottom: 1.25rem; padding: 0.85rem 1rem; border-radius: 8px; background: rgba(166, 56, 84, 0.22); border: 1px solid var(--crimson); color: var(--soft-rose); font-size: 0.85rem;">
              ${esc(crmState.loginError)}
            </div>
          ` : ''}

          <form id="crm-login-form" style="display: flex; flex-direction: column; gap: 1.15rem;">
            <div>
              <label for="crm-user" style="display: block; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; color: var(--soft-rose);">${esc(tr.usernameLabel)}</label>
              <input id="crm-user" name="username" type="text" class="crm-input" autocomplete="username" required />
            </div>
            <div>
              <label for="crm-pass" style="display: block; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; color: var(--soft-rose);">${esc(tr.passwordLabel)}</label>
              <input id="crm-pass" name="password" type="password" class="crm-input" autocomplete="current-password" required />
            </div>
            <button type="submit" class="nc-btn nc-btn-primary" style="width: 100%; margin-top: 0.5rem;">
              ${esc(tr.loginBtn)} →
            </button>
          </form>

          <div style="margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--border-dark); text-align: center;">
            <a href="/" style="font-size: 0.82rem; color: rgba(248, 247, 245, 0.65);">${esc(tr.backToSite)}</a>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // CRM TABS RENDERERS
  // ==========================================================================
  function renderDashboardTab() {
    const tr = t().crm;
    const st = crmState.data.stats;
    const recentOrders = (crmState.data.orders || []).slice(0, 5);
    const activeTasks = (crmState.data.tasks || []).filter((tk) => tk.status !== 'Done').slice(0, 6);
    const recentLogs = (crmState.data.activityLogs || []).slice(0, 8);

    return `
      <div class="crm-stat-grid">
        <div class="crm-stat-card">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft-rose);">${esc(tr.stats.totalOrders)}</div>
          <div class="crm-stat-val">${st.totalOrders}</div>
        </div>
        <div class="crm-stat-card" style="border-color: var(--crimson);">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--crimson);">${esc(tr.stats.newOrders)}</div>
          <div class="crm-stat-val">${st.newOrders}</div>
        </div>
        <div class="crm-stat-card">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft-rose);">${esc(tr.stats.activeProjects)}</div>
          <div class="crm-stat-val">${st.activeProjects}</div>
        </div>
        <div class="crm-stat-card">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft-rose);">${esc(tr.stats.completedProjects)}</div>
          <div class="crm-stat-val">${st.completedProjects}</div>
        </div>
        <div class="crm-stat-card">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft-rose);">${esc(tr.stats.cancelledOrders)}</div>
          <div class="crm-stat-val">${st.cancelledOrders}</div>
        </div>
        <div class="crm-stat-card">
          <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft-rose);">${esc(tr.stats.totalClients)}</div>
          <div class="crm-stat-val">${st.totalClients}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1.5rem;">
        <div class="crm-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="font-family:var(--font-display);font-size:1.1rem;">${esc(tr.tabs.orders)}</h3>
            <button type="button" data-crm-tab="orders" style="font-size:0.8rem;color:var(--crimson);font-weight:700;">→</button>
          </div>
          ${recentOrders.length === 0 ? `<p style="font-size:0.85rem;opacity:0.65;">${esc(ui().noRecords)}</p>` : `
            <div class="crm-table-wrap">
              <table class="crm-table">
                <thead>
                  <tr><th>ID</th><th>${esc(ui().customer)}</th><th>${esc(ui().status)}</th></tr>
                </thead>
                <tbody>
                  ${recentOrders.map((o) => `
                    <tr>
                      <td><strong>${esc(o.order_code)}</strong></td>
                      <td>${esc(o.customer_name)}<br/><span style="font-size:0.76rem;opacity:0.65;">${esc(o.business_name)}</span></td>
                      <td><span class="crm-badge">${esc(tr.statuses[o.status] || o.status)}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="crm-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="font-family:var(--font-display);font-size:1.1rem;">${esc(tr.tabs.tasks)}</h3>
            <button type="button" data-crm-tab="tasks" style="font-size:0.8rem;color:var(--crimson);font-weight:700;">→</button>
          </div>
          ${activeTasks.length === 0 ? `<p style="font-size:0.85rem;opacity:0.65;">${esc(ui().noRecords)}</p>` : `
            <div class="crm-table-wrap">
              <table class="crm-table">
                <thead>
                  <tr><th>Task</th><th>Priority</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${activeTasks.map((tk) => `
                    <tr>
                      <td><strong>${esc(tk.title)}</strong><br/><span style="font-size:0.75rem;opacity:0.65;">${esc(tk.deadline || '')}</span></td>
                      <td>${esc(tk.priority)}</td>
                      <td><span class="crm-badge">${esc(tr.taskStatuses[tk.status] || tk.status)}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>

      ${recentLogs.length > 0 ? `
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:1rem;">${esc(tr.tabs.logs)}</h3>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr>
              </thead>
              <tbody>
                ${recentLogs.map((lg) => `
                  <tr>
                    <td style="font-family:monospace;font-size:0.76rem;">${esc(new Date(lg.created_at).toLocaleString(crmState.lang))}</td>
                    <td><strong>${esc(lg.actor_username)}</strong> <span style="font-size:0.72rem;opacity:0.65;">(${esc(lg.actor_role)})</span></td>
                    <td><span class="crm-badge">${esc(lg.action)}</span></td>
                    <td>${esc(lg.details)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;
  }

  function renderOrdersTab() {
    const tr = t().crm;
    const u = ui();
    const q = crmState.searchQuery.toLowerCase();
    const filtered = (crmState.data.orders || []).filter((o) => {
      if (crmState.orderStatusFilter !== 'ALL' && o.status !== crmState.orderStatusFilter) return false;
      if (crmState.orderPackageFilter !== 'ALL' && o.selected_package !== crmState.orderPackageFilter) return false;
      if (!q) return true;
      return (
        String(o.order_code).toLowerCase().includes(q) ||
        String(o.customer_name).toLowerCase().includes(q) ||
        String(o.business_name).toLowerCase().includes(q) ||
        String(o.customer_phone).toLowerCase().includes(q)
      );
    });

    const statuses = ['New', 'Under Review', 'Waiting for Client', 'Approved', 'In Progress', 'Testing', 'Completed', 'Cancelled'];

    return `
      <div class="crm-panel">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
          <input type="search" id="crm-order-search" class="crm-input" placeholder="${esc(u.searchPlaceholder)}" value="${esc(crmState.searchQuery)}" />
          <select id="crm-order-status-filter" class="crm-select">
            <option value="ALL">${esc(u.allStatuses)}</option>
            ${statuses.map((st) => `<option value="${esc(st)}" ${crmState.orderStatusFilter === st ? 'selected' : ''}>${esc(tr.statuses[st] || st)}</option>`).join('')}
          </select>
          <select id="crm-order-pkg-filter" class="crm-select">
            <option value="ALL">${esc(u.allPackages)}</option>
            <option value="START" ${crmState.orderPackageFilter === 'START' ? 'selected' : ''}>START</option>
            <option value="BUSINESS" ${crmState.orderPackageFilter === 'BUSINESS' ? 'selected' : ''}>BUSINESS</option>
            <option value="PREMIUM" ${crmState.orderPackageFilter === 'PREMIUM' ? 'selected' : ''}>PREMIUM</option>
          </select>
        </div>

        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>${esc(u.orderId)}</th>
                <th>${esc(u.customer)}</th>
                <th>${esc(u.services)}</th>
                <th>${esc(u.budgetDeadline)}</th>
                <th>${esc(u.status)}</th>
                <th>${esc(u.assignedTo)}</th>
                <th>${esc(u.actions)}</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="7">${esc(u.noRecords)}</td></tr>` : filtered.map((o) => `
                <tr>
                  <td>
                    <strong style="color:var(--soft-rose);">${esc(o.order_code)}</strong>
                    <div style="font-size:0.72rem;opacity:0.6;">${esc(new Date(o.created_at).toLocaleDateString(crmState.lang))}</div>
                  </td>
                  <td>
                    <strong>${esc(o.customer_name)}</strong>
                    <div style="font-size:0.8rem;opacity:0.8;">${esc(o.business_name)} (${esc(o.business_type)})</div>
                    <div style="font-size:0.76rem;color:var(--soft-rose);">${esc(o.customer_phone)}</div>
                  </td>
                  <td>
                    <div style="font-size:0.82rem;">${esc((o.selected_services || []).join(', '))}</div>
                    ${o.selected_package ? `<span class="crm-badge" style="margin-top:0.3rem;">${esc(o.selected_package)}</span>` : ''}
                    ${(o.attachments || []).length > 0 ? `<div style="font-size:0.74rem;color:var(--soft-rose);margin-top:0.25rem;">📎 ${o.attachments.length} file(s)</div>` : ''}
                  </td>
                  <td>
                    <div>${esc(o.estimated_budget || '—')}</div>
                    <div style="font-size:0.76rem;opacity:0.7;">${esc(o.desired_deadline || '—')}</div>
                  </td>
                  <td>
                    <select class="crm-select" data-quick-order-status="${esc(o.id)}" style="padding:0.35rem 0.6rem;font-size:0.78rem;">
                      ${statuses.map((st) => `<option value="${esc(st)}" ${o.status === st ? 'selected' : ''}>${esc(tr.statuses[st] || st)}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="crm-select" data-quick-order-assign="${esc(o.id)}" style="padding:0.35rem 0.6rem;font-size:0.78rem;">
                      <option value="">${esc(u.unassigned)}</option>
                      ${(crmState.data.employees || []).map((emp) => `<option value="${esc(emp.id)}" ${o.assigned_to === emp.id ? 'selected' : ''}>${esc(emp.full_name)} (${esc(emp.role)})</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                      <button type="button" class="nc-btn nc-btn-primary" data-inspect-order="${esc(o.id)}" style="padding:0.35rem 0.75rem;font-size:0.72rem;">${esc(u.openBtn)}</button>
                      ${hasPerm('projects:create') ? `<button type="button" class="nc-btn nc-btn-outline-light" data-convert-order="${esc(o.id)}" style="padding:0.35rem 0.75rem;font-size:0.72rem;">${esc(u.createProjectBtn)}</button>` : ''}
                      ${hasPerm('orders:delete') ? `<button type="button" data-delete-order="${esc(o.id)}" style="color:var(--crimson);font-size:0.75rem;font-weight:700;padding:0.35rem;">✕</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOrderModal() {
    const o = crmState.selectedOrderModal;
    if (!o) return '';
    const tr = t().crm;
    const u = ui();
    const statuses = ['New', 'Under Review', 'Waiting for Client', 'Approved', 'In Progress', 'Testing', 'Completed', 'Cancelled'];

    return `
      <div class="crm-modal-backdrop" id="crm-order-modal-backdrop">
        <div class="crm-modal">
          <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:1rem;margin-bottom:1.25rem;border-bottom:1px solid var(--border-dark);">
            <div>
              <span class="nc-bracket-tag">${esc(o.order_code)}</span>
              <h2 style="font-family:var(--font-display);font-size:1.5rem;margin-top:0.25rem;">${esc(o.business_name)} — ${esc(o.customer_name)}</h2>
            </div>
            <button type="button" id="crm-close-order-modal" class="nc-btn nc-btn-outline-light" style="padding:0.4rem 0.9rem;font-size:0.75rem;">${esc(u.cancelBtn)}</button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.25rem;font-size:0.86rem;">
            <div style="background:#141013;padding:1rem;border-radius:10px;">
              <strong style="color:var(--soft-rose);display:block;margin-bottom:0.35rem;">Business & Goals</strong>
              <div><strong>Type:</strong> ${esc(o.business_type)} ${esc(o.custom_business_type || '')}</div>
              <div><strong>Industry:</strong> ${esc(o.industry || '—')}</div>
              <div><strong>Description:</strong> ${esc(o.business_description)}</div>
              <div><strong>Goals:</strong> ${esc(o.project_goals)}</div>
              <div><strong>Website / Social:</strong> ${esc(o.existing_website || '—')} / ${esc(o.social_media || '—')}</div>
            </div>

            <div style="background:#141013;padding:1rem;border-radius:10px;">
              <strong style="color:var(--soft-rose);display:block;margin-bottom:0.35rem;">Scope & Branding</strong>
              <div><strong>Services:</strong> ${esc((o.selected_services || []).join(', '))}</div>
              <div><strong>Package:</strong> ${esc(o.selected_package || 'Custom')}</div>
              <div><strong>Features:</strong> ${esc((o.required_features || []).join(', '))}</div>
              <div><strong>Colors:</strong> ${esc(o.primary_color)} / ${esc(o.secondary_color)} / ${esc(o.background_color)}</div>
              <div><strong>Style:</strong> ${esc(o.preferred_style || '—')}</div>
              <div><strong>Ref Notes:</strong> ${esc(o.reference_notes || '—')}</div>
            </div>

            <div style="background:#141013;padding:1rem;border-radius:10px;">
              <strong style="color:var(--soft-rose);display:block;margin-bottom:0.35rem;">Customer Contact</strong>
              <div><strong>Name:</strong> ${esc(o.customer_name)}</div>
              <div><strong>Phone:</strong> ${esc(o.customer_phone)}</div>
              <div><strong>WhatsApp:</strong> ${esc(o.customer_whatsapp || '—')}</div>
              <div><strong>Email:</strong> ${esc(o.customer_email || '—')}</div>
              <div><strong>Preferred:</strong> ${esc(o.preferred_contact)}</div>
            </div>
          </div>

          <!-- Uploaded Attachments Section -->
          <div style="margin-bottom:1.25rem;padding:1rem;border-radius:10px;background:#141013;">
            <strong style="color:var(--soft-rose);display:block;margin-bottom:0.65rem;font-size:0.85rem;">${esc(u.attachmentsTitle)} (${(o.attachments || []).length})</strong>
            ${(o.attachments || []).length === 0 ? `<div style="font-size:0.82rem;opacity:0.65;">No files uploaded with this order.</div>` : `
              <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
                ${ensureArray(o.attachments).map((att) => `
                  <a href="${att.dataBase64 ? esc(att.dataBase64) : `/api/admin/attachments/${esc(att.id)}`}" download="${esc(att.original_name || 'attachment')}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 0.85rem;border-radius:8px;background:var(--burgundy);color:var(--white);font-size:0.8rem;">
                    <span>📎 ${esc(att.original_name)}</span>
                    <span style="opacity:0.75;">(${Math.round((att.size_bytes || 1024) / 1024)} KB) ↗</span>
                  </a>
                `).join('')}
              </div>
            `}
          </div>

          <form id="crm-edit-order-form" data-order-id="${esc(o.id)}" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div>
              <label style="font-size:0.75rem;text-transform:uppercase;color:var(--soft-rose);">${esc(u.status)}</label>
              <select name="status" class="crm-select">
                ${statuses.map((st) => `<option value="${esc(st)}" ${o.status === st ? 'selected' : ''}>${esc(tr.statuses[st] || st)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:0.75rem;text-transform:uppercase;color:var(--soft-rose);">${esc(u.assignedTo)}</label>
              <select name="assigned_to" class="crm-select">
                <option value="">${esc(u.unassigned)}</option>
                ${(crmState.data.employees || []).map((emp) => `<option value="${esc(emp.id)}" ${o.assigned_to === emp.id ? 'selected' : ''}>${esc(emp.full_name)} (${esc(emp.role)})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:0.75rem;text-transform:uppercase;color:var(--soft-rose);">Budget</label>
              <input type="text" name="estimated_budget" class="crm-input" value="${esc(o.estimated_budget || '')}" />
            </div>
            <div>
              <label style="font-size:0.75rem;text-transform:uppercase;color:var(--soft-rose);">Deadline</label>
              <input type="text" name="desired_deadline" class="crm-input" value="${esc(o.desired_deadline || '')}" />
            </div>
            <div style="grid-column:1 / -1;">
              <label style="font-size:0.75rem;text-transform:uppercase;color:var(--soft-rose);">${esc(u.internalNotes)}</label>
              <textarea name="internal_notes" class="crm-textarea" rows="3">${esc(o.internal_notes || '')}</textarea>
            </div>
            <div style="grid-column:1 / -1;display:flex;justify-content:flex-end;gap:0.75rem;">
              <button type="submit" class="nc-btn nc-btn-primary">${esc(u.saveBtn)}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderClientsTab() {
    const u = ui();
    const clients = crmState.data.clients || [];

    return `
      ${hasPerm('clients:create') ? `
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">${esc(u.clientCreateTitle)}</h3>
          <form id="crm-create-client-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.85rem;">
            <input name="name" class="crm-input" placeholder="Client Name *" required />
            <input name="business_name" class="crm-input" placeholder="Business Name" />
            <input name="phone" class="crm-input" placeholder="Phone *" required />
            <input name="whatsapp" class="crm-input" placeholder="WhatsApp" />
            <input name="email" class="crm-input" placeholder="Email" />
            <input name="internal_notes" class="crm-input" placeholder="Internal Notes" />
            <button type="submit" class="nc-btn nc-btn-primary" style="padding:0.65rem 1.2rem;">${esc(u.addBtn)}</button>
          </form>
        </div>
      ` : ''}

      <div class="crm-panel">
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>Client / Business</th>
                <th>Phone / WhatsApp</th>
                <th>Email / Website</th>
                <th>Associated Orders</th>
                <th>Internal Notes</th>
              </tr>
            </thead>
            <tbody>
              ${clients.length === 0 ? `<tr><td colspan="5">${esc(u.noRecords)}</td></tr>` : clients.map((c) => {
                const clientOrders = (crmState.data.orders || []).filter((o) => o.client_id === c.id);
                return `
                  <tr>
                    <td>
                      <strong>${esc(c.name)}</strong>
                      <div style="font-size:0.8rem;opacity:0.75;">${esc(c.business_name || '')} ${esc(c.industry ? `(${c.industry})` : '')}</div>
                    </td>
                    <td>
                      <div>${esc(c.phone)}</div>
                      <div style="font-size:0.76rem;color:var(--soft-rose);">WA: ${esc(c.whatsapp || c.phone)}</div>
                    </td>
                    <td>
                      <div>${esc(c.email || '—')}</div>
                      <div style="font-size:0.76rem;opacity:0.7;">${esc(c.website || '')}</div>
                    </td>
                    <td>
                      ${clientOrders.map((co) => `<span class="crm-badge" style="margin-right:0.25rem;">${esc(co.order_code)}</span>`).join('') || '0'}
                    </td>
                    <td style="min-width:220px;">
                      <div style="display:flex;gap:0.4rem;">
                        <input type="text" class="crm-input" data-client-note-input="${esc(c.id)}" value="${esc(c.internal_notes || '')}" style="padding:0.35rem 0.6rem;font-size:0.8rem;" />
                        <button type="button" class="nc-btn nc-btn-outline-light" data-save-client-note="${esc(c.id)}" style="padding:0.35rem 0.65rem;font-size:0.72rem;">✓</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderProjectsTab() {
    const u = ui();
    const projects = crmState.data.projects || [];

    return `
      ${hasPerm('projects:create') ? `
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">${esc(u.projectCreateTitle)}</h3>
          <form id="crm-create-project-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.85rem;">
            <input name="title" class="crm-input" placeholder="Project Title *" required />
            <input name="description" class="crm-input" placeholder="Description" />
            <input name="deadline" type="date" class="crm-input" />
            <select name="order_id" class="crm-select">
              <option value="">Link to Order (optional)</option>
              ${(crmState.data.orders || []).map((o) => `<option value="${esc(o.id)}">${esc(o.order_code)} — ${esc(o.business_name)}</option>`).join('')}
            </select>
            <button type="submit" class="nc-btn nc-btn-primary" style="padding:0.65rem 1.2rem;">${esc(u.addBtn)}</button>
          </form>
        </div>
      ` : ''}

      <div class="crm-panel">
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>Code / Title</th>
                <th>Status & Progress (%)</th>
                <th>Deadline</th>
                <th>Technical & Design Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${projects.length === 0 ? `<tr><td colspan="5">${esc(u.noRecords)}</td></tr>` : projects.map((p) => `
                <tr>
                  <td>
                    <strong style="color:var(--soft-rose);">${esc(p.project_code)}</strong>
                    <div style="font-weight:700;margin-top:0.2rem;">${esc(p.title)}</div>
                    <div style="font-size:0.78rem;opacity:0.7;">${esc(p.description || '')}</div>
                  </td>
                  <td style="min-width:180px;">
                    <select class="crm-select" data-proj-status="${esc(p.id)}" style="margin-bottom:0.4rem;padding:0.35rem;">
                      ${['Planning', 'In Progress', 'Testing', 'Client Review', 'Completed', 'Cancelled'].map((st) => `<option value="${st}" ${p.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                    </select>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <input type="range" min="0" max="100" value="${p.progress}" data-proj-progress="${esc(p.id)}" style="flex:1;" />
                      <span style="font-family:monospace;font-size:0.8rem;">${p.progress}%</span>
                    </div>
                  </td>
                  <td>${esc(p.deadline || '—')}</td>
                  <td style="min-width:260px;">
                    <div style="margin-bottom:0.4rem;">
                      <label style="font-size:0.7rem;color:var(--soft-rose);">Tech Notes (Dev):</label>
                      <input type="text" class="crm-input" data-proj-tech="${esc(p.id)}" value="${esc(p.technical_notes || '')}" style="padding:0.35rem 0.5rem;font-size:0.78rem;" />
                    </div>
                    <div>
                      <label style="font-size:0.7rem;color:var(--soft-rose);">Design Notes (Designer):</label>
                      <input type="text" class="crm-input" data-proj-design="${esc(p.id)}" value="${esc(p.design_notes || '')}" style="padding:0.35rem 0.5rem;font-size:0.78rem;" />
                    </div>
                  </td>
                  <td>
                    <button type="button" class="nc-btn nc-btn-primary" data-save-project="${esc(p.id)}" style="padding:0.4rem 0.85rem;font-size:0.74rem;">${esc(u.saveBtn)}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTasksTab() {
    const tr = t().crm;
    const u = ui();
    const tasks = crmState.data.tasks || [];
    const taskStatuses = ['To Do', 'In Progress', 'Review', 'Done'];

    return `
      ${hasPerm('tasks:create') ? `
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">${esc(u.taskCreateTitle)}</h3>
          <form id="crm-create-task-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.85rem;">
            <input name="title" class="crm-input" placeholder="Task Title *" required />
            <select name="project_id" class="crm-select">
              <option value="">Project (optional)</option>
              ${(crmState.data.projects || []).map((p) => `<option value="${esc(p.id)}">${esc(p.project_code)} — ${esc(p.title)}</option>`).join('')}
            </select>
            <select name="task_type" class="crm-select">
              <option value="development">Development</option>
              <option value="design">UI/UX Design</option>
              <option value="qa">QA & Testing</option>
              <option value="management">Management</option>
            </select>
            <select name="priority" class="crm-select">
              <option value="Medium">Medium Priority</option>
              <option value="High">High Priority</option>
              <option value="Critical">Critical</option>
              <option value="Low">Low</option>
            </select>
            <select name="assigned_to" class="crm-select">
              <option value="">${esc(u.unassigned)}</option>
              ${(crmState.data.employees || []).map((emp) => `<option value="${esc(emp.id)}">${esc(emp.full_name)} (${esc(emp.role)})</option>`).join('')}
            </select>
            <input name="deadline" type="date" class="crm-input" />
            <button type="submit" class="nc-btn nc-btn-primary" style="padding:0.65rem 1.2rem;">${esc(u.addBtn)}</button>
          </form>
        </div>
      ` : ''}

      <div class="crm-panel">
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>Task / Type</th>
                <th>Priority & Deadline</th>
                <th>Assigned Employee</th>
                <th>Status</th>
                <th>Technical / Design Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tasks.length === 0 ? `<tr><td colspan="6">${esc(u.noRecords)}</td></tr>` : tasks.map((tk) => {
                const assignee = (crmState.data.employees || []).find((e) => e.id === tk.assigned_to);
                return `
                  <tr>
                    <td>
                      <strong>${esc(tk.title)}</strong>
                      <div><span class="crm-badge" style="margin-top:0.25rem;">${esc(tk.task_type)}</span></div>
                    </td>
                    <td>
                      <div><strong>${esc(tk.priority)}</strong></div>
                      <div style="font-size:0.76rem;opacity:0.7;">${esc(tk.deadline || '—')}</div>
                    </td>
                    <td>${esc(assignee ? `${assignee.full_name} (${assignee.role})` : u.unassigned)}</td>
                    <td>
                      <select class="crm-select" data-task-status="${esc(tk.id)}" style="padding:0.35rem;">
                        ${taskStatuses.map((st) => `<option value="${st}" ${tk.status === st ? 'selected' : ''}>${esc(tr.taskStatuses[st] || st)}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <input type="text" class="crm-input" data-task-notes="${esc(tk.id)}" value="${esc(tk.technical_notes || tk.design_notes || '')}" placeholder="Notes..." style="padding:0.35rem 0.6rem;font-size:0.8rem;" />
                    </td>
                    <td>
                      <button type="button" class="nc-btn nc-btn-primary" data-save-task="${esc(tk.id)}" style="padding:0.35rem 0.75rem;font-size:0.72rem;">${esc(u.saveBtn)}</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTeamTab() {
    const u = ui();
    const employees = crmState.data.employees || [];
    const roles = crmState.data.roles || [];

    return `
      ${crmState.user?.role === 'OWNER' ? `
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">${esc(u.employeeCreateTitle)}</h3>
          <form id="crm-create-emp-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:0.85rem;">
            <input name="username" class="crm-input" placeholder="Username *" required />
            <input name="full_name" class="crm-input" placeholder="Full Name *" required />
            <select name="role" class="crm-select">
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="DEVELOPER">DEVELOPER</option>
              <option value="DESIGNER">DESIGNER</option>
              <option value="OWNER">OWNER</option>
            </select>
            <input name="password" type="password" class="crm-input" placeholder="Initial Password (min 8) *" required />
            <button type="submit" class="nc-btn nc-btn-primary" style="padding:0.65rem 1.2rem;">${esc(u.addBtn)}</button>
          </form>
        </div>
      ` : ''}

      <div class="crm-panel">
        <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">Employees & Role Assignments</h3>
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role (RBAC)</th>
                <th>Status</th>
                <th>Last Login</th>
                ${crmState.user?.role === 'OWNER' ? '<th>Manage</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${employees.map((emp) => `
                <tr>
                  <td><strong>${esc(emp.username)}</strong></td>
                  <td>${esc(emp.full_name)}</td>
                  <td>
                    ${crmState.user?.role === 'OWNER' ? `
                      <select class="crm-select" data-emp-role="${esc(emp.id)}" style="padding:0.35rem;">
                        ${['OWNER', 'ADMIN', 'MANAGER', 'DEVELOPER', 'DESIGNER'].map((r) => `<option value="${r}" ${emp.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                      </select>
                    ` : `<span class="crm-badge">${esc(emp.role)}</span>`}
                  </td>
                  <td>
                    ${crmState.user?.role === 'OWNER' ? `
                      <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8rem;">
                        <input type="checkbox" data-emp-active="${esc(emp.id)}" ${emp.is_active ? 'checked' : ''} /> Active
                      </label>
                    ` : (emp.is_active ? 'Active' : 'Disabled')}
                  </td>
                  <td style="font-size:0.78rem;opacity:0.75;">${esc(emp.last_login_at ? new Date(emp.last_login_at).toLocaleString(crmState.lang) : '—')}</td>
                  ${crmState.user?.role === 'OWNER' ? `
                    <td>
                      <button type="button" class="nc-btn nc-btn-primary" data-save-emp="${esc(emp.id)}" style="padding:0.35rem 0.75rem;font-size:0.72rem;">${esc(u.saveBtn)}</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="crm-panel">
        <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">Role-Based Access Control (RBAC) Matrix</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;">
          ${roles.map((r) => `
            <div style="background:#141013;padding:1.15rem;border-radius:10px;border:1px solid var(--border-dark);">
              <span class="crm-badge">${esc(r.id)}</span>
              <div style="font-weight:700;margin-top:0.5rem;">${esc(r[`name_${crmState.lang}`] || r.name_en)}</div>
              <p style="font-size:0.8rem;opacity:0.75;margin-top:0.35rem;">${esc(r[`description_${crmState.lang}`] || r.description_en)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderPricingTab() {
    const u = ui();
    const plans = crmState.data.pricingPlans || [];

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1.5rem;">
        ${plans.map((p) => {
          const featLinesRu = (p.features || []).map((f) => f.text_ru).join('\n');
          const featLinesKk = (p.features || []).map((f) => f.text_kk).join('\n');
          const featLinesEn = (p.features || []).map((f) => f.text_en).join('\n');

          return `
            <div class="crm-panel">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <span class="crm-badge">${esc(p.code)}</span>
                <span style="font-size:0.78rem;opacity:0.7;">Order: #${p.sort_order}</span>
              </div>
              <form class="crm-pricing-edit-form" data-plan-id="${esc(p.id)}" style="display:flex;flex-direction:column;gap:0.75rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;">
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Name (RU)</label>
                    <input name="name_ru" class="crm-input" value="${esc(p.name_ru)}" />
                  </div>
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Name (KK)</label>
                    <input name="name_kk" class="crm-input" value="${esc(p.name_kk)}" />
                  </div>
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Name (EN)</label>
                    <input name="name_en" class="crm-input" value="${esc(p.name_en)}" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;">
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Price Label (RU)</label>
                    <input name="price_label_ru" class="crm-input" value="${esc(p.price_label_ru)}" />
                  </div>
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Price Label (KK)</label>
                    <input name="price_label_kk" class="crm-input" value="${esc(p.price_label_kk)}" />
                  </div>
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Price Label (EN)</label>
                    <input name="price_label_en" class="crm-input" value="${esc(p.price_label_en)}" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Numeric Price (optional)</label>
                    <input name="numeric_price" type="number" class="crm-input" value="${esc(p.numeric_price ?? '')}" placeholder="Custom Quote" />
                  </div>
                  <div>
                    <label style="font-size:0.7rem;color:var(--soft-rose);">Sort Order</label>
                    <input name="sort_order" type="number" class="crm-input" value="${p.sort_order}" />
                  </div>
                </div>

                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Description (RU)</label>
                  <textarea name="desc_ru" class="crm-textarea" rows="2">${esc(p.desc_ru)}</textarea>
                </div>
                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Description (KK)</label>
                  <textarea name="desc_kk" class="crm-textarea" rows="2">${esc(p.desc_kk)}</textarea>
                </div>
                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Description (EN)</label>
                  <textarea name="desc_en" class="crm-textarea" rows="2">${esc(p.desc_en)}</textarea>
                </div>

                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Features (RU — 1 per line)</label>
                  <textarea name="features_ru" class="crm-textarea" rows="4">${esc(featLinesRu)}</textarea>
                </div>
                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Features (KK — 1 per line)</label>
                  <textarea name="features_kk" class="crm-textarea" rows="3">${esc(featLinesKk)}</textarea>
                </div>
                <div>
                  <label style="font-size:0.7rem;color:var(--soft-rose);">Features (EN — 1 per line)</label>
                  <textarea name="features_en" class="crm-textarea" rows="3">${esc(featLinesEn)}</textarea>
                </div>

                <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.8rem;">
                  <label style="display:inline-flex;align-items:center;gap:0.4rem;">
                    <input type="checkbox" name="is_visible" ${p.is_visible ? 'checked' : ''} /> Visible on site
                  </label>
                  <label style="display:inline-flex;align-items:center;gap:0.4rem;">
                    <input type="checkbox" name="is_recommended" ${p.is_recommended ? 'checked' : ''} /> Recommended badge
                  </label>
                  <label style="display:inline-flex;align-items:center;gap:0.4rem;">
                    <input type="checkbox" name="is_custom_quote" ${p.is_custom_quote ? 'checked' : ''} /> Custom Quote Label
                  </label>
                </div>

                <button type="submit" class="nc-btn nc-btn-primary" style="margin-top:0.5rem;">${esc(u.saveBtn)} (${esc(p.code)})</button>
              </form>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderContentTab() {
    const u = ui();
    const services = crmState.data.services || [];
    const portfolio = crmState.data.portfolio || [];
    const faqs = crmState.data.faqs || [];

    return `
      <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;">
        <button type="button" class="nc-btn ${crmState.contentSubTab === 'services' ? 'nc-btn-primary' : 'nc-btn-outline-light'}" data-content-sub="services" style="padding:0.5rem 1.1rem;font-size:0.78rem;">Services (${services.length})</button>
        <button type="button" class="nc-btn ${crmState.contentSubTab === 'portfolio' ? 'nc-btn-primary' : 'nc-btn-outline-light'}" data-content-sub="portfolio" style="padding:0.5rem 1.1rem;font-size:0.78rem;">Portfolio (${portfolio.length})</button>
        <button type="button" class="nc-btn ${crmState.contentSubTab === 'faqs' ? 'nc-btn-primary' : 'nc-btn-outline-light'}" data-content-sub="faqs" style="padding:0.5rem 1.1rem;font-size:0.78rem;">FAQs (${faqs.length})</button>
      </div>

      ${crmState.contentSubTab === 'services' ? `
        <div class="crm-panel">
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead>
                <tr><th>#</th><th>Title (RU / KK / EN)</th><th>Description (RU / EN)</th><th>Visible</th><th>Save</th></tr>
              </thead>
              <tbody>
                ${services.map((s) => `
                  <tr>
                    <td><strong>${esc(s.number_code)}</strong></td>
                    <td style="min-width:220px;">
                      <input class="crm-input" data-srv-tru="${esc(s.id)}" value="${esc(s.title_ru)}" style="margin-bottom:0.35rem;" />
                      <input class="crm-input" data-srv-tkk="${esc(s.id)}" value="${esc(s.title_kk)}" style="margin-bottom:0.35rem;" />
                      <input class="crm-input" data-srv-ten="${esc(s.id)}" value="${esc(s.title_en)}" />
                    </td>
                    <td style="min-width:300px;">
                      <textarea class="crm-textarea" data-srv-dru="${esc(s.id)}" rows="2" style="margin-bottom:0.35rem;">${esc(s.desc_ru)}</textarea>
                      <textarea class="crm-textarea" data-srv-den="${esc(s.id)}" rows="2">${esc(s.desc_en)}</textarea>
                    </td>
                    <td>
                      <input type="checkbox" data-srv-vis="${esc(s.id)}" ${s.is_visible ? 'checked' : ''} />
                    </td>
                    <td>
                      <button type="button" class="nc-btn nc-btn-primary" data-save-srv="${esc(s.id)}" style="padding:0.4rem 0.8rem;font-size:0.74rem;">${esc(u.saveBtn)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${crmState.contentSubTab === 'portfolio' ? `
        <div class="crm-panel">
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead>
                <tr><th>Project Title</th><th>Category & Live URL</th><th>Description (RU / EN)</th><th>Visible</th><th>Save</th></tr>
              </thead>
              <tbody>
                ${portfolio.map((pr) => `
                  <tr>
                    <td style="min-width:190px;">
                      <input class="crm-input" data-port-tru="${esc(pr.id)}" value="${esc(pr.title_ru)}" style="margin-bottom:0.35rem;" />
                      <input class="crm-input" data-port-ten="${esc(pr.id)}" value="${esc(pr.title_en)}" />
                    </td>
                    <td style="min-width:240px;">
                      <input class="crm-input" data-port-cru="${esc(pr.id)}" value="${esc(pr.category_ru)}" style="margin-bottom:0.35rem;" />
                      <input class="crm-input" data-port-url="${esc(pr.id)}" value="${esc(pr.live_url)}" />
                    </td>
                    <td style="min-width:280px;">
                      <textarea class="crm-textarea" data-port-dru="${esc(pr.id)}" rows="2" style="margin-bottom:0.35rem;">${esc(pr.desc_ru)}</textarea>
                      <textarea class="crm-textarea" data-port-den="${esc(pr.id)}" rows="2">${esc(pr.desc_en)}</textarea>
                    </td>
                    <td>
                      <input type="checkbox" data-port-vis="${esc(pr.id)}" ${pr.is_visible ? 'checked' : ''} />
                    </td>
                    <td>
                      <button type="button" class="nc-btn nc-btn-primary" data-save-port="${esc(pr.id)}" style="padding:0.4rem 0.8rem;font-size:0.74rem;">${esc(u.saveBtn)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${crmState.contentSubTab === 'faqs' ? `
        <div class="crm-panel">
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead>
                <tr><th>Question (RU / EN)</th><th>Answer (RU / EN)</th><th>Visible</th><th>Save</th></tr>
              </thead>
              <tbody>
                ${faqs.map((fq) => `
                  <tr>
                    <td style="min-width:240px;">
                      <input class="crm-input" data-faq-qru="${esc(fq.id)}" value="${esc(fq.q_ru)}" style="margin-bottom:0.35rem;" />
                      <input class="crm-input" data-faq-qen="${esc(fq.id)}" value="${esc(fq.q_en)}" />
                    </td>
                    <td style="min-width:320px;">
                      <textarea class="crm-textarea" data-faq-aru="${esc(fq.id)}" rows="2" style="margin-bottom:0.35rem;">${esc(fq.a_ru)}</textarea>
                      <textarea class="crm-textarea" data-faq-aen="${esc(fq.id)}" rows="2">${esc(fq.a_en)}</textarea>
                    </td>
                    <td>
                      <input type="checkbox" data-faq-vis="${esc(fq.id)}" ${fq.is_visible ? 'checked' : ''} />
                    </td>
                    <td>
                      <button type="button" class="nc-btn nc-btn-primary" data-save-faq="${esc(fq.id)}" style="padding:0.4rem 0.8rem;font-size:0.74rem;">${esc(u.saveBtn)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;
  }

  function renderSettingsTab() {
    const u = ui();
    const tg = crmState.data.settings?.telegram_config || {};
    const hp = crmState.data.settings?.homepage_content || {};

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1.5rem;">
        <div class="crm-panel">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">${esc(u.passwordChangeTitle)}</h3>
          <form id="crm-change-pass-form" style="display:flex;flex-direction:column;gap:0.85rem;">
            <div>
              <label style="font-size:0.74rem;color:var(--soft-rose);">Current Password</label>
              <input name="currentPassword" type="password" class="crm-input" required />
            </div>
            <div>
              <label style="font-size:0.74rem;color:var(--soft-rose);">New Password (min 8 chars)</label>
              <input name="newPassword" type="password" class="crm-input" required />
            </div>
            <button type="submit" class="nc-btn nc-btn-primary">${esc(u.saveBtn)}</button>
          </form>
        </div>

        ${crmState.user?.role === 'OWNER' ? `
          <div class="crm-panel">
            <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:0.5rem;">${esc(u.telegramSettingsTitle)}</h3>
            <p style="font-size:0.8rem;opacity:0.72;margin-bottom:1rem;">
              Official Contact: <strong>@notnormale</strong>. Configure your Bot Token and Notification Chat ID below.
            </p>
            <form id="crm-tg-settings-form" style="display:flex;flex-direction:column;gap:0.85rem;">
              <div>
                <label style="font-size:0.74rem;color:var(--soft-rose);">Bot Token ${tg.hasBotToken ? '(Configured ✓)' : '(Not Configured)'}</label>
                <input name="botToken" type="password" class="crm-input" placeholder="123456:ABC-DEF..." />
              </div>
              <div>
                <label style="font-size:0.74rem;color:var(--soft-rose);">Notification Chat ID</label>
                <input name="chatId" type="text" class="crm-input" value="${esc(tg.chatId || '')}" placeholder="e.g. 123456789 or -100..." />
              </div>
              <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                <button type="submit" class="nc-btn nc-btn-primary" style="padding:0.55rem 1.1rem;font-size:0.76rem;">${esc(u.saveBtn)}</button>
                <button type="button" id="crm-test-tg-btn" class="nc-btn nc-btn-outline-light" style="padding:0.55rem 1.1rem;font-size:0.76rem;">${esc(u.testTelegramBtn)}</button>
              </div>
            </form>
          </div>
        ` : ''}

        <div class="crm-panel" style="grid-column: 1 / -1;">
          <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">Homepage Hero Text & Official Contacts</h3>
          <form id="crm-homepage-settings-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;">
            <div>
              <label style="font-size:0.74rem;color:var(--soft-rose);">Hero Subheadline (RU)</label>
              <textarea name="heroSub_ru" class="crm-textarea" rows="3">${esc(hp.heroSub_ru || '')}</textarea>
            </div>
            <div>
              <label style="font-size:0.74rem;color:var(--soft-rose);">Hero Subheadline (KK)</label>
              <textarea name="heroSub_kk" class="crm-textarea" rows="3">${esc(hp.heroSub_kk || '')}</textarea>
            </div>
            <div>
              <label style="font-size:0.74rem;color:var(--soft-rose);">Hero Subheadline (EN)</label>
              <textarea name="heroSub_en" class="crm-textarea" rows="3">${esc(hp.heroSub_en || '')}</textarea>
            </div>
            <div style="grid-column: 1 / -1;">
              <button type="submit" class="nc-btn nc-btn-primary">${esc(u.saveBtn)}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderLogsTab() {
    const logs = crmState.data.activityLogs || [];
    const notifs = crmState.data.notifications || [];

    return `
      <div class="crm-panel">
        <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">Telegram Notification Dispatch Log</h3>
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr><th>Time</th><th>Event</th><th>Title</th><th>Status</th><th>Details</th></tr>
            </thead>
            <tbody>
              ${notifs.length === 0 ? '<tr><td colspan="5">No notifications logged yet.</td></tr>' : notifs.map((n) => `
                <tr>
                  <td style="font-family:monospace;font-size:0.76rem;">${esc(new Date(n.created_at).toLocaleString(crmState.lang))}</td>
                  <td><span class="crm-badge">${esc(n.event_type)}</span></td>
                  <td><strong>${esc(n.title)}</strong></td>
                  <td>${esc(n.telegram_status)}</td>
                  <td style="font-size:0.76rem;opacity:0.75;">${esc(n.telegram_error || 'OK')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="crm-panel">
        <h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:1rem;">Security & Audit Activity Log</h3>
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr><th>Timestamp</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th></tr>
            </thead>
            <tbody>
              ${logs.map((lg) => `
                <tr>
                  <td style="font-family:monospace;font-size:0.76rem;">${esc(new Date(lg.created_at).toLocaleString(crmState.lang))}</td>
                  <td><strong>${esc(lg.actor_username)}</strong></td>
                  <td><span class="crm-badge">${esc(lg.actor_role)}</span></td>
                  <td>${esc(lg.action)}</td>
                  <td>${esc(lg.entity_type)} ${esc(lg.entity_id ? `(${lg.entity_id})` : '')}</td>
                  <td>${esc(lg.details)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // MAIN CRM SHELL
  // ==========================================================================
  function renderCrm() {
    const root = document.getElementById('nc-crm-root');
    if (!root) return;

    if (crmState.loading) {
      root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);letter-spacing:0.12em;">LOADING NOVEN.CODE CRM...</div>`;
      return;
    }

    if (!crmState.authenticated) {
      root.innerHTML = renderLoginView();
      bindCrmEvents();
      return;
    }

    const tr = t().crm;
    const tab = crmState.activeTab;

    let activeViewHtml = '';
    if (tab === 'dashboard') activeViewHtml = safeCrmTab('dashboard', renderDashboardTab);
    else if (tab === 'orders') activeViewHtml = safeCrmTab('orders', renderOrdersTab);
    else if (tab === 'clients') activeViewHtml = safeCrmTab('clients', renderClientsTab);
    else if (tab === 'projects') activeViewHtml = safeCrmTab('projects', renderProjectsTab);
    else if (tab === 'tasks') activeViewHtml = safeCrmTab('tasks', renderTasksTab);
    else if (tab === 'team') activeViewHtml = safeCrmTab('team', renderTeamTab);
    else if (tab === 'pricing') activeViewHtml = safeCrmTab('pricing', renderPricingTab);
    else if (tab === 'content') activeViewHtml = safeCrmTab('content', renderContentTab);
    else if (tab === 'settings') activeViewHtml = safeCrmTab('settings', renderSettingsTab);
    else if (tab === 'logs') activeViewHtml = safeCrmTab('logs', renderLogsTab);

    root.innerHTML = `
      <div class="crm-layout">
        <aside class="crm-sidebar">
          <div>
            <a href="/" class="nc-logo" style="margin-bottom: 1.75rem;">
              <span class="nc-logo-mark">✻</span>
              <span>NOVEN.CRM</span>
            </a>

            <div style="margin-bottom: 1.5rem; padding: 0.85rem; border-radius: 10px; background: rgba(104, 29, 50, 0.25); border: 1px solid var(--border-dark);">
              <div style="font-weight: 700; font-size: 0.9rem;">${esc(crmState.user.fullName)}</div>
              <div style="font-size: 0.75rem; color: var(--soft-rose);">@${esc(crmState.user.username)} — <strong>${esc(crmState.user.role)}</strong></div>
            </div>

            <nav aria-label="CRM Navigation">
              <button type="button" class="crm-nav-btn ${tab === 'dashboard' ? 'active' : ''}" data-crm-tab="dashboard">
                <span>${esc(tr.tabs.dashboard)}</span>
              </button>
              ${hasPerm('orders:view') ? `
                <button type="button" class="crm-nav-btn ${tab === 'orders' ? 'active' : ''}" data-crm-tab="orders">
                  <span>${esc(tr.tabs.orders)}</span>
                  <span class="crm-badge">${crmState.data.stats.newOrders}</span>
                </button>
              ` : ''}
              ${hasPerm('clients:view') ? `
                <button type="button" class="crm-nav-btn ${tab === 'clients' ? 'active' : ''}" data-crm-tab="clients">
                  <span>${esc(tr.tabs.clients)}</span>
                </button>
              ` : ''}
              <button type="button" class="crm-nav-btn ${tab === 'projects' ? 'active' : ''}" data-crm-tab="projects">
                <span>${esc(tr.tabs.projects)}</span>
              </button>
              <button type="button" class="crm-nav-btn ${tab === 'tasks' ? 'active' : ''}" data-crm-tab="tasks">
                <span>${esc(tr.tabs.tasks)}</span>
              </button>
              ${crmState.user.role === 'OWNER' || crmState.user.role === 'ADMIN' ? `
                <button type="button" class="crm-nav-btn ${tab === 'team' ? 'active' : ''}" data-crm-tab="team">
                  <span>${esc(tr.tabs.team)}</span>
                </button>
              ` : ''}
              ${hasPerm('pricing:view') ? `
                <button type="button" class="crm-nav-btn ${tab === 'pricing' ? 'active' : ''}" data-crm-tab="pricing">
                  <span>${esc(tr.tabs.pricing)}</span>
                </button>
              ` : ''}
              ${hasPerm('content:view') ? `
                <button type="button" class="crm-nav-btn ${tab === 'content' ? 'active' : ''}" data-crm-tab="content">
                  <span>${esc(tr.tabs.content)}</span>
                </button>
              ` : ''}
              <button type="button" class="crm-nav-btn ${tab === 'settings' ? 'active' : ''}" data-crm-tab="settings">
                <span>${esc(tr.tabs.settings)}</span>
              </button>
              ${hasPerm('logs:view') ? `
                <button type="button" class="crm-nav-btn ${tab === 'logs' ? 'active' : ''}" data-crm-tab="logs">
                  <span>${esc(tr.tabs.logs)}</span>
                </button>
              ` : ''}
            </nav>
          </div>

          <div style="padding-top: 1.5rem; border-top: 1px solid var(--border-dark); display: flex; flex-direction: column; gap: 0.65rem;">
            <a href="/" style="font-size: 0.8rem; color: var(--soft-rose);">${esc(tr.backToSite)}</a>
            <button type="button" id="crm-logout-btn" class="nc-btn nc-btn-outline-light" style="padding: 0.55rem 1rem; font-size: 0.75rem; width: 100%;">
              ${esc(tr.logoutBtn)}
            </button>
          </div>
        </aside>

        <main class="crm-main">
          <div class="crm-topbar">
            <div>
              <span class="nc-bracket-tag">[ NOVEN.CODE CRM / ${esc(tab.toUpperCase())} ]</span>
              <h1 style="font-family: var(--font-display); font-size: 1.85rem; font-weight: 800; margin-top: 0.25rem;">
                ${esc(tr.tabs[tab] || tab)}
              </h1>
            </div>

            <div style="display: flex; align-items: center; gap: 0.85rem;">
              <div class="nc-lang-switcher">
                <button type="button" class="nc-lang-btn ${crmState.lang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
                <button type="button" class="nc-lang-btn ${crmState.lang === 'kk' ? 'active' : ''}" data-lang="kk">KK</button>
                <button type="button" class="nc-lang-btn ${crmState.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
              </div>
            </div>
          </div>

          ${crmState.toast ? `
            <div role="status" style="margin-bottom: 1.25rem; padding: 0.85rem 1.25rem; border-radius: 10px; background: var(--burgundy); border: 1px solid var(--crimson); color: var(--white); font-weight: 600;">
              ✓ ${esc(crmState.toast)}
            </div>
          ` : ''}

          ${activeViewHtml}
        </main>
      </div>

      ${renderOrderModal()}
    `;

    bindCrmEvents();
  }

  // ==========================================================================
  // CRM EVENT LISTENERS
  // ==========================================================================
  function bindCrmEvents() {
    document.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang')));
    });

    const loginForm = document.getElementById('crm-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        crmState.loginError = '';
        const fd = new FormData(loginForm);
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              username: fd.get('username'),
              password: fd.get('password')
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            crmState.loginError = data.error || 'Authentication failed';
            renderCrm();
            return;
          }
          crmState.authenticated = true;
          crmState.csrfToken = data.csrfToken;
          crmState.user = data.user;
          await refreshOverviewData();
          renderCrm();
        } catch {
          crmState.loginError = 'Network error while signing in.';
          renderCrm();
        }
      });
    }

    const logoutBtn = document.getElementById('crm-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiRequest('/api/auth/logout', 'POST').catch(() => {});
        crmState.authenticated = false;
        crmState.user = null;
        renderCrm();
      });
    }

    document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        crmState.activeTab = btn.getAttribute('data-crm-tab');
        renderCrm();
      });
    });

    document.querySelectorAll('[data-content-sub]').forEach((btn) => {
      btn.addEventListener('click', () => {
        crmState.contentSubTab = btn.getAttribute('data-content-sub');
        renderCrm();
      });
    });

    // Order Filters
    const searchInput = document.getElementById('crm-order-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        crmState.searchQuery = e.target.value;
        renderCrm();
        const el = document.getElementById('crm-order-search');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }

    const statusFilter = document.getElementById('crm-order-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        crmState.orderStatusFilter = e.target.value;
        renderCrm();
      });
    }

    const pkgFilter = document.getElementById('crm-order-pkg-filter');
    if (pkgFilter) {
      pkgFilter.addEventListener('change', (e) => {
        crmState.orderPackageFilter = e.target.value;
        renderCrm();
      });
    }

    // Quick status & assignee updates on Orders table
    document.querySelectorAll('[data-quick-order-status]').forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const orderId = sel.getAttribute('data-quick-order-status');
        try {
          await apiRequest(`/api/admin/orders/${orderId}`, 'PATCH', { status: e.target.value });
          await refreshOverviewData();
          showToast('Order status updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.querySelectorAll('[data-quick-order-assign]').forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const orderId = sel.getAttribute('data-quick-order-assign');
        try {
          await apiRequest(`/api/admin/orders/${orderId}`, 'PATCH', { assigned_to: e.target.value });
          await refreshOverviewData();
          showToast('Order assignment updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.querySelectorAll('[data-inspect-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-inspect-order');
        crmState.selectedOrderModal = (crmState.data.orders || []).find((o) => o.id === id) || null;
        renderCrm();
      });
    });

    const closeOrderModal = document.getElementById('crm-close-order-modal');
    if (closeOrderModal) {
      closeOrderModal.addEventListener('click', () => {
        crmState.selectedOrderModal = null;
        renderCrm();
      });
    }

    const editOrderForm = document.getElementById('crm-edit-order-form');
    if (editOrderForm) {
      editOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = editOrderForm.getAttribute('data-order-id');
        const fd = new FormData(editOrderForm);
        try {
          await apiRequest(`/api/admin/orders/${orderId}`, 'PATCH', {
            status: fd.get('status'),
            assigned_to: fd.get('assigned_to'),
            estimated_budget: fd.get('estimated_budget'),
            desired_deadline: fd.get('desired_deadline'),
            internal_notes: fd.get('internal_notes')
          });
          crmState.selectedOrderModal = null;
          await refreshOverviewData();
          showToast('Order details saved');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.querySelectorAll('[data-convert-order]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-convert-order');
        const ord = (crmState.data.orders || []).find((o) => o.id === id);
        if (!ord) return;
        try {
          await apiRequest('/api/admin/projects', 'POST', {
            title: `${ord.business_name} — ${(ord.selected_services || [])[0] || 'Digital Project'}`,
            description: ord.project_goals,
            client_id: ord.client_id,
            order_id: ord.id,
            deadline: ord.desired_deadline,
            assigned_employees: ord.assigned_to ? [ord.assigned_to] : []
          });
          await refreshOverviewData();
          crmState.activeTab = 'projects';
          showToast(`Created project from order ${ord.order_code}`);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.querySelectorAll('[data-delete-order]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-order');
        if (!window.confirm('Are you sure you want to permanently delete this order?')) return;
        try {
          await apiRequest(`/api/admin/orders/${id}`, 'DELETE');
          await refreshOverviewData();
          showToast('Order deleted');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Clients Creation & Note Updates
    const createClientForm = document.getElementById('crm-create-client-form');
    if (createClientForm) {
      createClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(createClientForm);
        try {
          await apiRequest('/api/admin/clients', 'POST', Object.fromEntries(fd.entries()));
          await refreshOverviewData();
          showToast('Client created');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.querySelectorAll('[data-save-client-note]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-client-note');
        const input = document.querySelector(`[data-client-note-input="${id}"]`);
        try {
          await apiRequest(`/api/admin/clients/${id}`, 'PATCH', { internal_notes: input ? input.value : '' });
          await refreshOverviewData();
          showToast('Client notes saved');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Projects Creation & Updates
    const createProjectForm = document.getElementById('crm-create-project-form');
    if (createProjectForm) {
      createProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(createProjectForm);
        try {
          await apiRequest('/api/admin/projects', 'POST', Object.fromEntries(fd.entries()));
          await refreshOverviewData();
          showToast('Project created');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.querySelectorAll('[data-save-project]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-project');
        const stEl = document.querySelector(`[data-proj-status="${id}"]`);
        const prEl = document.querySelector(`[data-proj-progress="${id}"]`);
        const techEl = document.querySelector(`[data-proj-tech="${id}"]`);
        const desEl = document.querySelector(`[data-proj-design="${id}"]`);
        try {
          await apiRequest(`/api/admin/projects/${id}`, 'PATCH', {
            status: stEl ? stEl.value : undefined,
            progress: prEl ? Number(prEl.value) : undefined,
            technical_notes: techEl ? techEl.value : undefined,
            design_notes: desEl ? desEl.value : undefined
          });
          await refreshOverviewData();
          showToast('Project updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Tasks Creation & Updates
    const createTaskForm = document.getElementById('crm-create-task-form');
    if (createTaskForm) {
      createTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(createTaskForm);
        try {
          await apiRequest('/api/admin/tasks', 'POST', Object.fromEntries(fd.entries()));
          await refreshOverviewData();
          showToast('Task created');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.querySelectorAll('[data-save-task]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-task');
        const stEl = document.querySelector(`[data-task-status="${id}"]`);
        const ntEl = document.querySelector(`[data-task-notes="${id}"]`);
        try {
          await apiRequest(`/api/admin/tasks/${id}`, 'PATCH', {
            status: stEl ? stEl.value : undefined,
            technical_notes: ntEl ? ntEl.value : undefined
          });
          await refreshOverviewData();
          showToast('Task updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Team / Employee Management
    const createEmpForm = document.getElementById('crm-create-emp-form');
    if (createEmpForm) {
      createEmpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(createEmpForm);
        try {
          await apiRequest('/api/admin/employees', 'POST', Object.fromEntries(fd.entries()));
          await refreshOverviewData();
          showToast('Employee account created');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.querySelectorAll('[data-save-emp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-emp');
        const roleEl = document.querySelector(`[data-emp-role="${id}"]`);
        const actEl = document.querySelector(`[data-emp-active="${id}"]`);
        try {
          await apiRequest(`/api/admin/employees/${id}`, 'PATCH', {
            role: roleEl ? roleEl.value : undefined,
            is_active: actEl ? actEl.checked : undefined
          });
          await refreshOverviewData();
          showToast('Employee role & status updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Pricing Plan Management
    document.querySelectorAll('.crm-pricing-edit-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const planId = form.getAttribute('data-plan-id');
        const fd = new FormData(form);
        const linesRu = String(fd.get('features_ru') || '').split('\n').map((s) => s.trim()).filter(Boolean);
        const linesKk = String(fd.get('features_kk') || '').split('\n').map((s) => s.trim()).filter(Boolean);
        const linesEn = String(fd.get('features_en') || '').split('\n').map((s) => s.trim()).filter(Boolean);

        const features = linesRu.map((ruText, idx) => ({
          text_ru: ruText,
          text_kk: linesKk[idx] || ruText,
          text_en: linesEn[idx] || ruText
        }));

        try {
          await apiRequest(`/api/admin/pricing/${planId}`, 'PATCH', {
            name_ru: fd.get('name_ru'),
            name_kk: fd.get('name_kk'),
            name_en: fd.get('name_en'),
            price_label_ru: fd.get('price_label_ru'),
            price_label_kk: fd.get('price_label_kk'),
            price_label_en: fd.get('price_label_en'),
            numeric_price: fd.get('numeric_price'),
            sort_order: Number(fd.get('sort_order') || 1),
            desc_ru: fd.get('desc_ru'),
            desc_kk: fd.get('desc_kk'),
            desc_en: fd.get('desc_en'),
            is_visible: form.querySelector('[name="is_visible"]').checked,
            is_recommended: form.querySelector('[name="is_recommended"]').checked,
            is_custom_quote: form.querySelector('[name="is_custom_quote"]').checked,
            features
          });
          await refreshOverviewData();
          showToast('Pricing package updated on live website');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Content CMS (Services, Portfolio, FAQs)
    document.querySelectorAll('[data-save-srv]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-srv');
        try {
          await apiRequest(`/api/admin/services/${id}`, 'PATCH', {
            title_ru: document.querySelector(`[data-srv-tru="${id}"]`)?.value,
            title_kk: document.querySelector(`[data-srv-tkk="${id}"]`)?.value,
            title_en: document.querySelector(`[data-srv-ten="${id}"]`)?.value,
            desc_ru: document.querySelector(`[data-srv-dru="${id}"]`)?.value,
            desc_en: document.querySelector(`[data-srv-den="${id}"]`)?.value,
            is_visible: document.querySelector(`[data-srv-vis="${id}"]`)?.checked
          });
          await refreshOverviewData();
          showToast('Service updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.querySelectorAll('[data-save-port]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-port');
        try {
          await apiRequest(`/api/admin/portfolio/${id}`, 'PATCH', {
            title_ru: document.querySelector(`[data-port-tru="${id}"]`)?.value,
            title_en: document.querySelector(`[data-port-ten="${id}"]`)?.value,
            category_ru: document.querySelector(`[data-port-cru="${id}"]`)?.value,
            live_url: document.querySelector(`[data-port-url="${id}"]`)?.value,
            desc_ru: document.querySelector(`[data-port-dru="${id}"]`)?.value,
            desc_en: document.querySelector(`[data-port-den="${id}"]`)?.value,
            is_visible: document.querySelector(`[data-port-vis="${id}"]`)?.checked
          });
          await refreshOverviewData();
          showToast('Portfolio project updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.querySelectorAll('[data-save-faq]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-faq');
        try {
          await apiRequest(`/api/admin/faqs/${id}`, 'PATCH', {
            q_ru: document.querySelector(`[data-faq-qru="${id}"]`)?.value,
            q_en: document.querySelector(`[data-faq-qen="${id}"]`)?.value,
            a_ru: document.querySelector(`[data-faq-aru="${id}"]`)?.value,
            a_en: document.querySelector(`[data-faq-aen="${id}"]`)?.value,
            is_visible: document.querySelector(`[data-faq-vis="${id}"]`)?.checked
          });
          await refreshOverviewData();
          showToast('FAQ updated');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // Settings & Password Change & Telegram Test
    const passForm = document.getElementById('crm-change-pass-form');
    if (passForm) {
      passForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(passForm);
        try {
          await apiRequest('/api/auth/change-password', 'POST', {
            currentPassword: fd.get('currentPassword'),
            newPassword: fd.get('newPassword')
          });
          passForm.reset();
          showToast('Password updated securely');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    const tgForm = document.getElementById('crm-tg-settings-form');
    if (tgForm) {
      tgForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(tgForm);
        try {
          await apiRequest('/api/admin/settings', 'PATCH', {
            telegram_config: {
              botToken: fd.get('botToken'),
              chatId: fd.get('chatId')
            }
          });
          await refreshOverviewData();
          showToast('Telegram configuration saved');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    const testTgBtn = document.getElementById('crm-test-tg-btn');
    if (testTgBtn) {
      testTgBtn.addEventListener('click', async () => {
        try {
          const res = await apiRequest('/api/admin/telegram/test', 'POST');
          await refreshOverviewData();
          showToast(`Telegram test status: ${res.result?.status}`);
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    const hpForm = document.getElementById('crm-homepage-settings-form');
    if (hpForm) {
      hpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(hpForm);
        try {
          const prev = crmState.data.settings?.homepage_content || {};
          await apiRequest('/api/admin/settings', 'PATCH', {
            homepage_content: {
              ...prev,
              heroSub_ru: fd.get('heroSub_ru'),
              heroSub_kk: fd.get('heroSub_kk'),
              heroSub_en: fd.get('heroSub_en')
            }
          });
          await refreshOverviewData();
          showToast('Homepage hero content saved');
        } catch (err) {
          showToast(err.message);
        }
      });
    }
  }

  window.refreshNovenCrm = checkSessionAndLoad;
  checkSessionAndLoad();
})();
