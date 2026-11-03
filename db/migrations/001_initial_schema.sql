-- ============================================================================
-- NOVEN.CODE — POSTGRESQL / SUPABASE DATABASE MIGRATION
-- Version: 001_initial_schema
-- Description: Complete database schema, relationships, indexes, and RLS policies
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(50) PRIMARY KEY,
  name_ru VARCHAR(100) NOT NULL,
  name_kk VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  description_ru TEXT,
  description_kk TEXT,
  description_en TEXT,
  permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(100) PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description_en TEXT
);

-- 2. USERS (EMPLOYEES)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(50) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SESSIONS (Server-side HTTP-Only Session Store)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(128) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token VARCHAR(128) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 4. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  business_name VARCHAR(200),
  business_type VARCHAR(100),
  industry VARCHAR(100),
  phone VARCHAR(60) NOT NULL,
  whatsapp VARCHAR(60),
  email VARCHAR(150),
  preferred_contact VARCHAR(50) DEFAULT 'whatsapp',
  website VARCHAR(255),
  social_links VARCHAR(255),
  internal_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- 5. PRICING PLANS & FEATURES
CREATE TABLE IF NOT EXISTS pricing_plans (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL, -- START, BUSINESS, PREMIUM
  name_ru VARCHAR(120) NOT NULL,
  name_kk VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) NOT NULL,
  desc_ru TEXT NOT NULL,
  desc_kk TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  price_label_ru VARCHAR(150) NOT NULL,
  price_label_kk VARCHAR(150) NOT NULL,
  price_label_en VARCHAR(150) NOT NULL,
  numeric_price NUMERIC(14, 2),
  currency VARCHAR(16) DEFAULT 'KZT',
  is_custom_quote BOOLEAN NOT NULL DEFAULT TRUE,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  cta_ru VARCHAR(100) NOT NULL DEFAULT 'Выбрать тариф',
  cta_kk VARCHAR(100) NOT NULL DEFAULT 'Тарифті таңдау',
  cta_en VARCHAR(100) NOT NULL DEFAULT 'Choose Plan',
  optional_addons_ru TEXT DEFAULT '',
  optional_addons_kk TEXT DEFAULT '',
  optional_addons_en TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id VARCHAR(64) NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
  text_ru TEXT NOT NULL,
  text_kk TEXT NOT NULL,
  text_en TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pricing_features_plan_id ON pricing_features(plan_id);

-- 6. SERVICES
CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  number_code VARCHAR(10) NOT NULL,
  title_ru VARCHAR(150) NOT NULL,
  title_kk VARCHAR(150) NOT NULL,
  title_en VARCHAR(150) NOT NULL,
  desc_ru TEXT NOT NULL,
  desc_kk TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  benefits_ru JSONB NOT NULL DEFAULT '[]'::jsonb,
  benefits_kk JSONB NOT NULL DEFAULT '[]'::jsonb,
  benefits_en JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_ru VARCHAR(100) NOT NULL DEFAULT 'Заказать услугу',
  cta_kk VARCHAR(100) NOT NULL DEFAULT 'Қызметке тапсырыс беру',
  cta_en VARCHAR(100) NOT NULL DEFAULT 'Request Service',
  icon_name VARCHAR(64) NOT NULL DEFAULT 'globe',
  visual_type VARCHAR(64) NOT NULL DEFAULT 'grid',
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PORTFOLIO PROJECTS
CREATE TABLE IF NOT EXISTS portfolio_projects (
  id VARCHAR(64) PRIMARY KEY,
  title_ru VARCHAR(150) NOT NULL,
  title_kk VARCHAR(150) NOT NULL,
  title_en VARCHAR(150) NOT NULL,
  category_ru VARCHAR(100) NOT NULL,
  category_kk VARCHAR(100) NOT NULL,
  category_en VARCHAR(100) NOT NULL,
  desc_ru TEXT NOT NULL,
  desc_kk TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  live_url TEXT NOT NULL,
  preview_image TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. FAQS
CREATE TABLE IF NOT EXISTS faqs (
  id VARCHAR(64) PRIMARY KEY,
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  q_ru TEXT NOT NULL,
  q_kk TEXT NOT NULL,
  q_en TEXT NOT NULL,
  a_ru TEXT NOT NULL,
  a_kk TEXT NOT NULL,
  a_en TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ORDERS & ORDER ATTACHMENTS
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code VARCHAR(32) UNIQUE NOT NULL, -- e.g. #NC-0001
  idempotency_key VARCHAR(128) UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  selected_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_package VARCHAR(64),
  business_name VARCHAR(200) NOT NULL,
  business_type VARCHAR(100) NOT NULL,
  custom_business_type VARCHAR(150),
  industry VARCHAR(150),
  business_description TEXT NOT NULL,
  target_audience TEXT,
  project_goals TEXT NOT NULL,
  existing_website VARCHAR(255),
  social_media VARCHAR(255),
  reference_notes TEXT,
  reference_avoid TEXT,
  primary_color VARCHAR(32),
  secondary_color VARCHAR(32),
  background_color VARCHAR(32),
  hex_codes TEXT,
  existing_branding VARCHAR(150),
  preferred_style VARCHAR(150),
  colors_to_avoid TEXT,
  required_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_features TEXT,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(60) NOT NULL,
  customer_whatsapp VARCHAR(60),
  customer_email VARCHAR(150),
  preferred_contact VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
  estimated_budget VARCHAR(120),
  desired_deadline VARCHAR(100),
  priority VARCHAR(50) DEFAULT 'standard',
  additional_requirements TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'New',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  internal_notes TEXT DEFAULT '',
  locale VARCHAR(10) DEFAULT 'ru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  category VARCHAR(50) DEFAULT 'reference',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON order_attachments(order_id);

-- 10. PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code VARCHAR(32) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Planning',
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  deadline VARCHAR(100),
  assigned_employees JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes TEXT DEFAULT '',
  design_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  technical_notes TEXT DEFAULT '',
  design_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 11. TASKS
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL DEFAULT 'development', -- development, design, management, qa
  status VARCHAR(50) NOT NULL DEFAULT 'To Do', -- To Do, In Progress, Review, Done
  priority VARCHAR(50) NOT NULL DEFAULT 'Medium', -- Low, Medium, High, Critical
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  deadline VARCHAR(100),
  technical_notes TEXT DEFAULT '',
  design_notes TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- 12. NOTIFICATIONS (Telegram & Internal Log)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  telegram_sent BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_status VARCHAR(100) NOT NULL DEFAULT 'pending',
  telegram_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. ACTIVITY LOGS (Audit Trail)
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_username VARCHAR(100) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(100),
  details TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- 14. SETTINGS & CMS CONTENT
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE / POSTGRESQL
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Public Read Policies for Visible Website Content
CREATE POLICY "Public read visible services" ON services FOR SELECT USING (is_visible = TRUE);
CREATE POLICY "Public read visible pricing_plans" ON pricing_plans FOR SELECT USING (is_visible = TRUE);
CREATE POLICY "Public read pricing_features" ON pricing_features FOR SELECT USING (TRUE);
CREATE POLICY "Public read visible portfolio_projects" ON portfolio_projects FOR SELECT USING (is_visible = TRUE);
CREATE POLICY "Public read visible faqs" ON faqs FOR SELECT USING (is_visible = TRUE);
