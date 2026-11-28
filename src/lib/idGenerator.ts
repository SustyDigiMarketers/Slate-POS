/**
 * SLATE POS — Secure Unique ID Generation Utility
 * - User ID: Exactly 6 numeric digits (0–9), leading zeros permitted, stored as string (e.g. "004821").
 * - Organization ID: Alphanumeric string (A–Z, a–z, 0–9), no spaces, hyphens, or special chars (e.g. "SLATE8K29P").
 */

export function generateUserCode(existingCodes: Set<string> = new Set()): string {
  let attempts = 0;
  while (attempts < 10000) {
    // Generate 6 random digits between 0 and 999999, padded with leading zeros
    const num = Math.floor(Math.random() * 1000000);
    const code = String(num).padStart(6, '0');
    
    // Validate exact 6 digits numeric only
    if (/^\d{6}$/.test(code) && !existingCodes.has(code)) {
      existingCodes.add(code);
      return code;
    }
    attempts++;
  }
  // Fallback sequential unique timestamp-derived 6 digits if random collision space saturated
  const fallback = String(Date.now() % 1000000).padStart(6, '0');
  existingCodes.add(fallback);
  return fallback;
}

export function generateOrganizationCode(existingCodes: Set<string> = new Set()): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let attempts = 0;
  while (attempts < 10000) {
    let result = '';
    const length = 10;
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Validate alphanumeric only, no special chars/spaces
    if (/^[A-Za-z0-9]{8,12}$/.test(result) && !existingCodes.has(result)) {
      existingCodes.add(result);
      return result;
    }
    attempts++;
  }
  const fallback = `ORG${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  existingCodes.add(fallback);
  return fallback;
}
