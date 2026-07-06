/** CPC section (first letter) → doom-scroller-friendly industry label. */
export const CPC_SECTIONS: Record<string, string> = {
  A: 'Human stuff', // Human necessities
  B: 'Making & moving', // Operations, transport
  C: 'Chemistry',
  D: 'Textiles & paper',
  E: 'Buildings & digging', // Fixed constructions
  F: 'Engines & heat',
  G: 'Physics & computing',
  H: 'Electricity',
  Y: 'Misc tech',
};

export const INDUSTRY_FILTERS = Object.entries(CPC_SECTIONS).map(([section, label]) => ({
  section,
  label,
}));

export function industryOf(cpc: string[]): string | undefined {
  const section = cpc[0]?.[0];
  return section ? CPC_SECTIONS[section] : undefined;
}
