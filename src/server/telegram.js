'use strict';

const https = require('node:https');

/**
 * Send a Telegram notification via Telegram Bot API and record the result in the database.
 * Never exposes passwords, private tokens, or unnecessary sensitive data.
 * Gracefully degrades if Bot Token / Chat ID are not configured or if Telegram is unreachable.
 */
async function sendTelegramNotification(db, eventType, title, formattedMessage) {
  const now = new Date().toISOString();
  const notifId = require('node:crypto').randomUUID();

  // Fetch Telegram configuration from server environment or DB settings
  let tgConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabledEvents: [
      'order_created',
      'order_updated',
      'project_created',
      'deadline_approaching',
      'task_assigned',
      'task_completed',
      'critical_event'
    ]
  };

  try {
    const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('telegram_config');
    if (row && row.value_json) {
      const parsed = JSON.parse(row.value_json);
      if (parsed.botToken && !tgConfig.botToken) tgConfig.botToken = parsed.botToken;
      if (parsed.chatId && !tgConfig.chatId) tgConfig.chatId = parsed.chatId;
      if (Array.isArray(parsed.enabledEvents)) tgConfig.enabledEvents = parsed.enabledEvents;
    }
  } catch {
    // Ignore DB read error and proceed with env defaults
  }

  // Check if event is enabled
  if (!tgConfig.enabledEvents.includes(eventType)) {
    db.prepare(`
      INSERT INTO notifications (id, event_type, title, message, telegram_sent, telegram_status, telegram_error, created_at)
      VALUES (?, ?, ?, ?, 0, 'skipped_disabled', 'Event disabled in notification settings', ?)
    `).run(notifId, eventType, title, formattedMessage, now);
    return { sent: false, status: 'skipped_disabled' };
  }

  // Check if Bot Token and Chat ID are configured
  if (!tgConfig.botToken || !tgConfig.chatId) {
    db.prepare(`
      INSERT INTO notifications (id, event_type, title, message, telegram_sent, telegram_status, telegram_error, created_at)
      VALUES (?, ?, ?, ?, 0, 'queued_missing_credentials', 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured', ?)
    `).run(notifId, eventType, title, formattedMessage, now);
    return { sent: false, status: 'queued_missing_credentials' };
  }

  // Dispatch HTTPS POST request to api.telegram.org
  const payload = JSON.stringify({
    chat_id: tgConfig.chatId,
    text: formattedMessage
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${tgConfig.botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 6000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          db.prepare(`
            INSERT INTO notifications (id, event_type, title, message, telegram_sent, telegram_status, telegram_error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            notifId,
            eventType,
            title,
            formattedMessage,
            ok ? 1 : 0,
            ok ? 'delivered' : `http_${res.statusCode}`,
            ok ? null : body.slice(0, 300),
            now
          );
          resolve({ sent: ok, status: ok ? 'delivered' : `http_${res.statusCode}` });
        });
      }
    );

    req.on('error', (err) => {
      db.prepare(`
        INSERT INTO notifications (id, event_type, title, message, telegram_sent, telegram_status, telegram_error, created_at)
        VALUES (?, ?, ?, ?, 0, 'network_error', ?, ?)
      `).run(notifId, eventType, title, formattedMessage, String(err.message).slice(0, 300), now);
      resolve({ sent: false, status: 'network_error', error: err.message });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Telegram request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Format exact new order Telegram notification as specified in Section 17.
 */
function formatNewOrderTelegramMessage(order) {
  const servicesList = Array.isArray(order.selected_services)
    ? order.selected_services.join(', ')
    : String(order.selected_services || '—');

  return [
    'NEW NOVEN.CODE ORDER',
    '',
    `Order ID: ${order.order_code}`,
    '',
    `Customer: ${order.customer_name}`,
    '',
    `Service: ${servicesList}`,
    '',
    `Package: ${order.selected_package || 'Custom'}`,
    '',
    `Budget: ${order.estimated_budget || 'Not specified'}`,
    '',
    `Deadline: ${order.desired_deadline || 'Flexible'}`,
    '',
    `Contact: ${order.customer_phone}${order.customer_whatsapp ? ` (WhatsApp: ${order.customer_whatsapp})` : ''} [${order.preferred_contact}]`,
    '',
    'Open CRM to view the complete order.'
  ].join('\n');
}

module.exports = {
  sendTelegramNotification,
  formatNewOrderTelegramMessage
};
