'use strict';

(function () {
  const savedLang = localStorage.getItem('nc_lang') || 'ru';
  const savedOrderDraft = (() => {
    try {
      const raw = sessionStorage.getItem('nc_order_draft');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  function normalizeRoute(rawPath) {
    if (!rawPath) return '/';
    let p = rawPath.replace(/\/index\.html$/i, '');
    const knownRoutes = ['/services', '/pricing', '/portfolio', '/about', '/process', '/faq', '/contact', '/start-project', '/order-confirmation', '/admin'];
    for (const kr of knownRoutes) {
      if (p === kr || p.endsWith(kr)) return kr;
    }
    return '/';
  }

  const state = {
    lang: ['ru', 'kk', 'en'].includes(savedLang) ? savedLang : 'ru',
    route: normalizeRoute(window.location.pathname),
    mobileMenuOpen: false,
    faqOpenIds: new Set(['faq-01']),
    bootstrap: {
      services: [],
      pricingPlans: [],
      portfolio: [],
      faqs: [],
      settings: {}
    },
    sound: new window.NovenAmbientSound(),
    showSoundBanner: !localStorage.getItem('nc_sound_consent'),
    orderStep: savedOrderDraft?.orderStep || 1,
    isSubmittingOrder: false,
    orderError: '',
    confirmedOrder: null,
    orderForm: savedOrderDraft?.orderForm || {
      idempotencyKey: 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      selectedPackage: '',
      selectedServices: [],
      businessName: '',
      businessType: '',
      customBusinessType: '',
      industry: '',
      businessDescription: '',
      targetAudience: '',
      projectGoals: '',
      existingWebsite: '',
      socialMedia: '',
      attachments: [],
      referenceNotes: '',
      referenceAvoid: '',
      primaryColor: '#681D32',
      secondaryColor: '#A63854',
      backgroundColor: '#F8F7F5',
      hexCodes: '',
      existingBranding: '',
      preferredStyle: '',
      colorsToAvoid: '',
      requiredFeatures: [],
      customFeatures: '',
      customerName: '',
      customerPhone: '',
      customerWhatsapp: '',
      customerEmail: '',
      preferredContact: 'whatsapp',
      estimatedBudget: '',
      desiredDeadline: '',
      priority: 'standard',
      additionalRequirements: ''
    }
  };

  function persistOrderDraft() {
    try {
      // Persist form fields (excluding large base64 attachment payloads if over quota)
      sessionStorage.setItem('nc_order_draft', JSON.stringify({
        orderStep: state.orderStep,
        orderForm: {
          ...state.orderForm,
          attachments: state.orderForm.attachments.slice(0, 5)
        }
      }));
    } catch {
      // Ignore storage quota warnings
    }
  }

  function t() {
    return window.NOVEN_I18N[state.lang] || window.NOVEN_I18N.ru;
  }

  function locField(obj, baseKey) {
    if (!obj) return '';
    return obj[`${baseKey}_${state.lang}`] || obj[`${baseKey}_ru`] || obj[`${baseKey}_en`] || '';
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setLang(newLang) {
    if (!['ru', 'kk', 'en'].includes(newLang)) return;
    state.lang = newLang;
    localStorage.setItem('nc_lang', newLang);
    document.documentElement.lang = newLang;
    const tr = t();
    document.title = tr.meta.title;
    renderApp();
  }

  function navigateTo(path, options = {}) {
    state.mobileMenuOpen = false;
    const norm = normalizeRoute(path);
    state.route = norm;
    try {
      const basePrefix = window.location.pathname.includes('/noven-code') ? '/noven-code' : '';
      const targetUrl = basePrefix + (norm === '/' ? '/' : norm);
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    } catch {}
    if (options.preselectPackage) {
      state.orderForm.selectedPackage = options.preselectPackage;
      persistOrderDraft();
    }
    if (options.preselectService) {
      if (!state.orderForm.selectedServices.includes(options.preselectService)) {
        state.orderForm.selectedServices.push(options.preselectService);
      }
      persistOrderDraft();
    }
    renderApp();
    if (options.scrollToId) {
      setTimeout(() => {
        const el = document.getElementById(options.scrollToId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  window.addEventListener('popstate', () => {
    state.route = normalizeRoute(window.location.pathname);
    renderApp();
  });

  // ==========================================================================
  // RENDER COMPONENTS
  // ==========================================================================
  function renderHeader() {
    const tr = t();
    const isPlaying = state.sound.isPlaying;
    return `
      <header class="nc-header">
        <div class="nc-container nc-header-inner">
          <a href="/" class="nc-logo" data-nav="/">
            <span class="nc-logo-mark">✻</span>
            <span>NOVEN.CODE</span>
          </a>

          <nav class="nc-nav-links" aria-label="Main Navigation">
            <a href="/" class="nc-nav-item ${state.route === '/' ? 'active' : ''}" data-nav="/">${esc(tr.nav.home)}</a>
            <span class="nc-nav-sep">/</span>
            <a href="/services" class="nc-nav-item ${state.route === '/services' ? 'active' : ''}" data-nav="/services">${esc(tr.nav.services)}</a>
            <span class="nc-nav-sep">/</span>
            <a href="/pricing" class="nc-nav-item ${state.route === '/pricing' ? 'active' : ''}" data-nav="/pricing">${esc(tr.nav.pricing)}</a>
            <span class="nc-nav-sep">/</span>
            <a href="/portfolio" class="nc-nav-item ${state.route === '/portfolio' ? 'active' : ''}" data-nav="/portfolio">${esc(tr.nav.portfolio)}</a>
            <span class="nc-nav-sep">/</span>
            <a href="/about" class="nc-nav-item ${state.route === '/about' ? 'active' : ''}" data-nav="/about">${esc(tr.nav.about)}</a>
            <span class="nc-nav-sep">/</span>
            <a href="/contact" class="nc-nav-item ${state.route === '/contact' ? 'active' : ''}" data-nav="/contact">${esc(tr.nav.contact)}</a>
          </nav>

          <div class="nc-header-actions">
            <button type="button" id="nc-sound-btn" class="nc-sound-toggle ${isPlaying ? 'playing' : ''}" aria-label="${esc(isPlaying ? tr.sound.soundOn : tr.sound.soundOff)}" title="${esc(tr.sound.volume)}">
              <span class="nc-sound-bars"><span></span><span></span><span></span></span>
              <span>${esc(isPlaying ? tr.sound.soundOn : tr.sound.soundOff)}</span>
            </button>

            <div class="nc-lang-switcher" role="group" aria-label="Language Switcher">
              <button type="button" class="nc-lang-btn ${state.lang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
              <button type="button" class="nc-lang-btn ${state.lang === 'kk' ? 'active' : ''}" data-lang="kk">KK</button>
              <button type="button" class="nc-lang-btn ${state.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
            </div>

            <a href="/start-project" class="nc-btn nc-btn-primary" data-nav="/start-project" style="padding: 0.65rem 1.25rem; font-size: 0.78rem;">
              <span>${esc(tr.nav.startProject)}</span>
              <span>↗</span>
            </a>

            <button type="button" id="nc-mobile-menu-btn" class="nc-mobile-toggle" aria-label="Menu">
              <span>${state.mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>
      </header>

      <div class="nc-mobile-drawer ${state.mobileMenuOpen ? 'open' : ''}">
        <div class="nc-mobile-nav-list">
          <a href="/" class="nc-mobile-nav-link" data-nav="/"><span>${esc(tr.nav.home)}</span><span>01</span></a>
          <a href="/services" class="nc-mobile-nav-link" data-nav="/services"><span>${esc(tr.nav.services)}</span><span>02</span></a>
          <a href="/pricing" class="nc-mobile-nav-link" data-nav="/pricing"><span>${esc(tr.nav.pricing)}</span><span>03</span></a>
          <a href="/portfolio" class="nc-mobile-nav-link" data-nav="/portfolio"><span>${esc(tr.nav.portfolio)}</span><span>04</span></a>
          <a href="/about" class="nc-mobile-nav-link" data-nav="/about"><span>${esc(tr.nav.about)}</span><span>05</span></a>
          <a href="/process" class="nc-mobile-nav-link" data-nav="/process"><span>${esc(tr.nav.process)}</span><span>06</span></a>
          <a href="/faq" class="nc-mobile-nav-link" data-nav="/faq"><span>${esc(tr.nav.faq)}</span><span>07</span></a>
          <a href="/contact" class="nc-mobile-nav-link" data-nav="/contact"><span>${esc(tr.nav.contact)}</span><span>08</span></a>
        </div>
        <div style="margin-top: 2rem;">
          <a href="/start-project" class="nc-btn nc-btn-primary" data-nav="/start-project" style="width: 100%; justify-content: center;">
            ${esc(tr.nav.startProject)} ↗
          </a>
        </div>
      </div>
    `;
  }

  function renderHeroSection() {
    const tr = t();
    const hp = state.bootstrap.settings?.homepage_content || {};
    const subText = hp[`heroSub_${state.lang}`] || tr.hero.defaultSub;
    const primaryCtaText = hp[`primaryCta_${state.lang}`] || tr.hero.primaryCta;
    const secondaryCtaText = hp[`secondaryCta_${state.lang}`] || tr.hero.secondaryCta;

    return `
      <section class="nc-hero">
        <canvas id="nc-hero-3d-canvas" class="nc-hero-canvas" aria-hidden="true"></canvas>
        <div class="nc-hero-grid-overlay" aria-hidden="true"></div>

        <div class="nc-container nc-hero-content">
          <div class="nc-hero-top-meta">
            <span class="nc-bracket-tag">${esc(tr.hero.tag)}</span>
            <span class="nc-hero-index-counter">01 / 07 — NOVEN.CODE STUDIO</span>
          </div>

          <div class="nc-hero-main-grid">
            <div>
              <h1 class="nc-hero-headline">
                WE BUILD<br/>
                DIGITAL<span class="crimson-dot">.</span><br/>
                <span class="accent-line">YOU GROW<span class="crimson-dot">.</span></span>
              </h1>

              <div class="nc-hero-cta-row">
                <a href="/start-project" class="nc-circle-cta" data-nav="/start-project">
                  <span class="nc-circle-cta-icon">↗</span>
                  <span>${esc(primaryCtaText)}</span>
                </a>

                <a href="/portfolio" class="nc-btn nc-btn-outline-light" data-nav="/portfolio">
                  <span>${esc(secondaryCtaText)}</span>
                </a>
              </div>
            </div>

            <div class="nc-hero-description-col">
              <p class="nc-hero-sub">${esc(subText)}</p>
              <div style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.82rem; color: var(--soft-rose);">
                <a href="https://wa.me/77066421107" target="_blank" rel="noopener noreferrer" style="border-bottom: 1px solid rgba(233,221,224,0.35);">WhatsApp: +7 706 642 1107 ↗</a>
                <a href="https://t.me/notnormale" target="_blank" rel="noopener noreferrer" style="border-bottom: 1px solid rgba(233,221,224,0.35);">Telegram: @notnormale ↗</a>
              </div>
            </div>
          </div>

          <div class="nc-hero-bento-row">
            <div class="nc-bento-card">
              <span class="nc-bento-asterisk">✻</span>
              <div>
                <h2 class="nc-bento-title">${esc(tr.hero.bento1Title)}</h2>
                <p class="nc-bento-caption">${esc(tr.hero.bento1Desc)}</p>
              </div>
            </div>

            <div class="nc-bento-card burgundy-accent">
              <span class="nc-bento-asterisk">✻</span>
              <div>
                <h2 class="nc-bento-title">${esc(tr.hero.bento2Title)}</h2>
                <p class="nc-bento-caption">${esc(tr.hero.bento2Desc)}</p>
              </div>
            </div>

            <div class="nc-bento-card light-accent">
              <span class="nc-bento-asterisk">✻</span>
              <div>
                <h2 class="nc-bento-title">${esc(tr.hero.bento3Title)}</h2>
                <p class="nc-bento-caption">${esc(tr.hero.bento3Desc)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderServicesSection() {
    const tr = t();
    const services = state.bootstrap.services || [];

    return `
      <section id="section-services" class="nc-section nc-section-dark">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.services.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.services.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.services.subtitle)}</p>
          </div>

          <div class="nc-services-wrapper">
            <div class="nc-services-connector-line" aria-hidden="true"></div>
            <div class="nc-services-grid">
              ${services.map((srv) => {
                const title = locField(srv, 'title');
                const desc = locField(srv, 'desc');
                const cta = locField(srv, 'cta');
                const benefits = srv[`benefits_${state.lang}`] || srv.benefits_ru || [];
                return `
                  <article class="nc-service-card">
                    <div>
                      <div class="nc-service-num">
                        <span>${esc(srv.number_code)}</span>
                        <span style="color: var(--crimson);">✻</span>
                      </div>
                      <h3 class="nc-service-title">${esc(title)}</h3>
                      <p class="nc-service-desc">${esc(desc)}</p>
                    </div>
                    <div>
                      <ul class="nc-service-benefits">
                        ${benefits.map((b) => `<li>${esc(b)}</li>`).join('')}
                      </ul>
                      <button type="button" class="nc-service-cta" data-order-service="${esc(title)}">
                        <span>${esc(cta)}</span>
                        <span>↗</span>
                      </button>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 9th Service Highlight Banner: Custom Digital Solutions -->
          <div style="margin-top: 2.5rem; padding: 2.25rem 2.5rem; border-radius: 16px; background: linear-gradient(120deg, var(--burgundy) 0%, #2B101A 100%); border: 1px solid var(--crimson); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem;">
            <div style="max-width: 680px;">
              <span class="nc-bracket-tag" style="color: var(--soft-rose);">09 / BESPOKE ENGINEERING</span>
              <h3 style="font-family: var(--font-display); font-size: 1.65rem; font-weight: 800; margin-top: 0.4rem;">${esc(tr.services.customCtaTitle)}</h3>
              <p style="font-size: 0.95rem; opacity: 0.86; margin-top: 0.5rem;">${esc(tr.services.customCtaDesc)}</p>
            </div>
            <button type="button" class="nc-btn nc-btn-white" data-order-service="${esc(tr.services.customCtaTitle)}">
              <span>${esc(tr.services.customCtaBtn)}</span>
              <span>↗</span>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderPricingSection() {
    const tr = t();
    const plans = state.bootstrap.pricingPlans || [];

    return `
      <section id="section-pricing" class="nc-section nc-section-light">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.pricing.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.pricing.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.pricing.subtitle)}</p>
          </div>

          <div class="nc-pricing-grid">
            ${plans.map((plan) => {
              const name = locField(plan, 'name');
              const desc = locField(plan, 'desc');
              const priceLabel = locField(plan, 'price_label');
              const cta = locField(plan, 'cta') || tr.pricing.chooseBtn;
              const addons = locField(plan, 'optional_addons');
              const formattedNumPrice = (!plan.is_custom_quote && plan.numeric_price)
                ? new Intl.NumberFormat(state.lang === 'en' ? 'en-US' : 'ru-KZ').format(plan.numeric_price) + ' ' + (plan.currency || 'KZT')
                : priceLabel;

              return `
                <article class="nc-pricing-card ${plan.is_recommended ? 'recommended' : ''}">
                  ${plan.is_recommended ? `<span class="nc-pricing-badge">${esc(tr.pricing.recommendedBadge)}</span>` : ''}
                  <div>
                    <div class="nc-pricing-code">[ PACKAGE / ${esc(plan.code)} ]</div>
                    <h3 class="nc-pricing-name">${esc(name)}</h3>
                    <p style="font-size: 0.94rem; opacity: 0.8; line-height: 1.55;">${esc(desc)}</p>

                    <div class="nc-pricing-price-box">
                      <div class="nc-pricing-price-label">${esc(formattedNumPrice)}</div>
                    </div>

                    <div style="font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.85rem; opacity: 0.75;">
                      ${esc(tr.pricing.includedLabel)}
                    </div>
                    <ul class="nc-pricing-features-list">
                      ${(plan.features || []).map((f) => `
                        <li>
                          <span class="nc-pricing-check">✓</span>
                          <span>${esc(locField(f, 'text'))}</span>
                        </li>
                      `).join('')}
                    </ul>
                  </div>

                  <div>
                    ${addons ? `
                      <div class="nc-pricing-addons">
                        <strong>${esc(tr.pricing.addonsLabel)}</strong> ${esc(addons)}
                      </div>
                    ` : ''}
                    <button type="button" class="nc-btn ${plan.is_recommended ? 'nc-btn-primary' : 'nc-btn-outline-dark'}" data-choose-plan="${esc(plan.code)}" style="width: 100%;">
                      <span>${esc(cta)}</span>
                      <span>↗</span>
                    </button>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderPortfolioSection() {
    const tr = t();
    const portfolio = state.bootstrap.portfolio || [];

    return `
      <section id="section-portfolio" class="nc-section nc-section-white">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.portfolio.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.portfolio.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.portfolio.subtitle)}</p>
          </div>

          <div class="nc-portfolio-grid">
            ${portfolio.map((item) => {
              const title = locField(item, 'title');
              const category = locField(item, 'category');
              const desc = locField(item, 'desc');
              return `
                <article class="nc-portfolio-card">
                  <div>
                    <div class="nc-portfolio-preview">
                      <img src="${esc(item.preview_image)}" alt="${esc(title)}" loading="lazy" />
                    </div>
                    <div class="nc-portfolio-body">
                      <div>
                        <div class="nc-portfolio-category">${esc(category)}</div>
                        <h3 class="nc-portfolio-title">${esc(title)}</h3>
                        <p class="nc-portfolio-desc">${esc(desc)}</p>
                      </div>
                      <div class="nc-portfolio-footer">
                        <span class="nc-portfolio-url" title="${esc(item.live_url)}">${esc(item.live_url)}</span>
                        <a href="${esc(item.live_url)}" target="_blank" rel="noopener noreferrer" class="nc-btn nc-btn-primary" style="padding: 0.6rem 1.15rem; font-size: 0.76rem;">
                          <span>${esc(tr.portfolio.viewLiveBtn)}</span>
                          <span>↗</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </div>

          <p style="margin-top: 2rem; font-size: 0.85rem; color: rgba(23, 19, 22, 0.58); text-align: center;">
            ${esc(tr.portfolio.demoNotice)}
          </p>
        </div>
      </section>
    `;
  }

  function renderAboutSection() {
    const tr = t();
    return `
      <section id="section-about" class="nc-section nc-section-light">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.about.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.about.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.about.subtitle)}</p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
            <div style="background: var(--white); padding: 2.25rem; border-radius: 16px; border: 1px solid var(--border-light);">
              <div style="font-family: var(--font-display); color: var(--crimson); font-weight: 800; font-size: 1.25rem; margin-bottom: 0.75rem;">01 / CUSTOM</div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem;">${esc(tr.about.p1Title)}</h3>
              <p style="font-size: 0.94rem; color: rgba(23,19,22,0.75);">${esc(tr.about.p1Desc)}</p>
            </div>

            <div style="background: var(--white); padding: 2.25rem; border-radius: 16px; border: 1px solid var(--border-light);">
              <div style="font-family: var(--font-display); color: var(--crimson); font-weight: 800; font-size: 1.25rem; margin-bottom: 0.75rem;">02 / DESIGN</div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem;">${esc(tr.about.p2Title)}</h3>
              <p style="font-size: 0.94rem; color: rgba(23,19,22,0.75);">${esc(tr.about.p2Desc)}</p>
            </div>

            <div style="background: var(--white); padding: 2.25rem; border-radius: 16px; border: 1px solid var(--border-light);">
              <div style="font-family: var(--font-display); color: var(--crimson); font-weight: 800; font-size: 1.25rem; margin-bottom: 0.75rem;">03 / RELIABILITY</div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem;">${esc(tr.about.p3Title)}</h3>
              <p style="font-size: 0.94rem; color: rgba(23,19,22,0.75);">${esc(tr.about.p3Desc)}</p>
            </div>

            <div style="background: var(--near-black); color: var(--off-white); padding: 2.25rem; border-radius: 16px; border: 1px solid var(--crimson);">
              <div style="font-family: var(--font-display); color: var(--soft-rose); font-weight: 800; font-size: 1.25rem; margin-bottom: 0.75rem;">04 / BUSINESS</div>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem;">${esc(tr.about.p4Title)}</h3>
              <p style="font-size: 0.94rem; opacity: 0.82;">${esc(tr.about.p4Desc)}</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderProcessSection() {
    const tr = t();
    const steps = tr.process.steps;
    const colPositions = [
      '1 / span 2',
      '2 / span 2',
      '3 / span 2',
      '4 / span 2',
      '5 / span 2',
      '6 / span 2',
      '6 / span 2',
      '7 / span 2'
    ];

    return `
      <section id="section-process" class="nc-section nc-section-burgundy">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.process.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.process.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.process.subtitle)}</p>
          </div>

          <div class="nc-workflow-board">
            <div class="nc-workflow-phases-header">
              <span>${esc(tr.process.phase1)}</span>
              <span>${esc(tr.process.phase2)}</span>
              <span>${esc(tr.process.phase3)}</span>
              <span>${esc(tr.process.phase4)}</span>
            </div>

            <div class="nc-workflow-grid">
              ${steps.map((s, idx) => `
                <div class="nc-workflow-row">
                  <div class="nc-workflow-pill" style="grid-column: ${colPositions[idx] || '1 / span 2'};" title="${esc(s.desc)}">
                    <span>${esc(s.title)}</span>
                    <span class="step-idx">${esc(s.num)}</span>
                  </div>
                </div>
              `).join('')}
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-top: 2.25rem; padding-top: 1.75rem; border-top: 1px solid rgba(23, 19, 22, 0.12);">
              ${steps.map((s) => `
                <div>
                  <div style="font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; color: var(--crimson);">${esc(s.num)} — ${esc(s.title)}</div>
                  <p style="font-size: 0.84rem; color: rgba(23, 19, 22, 0.74); margin-top: 0.25rem;">${esc(s.desc)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderFaqSection() {
    const tr = t();
    const faqs = state.bootstrap.faqs || [];

    return `
      <section id="section-faq" class="nc-section nc-section-white">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.faq.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.faq.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.faq.subtitle)}</p>
          </div>

          <div class="nc-faq-list">
            ${faqs.map((fq, idx) => {
              const isOpen = state.faqOpenIds.has(fq.id);
              const q = locField(fq, 'q');
              const a = locField(fq, 'a');
              return `
                <div class="nc-faq-item ${isOpen ? 'open' : ''}">
                  <button type="button" class="nc-faq-trigger" data-faq-toggle="${esc(fq.id)}" aria-expanded="${isOpen}">
                    <span><strong style="color: var(--crimson); margin-right: 0.75rem;">${String(idx + 1).padStart(2, '0')}</strong> ${esc(q)}</span>
                    <span style="font-size: 1.4rem; color: var(--burgundy);">${isOpen ? '−' : '+'}</span>
                  </button>
                  <div class="nc-faq-answer">
                    <p>${esc(a)}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderContactSection() {
    const tr = t();
    return `
      <section id="section-contact" class="nc-section nc-section-dark">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.contact.tag)}</span>
              <h2 class="nc-section-title">${esc(tr.contact.title)}</h2>
            </div>
            <p class="nc-section-subtitle">${esc(tr.contact.subtitle)}</p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
            <a href="https://wa.me/77066421107" target="_blank" rel="noopener noreferrer" class="nc-bento-card burgundy-accent" style="min-height: 200px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="nc-bracket-tag" style="color: var(--soft-rose);">WHATSAPP</span>
                <span style="font-size: 1.4rem;">↗</span>
              </div>
              <div>
                <div style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; margin-bottom: 0.4rem;">+7 706 642 1107</div>
                <span style="font-size: 0.88rem; opacity: 0.85;">${esc(tr.contact.whatsappLabel)}</span>
              </div>
            </a>

            <a href="https://t.me/notnormale" target="_blank" rel="noopener noreferrer" class="nc-bento-card" style="min-height: 200px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="nc-bracket-tag">TELEGRAM</span>
                <span style="font-size: 1.4rem;">↗</span>
              </div>
              <div>
                <div style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; margin-bottom: 0.4rem;">@notnormale</div>
                <span style="font-size: 0.88rem; opacity: 0.85;">${esc(tr.contact.telegramLabel)}</span>
              </div>
            </a>

            <a href="https://www.instagram.com/noven.code/" target="_blank" rel="noopener noreferrer" class="nc-bento-card light-accent" style="min-height: 200px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="nc-bracket-tag" style="color: var(--burgundy);">INSTAGRAM</span>
                <span style="font-size: 1.4rem;">↗</span>
              </div>
              <div>
                <div style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; margin-bottom: 0.4rem;">@noven.code</div>
                <span style="font-size: 0.88rem; opacity: 0.85;">${esc(tr.contact.instagramLabel)}</span>
              </div>
            </a>
          </div>

          <div style="margin-top: 3rem; text-align: center;">
            <a href="/start-project" class="nc-btn nc-btn-white" data-nav="/start-project">
              <span>${esc(tr.contact.startBuilderCta)}</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </section>
    `;
  }

  // ==========================================================================
  // MULTI-STEP PROJECT ORDER BUILDER (STEPS 1 - 8 + SUBMISSION)
  // ==========================================================================
  function renderOrderBuilderSection() {
    const tr = t();
    const st = tr.order.steps;
    const f = state.orderForm;
    const step = state.orderStep;

    let stepHtml = '';

    if (step === 1) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s1Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s1Desc)}</p>
        <div class="nc-choice-grid">
          ${st.s1Options.map((opt) => {
            const isSel = f.selectedServices.includes(opt);
            return `
              <button type="button" class="nc-choice-card ${isSel ? 'selected' : ''}" data-toggle-service="${esc(opt)}">
                <span>${esc(opt)}</span>
                <span>${isSel ? '✓' : '+'}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    } else if (step === 2) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s2Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s2Desc)}</p>
        <div class="nc-form-grid">
          <div class="nc-form-group">
            <label class="nc-label" for="ob-bname">${esc(st.businessName)}</label>
            <input id="ob-bname" type="text" class="nc-input" data-field="businessName" value="${esc(f.businessName)}" required />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-btype">${esc(st.businessType)}</label>
            <select id="ob-btype" class="nc-select" data-field="businessType">
              <option value="">—</option>
              ${st.businessTypeOptions.map((opt) => `<option value="${esc(opt)}" ${f.businessType === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
            </select>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-cbtype">${esc(st.customBusinessType)}</label>
            <input id="ob-cbtype" type="text" class="nc-input" data-field="customBusinessType" value="${esc(f.customBusinessType)}" />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-industry">${esc(st.industry)}</label>
            <input id="ob-industry" type="text" class="nc-input" data-field="industry" value="${esc(f.industry)}" />
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-bdesc">${esc(st.businessDescription)}</label>
            <textarea id="ob-bdesc" class="nc-textarea" data-field="businessDescription">${esc(f.businessDescription)}</textarea>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-audience">${esc(st.targetAudience)}</label>
            <textarea id="ob-audience" class="nc-textarea" data-field="targetAudience">${esc(f.targetAudience)}</textarea>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-goals">${esc(st.projectGoals)}</label>
            <textarea id="ob-goals" class="nc-textarea" data-field="projectGoals">${esc(f.projectGoals)}</textarea>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-web">${esc(st.existingWebsite)}</label>
            <input id="ob-web" type="text" class="nc-input" data-field="existingWebsite" value="${esc(f.existingWebsite)}" placeholder="https://..." />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-social">${esc(st.socialMedia)}</label>
            <input id="ob-social" type="text" class="nc-input" data-field="socialMedia" value="${esc(f.socialMedia)}" placeholder="@brand" />
          </div>
        </div>
      `;
    } else if (step === 3) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s3Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s3Desc)}</p>

        <div class="nc-upload-dropzone" id="nc-upload-trigger">
          <input type="file" id="nc-file-input" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.zip" style="display: none;" />
          <div style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; color: var(--burgundy); margin-bottom: 0.4rem;">
            ↑ ${esc(st.uploadTitle)}
          </div>
          <div style="font-size: 0.85rem; color: rgba(23,19,22,0.65);">${esc(st.uploadHint)}</div>
        </div>

        ${f.attachments.length > 0 ? `
          <div class="nc-upload-preview-list">
            ${f.attachments.map((att, idx) => `
              <div class="nc-upload-preview-item">
                ${att.type.startsWith('image/') ? `<img src="${att.dataBase64}" alt="${esc(att.name)}" class="nc-upload-thumb" />` : `<div class="nc-upload-thumb" style="display:flex;align-items:center;justify-content:center;color:#fff;font-family:monospace;font-size:0.85rem;">${esc(att.name.split('.').pop().toUpperCase())}</div>`}
                <div style="font-size: 0.78rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(att.name)}</div>
                <div style="font-size: 0.72rem; color: rgba(23,19,22,0.55);">${Math.round(att.size / 1024)} KB</div>
                <button type="button" data-remove-att="${idx}" style="font-size: 0.75rem; color: var(--crimson); font-weight: 700; text-align: left;">✕ ${esc(st.removeFile)}</button>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="nc-form-grid" style="margin-top: 1.75rem;">
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-refnotes">${esc(st.likeQuestion)}</label>
            <textarea id="ob-refnotes" class="nc-textarea" data-field="referenceNotes" placeholder="${esc(st.likePlaceholder)}">${esc(f.referenceNotes)}</textarea>
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-refavoid">${esc(st.avoidQuestion)}</label>
            <textarea id="ob-refavoid" class="nc-textarea" data-field="referenceAvoid" placeholder="${esc(st.avoidPlaceholder)}">${esc(f.referenceAvoid)}</textarea>
          </div>
        </div>
      `;
    } else if (step === 4) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s4Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s4Desc)}</p>
        <div class="nc-form-grid">
          <div class="nc-form-group">
            <label class="nc-label" for="ob-c1">${esc(st.primaryColor)}</label>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <input id="ob-c1" type="color" data-field="primaryColor" value="${esc(f.primaryColor || '#681D32')}" style="width: 54px; height: 44px; border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;" />
              <input type="text" class="nc-input" data-field="primaryColor" value="${esc(f.primaryColor || '#681D32')}" />
            </div>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-c2">${esc(st.secondaryColor)}</label>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <input id="ob-c2" type="color" data-field="secondaryColor" value="${esc(f.secondaryColor || '#A63854')}" style="width: 54px; height: 44px; border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;" />
              <input type="text" class="nc-input" data-field="secondaryColor" value="${esc(f.secondaryColor || '#A63854')}" />
            </div>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-c3">${esc(st.backgroundColor)}</label>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <input id="ob-c3" type="color" data-field="backgroundColor" value="${esc(f.backgroundColor || '#F8F7F5')}" style="width: 54px; height: 44px; border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;" />
              <input type="text" class="nc-input" data-field="backgroundColor" value="${esc(f.backgroundColor || '#F8F7F5')}" />
            </div>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-hex">${esc(st.hexCodes)}</label>
            <input id="ob-hex" type="text" class="nc-input" data-field="hexCodes" value="${esc(f.hexCodes)}" placeholder="#681D32, #F8F7F5, #171316" />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-brand">${esc(st.existingBranding)}</label>
            <select id="ob-brand" class="nc-select" data-field="existingBranding">
              <option value="">—</option>
              ${st.brandingOptions.map((opt) => `<option value="${esc(opt)}" ${f.existingBranding === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
            </select>
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-style">${esc(st.preferredStyle)}</label>
            <select id="ob-style" class="nc-select" data-field="preferredStyle">
              <option value="">—</option>
              ${st.styleOptions.map((opt) => `<option value="${esc(opt)}" ${f.preferredStyle === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
            </select>
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-cavoid">${esc(st.colorsToAvoid)}</label>
            <input id="ob-cavoid" type="text" class="nc-input" data-field="colorsToAvoid" value="${esc(f.colorsToAvoid)}" />
          </div>
        </div>
      `;
    } else if (step === 5) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s5Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s5Desc)}</p>
        <div class="nc-choice-grid">
          ${st.featureOptions.map((feat) => {
            const isSel = f.requiredFeatures.includes(feat);
            return `
              <button type="button" class="nc-choice-card ${isSel ? 'selected' : ''}" data-toggle-feature="${esc(feat)}">
                <span>${esc(feat)}</span>
                <span>${isSel ? '✓' : '+'}</span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="nc-form-group full-width" style="margin-top: 1.75rem;">
          <label class="nc-label" for="ob-cfeat">${esc(st.customFeatures)}</label>
          <textarea id="ob-cfeat" class="nc-textarea" data-field="customFeatures">${esc(f.customFeatures)}</textarea>
        </div>
      `;
    } else if (step === 6) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s6Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s6Desc)}</p>
        <div class="nc-form-grid">
          <div class="nc-form-group">
            <label class="nc-label" for="ob-cname">${esc(st.customerName)}</label>
            <input id="ob-cname" type="text" class="nc-input" data-field="customerName" value="${esc(f.customerName)}" required />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-cphone">${esc(st.customerPhone)}</label>
            <input id="ob-cphone" type="tel" class="nc-input" data-field="customerPhone" value="${esc(f.customerPhone)}" placeholder="+7 700 000 0000" required />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-cwa">${esc(st.customerWhatsapp)}</label>
            <input id="ob-cwa" type="tel" class="nc-input" data-field="customerWhatsapp" value="${esc(f.customerWhatsapp)}" placeholder="+7 700 000 0000" />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-cemail">${esc(st.customerEmail)}</label>
            <input id="ob-cemail" type="email" class="nc-input" data-field="customerEmail" value="${esc(f.customerEmail)}" />
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-prefc">${esc(st.preferredContact)}</label>
            <select id="ob-prefc" class="nc-select" data-field="preferredContact">
              ${Object.entries(st.contactMethods).map(([k, label]) => `<option value="${esc(k)}" ${f.preferredContact === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top: 1.5rem; padding: 1rem 1.25rem; border-radius: 10px; background: var(--soft-rose); color: var(--near-black); font-size: 0.88rem; font-weight: 600;">
          ${esc(st.officialContactsNote)}
        </div>
      `;
    } else if (step === 7) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s7Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s7Desc)}</p>
        <div class="nc-form-grid">
          <div class="nc-form-group">
            <label class="nc-label" for="ob-budget">${esc(st.estimatedBudget)}</label>
            <input id="ob-budget" type="text" class="nc-input" data-field="estimatedBudget" value="${esc(f.estimatedBudget)}" />
          </div>
          <div class="nc-form-group">
            <label class="nc-label" for="ob-deadline">${esc(st.desiredDeadline)}</label>
            <input id="ob-deadline" type="date" class="nc-input" data-field="desiredDeadline" value="${esc(f.desiredDeadline)}" />
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-prio">${esc(st.priority)}</label>
            <select id="ob-prio" class="nc-select" data-field="priority">
              ${Object.entries(st.priorityOptions).map(([k, label]) => `<option value="${esc(k)}" ${f.priority === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}
            </select>
          </div>
          <div class="nc-form-group full-width">
            <label class="nc-label" for="ob-addreq">${esc(st.additionalRequirements)}</label>
            <textarea id="ob-addreq" class="nc-textarea" data-field="additionalRequirements">${esc(f.additionalRequirements)}</textarea>
          </div>
        </div>
      `;
    } else if (step === 8) {
      stepHtml = `
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">${esc(st.s8Title)}</h3>
        <p style="color: rgba(23,19,22,0.72); margin-bottom: 1.75rem;">${esc(st.s8Desc)}</p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
          <div style="padding: 1.25rem; border-radius: 12px; background: var(--off-white); border: 1px solid var(--border-light);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <strong style="font-family:var(--font-display);font-size:0.85rem;text-transform:uppercase;">1. ${esc(st.s1Title)}</strong>
              <button type="button" data-goto-step="1" style="color:var(--crimson);font-size:0.78rem;font-weight:700;">${esc(tr.order.editStepBtn)}</button>
            </div>
            <div style="font-size:0.9rem;">${esc(f.selectedServices.join(', ') || '—')}</div>
            ${f.selectedPackage ? `<div style="margin-top:0.4rem;font-size:0.82rem;color:var(--burgundy);font-weight:700;">Package: ${esc(f.selectedPackage)}</div>` : ''}
          </div>

          <div style="padding: 1.25rem; border-radius: 12px; background: var(--off-white); border: 1px solid var(--border-light);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <strong style="font-family:var(--font-display);font-size:0.85rem;text-transform:uppercase;">2. ${esc(st.s2Title)}</strong>
              <button type="button" data-goto-step="2" style="color:var(--crimson);font-size:0.78rem;font-weight:700;">${esc(tr.order.editStepBtn)}</button>
            </div>
            <div style="font-size:0.9rem;"><strong>${esc(f.businessName)}</strong> (${esc(f.businessType)})</div>
            <div style="font-size:0.84rem;opacity:0.78;margin-top:0.25rem;">${esc(f.businessDescription)}</div>
          </div>

          <div style="padding: 1.25rem; border-radius: 12px; background: var(--off-white); border: 1px solid var(--border-light);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <strong style="font-family:var(--font-display);font-size:0.85rem;text-transform:uppercase;">3 & 4. Design & Palette</strong>
              <button type="button" data-goto-step="3" style="color:var(--crimson);font-size:0.78rem;font-weight:700;">${esc(tr.order.editStepBtn)}</button>
            </div>
            <div style="font-size:0.88rem;">Attachments: ${f.attachments.length} file(s)</div>
            <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.4rem;">
              <span style="width:18px;height:18px;border-radius:4px;background:${esc(f.primaryColor)};display:inline-block;border:1px solid #ccc;"></span>
              <span style="width:18px;height:18px;border-radius:4px;background:${esc(f.secondaryColor)};display:inline-block;border:1px solid #ccc;"></span>
              <span style="width:18px;height:18px;border-radius:4px;background:${esc(f.backgroundColor)};display:inline-block;border:1px solid #ccc;"></span>
              <span style="font-size:0.82rem;">${esc(f.preferredStyle || '')}</span>
            </div>
          </div>

          <div style="padding: 1.25rem; border-radius: 12px; background: var(--off-white); border: 1px solid var(--border-light);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <strong style="font-family:var(--font-display);font-size:0.85rem;text-transform:uppercase;">5. ${esc(st.s5Title)}</strong>
              <button type="button" data-goto-step="5" style="color:var(--crimson);font-size:0.78rem;font-weight:700;">${esc(tr.order.editStepBtn)}</button>
            </div>
            <div style="font-size:0.88rem;">${esc(f.requiredFeatures.join(', ') || '—')}</div>
          </div>

          <div style="padding: 1.25rem; border-radius: 12px; background: var(--off-white); border: 1px solid var(--border-light);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <strong style="font-family:var(--font-display);font-size:0.85rem;text-transform:uppercase;">6 & 7. Contact & Timeline</strong>
              <button type="button" data-goto-step="6" style="color:var(--crimson);font-size:0.78rem;font-weight:700;">${esc(tr.order.editStepBtn)}</button>
            </div>
            <div style="font-size:0.9rem;"><strong>${esc(f.customerName)}</strong> — ${esc(f.customerPhone)}</div>
            <div style="font-size:0.84rem;opacity:0.78;margin-top:0.25rem;">Budget: ${esc(f.estimatedBudget || '—')} | Deadline: ${esc(f.desiredDeadline || '—')}</div>
          </div>
        </div>
      `;
    }

    return `
      <section id="section-order-builder" class="nc-section nc-section-light" style="padding-top: 8rem;">
        <div class="nc-container">
          <div class="nc-section-header">
            <div>
              <span class="nc-bracket-tag">${esc(tr.order.tag)}</span>
              <h1 class="nc-section-title">${esc(tr.order.title)}</h1>
            </div>
            <p class="nc-section-subtitle">${esc(tr.order.subtitle)}</p>
          </div>

          <div class="nc-order-builder-shell">
            <div class="nc-order-progress-header">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                <span style="font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; letter-spacing: 0.08em; text-transform: uppercase;">
                  ${esc(tr.order.stepOf.replace('{current}', String(step)))}
                </span>
                ${f.selectedPackage ? `
                  <div style="display: inline-flex; align-items: center; gap: 0.75rem; background: var(--burgundy); padding: 0.35rem 0.9rem; border-radius: 999px; font-size: 0.8rem;">
                    <span>${esc(tr.order.selectedPlanBanner)} <strong>${esc(f.selectedPackage)}</strong></span>
                    <button type="button" id="nc-clear-plan-btn" style="color: var(--soft-rose); text-decoration: underline; font-size: 0.75rem;">${esc(tr.order.clearPlanBtn)}</button>
                  </div>
                ` : ''}
              </div>

              <div class="nc-order-steps-track">
                ${[1, 2, 3, 4, 5, 6, 7, 8].map((sNum) => `
                  <div class="nc-step-pill ${sNum < step ? 'completed' : ''} ${sNum === step ? 'current' : ''}" data-goto-step="${sNum}" title="Step ${sNum}"></div>
                `).join('')}
              </div>
            </div>

            <div class="nc-order-stage-body">
              ${state.orderError ? `
                <div role="alert" style="margin-bottom: 1.5rem; padding: 1rem 1.25rem; border-radius: 10px; background: rgba(166, 56, 84, 0.12); border: 1px solid var(--crimson); color: var(--burgundy); font-weight: 600;">
                  ${esc(state.orderError)}
                </div>
              ` : ''}

              ${stepHtml}

              <div style="margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                ${step > 1 ? `
                  <button type="button" id="nc-order-prev" class="nc-btn nc-btn-outline-dark">
                    ← ${esc(tr.order.prevBtn)}
                  </button>
                ` : '<div></div>'}

                ${step < 8 ? `
                  <button type="button" id="nc-order-next" class="nc-btn nc-btn-primary">
                    ${esc(tr.order.nextBtn)} →
                  </button>
                ` : `
                  <button type="button" id="nc-order-submit" class="nc-btn nc-btn-primary" ${state.isSubmittingOrder ? 'disabled' : ''}>
                    ${esc(state.isSubmittingOrder ? tr.order.submittingBtn : tr.order.submitBtn)} ↗
                  </button>
                `}
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderOrderConfirmationPage() {
    const tr = t();
    const conf = state.confirmedOrder || { orderCode: '#NC-0001' };

    return `
      <section class="nc-section nc-section-dark" style="min-height: 85vh; display: flex; align-items: center; padding-top: 8rem;">
        <div class="nc-container" style="max-width: 780px; text-align: center;">
          <span class="nc-bracket-tag">${esc(tr.order.confirmation.tag)}</span>
          <h1 class="nc-section-title" style="margin-top: 1rem;">${esc(tr.order.confirmation.title)}</h1>
          <p style="font-size: 1.08rem; opacity: 0.85; margin: 1.25rem auto 2.5rem auto; max-width: 58ch;">
            ${esc(tr.order.confirmation.subtitle)}
          </p>

          <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--crimson); border-radius: 16px; padding: 2rem; margin-bottom: 2.5rem;">
            <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--soft-rose);">
              ${esc(tr.order.confirmation.orderIdLabel)}
            </div>
            <div style="font-family: var(--font-display); font-size: 3rem; font-weight: 800; color: var(--white); margin-top: 0.35rem;">
              ${esc(conf.orderCode)}
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 1rem;">
            <a href="/" class="nc-btn nc-btn-white" data-nav="/">
              ${esc(tr.order.confirmation.backHomeBtn)}
            </a>
            <a href="https://wa.me/77066421107" target="_blank" rel="noopener noreferrer" class="nc-btn nc-btn-primary">
              ${esc(tr.order.confirmation.messageWhatsappBtn)} ↗
            </a>
          </div>
        </div>
      </section>
    `;
  }

  function renderFooter() {
    const tr = t();
    return `
      <footer class="nc-footer">
        <div class="nc-container">
          <div class="nc-footer-grid">
            <div>
              <a href="/" class="nc-logo" data-nav="/" style="margin-bottom: 1rem;">
                <span class="nc-logo-mark">✻</span>
                <span>NOVEN.CODE</span>
              </a>
              <p style="font-size: 0.9rem; color: rgba(248, 247, 245, 0.68); max-width: 34ch; margin-top: 0.85rem;">
                ${esc(tr.hero.defaultSub)}
              </p>
            </div>

            <div>
              <div class="nc-footer-col-title">${esc(tr.nav.home)}</div>
              <ul class="nc-footer-links">
                <li><a href="/" data-nav="/">${esc(tr.nav.home)}</a></li>
                <li><a href="/services" data-nav="/services">${esc(tr.nav.services)}</a></li>
                <li><a href="/pricing" data-nav="/pricing">${esc(tr.nav.pricing)}</a></li>
                <li><a href="/portfolio" data-nav="/portfolio">${esc(tr.nav.portfolio)}</a></li>
                <li><a href="/about" data-nav="/about">${esc(tr.nav.about)}</a></li>
                <li><a href="/process" data-nav="/process">${esc(tr.nav.process)}</a></li>
                <li><a href="/faq" data-nav="/faq">${esc(tr.nav.faq)}</a></li>
                <li><a href="/contact" data-nav="/contact">${esc(tr.nav.contact)}</a></li>
              </ul>
            </div>

            <div>
              <div class="nc-footer-col-title">${esc(tr.nav.services)}</div>
              <ul class="nc-footer-links">
                ${(state.bootstrap.services || []).slice(0, 6).map((s) => `
                  <li><a href="/services" data-nav="/services">${esc(locField(s, 'title'))}</a></li>
                `).join('')}
              </ul>
            </div>

            <div>
              <div class="nc-footer-col-title">${esc(tr.nav.contact)}</div>
              <ul class="nc-footer-links">
                <li><a href="https://wa.me/77066421107" target="_blank" rel="noopener noreferrer">WhatsApp: +7 706 642 1107</a></li>
                <li><a href="https://t.me/notnormale" target="_blank" rel="noopener noreferrer">Telegram: @notnormale</a></li>
                <li><a href="https://www.instagram.com/noven.code/" target="_blank" rel="noopener noreferrer">Instagram: @noven.code</a></li>
              </ul>
            </div>
          </div>

          <div class="nc-footer-bottom">
            <span>© ${new Date().getFullYear()} Noven.code. All rights reserved.</span>
            <span>WE BUILD DIGITAL. YOU GROW.</span>
          </div>

          <!-- STRICT PLACEMENT REQUIREMENT: Subtle Employee Login link ONLY at the very bottom of the Footer -->
          <div class="nc-footer-discreet-admin">
            <a href="/admin" class="nc-employee-login-link">${esc(tr.nav.employeeLogin)}</a>
          </div>
        </div>
      </footer>
    `;
  }

  function renderSoundConsentBanner() {
    if (!state.showSoundBanner) return '';
    const tr = t();
    return `
      <aside class="nc-sound-consent" aria-label="Audio Experience Consent">
        <div style="font-family: var(--font-display); font-size: 0.95rem; font-weight: 700;">
          ${esc(tr.sound.promptTitle)}
        </div>
        <p style="font-size: 0.82rem; color: rgba(248, 247, 245, 0.72); margin-top: 0.3rem;">
          ${esc(tr.sound.promptDesc)}
        </p>
        <div class="nc-sound-consent-actions">
          <button type="button" id="nc-consent-enable" class="nc-btn nc-btn-primary" style="padding: 0.5rem 1rem; font-size: 0.74rem;">
            ${esc(tr.sound.enable)}
          </button>
          <button type="button" id="nc-consent-mute" class="nc-btn nc-btn-outline-light" style="padding: 0.5rem 1rem; font-size: 0.74rem;">
            ${esc(tr.sound.continueMuted)}
          </button>
        </div>
      </aside>
    `;
  }

  function renderMainView() {
    const r = state.route;
    if (r === '/services') {
      return `<main style="padding-top: 78px;">${renderServicesSection()}${renderPricingSection()}${renderContactSection()}</main>`;
    }
    if (r === '/pricing') {
      return `<main style="padding-top: 78px;">${renderPricingSection()}${renderFaqSection()}${renderContactSection()}</main>`;
    }
    if (r === '/portfolio') {
      return `<main style="padding-top: 78px;">${renderPortfolioSection()}${renderContactSection()}</main>`;
    }
    if (r === '/about') {
      return `<main style="padding-top: 78px;">${renderAboutSection()}${renderProcessSection()}${renderContactSection()}</main>`;
    }
    if (r === '/process') {
      return `<main style="padding-top: 78px;">${renderProcessSection()}${renderContactSection()}</main>`;
    }
    if (r === '/faq') {
      return `<main style="padding-top: 78px;">${renderFaqSection()}${renderContactSection()}</main>`;
    }
    if (r === '/contact') {
      return `<main style="padding-top: 78px;">${renderContactSection()}</main>`;
    }
    if (r === '/start-project') {
      return `<main>${renderOrderBuilderSection()}</main>`;
    }
    if (r === '/order-confirmation') {
      return `<main>${renderOrderConfirmationPage()}</main>`;
    }
    // Default Homepage (/) with all core sections
    return `
      <main>
        ${renderHeroSection()}
        ${renderServicesSection()}
        ${renderPortfolioSection()}
        ${renderProcessSection()}
        ${renderPricingSection()}
        ${renderAboutSection()}
        ${renderFaqSection()}
        ${renderContactSection()}
      </main>
    `;
  }

  function renderApp() {
    const root = document.getElementById('nc-app');
    if (!root) return;

    root.innerHTML = `
      ${renderHeader()}
      ${renderMainView()}
      ${renderFooter()}
      ${renderSoundConsentBanner()}
    `;

    bindEvents();

    const canvasEl = document.getElementById('nc-hero-3d-canvas');
    if (canvasEl && window.initHero3DCanvas) {
      window.initHero3DCanvas(canvasEl);
    }
  }

  // ==========================================================================
  // EVENT DELEGATION & FORM BINDINGS
  // ==========================================================================
  function bindEvents() {
    // Navigation links
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPath = el.getAttribute('data-nav');
        navigateTo(targetPath);
      });
    });

    // Language switcher
    document.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLang(btn.getAttribute('data-lang'));
      });
    });

    // Mobile menu toggle
    const mobileBtn = document.getElementById('nc-mobile-menu-btn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        state.mobileMenuOpen = !state.mobileMenuOpen;
        renderApp();
      });
    }

    // Sound toggle & consent
    const soundBtn = document.getElementById('nc-sound-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        state.sound.toggle();
        state.showSoundBanner = false;
        renderApp();
      });
    }

    const consentEnable = document.getElementById('nc-consent-enable');
    if (consentEnable) {
      consentEnable.addEventListener('click', () => {
        state.sound.enable();
        state.showSoundBanner = false;
        renderApp();
      });
    }

    const consentMute = document.getElementById('nc-consent-mute');
    if (consentMute) {
      consentMute.addEventListener('click', () => {
        state.sound.mute();
        state.showSoundBanner = false;
        renderApp();
      });
    }

    // Service CTA -> open Order Builder with preselected service
    document.querySelectorAll('[data-order-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const srv = btn.getAttribute('data-order-service');
        navigateTo('/start-project', { preselectService: srv });
      });
    });

    // Choose Plan CTA -> open Order Builder with preselected package
    document.querySelectorAll('[data-choose-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const planCode = btn.getAttribute('data-choose-plan');
        navigateTo('/start-project', { preselectPackage: planCode });
      });
    });

    // FAQ Accordion toggle
    document.querySelectorAll('[data-faq-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-faq-toggle');
        if (state.faqOpenIds.has(id)) state.faqOpenIds.delete(id);
        else state.faqOpenIds.add(id);
        renderApp();
      });
    });

    // Order Builder controls
    const clearPlanBtn = document.getElementById('nc-clear-plan-btn');
    if (clearPlanBtn) {
      clearPlanBtn.addEventListener('click', () => {
        state.orderForm.selectedPackage = '';
        persistOrderDraft();
        renderApp();
      });
    }

    document.querySelectorAll('[data-toggle-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const srv = btn.getAttribute('data-toggle-service');
        const idx = state.orderForm.selectedServices.indexOf(srv);
        if (idx >= 0) state.orderForm.selectedServices.splice(idx, 1);
        else state.orderForm.selectedServices.push(srv);
        state.orderError = '';
        persistOrderDraft();
        renderApp();
      });
    });

    document.querySelectorAll('[data-toggle-feature]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const feat = btn.getAttribute('data-toggle-feature');
        const idx = state.orderForm.requiredFeatures.indexOf(feat);
        if (idx >= 0) state.orderForm.requiredFeatures.splice(idx, 1);
        else state.orderForm.requiredFeatures.push(feat);
        persistOrderDraft();
        renderApp();
      });
    });

    document.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.getAttribute('data-field');
      input.addEventListener('input', (e) => {
        state.orderForm[field] = e.target.value;
        state.orderError = '';
        persistOrderDraft();
      });
    });

    // File Upload Dropzone in Step 3
    const uploadTrigger = document.getElementById('nc-upload-trigger');
    const fileInput = document.getElementById('nc-file-input');
    if (uploadTrigger && fileInput) {
      uploadTrigger.addEventListener('click', () => fileInput.click());
      uploadTrigger.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      uploadTrigger.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files) handleFilesSelected(e.target.files);
      });
    }

    document.querySelectorAll('[data-remove-att]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove-att'));
        state.orderForm.attachments.splice(idx, 1);
        persistOrderDraft();
        renderApp();
      });
    });

    document.querySelectorAll('[data-goto-step]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = Number(el.getAttribute('data-goto-step'));
        if (target >= 1 && target <= 8) {
          state.orderStep = target;
          state.orderError = '';
          persistOrderDraft();
          renderApp();
        }
      });
    });

    const prevBtn = document.getElementById('nc-order-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.orderStep > 1) {
          state.orderStep -= 1;
          state.orderError = '';
          persistOrderDraft();
          renderApp();
        }
      });
    }

    const nextBtn = document.getElementById('nc-order-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const tr = t();
        if (state.orderStep === 1 && state.orderForm.selectedServices.length === 0) {
          state.orderError = tr.order.validation.selectService;
          renderApp();
          return;
        }
        if (state.orderStep === 2) {
          const f = state.orderForm;
          if (!f.businessName.trim() || !f.businessType.trim() || !f.businessDescription.trim() || !f.projectGoals.trim()) {
            state.orderError = tr.order.validation.fillBusiness;
            renderApp();
            return;
          }
        }
        if (state.orderStep === 6) {
          const f = state.orderForm;
          if (!f.customerName.trim() || !f.customerPhone.trim()) {
            state.orderError = tr.order.validation.fillContacts;
            renderApp();
            return;
          }
        }
        state.orderError = '';
        state.orderStep += 1;
        persistOrderDraft();
        renderApp();
      });
    }

    const submitBtn = document.getElementById('nc-order-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitProjectOrder);
    }
  }

  function handleFilesSelected(fileList) {
    const files = Array.from(fileList).slice(0, 10 - state.orderForm.attachments.length);
    files.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        state.orderError = `File ${file.name} exceeds 10MB limit.`;
        renderApp();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.orderForm.attachments.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataBase64: reader.result
        });
        persistOrderDraft();
        renderApp();
      };
      reader.readAsDataURL(file);
    });
  }

  async function submitProjectOrder() {
    if (state.isSubmittingOrder) return;
    const tr = t();
    const f = state.orderForm;

    if (f.selectedServices.length === 0) {
      state.orderError = tr.order.validation.selectService;
      state.orderStep = 1;
      renderApp();
      return;
    }
    if (!f.businessName.trim() || !f.businessType.trim() || !f.businessDescription.trim() || !f.projectGoals.trim()) {
      state.orderError = tr.order.validation.fillBusiness;
      state.orderStep = 2;
      renderApp();
      return;
    }
    if (!f.customerName.trim() || !f.customerPhone.trim()) {
      state.orderError = tr.order.validation.fillContacts;
      state.orderStep = 6;
      renderApp();
      return;
    }

    state.isSubmittingOrder = true;
    state.orderError = '';
    renderApp();

    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          locale: state.lang
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        state.isSubmittingOrder = false;
        state.orderError = data.error || 'Failed to submit order. Please check your inputs.';
        renderApp();
        return;
      }

      // Order saved in DB & CRM
      state.isSubmittingOrder = false;
      state.confirmedOrder = data;
      sessionStorage.removeItem('nc_order_draft');
      // Reset idempotencyKey for any subsequent new order
      state.orderForm.idempotencyKey = 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      state.orderStep = 1;
      navigateTo('/order-confirmation');
    } catch (err) {
      state.isSubmittingOrder = false;
      state.orderError = 'Network error while submitting order. Please try again.';
      renderApp();
    }
  }

  async function bootstrapApp() {
    document.documentElement.lang = state.lang;
    try {
      const res = await fetch('/api/public/bootstrap');
      if (res.ok) {
        state.bootstrap = await res.json();
      }
    } catch {
      // Fallback to empty arrays if offline
    }
    renderApp();
  }

  window.refreshNovenPublicSite = bootstrapApp;
  bootstrapApp();
})();
