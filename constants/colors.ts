// Black & Green "IT" theme.
// Every screen imports COLORS from here, so changing a color
// in this one file changes it everywhere in the app.
export const COLORS = {
  // Backgrounds
  background: '#0A0A0A', // main background - black
  surface: '#141414', // secondary background - dark charcoal
  card: '#1E1E1E', // cards and panels - dark gray

  // Accents
  primary: '#00FF66', // primary accent - neon green (buttons, active tabs)
  primaryDark: '#008F46', // secondary accent - deep green

  // Text
  textPrimary: '#FFFFFF', // headings and main text - white
  textSecondary: '#B3B3B3', // labels and helper text - light gray
  textOnPrimary: '#0A0A0A', // text ON a neon green button - black (contrast)

  // Lines
  border: '#333333', // borders and dividers - dark gray

  // Messages
  danger: '#FF4D4D', // error messages - red
  warning: '#FFBF47', // warning messages - amber
  success: '#00FF66', // success messages - neon green

  // Kept for older code (same as background/card)
  shadow: '#000000',
} as const;
