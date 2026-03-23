// Gmail Tools for Sarah Rodriguez
// Uses OAuth tokens stored in user_connectors to access Gmail API

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('gmail-tools');
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ── Token Management ────────────────────────────────────────────────────────

async function getGmailToken(orgId) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const org = orgId || 'a1000000-0000-0000-0000-000000000001';

  // Step 1: Find the gmail connector ID
  const { data: connector } = await sb
    .from('connectors')
    .select('id')
    .eq('slug', 'gmail')
    .single();

  // Step 2: Get the user_connector with that connector_id
  if (connector?.id) {
    const { data, error } = await sb
      .from('user_connectors')
      .select('access_token, refresh_token, token_expires_at, connector_id')
      .eq('organization_id', org)
      .eq('status', 'active')
      .eq('connector_id', connector.id)
      .single();

    if (!error && data?.access_token) {
      if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
        return await refreshGmailToken(sb, data, org);
      }
      return data.access_token;
    }
  }

  // Fallback: query with join
  const { data: joined, error: joinErr } = await sb
    .from('user_connectors')
    .select('access_token, refresh_token, token_expires_at, connector_id, connectors(slug)')
    .eq('organization_id', org)
    .eq('status', 'active');

  if (joinErr || !joined) throw new Error('Gmail not connected. Please connect Gmail in the dashboard.');
  const gmailRow = joined.find(r => r.connectors?.slug === 'gmail');
  if (!gmailRow?.access_token) throw new Error('Gmail not connected. Please connect Gmail in the dashboard.');

  if (gmailRow.token_expires_at && new Date(gmailRow.token_expires_at) < new Date()) {
    return await refreshGmailToken(sb, gmailRow, org);
  }
  return gmailRow.access_token;
}

async function refreshGmailToken(sb, row, orgId) {
  if (!row.refresh_token) throw new Error('Gmail token expired and no refresh token available. Please reconnect Gmail.');

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured.');

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) throw new Error(`Failed to refresh Gmail token: ${resp.status}`);
  const tokenData = await resp.json();

  // Update stored token
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  await sb.from('user_connectors')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId || 'a1000000-0000-0000-0000-000000000001')
    .eq('connector_id', row.connector_id);

  logger.info('Gmail token refreshed successfully');
  return tokenData.access_token;
}

async function gmailFetch(path, token, options = {}) {
  const resp = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gmail API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

// ── Tool Implementations ────────────────────────────────────────────────────

async function gmailCheckInbox(input) {
  const token = await getGmailToken(input.orgId);
  const maxResults = input.maxResults || 10;
  const query = input.query || 'is:unread';

  const data = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`, token);
  const messages = data.messages || [];

  if (messages.length === 0) {
    return { success: true, data: { messages: [], count: 0, summary: 'No messages found matching the query.' } };
  }

  // Fetch details for each message
  const detailed = [];
  for (const msg of messages.slice(0, maxResults)) {
    try {
      const full = await gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, token);
      const headers = full.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const isUnread = (full.labelIds || []).includes('UNREAD');
      detailed.push({ id: msg.id, from, subject, date, unread: isUnread, snippet: full.snippet || '' });
    } catch (e) {
      logger.warn('Failed to fetch message details', { messageId: msg.id, error: e.message });
    }
  }

  return {
    success: true,
    data: {
      messages: detailed,
      count: detailed.length,
      totalResults: data.resultSizeEstimate || messages.length,
      summary: `Found ${detailed.length} message(s). ${detailed.filter(m => m.unread).length} unread.`
    }
  };
}

async function gmailReadMessage(input) {
  if (!input.messageId) return { success: false, error: 'messageId is required' };
  const token = await getGmailToken(input.orgId);
  const full = await gmailFetch(`/messages/${input.messageId}?format=full`, token);

  const headers = full.payload?.headers || [];
  const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
  const to = headers.find(h => h.name === 'To')?.value || '';
  const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
  const date = headers.find(h => h.name === 'Date')?.value || '';

  // Extract body text
  let body = '';
  function extractText(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    if (part.parts) part.parts.forEach(extractText);
  }
  if (full.payload) extractText(full.payload);
  if (!body && full.snippet) body = full.snippet;

  return { success: true, data: { id: full.id, from, to, subject, date, body: body.slice(0, 3000), snippet: full.snippet } };
}

async function gmailSendEmail(input) {
  if (!input.to || !input.subject || !input.body) {
    return { success: false, error: 'to, subject, and body are required' };
  }
  const token = await getGmailToken(input.orgId);

  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    input.body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');
  const result = await gmailFetch('/messages/send', token, {
    method: 'POST',
    body: JSON.stringify({ raw: encoded }),
  });

  return { success: true, data: { messageId: result.id, threadId: result.threadId } };
}

// ── Tool Definitions ────────────────────────────────────────────────────────

export const gmailToolDefinitions = {
  gmail_check_inbox: {
    description: 'Check the Gmail inbox for new, unread, or specific emails. Use this to check for urgent emails, get a summary of recent messages, or search for specific emails. Returns sender, subject, date, and snippet for each message.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (default: "is:unread"). Examples: "is:unread", "from:client@example.com", "subject:urgent", "newer_than:1h", "is:important"' },
        maxResults: { type: 'number', description: 'Max messages to return (default: 10, max: 20)' },
        orgId: { type: 'string', description: 'Organization ID (optional, defaults to BLOOM org)' },
      },
      required: [],
    },
    handler: gmailCheckInbox,
  },

  gmail_read_message: {
    description: 'Read the full content of a specific email by its message ID. Use after gmail_check_inbox to read the full body of an interesting or urgent email.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID to read' },
        orgId: { type: 'string', description: 'Organization ID (optional)' },
      },
      required: ['messageId'],
    },
    handler: gmailReadMessage,
  },

  gmail_send_email: {
    description: 'Send an email via Gmail. Use this to send emails on behalf of the organization. Requires to, subject, and body (HTML supported).',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body (HTML supported)' },
        orgId: { type: 'string', description: 'Organization ID (optional)' },
      },
      required: ['to', 'subject', 'body'],
    },
    handler: gmailSendEmail,
  },
};

export async function executeGmailTool(toolName, input) {
  const tool = gmailToolDefinitions[toolName];
  if (!tool) throw new Error(`Unknown Gmail tool: ${toolName}`);

  logger.info('Executing Gmail tool', { tool: toolName });
  try {
    const result = await tool.handler(input);
    return result;
  } catch (error) {
    logger.error('Gmail tool error', { tool: toolName, error: error.message });
    return { success: false, error: error.message };
  }
}
