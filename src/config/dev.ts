/**
 * SLATE POS — Development Environment Configuration
 *
 * Strict safeguards:
 * - DEV_LOCAL_MODE evaluates to true ONLY when running in Vite development mode (import.meta.env.DEV)
 *   AND explicitly enabled by setting VITE_DEV_LOCAL_MODE=true in local environment variables.
 * - In production builds (npm run build), import.meta.env.DEV is statically replaced with false,
 *   guaranteeing that dev-only branches are tree-shaken and never executed in production.
 * - Defaults strictly to false.
 * - Never bypasses Supabase Authentication, RLS policies, or exposes credentials.
 */

export const DEV_LOCAL_MODE: boolean =
  Boolean(import.meta.env.DEV && import.meta.env.VITE_DEV_LOCAL_MODE === 'true');
