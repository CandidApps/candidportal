/**
 * One-off: search Zoho Mail for contacts matching customer website domains.
 * Writes a review CSV/XLSX — does NOT insert into CRM.
 *
 * Usage: node scripts/export-domain-email-contacts.mjs
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createDecipheriv } = require('crypto');
const XLSX = require('xlsx');

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvLocal();

const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me',
  'protonmail.com', 'mail.com', 'zoho.com', 'zohomail.com', 'gmx.com', 'ymail.com',
]);

const INTERNAL_DOMAINS = new Set(['candid.solutions', 'candidsolutions.com']);

function decryptSecret(payload) {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed encrypted secret');
  const key = Buffer.from(process.env.ZOHO_TOKEN_ENC_KEY, 'hex');
  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function domainFromWebsite(website) {
  try {
    let u = String(website || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || FREE_DOMAINS.has(host) || INTERNAL_DOMAINS.has(host)) return '';
    return host;
  } catch {
    return '';
  }
}

function parseEmail(raw) {
  const s = String(raw || '');
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const GENERIC_LOCALS = new Set([
  'info', 'admin', 'sales', 'support', 'help', 'hello', 'contact', 'office', 'team',
  'billing', 'accounting', 'hr', 'jobs', 'careers', 'noreply', 'no-reply', 'donotreply',
  'do-not-reply', 'mailer-daemon', 'postmaster', 'webmaster', 'wordpress', 'marketing',
  'orders', 'order', 'service', 'customerservice', 'custserv', 'enquiries', 'inquiry',
  'inquiries', 'reception', 'frontdesk', 'ops', 'operations', 'it', 'tech',
  'notifications', 'notify', 'alerts', 'system', 'bot', 'mail', 'email', 'news',
  'newsletter', 'media', 'press', 'legal', 'compliance', 'security', 'abuse',
  'helpdesk', 'staff', 'agent', 'mgmt', 'accounts', 'accountspayable',
]);

function displayName(raw, email) {
  const name = decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.toLowerCase() === email.toLowerCase()) return '';
  if (name.includes('@')) return '';
  return name;
}

/** Guess "John Doe" from john.doe@… — returns '' for generic mailboxes. */
function guessNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const cleaned = local
    .replace(/\+.*$/, '')
    .replace(/\d+$/g, '')
    .trim();
  if (!cleaned) return '';

  const compact = cleaned.toLowerCase().replace(/[._-]+/g, '');
  if (GENERIC_LOCALS.has(cleaned.toLowerCase()) || GENERIC_LOCALS.has(compact)) return '';

  const parts = cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[._\-\s]+/)
    .map((p) => p.replace(/[^a-zA-Z']/g, ''))
    .filter((p) => p.length >= 2);

  if (!parts.length) return '';
  if (parts.length === 1) {
    const p = parts[0];
    if (p.length < 3 || p.length > 24) return '';
    if (!/^[a-zA-Z]+$/.test(p)) return '';
  }

  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function nameQuality(name) {
  if (!name) return 0;
  if (name.includes('@')) return 0;
  const words = name.trim().split(/\s+/);
  let score = words.length * 10 + Math.min(name.length, 40);
  if (words.length >= 2) score += 20;
  return score;
}

function preferName(current, next) {
  return nameQuality(next) > nameQuality(current) ? next : current;
}

function extractAddrs(field) {
  const s = decodeHtmlEntities(field);
  if (!s.trim()) return [];
  const out = [];
  const re = /(?:"([^"]+)"|([^,<]+))?\s*<([^>]+)>|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m;
  while ((m = re.exec(s))) {
    const email = (m[3] || m[4] || '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    const name = displayName(m[1] || m[2] || '', email);
    out.push({ email, name });
  }
  if (!out.length) {
    const email = parseEmail(s);
    if (email) out.push({ email, name: displayName(s, email) });
  }
  return out;
}

async function refreshAccessToken(refreshToken) {
  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.com';
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${accountsDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Token refresh missing access_token');
  return json.access_token;
}

async function zohoSearch({ accessToken, accountId, searchKey, limit = 50 }) {
  const apiDomain = process.env.ZOHO_MAIL_API_DOMAIN || 'https://mail.zoho.com';
  const params = new URLSearchParams({
    searchKey,
    limit: String(limit),
    includeto: 'true',
  });
  const res = await fetch(
    `${apiDomain}/api/accounts/${accountId}/messages/search?${params}`,
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho search failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

(async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: customers, error: custErr } = await admin
    .from('customers')
    .select('id, external_id, company, website')
    .is('archived_at', null)
    .not('website', 'is', null);
  if (custErr) throw custErr;

  const { data: existingContacts } = await admin
    .from('customer_contacts')
    .select('customer_id, email, name');

  const existingByCustomer = new Map();
  /** @type {Map<string, string>} */
  const crmNameByEmail = new Map();
  for (const c of existingContacts || []) {
    const email = String(c.email || '').trim().toLowerCase();
    if (!email) continue;
    const set = existingByCustomer.get(c.customer_id) || new Set();
    set.add(email);
    existingByCustomer.set(c.customer_id, set);
    const nm = String(c.name || '').trim();
    if (nm && !nm.includes('@')) {
      const prev = crmNameByEmail.get(email) || '';
      crmNameByEmail.set(email, preferName(prev, nm));
    }
  }

  /** @type {Map<string, { domain: string, accounts: Array<{id:string,external_id:string,company:string,website:string}> }>} */
  const byDomain = new Map();
  for (const c of customers || []) {
    const domain = domainFromWebsite(c.website);
    if (!domain) continue;
    const entry = byDomain.get(domain) || { domain, accounts: [] };
    entry.accounts.push({
      id: c.id,
      external_id: c.external_id,
      company: c.company,
      website: c.website,
    });
    byDomain.set(domain, entry);
  }

  const domains = [...byDomain.keys()].sort();
  console.log(`Domains to search: ${domains.length}`);

  // Prefer Bryan mailbox with access token history; fall back to any with refresh token.
  const { data: zohoRows, error: zohoErr } = await admin
    .from('zoho_connections')
    .select('*')
    .eq('email', 'bryan.willis@candid.solutions')
    .order('connected_at', { ascending: false })
    .limit(1);
  if (zohoErr) throw zohoErr;
  let row = zohoRows?.[0];
  if (!row) {
    const { data: any } = await admin.from('zoho_connections').select('*').limit(1);
    row = any?.[0];
  }
  if (!row?.refresh_token_enc || !row.account_id) {
    throw new Error('No Zoho connection available to search mail.');
  }

  const refreshToken = decryptSecret(row.refresh_token_enc);
  const accessToken = await refreshAccessToken(refreshToken);
  const accountId = row.account_id;
  const mailbox = String(row.email || '').toLowerCase();
  console.log(`Searching mailbox: ${mailbox}`);

  /** @type {Map<string, { email: string, name: string, domain: string, roles: Set<string>, subjects: Set<string>, messageCount: number, lastSeen: number }>} */
  const contacts = new Map();

  let searched = 0;
  let searchErrors = 0;

  await mapPool(domains, 2, async (domain) => {
    try {
      const searchKey = `sender:${domain}::or:to:${domain}`;
      const rows = await zohoSearch({ accessToken, accountId, searchKey, limit: 40 });
      searched += 1;
      if (searched % 10 === 0) console.log(`  … ${searched}/${domains.length} domains`);

      for (const msg of rows) {
        const fields = [
          ['from', msg.fromAddress || msg.from],
          ['to', msg.toAddress || msg.toAddr || msg.to],
          ['cc', msg.ccAddress || msg.cc],
        ];
        // Zoho often puts the human name in `sender` separately from fromAddress.
        const senderName = displayName(msg.sender || '', '');
        const subject = String(msg.subject || '');
        const when = Number(msg.receivedTime || msg.receivedtime || msg.sentDateInGMT || 0);

        for (const [role, field] of fields) {
          for (const part of extractAddrs(field)) {
            const email = part.email.toLowerCase();
            const host = email.split('@')[1] || '';
            if (host !== domain && !host.endsWith('.' + domain)) continue;
            if (INTERNAL_DOMAINS.has(host) || FREE_DOMAINS.has(host)) continue;
            if (email === mailbox) continue;

            let name = part.name || '';
            if (!name && role === 'from' && senderName && !senderName.includes('@')) {
              name = senderName;
            }

            const key = email;
            const cur = contacts.get(key) || {
              email,
              name: name || '',
              domain,
              roles: new Set(),
              subjects: new Set(),
              messageCount: 0,
              lastSeen: 0,
            };
            if (name) cur.name = preferName(cur.name, name);
            cur.roles.add(role);
            if (subject) cur.subjects.add(subject.slice(0, 120));
            cur.messageCount += 1;
            if (when > cur.lastSeen) cur.lastSeen = when;
            contacts.set(key, cur);
          }
        }
      }
    } catch (err) {
      searchErrors += 1;
      console.warn(`  ! ${domain}: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(400);
  });

  console.log(`Found ${contacts.size} unique external contacts (${searchErrors} domain search errors)`);

  let namesFromEmail = 0;
  let namesGuessed = 0;
  let namesFromCrm = 0;
  let namesMissing = 0;

  const exportRows = [];
  for (const c of contacts.values()) {
    const fromEmail = c.name || '';
    const fromCrm = crmNameByEmail.get(c.email) || '';
    const guessed = guessNameFromEmail(c.email);

    let contactName = '';
    let nameSource = '';
    if (fromEmail) {
      contactName = fromEmail;
      nameSource = 'email header';
      namesFromEmail += 1;
    } else if (fromCrm) {
      contactName = fromCrm;
      nameSource = 'existing CRM';
      namesFromCrm += 1;
    } else if (guessed) {
      contactName = guessed;
      nameSource = 'guessed from email';
      namesGuessed += 1;
    } else {
      nameSource = '';
      namesMissing += 1;
    }

    // If CRM or header both exist, prefer the richer one but keep source accurate.
    if (fromEmail && fromCrm && nameQuality(fromCrm) > nameQuality(fromEmail)) {
      contactName = fromCrm;
      nameSource = 'existing CRM';
    }

    const accounts = byDomain.get(c.domain)?.accounts || [];
    for (const acct of accounts) {
      const already = existingByCustomer.get(acct.id)?.has(c.email) ? 'yes' : 'no';
      exportRows.push({
        Include: already === 'yes' ? '' : 'y',
        'Contact Name': contactName,
        'Contact Email': c.email,
        'Name Source': nameSource,
        Company: acct.company,
        'Account ID': acct.external_id,
        Website: acct.website,
        Domain: c.domain,
        'Seen As': [...c.roles].sort().join(', '),
        'Email Hits': c.messageCount,
        'Last Seen (UTC)': c.lastSeen
          ? new Date(c.lastSeen).toISOString().slice(0, 19).replace('T', ' ')
          : '',
        'Already In CRM': already,
        'Sample Subjects': [...c.subjects].slice(0, 3).join(' | '),
        Notes: '',
      });
    }
  }

  exportRows.sort((a, b) =>
    a.Company.localeCompare(b.Company) || a['Contact Email'].localeCompare(b['Contact Email']),
  );

  fs.mkdirSync('tmp', { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = path.join('tmp', `account-email-contacts-WITH-NAMES-${stamp}.csv`);
  const xlsxPath = path.join(
    require('os').homedir(),
    'Desktop',
    `account-email-contacts-WITH-NAMES-${stamp}.xlsx`,
  );
  const xlsxRepoPath = path.join(process.cwd(), `account-email-contacts-WITH-NAMES-${stamp}.xlsx`);

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts to review');
  try {
    XLSX.writeFile(wb, xlsxPath);
  } catch (err) {
    console.warn('Desktop write failed, using repo path:', err.message);
  }
  XLSX.writeFile(wb, xlsxRepoPath);
  XLSX.writeFile(wb, csvPath, { bookType: 'csv' });

  const summary = {
    domainsSearched: domains.length,
    uniqueContacts: contacts.size,
    exportRows: exportRows.length,
    alreadyInCrm: exportRows.filter((r) => r['Already In CRM'] === 'yes').length,
    newSuggested: exportRows.filter((r) => r['Already In CRM'] === 'no').length,
    namesFromEmailHeader: namesFromEmail,
    namesFromCrm: namesFromCrm,
    namesGuessedFromEmail: namesGuessed,
    namesMissing: namesMissing,
    searchErrors,
    mailbox,
    xlsxPath,
    xlsxRepoPath,
    csvPath,
  };
  fs.writeFileSync('tmp/account-email-contacts-summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
