# Noven.code — Digital Development Studio & CRM Platform

Complete, production-ready public website, interactive 3D WebGL experience, 9-step Project Order Builder, and role-based internal CRM system for **Noven.code**.

---

## 1. Official Brand & Contact Information

- **Brand**: `Noven.code` — *WE BUILD DIGITAL. YOU GROW.*
- **Instagram**: [@noven.code](https://www.instagram.com/noven.code/)
- **WhatsApp**: [+7 706 642 1107](https://wa.me/77066421107)
- **Telegram**: [@notnormale](https://t.me/notnormale)

---

## 2. Quick Start & Launching the Platform

### Option A: One-Click Windows Launchers
Run either launcher from the project root (`C:\Users\1\.gemini\antigravity\scratch\noven-code`):
```powershell
.\start-server.ps1
# or double-click start-server.bat
```

### Option B: Standard Node.js CLI
```bash
npm start
```

Once started, open in your browser:
- **Public Website**: `http://127.0.0.1:3000/`
- **Project Order Builder**: `http://127.0.0.1:3000/start-project`
- **Employee CRM (`/admin`)**: `http://127.0.0.1:3000/admin` (Accessible on the public site exclusively through the discreet **"Вход для сотрудников / Қызметкерлерге кіру / Employee Login"** link at the very bottom of the Footer).

### Running the Automated Verification Suite
```powershell
.\start-server.ps1 # or run scripts/verify-all.js
```

---

## 3. Architecture & Directory Structure

- `db/`
  - `migrations/001_initial_schema.sql` — Complete PostgreSQL / Supabase DDL with 15 tables, foreign keys, indexes, and Row-Level Security (RLS) policies.
  - `noven_code.sqlite` — Auto-initialized persistent SQLite database using Node's native `node:sqlite` (`DatabaseSync`).
- `src/`
  - `data/seed-data.js` — Trilingual (`ru`, `kk`, `en`) seed data for 8 services, 3 editable pricing packages (`START`, `BUSINESS`, `PREMIUM`), 3 live portfolio demonstration projects, 10 FAQs, roles, and settings.
  - `server/db.js` — Database connection, schema migration runner, initial Owner account seeding, and sequential code generators (`#NC-0001`, `#PRJ-001`).
  - `server/security.js` — `crypto.scryptSync` password hashing, timing-safe comparison, SHA-256 session token hashing, RBAC permission matrix, rate limiting, input sanitization, and binary magic-byte file upload validation.
  - `server/telegram.js` — Telegram Bot API dispatcher with exact `NEW NOVEN.CODE ORDER` formatting and database delivery logging.
  - `server/index.js` — Full HTTP & REST API server with strict security headers, CSRF validation, HttpOnly cookie sessions, and protected attachment streaming.
- `public/`
  - `index.html` & `js/public-app.js` — Multilingual public website (`RU` default, `KK`, `EN`) with Home, Services, Pricing, Portfolio, About, Process, FAQ, Contact, 9-step Order Builder, and Order Confirmation pages.
  - `admin.html` & `js/admin-app.js` — Protected internal CRM (`/admin`) with Dashboard, Orders, Clients, Projects, Tasks, Team & Roles, Pricing Management, Content CMS, Activity Log, and Settings/Telegram modules.
  - `js/scene3d-sound.js` — Hardware-accelerated 3D interactive geometric polyhedron & orbital ring renderer + Web Audio API ambient synthesizer with explicit user consent prompt.
  - `js/i18n.js` — Complete Russian, Kazakh, and English translation dictionaries for both public website and CRM.
  - `css/styles.css` — Custom Editorial Brutalist Luxury design system built around Deep Burgundy (`#681D32`), Crimson (`#A63854`), Off White (`#F8F7F5`), Near Black (`#171316`), Soft Rose (`#E9DDE0`), and White (`#FFFFFF`).

---

## 4. Initial Administrator Setup & Security

On initial database initialization, the server seeds the initial `OWNER` account:
- **Username**: `Notnur4ikGg` (configurable via `INITIAL_OWNER_USERNAME`)
- **Password**: Configured via `INITIAL_OWNER_PASSWORD` (hashed with `scryptSync` + 16-byte cryptographic salt; never exposed in frontend code or API payloads).
- **Recommended First Step**: After logging in at `/admin`, open **Settings → Change Password** to update your password and configure your `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for instant Telegram notifications.
