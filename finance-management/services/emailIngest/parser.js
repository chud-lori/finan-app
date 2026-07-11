/**
 * Bank notification email parser — zero-dependency, template/heuristic based.
 *
 * Supported sources: BCA (bca.co.id / klikbca.com) and Bank Jago (jago.com).
 * Parsing is deliberately conservative: anything ambiguous returns
 * `parsed: false` so the email still lands in the pending-review queue as a
 * "needs manual entry" item instead of guessing a wrong amount. Parsed items
 * are NEVER written to the ledger directly — the user confirms them first
 * (see routers/emailIngest.js), keeping the atomic $inc balance path as the
 * only ledger writer.
 *
 * Extending to a new bank = add an entry to SOURCES + a parse<Bank> function.
 */

const SOURCES = [
  { key: 'bca',  fromPattern: /@(?:[a-z0-9-]+\.)*(?:bca\.co\.id|klikbca\.com)$/i },
  { key: 'jago', fromPattern: /@(?:[a-z0-9-]+\.)*jago\.com$/i },
];

// Strip HTML to text: drop style/script blocks, turn block tags into newlines,
// decode the handful of entities that appear in bank templates.
const htmlToText = (html) => String(html || '')
  .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();

/**
 * Parse an Indonesian/English formatted rupiah string to a number.
 * Handles "150.000", "1.234.567,89", "150,000.00", "150000", trailing ",-".
 * Returns null when the string does not look like a plausible amount.
 */
const parseIdrAmount = (raw) => {
  if (!raw) return null;
  let s = String(raw).trim().replace(/(?:rp\.?|idr)\s*/i, '').replace(/,-$/, '').trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present — the later one is the decimal separator
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('');
    if (dec === ',') s = s.replace(',', '.');
  } else if (lastComma !== -1) {
    // Only commas: "150,000" (thousands) vs "150000,50" (decimal)
    const tail = s.length - lastComma - 1;
    s = tail === 3 ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    // Only dots: Indonesian thousands "150.000" vs decimal "150000.50"
    const tail = s.length - lastDot - 1;
    s = tail === 3 ? s.split('.').join('') : s;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Find an amount in body text: prefer explicitly labeled amounts, fall back
// to the largest Rp/IDR-prefixed number in the message.
const AMOUNT_LABELS = /(?:jumlah|nominal|total(?:\s+transaksi)?|amount)\s*(?:transfer|pembayaran|payment)?\s*[:=]?\s*(?:rp\.?|idr)?\s*([\d][\d.,]*)/i;
const RP_ANY = /(?:rp\.?|idr)\s*([\d][\d.,]*)/gi;

const findAmount = (text) => {
  const labeled = text.match(AMOUNT_LABELS);
  if (labeled) {
    const n = parseIdrAmount(labeled[1]);
    if (n) return n;
  }
  let best = null;
  for (const m of text.matchAll(RP_ANY)) {
    const n = parseIdrAmount(m[1]);
    if (n && (best === null || n > best)) best = n;
  }
  return best;
};

// income vs expense keyword scan — Indonesian + English phrasings used by
// BCA/Jago notification templates. Income requires an explicit inbound
// signal; everything else defaults to expense.
const INCOME_RE = /(transfer\s+masuk|dana\s+masuk|menerima\s+(?:dana|transfer)|received\s+(?:a\s+)?(?:transfer|payment|money)|uang\s+masuk|incoming\s+transfer|top\s?up\s+diterima)/i;

// Grab the value following a labeled line, e.g. "Kepada: BUDI SANTOSO"
const labeledValue = (text, labelRe) => {
  const m = text.match(labelRe);
  if (!m) return null;
  const v = m[1].trim().replace(/\s{2,}/g, ' ');
  return v.length >= 2 && v.length <= 120 ? v : null;
};

const BCA_DESC_LABELS = [
  /(?:nama\s+penerima|kepada|penerima)\s*[:=]\s*([^\n]+)/i,
  /(?:berita|keterangan|remark)\s*[:=]\s*([^\n]+)/i,
  /(?:merchant|nama\s+merchant)\s*[:=]\s*([^\n]+)/i,
  /(?:dari|pengirim|nama\s+pengirim)\s*[:=]\s*([^\n]+)/i,
];

const JAGO_DESC_LABELS = [
  /(?:to|kepada|recipient|penerima)\s*[:=]\s*([^\n]+)/i,
  /(?:merchant|di|at)\s*[:=]\s*([^\n]+)/i,
  /(?:from|dari)\s*[:=]\s*([^\n]+)/i,
  /(?:notes?|catatan)\s*[:=]\s*([^\n]+)/i,
];

// Jago prose templates: "You've successfully transferred Rp100.000 to GOPAY"
const JAGO_PROSE = [
  /transferred\s+(?:rp\.?|idr)\s*[\d.,]+\s+to\s+([^\n.]+)/i,
  /paid\s+(?:rp\.?|idr)\s*[\d.,]+\s+(?:to|at)\s+([^\n.]+)/i,
  /berhasil\s+(?:transfer|membayar|bayar)\s+(?:rp\.?|idr)\s*[\d.,]+\s+ke\s+([^\n.]+)/i,
];

const findDescription = (source, text, subject) => {
  const labels = source === 'bca' ? BCA_DESC_LABELS : JAGO_DESC_LABELS;
  if (source === 'jago') {
    for (const re of JAGO_PROSE) {
      const m = text.match(re);
      if (m) {
        const v = m[1].trim();
        if (v.length >= 2 && v.length <= 120) return v;
      }
    }
  }
  for (const re of labels) {
    const v = labeledValue(text, re);
    if (v) return v;
  }
  const subj = String(subject || '').trim();
  return subj.length >= 3 ? subj.slice(0, 120) : null;
};

/** Identify the bank from the From address; null when not a supported bank. */
const identifySource = (fromAddress) => {
  const addr = String(fromAddress || '').toLowerCase().trim();
  const bare = (addr.match(/<([^>]+)>/) || [null, addr])[1].trim();
  for (const s of SOURCES) if (s.fromPattern.test(bare)) return s.key;
  return null;
};

/**
 * Parse a bank notification email into a pending-transaction candidate.
 *
 * @param {object} email — { from, subject, text, html, date }
 * @returns {object|null} null when the sender is not a supported bank;
 *   otherwise { source, parsed, subject, snippet, ...fields when parsed }
 */
const parseBankEmail = (email) => {
  const source = identifySource(email.from);
  if (!source) return null;

  const text = (email.text && email.text.trim()) || htmlToText(email.html);
  const subject = String(email.subject || '').trim();
  const snippet = (text || subject).slice(0, 300);
  const base = { source, subject: subject.slice(0, 200), snippet };

  const amount = findAmount(`${text}\n${subject}`);
  if (!amount) return { ...base, parsed: false };

  const type = INCOME_RE.test(`${text}\n${subject}`) ? 'income' : 'expense';
  const description = findDescription(source, text, subject) || `${source} transaction`;
  const time = email.date instanceof Date && !isNaN(email.date) ? email.date : new Date();

  return { ...base, parsed: true, amount, currency: 'idr', type, description, time };
};

module.exports = { parseBankEmail, identifySource, parseIdrAmount, htmlToText };
