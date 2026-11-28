/**
 * SLATE POS — Centralized Company Logo & Brand Asset Management
 *
 * Single source of truth for:
 * - Default transparent 500x500 PNG asset (/branding/logo.png)
 * - Default Login showcase artwork (/login.jpeg)
 * - Strict PNG upload validation (extension, MIME, PNG magic signature, 500x500 IHDR dimensions, size cap)
 * - Safe URL sanitization (blocks javascript:/vbscript:/untrusted data payloads)
 * - Live browser favicon & apple-touch-icon synchronization
 */

import type { Organization } from '../types';

export const DEFAULT_BRAND_LOGO_PATH = '/branding/logo.png';
export const DEFAULT_LOGIN_BANNER_PATH = '/login.jpeg';
export const REQUIRED_LOGO_DIMENSION = 500;
export const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface LogoValidationResult {
  valid: boolean;
  width?: number;
  height?: number;
  dataUrl?: string;
  error?: string;
}

const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Sanitizes custom logo / banner URLs to allow only:
 * - Relative local asset paths starting with '/' (e.g. /branding/logo.png)
 * - HTTPS URLs
 * - Verified PNG (or SVG for internal default showcase) Data URLs
 */
export function sanitizeBrandImageUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('https://')) {
    return trimmed;
  }

  if (lower.startsWith('data:image/png;base64,')) {
    return trimmed;
  }

  return undefined;
}

/**
 * Returns the active brand logo URL (custom organization 500x500 PNG or centralized default).
 */
export function getActiveBrandLogoUrl(org?: Partial<Organization> | null): string {
  return sanitizeBrandImageUrl(org?.logoUrl) || DEFAULT_BRAND_LOGO_PATH;
}

/**
 * Returns the active login showcase artwork URL.
 */
export function getActiveLoginBannerUrl(org?: Partial<Organization> | null): string {
  return sanitizeBrandImageUrl(org?.loginBannerUrl) || DEFAULT_LOGIN_BANNER_PATH;
}

/**
 * Validates raw PNG header bytes and parses exact width & height from the IHDR chunk.
 * Works identically in Node.js (unit tests) and browser runtimes.
 */
export function parsePngDimensions(bytes: Uint8Array): { valid: boolean; width?: number; height?: number; error?: string } {
  if (!bytes || bytes.length < 24) {
    return { valid: false, error: 'File is too small to be a valid PNG image.' };
  }

  for (let i = 0; i < PNG_MAGIC_BYTES.length; i++) {
    if (bytes[i] !== PNG_MAGIC_BYTES[i]) {
      return { valid: false, error: 'Invalid PNG signature. Please upload a genuine .png image file.' };
    }
  }

  // Bytes 12..15 must be 'IHDR'
  const ihdr = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdr !== 'IHDR') {
    return { valid: false, error: 'Corrupt PNG header (missing IHDR chunk).' };
  }

  const width =
    ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height =
    ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;

  return { valid: true, width, height };
}

/**
 * Validates that a binary PNG buffer meets exact 500 x 500 resolution & size requirements.
 */
export function validatePngBytesForBrandLogo(bytes: Uint8Array): LogoValidationResult {
  if (bytes.byteLength > MAX_LOGO_FILE_BYTES) {
    return {
      valid: false,
      error: `Logo file size exceeds the 2 MB limit (${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const parsed = parsePngDimensions(bytes);
  if (!parsed.valid) {
    return { valid: false, error: parsed.error };
  }

  if (parsed.width !== REQUIRED_LOGO_DIMENSION || parsed.height !== REQUIRED_LOGO_DIMENSION) {
    return {
      valid: false,
      width: parsed.width,
      height: parsed.height,
      error: `Company logo must be exactly ${REQUIRED_LOGO_DIMENSION} × ${REQUIRED_LOGO_DIMENSION} pixels (uploaded image is ${parsed.width} × ${parsed.height} px).`,
    };
  }

  return {
    valid: true,
    width: parsed.width,
    height: parsed.height,
  };
}

/**
 * Browser File validator for Admin Company Logo upload in Configure -> Organization Settings.
 */
export async function validatePngLogoFile(file: File): Promise<LogoValidationResult> {
  if (!file) {
    return { valid: false, error: 'Please select a PNG file.' };
  }

  const lowerName = (file.name || '').toLowerCase();
  if (file.type !== 'image/png' && !lowerName.endsWith('.png')) {
    return { valid: false, error: 'Only PNG (.png) files are supported for the company logo.' };
  }

  if (file.size > MAX_LOGO_FILE_BYTES) {
    return {
      valid: false,
      error: `Logo file is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`,
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const check = validatePngBytesForBrandLogo(bytes);
  if (!check.valid) {
    return check;
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read PNG file.'));
    reader.readAsDataURL(file);
  });

  if (!dataUrl.startsWith('data:image/png;base64,')) {
    return { valid: false, error: 'Encoded image must be a valid base64 PNG data URL.' };
  }

  return {
    valid: true,
    width: check.width,
    height: check.height,
    dataUrl,
  };
}

/**
 * Synchronizes browser tab favicon & apple-touch-icon with the active centralized brand logo.
 */
export function applyDocumentFavicon(logoUrl?: string | null): void {
  if (typeof document === 'undefined') return;
  const safeHref = sanitizeBrandImageUrl(logoUrl) || DEFAULT_BRAND_LOGO_PATH;

  const updateRelLink = (rel: string, type?: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      if (type) link.type = type;
      document.head.appendChild(link);
    } else if (type) {
      link.type = type;
    }
    if (link.getAttribute('href') !== safeHref) {
      link.setAttribute('href', safeHref);
    }
  };

  updateRelLink('icon', 'image/png');
  updateRelLink('shortcut icon', 'image/png');
  updateRelLink('apple-touch-icon', 'image/png');
}
