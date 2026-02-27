import {
  detectScamWarnings,
  detectCrisis,
  detectMinor,
  detectFairHousing,
} from '../index';

// ─── detectScamWarnings ──────────────────────────────────────────────────────

describe('detectScamWarnings', () => {
  it('returns empty array for a clean post', () => {
    const result = detectScamWarnings('Free tomatoes', 'I have extra from the garden. Come pick them up.');
    expect(result).toEqual([]);
  });

  it('flags Cash App / payment platform mentions', () => {
    const result = detectScamWarnings('Need help', 'Please send via Cash App');
    const ids = result.map(w => w.id);
    expect(ids).toContain('payment');
  });

  it('flags Venmo in the body', () => {
    const result = detectScamWarnings('Offering rides', 'Just Venmo me after');
    expect(result.map(w => w.id)).toContain('payment');
  });

  it('flags urgency language', () => {
    const result = detectScamWarnings('Act now', 'Limited time offer, must respond today only');
    expect(result.map(w => w.id)).toContain('urgency');
  });

  it('flags requests for personal documents', () => {
    const result = detectScamWarnings('Job offer', 'Please send photo ID and social security number');
    expect(result.map(w => w.id)).toContain('documents');
  });

  it('flags overpayment scam language', () => {
    const result = detectScamWarnings('Item sold', "I'll send a cashier's check — you send back the difference");
    expect(result.map(w => w.id)).toContain('overpayment');
  });

  it('flags romance language', () => {
    const result = detectScamWarnings('Hi', "You are so beautiful, I fell in love instantly");
    expect(result.map(w => w.id)).toContain('romance');
  });

  it('returns Warning objects with id and msg strings', () => {
    const result = detectScamWarnings('', 'send me your passport and id');
    expect(result.length).toBeGreaterThan(0);
    result.forEach(w => {
      expect(typeof w.id).toBe('string');
      expect(typeof w.msg).toBe('string');
      expect(w.id.length).toBeGreaterThan(0);
      expect(w.msg.length).toBeGreaterThan(0);
    });
  });
});

// ─── detectCrisis ────────────────────────────────────────────────────────────

describe('detectCrisis', () => {
  it('returns false for a normal post', () => {
    expect(detectCrisis('Need help moving', 'I need help moving a couch this weekend')).toBe(false);
  });

  it('detects suicidal language', () => {
    expect(detectCrisis('', 'I want to die, I have no reason to live')).toBe(true);
  });

  it('detects self-harm language', () => {
    expect(detectCrisis('', 'I have been hurting myself')).toBe(true);
  });

  it('detects domestic violence language', () => {
    expect(detectCrisis('', 'I am being abused and afraid to go home')).toBe(true);
  });

  it('detects trafficking indicators', () => {
    expect(detectCrisis('', 'They took my passport and I cannot leave')).toBe(true);
  });

  it('detects missing person post', () => {
    expect(detectCrisis('Missing teenager', 'Have you seen this missing child last seen wearing a red jacket')).toBe(true);
  });
});

// ─── detectMinor ─────────────────────────────────────────────────────────────

describe('detectMinor', () => {
  it('returns false for a normal adult post', () => {
    expect(detectMinor('Looking for a plumber, any recommendations?')).toBe(false);
  });

  it('detects explicit age mention of a minor', () => {
    expect(detectMinor('My daughter is 14 and needs tutoring')).toBe(true);
  });

  it('detects "teenager" keyword', () => {
    expect(detectMinor('Looking for a teenager to babysit')).toBe(true);
  });

  it('detects "minor" keyword', () => {
    expect(detectMinor('This involves a minor')).toBe(true);
  });

  it('detects high school student', () => {
    expect(detectMinor("I'm a high school student looking for a mentor")).toBe(true);
  });
});

// ─── detectFairHousing ───────────────────────────────────────────────────────

describe('detectFairHousing', () => {
  it('returns false for a clean housing post', () => {
    expect(detectFairHousing('Room for rent', 'Clean 2BR available, all welcome, pets negotiable')).toBe(false);
  });

  it('flags "no section 8"', () => {
    expect(detectFairHousing('Room available', 'No section 8, no vouchers')).toBe(true);
  });

  it('flags "no children"', () => {
    expect(detectFairHousing('Apartment', 'No kids, no families')).toBe(true);
  });

  it('flags discriminatory religious preference', () => {
    expect(detectFairHousing('Rental', 'Christians only please')).toBe(true);
  });

  it('flags disability discrimination', () => {
    expect(detectFairHousing('Room', 'Able-bodied only, no wheelchair')).toBe(true);
  });

  it('flags sexual orientation discrimination', () => {
    expect(detectFairHousing('Apartment', 'Straight couples only')).toBe(true);
  });
});
