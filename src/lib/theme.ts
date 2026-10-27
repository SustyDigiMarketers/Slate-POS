/**
 * SLATE POS — Centralized Design Tokens & Theme Specification
 * Pure Poppins Typography System
 * Primary Dark Green (#075E54), Secondary Green (#128C7E), Light Green (#DCF8C6),
 * Warm Neutral Background (#ECE5DD), White Surfaces (#FFFFFF)
 */

export const THEME = {
  // Brand Palette
  primary: '#075E54', // Deep Forest Emerald green
  primaryHover: '#064E46',
  secondary: '#128C7E', // Teal Green
  secondaryHover: '#0F766A',
  lightGreen: '#DCF8C6', // Light Green accent / badge background
  lightGreenHover: '#CEF5B4',
  background: '#ECE5DD', // Warm Neutral canvas
  surface: '#FFFFFF', // Crisp white container
  surfaceMuted: '#F7F5F2', // Soft warm neutral card header

  // Typography Tokens — Poppins Exclusively
  font: {
    family: "'Poppins', sans-serif",
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // Typography & Neutrals
  textDark: '#111B21', // High-contrast primary text
  textMedium: '#3B4A54', // Secondary text
  textMuted: '#667781', // Subtle metadata text
  border: '#D1D7DB', // Structural hairline border
  borderSubtle: '#E9EDEF', // Dividers

  // Gradients (Restrained & Tasteful)
  gradients: {
    primaryAction: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)',
    primaryActionHover: 'linear-gradient(135deg, #064E46 0%, #0F766A 100%)',
    cardHighlight: 'linear-gradient(135deg, #FFFFFF 0%, #F1F8F5 100%)',
    successSurface: 'linear-gradient(135deg, #FFFFFF 0%, #F4FBF7 100%)',
    subtleNavSelected: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)',
    receiptThermal: 'linear-gradient(180deg, #FFFFFF 0%, #FDFDFD 100%)',
  },

  // Shadows
  shadows: {
    card: '0 1px 3px rgba(11, 27, 23, 0.05), 0 3px 12px rgba(7, 94, 84, 0.04)',
    cardHover: '0 4px 16px rgba(7, 94, 84, 0.09)',
    popover: '0 12px 32px rgba(18, 40, 36, 0.14)',
    modal: '0 20px 48px rgba(11, 27, 23, 0.22)',
  },

  // Radii
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },

  // Semantic Status Tokens
  status: {
    successBg: '#DCF8C6',
    successText: '#075E54',
    successBorder: '#B3EBA0',
    warningBg: '#FEF3C7',
    warningText: '#92400E',
    warningBorder: '#FDE68A',
    dangerBg: '#FEE2E2',
    dangerText: '#B91C1C',
    dangerBorder: '#FECACA',
    infoBg: '#E0F2FE',
    infoText: '#0369A1',
    infoBorder: '#BAE6FD',
  },

  // Coordinated Chart Visuals
  charts: {
    fontFamily: 'Poppins, sans-serif',
    netRevenueArea: '#075E54',
    receiptsLine: '#128C7E',
    expensesBar: '#D97706',
    salesBar: '#075E54',
    receiptsBar: '#128C7E',
    aging: {
      current: '#128C7E',
      d1_15: '#EAB308',
      d16_30: '#F97316',
      d31_45: '#EF4444',
      above45: '#991B1B',
    },
  },
} as const;
