// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Safety Detection
// All runs client-side. Nothing is sent anywhere.
// Ported directly from mutual-aid-v3-layer4.jsx.
// ═══════════════════════════════════════════════════════════════════════════

export interface Warning { id: string; msg: string; }

// ─── SCAM PATTERNS ─────────────────────────────────────────────────────────

const SCAM_PATTERNS = [
  { id: 'payment',    regex: /\b(venmo|cashapp|cash\s*app|zelle|paypal|gofundme|donation|donate)\b/i,
    msg: 'This post mentions payment platforms. Root System is for direct exchanges, not financial transactions.' },
  { id: 'urgency',    regex: /\b(act now|limited time|today only|must respond|urgent|ASAP|don't wait|hurry)\b/i,
    msg: 'This post uses urgency language. Take your time.' },
  { id: 'offplatform',regex: /\b(telegram|instagram\s*dm|whatsapp|kik|snapchat)\b/i,
    msg: 'Consider using Signal or ProtonMail instead of the platforms mentioned.' },
  { id: 'documents',  regex: /\b(send.{0,10}(id|ssn|license|passport|social\s*security)|photo\s*id|personal\s*documents)\b/i,
    msg: 'Never share personal documents through this platform.' },
  { id: 'tooGood',    regex: /\$\s*[5-9]\d{2,}|\$\s*\d{4,}|\bfree.{0,15}(iphone|laptop|car|tv|gift\s*card)/i,
    msg: 'High-value free offers from strangers deserve extra scrutiny.' },
];

export function detectScamWarnings(title: string, body: string): Warning[] {
  const text = `${title} ${body}`;
  return SCAM_PATTERNS
    .filter(p => p.regex.test(text))
    .map(p => ({ id: p.id, msg: p.msg }));
}

// ─── CRISIS DETECTION ──────────────────────────────────────────────────────

const CRISIS_PATTERNS = [
  /\b(want to die|want to kill myself|end my life|suicidal|no reason to live|can't go on)\b/i,
  /\b(hurting myself|self.harm|cutting myself)\b/i,
  /\b(being abused|he hits me|she hits me|afraid to go home)\b/i,
];

export function detectCrisis(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  return CRISIS_PATTERNS.some(p => p.test(text));
}

export const CRISIS_RESOURCES = [
  { label: '988 Suicide & Crisis Lifeline', value: '988' },
  { label: 'Crisis Text Line', value: 'Text HOME to 741741' },
  { label: 'Domestic Violence Hotline', value: '1-800-799-7233' },
  { label: '211 Local Services', value: '211' },
];

// ─── MINOR DETECTION ───────────────────────────────────────────────────────

const MINOR_PATTERNS = [
  /\b(i am \d{1,2}|i'm \d{1,2}|i'm \d{1,2} years|my daughter is \d{1,2}|my son is \d{1,2})\b/i,
  /\b(middle school|high school student|teenager|teen|minor|underage)\b/i,
];

export function detectMinor(text: string): boolean {
  return MINOR_PATTERNS.some(p => p.test(text));
}

// ─── FAIR HOUSING ──────────────────────────────────────────────────────────

const FAIR_HOUSING_PATTERNS = [
  /\b(no (kids|children|families|section 8|vouchers|pets))\b/i,
  /\b(whites only|christians only|english only|adults only)\b/i,
];

export function detectFairHousing(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  return FAIR_HOUSING_PATTERNS.some(p => p.test(text));
}
