/**
 * SLATE POS — Centralized Design Tokens & Tricolour Theme Specification
 * Primary: Venice Blue (#16587B)
 * Secondary: Rock Blue (#84B3CE)
 * Background: Merino (#F5EEDD)
 */

export const THEME = {
  // Official Brand Tricolour Palette
  primary: '#16587B', // Venice Blue
  primaryHover: '#124866', // Derived hover shade
  primaryActive: '#0F405B', // Derived active shade
  secondary: '#84B3CE', // Rock Blue
  secondaryHover: '#6FA3C0', // Derived secondary hover shade
  accentTint: '#E5EFF5', // Soft Rock Blue surface tint
  background: '#F5EEDD', // Merino canvas
  surface: '#FFFFFF', // Crisp white card container
  surfaceMuted: '#FAF6EC', // Soft Merino card header / subtle neutral

  // Typography Tokens — Inter Standardized
  font: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // Typography & Neutrals
  textPrimary: '#16587B', // Venice Blue primary heading/brand text
  textDark: '#111B21', // High-contrast primary body text
  textMedium: '#405D6D', // Secondary slate-blue text
  textMuted: '#5C7280', // Subtle metadata text
  textOnPrimary: '#F5EEDD', // Merino text on Venice Blue surfaces
  border: '#C9D6DF', // Structural hairline border
  borderSubtle: 'rgba(22, 88, 123, 0.16)', // Subtle branded dividers

  // Gradients (Derived from Venice Blue, Rock Blue & Merino)
  gradients: {
    primaryAction: 'linear-gradient(135deg, #16587B 0%, #124866 100%)',
    primaryActionHover: 'linear-gradient(135deg, #124866 0%, #0F405B 100%)',
    cardHighlight: 'linear-gradient(135deg, #FFFFFF 0%, #F5EEDD 100%)',
    successSurface: 'linear-gradient(135deg, #FFFFFF 0%, #FAF6EC 100%)',
    subtleNavSelected: 'linear-gradient(135deg, #16587B 0%, #84B3CE 100%)',
    receiptThermal: 'linear-gradient(180deg, #FFFFFF 0%, #FDFDFD 100%)',
  },

  // Shadows
  shadows: {
    card: '0 1px 3px rgba(15, 64, 91, 0.06), 0 3px 12px rgba(22, 88, 123, 0.05)',
    cardHover: '0 4px 16px rgba(22, 88, 123, 0.10)',
    popover: '0 12px 32px rgba(15, 64, 91, 0.16)',
    modal: '0 20px 48px rgba(15, 64, 91, 0.22)',
  },

  // Radii
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },

  // Semantic Status Tokens (Distinct from brand colours)
  status: {
    successBg: '#DCFCE7',
    successText: '#166534',
    successBorder: '#BBF7D0',
    warningBg: '#FEF3C7',
    warningText: '#92400E',
    warningBorder: '#FDE68A',
    dangerBg: '#FEE2E2',
    dangerText: '#B91C1C',
    dangerBorder: '#FECACA',
    infoBg: '#E5EFF5',
    infoText: '#16587B',
    infoBorder: '#84B3CE',
  },

  // Coordinated Chart Visuals (Venice Blue + Rock Blue + Merino/Semantic)
  charts: {
    fontFamily: 'Inter, sans-serif',
    netRevenueArea: '#16587B',
    receiptsLine: '#84B3CE',
    expensesBar: '#D97706',
    salesBar: '#16587B',
    receiptsBar: '#84B3CE',
    aging: {
      current: '#16587B',
      d1_15: '#84B3CE',
      d16_30: '#F59E0B',
      d31_45: '#EF4444',
      above45: '#991B1B',
    },
  },
} as const;
