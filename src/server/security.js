'use strict';

const crypto = require('node:crypto');

/**
 * Hash a password using Node's native cryptographic scrypt KDF (memory-hard, resistant to GPU/ASIC attacks).
 */
function hashPassword(password, providedSalt = null) {
  const salt = providedSalt || crypto.randomBytes(32).toString('hex');
  const derivedKey = crypto.scryptSync(String(password), salt, 64, {
    N: 16384,
    r: 8,
    p: 1
  });
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

/**
 * Constant-time verification of a password against stored hash and salt.
 */
function verifyPassword(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const { hash } = hashPassword(String(password), storedSalt);
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token.
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a session token using SHA-256 before storing or querying in DB.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Role-based Access Control (RBAC) Matrix
 * Enforces permissions on the server side.
 */
const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: [
    'dashboard:view',
    'orders:view', 'orders:edit', 'orders:assign', 'orders:status', 'orders:delete',
    'clients:view', 'clients:create', 'clients:edit',
    'projects:view', 'projects:create', 'projects:edit',
    'tasks:view', 'tasks:create', 'tasks:edit', 'tasks:status',
    'pricing:view', 'pricing:edit',
    'content:view', 'content:edit',
    'logs:view',
    'settings:view'
  ],
  MANAGER: [
    'dashboard:view',
    'orders:view', 'orders:status', 'orders:notes',
    'clients:view', 'clients:create', 'clients:edit',
    'projects:view',
    'tasks:view', 'tasks:status'
  ],
  DEVELOPER: [
    'dashboard:view',
    'projects:view', 'projects:tech_notes',
    'tasks:view', 'tasks:status', 'tasks:tech_notes'
  ],
  DESIGNER: [
    'dashboard:view',
    'projects:view', 'projects:design_notes', 'projects:design_files',
    'tasks:view', 'tasks:status', 'tasks:design_notes'
  ]
};

function hasPermission(role, permission) {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/**
 * In-memory Rate Limiter for login and public form submissions.
 */
const rateBuckets = new Map();

function checkRateLimit(key, maxRequests = 8, windowMs = 60 * 1000) {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSec: 0 };
  }
  if (entry.count >= maxRequests) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterSec: 0 };
}

function resetRateLimit(key) {
  rateBuckets.delete(key);
}

/**
 * Input Sanitization helper to prevent XSS and injection vectors.
 */
function sanitizeString(input, maxLen = 5000) {
  if (input === null || input === undefined) return '';
  const str = String(input).trim().slice(0, maxLen);
  return str
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/**
 * Parse cookies from Cookie header.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      cookies[k] = decodeURIComponent(v);
    }
  }
  return cookies;
}

/**
 * Validate uploaded file magic bytes and extension.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/zip'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf', '.zip'
]);

function validateFileAttachment(fileObj, maxBytes = 10 * 1024 * 1024) {
  if (!fileObj || !fileObj.name || !fileObj.dataBase64) {
    return { valid: false, reason: 'Missing file data or filename' };
  }
  const cleanName = String(fileObj.name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const dotIdx = cleanName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? cleanName.slice(dotIdx).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Unsupported file extension: ${ext}` };
  }
  const mime = String(fileObj.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return { valid: false, reason: `Unsupported MIME type: ${mime}` };
  }

  // Strip base64 prefix if present
  const base64Clean = String(fileObj.dataBase64).replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(base64Clean, 'base64');
  } catch {
    return { valid: false, reason: 'Invalid base64 encoding' };
  }

  if (buffer.length === 0) {
    return { valid: false, reason: 'Empty file buffer' };
  }
  if (buffer.length > maxBytes) {
    return { valid: false, reason: 'File exceeds maximum allowed size (10MB)' };
  }

  // Verify binary magic headers for common formats
  if (mime === 'image/png' && buffer.slice(0, 4).toString('hex') !== '89504e47') {
    return { valid: false, reason: 'Invalid PNG file signature' };
  }
  if (mime === 'image/jpeg' && buffer.slice(0, 2).toString('hex') !== 'ffd8') {
    return { valid: false, reason: 'Invalid JPEG file signature' };
  }
  if (mime === 'application/pdf' && buffer.slice(0, 4).toString('ascii') !== '%PDF') {
    return { valid: false, reason: 'Invalid PDF file signature' };
  }

  return {
    valid: true,
    buffer,
    cleanName,
    ext,
    mime,
    sizeBytes: buffer.length
  };
}

module.exports = {
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
};
