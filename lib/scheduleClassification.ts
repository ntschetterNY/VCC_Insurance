// ---------------------------------------------------------------------------
// Schedule Classification — Attachment 1
//
// Maps trades to their insurance schedule (A, B, or C) based on scope and
// building height. Each schedule defines a deductible and three minimum
// limits of liability values.
// ---------------------------------------------------------------------------

export type ScheduleType = 'A' | 'B' | 'C'

export interface ScheduleDefinition {
  type: ScheduleType
  deductible: number
  minLimits: [number, number, number] // three liability values
  label: string
}

export const SCHEDULE_DEFINITIONS: Record<ScheduleType, ScheduleDefinition> = {
  A: {
    type: 'A',
    deductible: 75_000,
    minLimits: [3_000_000, 3_000_000, 3_000_000],
    label: 'Schedule A',
  },
  B: {
    type: 'B',
    deductible: 100_000,
    minLimits: [5_000_000, 5_000_000, 5_000_000],
    label: 'Schedule B',
  },
  C: {
    type: 'C',
    deductible: 75_000,
    minLimits: [10_000_000, 10_000_000, 10_000_000],
    label: 'Schedule C',
  },
}

// ---------------------------------------------------------------------------
// Trade → Schedule mapping
//
// Each entry is the trade description exactly as listed in Attachment 1.
// The classifyTrade() function does a fuzzy/keyword match against these.
// ---------------------------------------------------------------------------

export const TRADE_SCHEDULE_MAP: { trade: string; schedule: ScheduleType }[] = [
  // ---- Schedule A ----
  { trade: 'Carpentry - Framing (interior)', schedule: 'A' },
  { trade: 'Carpentry - All Other (interior)', schedule: 'A' },
  { trade: 'Carpeting/Flooring (interior)', schedule: 'A' },
  { trade: 'Concrete - All Other (interior)', schedule: 'A' },
  { trade: 'Demolition (interior-non-structural)', schedule: 'A' },
  { trade: 'Door Installation (interior)', schedule: 'A' },
  { trade: 'Drywall', schedule: 'A' },
  { trade: 'Electrical (exterior < 3 stories)', schedule: 'A' },
  { trade: 'Electrical (interior)', schedule: 'A' },
  { trade: 'HVAC (exterior < 3 stories)', schedule: 'A' },
  { trade: 'HVAC (interior)', schedule: 'A' },
  { trade: 'Landscaping - Ground Level', schedule: 'A' },
  { trade: 'Landscaping - Rooftop (exterior < 3 stories)', schedule: 'A' },
  { trade: 'Security System', schedule: 'A' },
  { trade: 'All Other Interior < 3 Stories', schedule: 'A' },

  // ---- Schedule B ----
  { trade: 'Carpentry - Framing', schedule: 'B' },
  { trade: 'Concrete - All Other (exterior < 3 stories)', schedule: 'B' },
  { trade: 'Demolition (exterior < 3 stories)', schedule: 'B' },
  { trade: 'Door Installation', schedule: 'B' },
  { trade: 'Electrical (exterior > 3 stories)', schedule: 'B' },
  { trade: 'HVAC (exterior > 3 stories)', schedule: 'B' },
  { trade: 'Landscaping - Rooftop (exterior > 3 stories)', schedule: 'B' },
  { trade: 'Masonry/Facade (exterior < 3 stories)', schedule: 'B' },
  { trade: 'Plumbing', schedule: 'B' },
  { trade: 'Roofing (exterior < 3 stories)', schedule: 'B' },
  { trade: 'Steel - Ornamental (exterior < 3 stories)', schedule: 'B' },
  { trade: 'Window Installation (exterior < 3 stories)', schedule: 'B' },
  { trade: 'All Other Interior > 3 Stories', schedule: 'B' },

  // ---- Schedule C ----
  { trade: 'Concrete - All Other (exterior > 3 stories)', schedule: 'C' },
  { trade: 'Concrete - Foundation', schedule: 'C' },
  { trade: 'Concrete - Structural', schedule: 'C' },
  { trade: 'Crane', schedule: 'C' },
  { trade: 'Demolition (exterior > 3 stories)', schedule: 'C' },
  { trade: 'EIFS', schedule: 'C' },
  { trade: 'Excavation', schedule: 'C' },
  { trade: 'Hoist/Elevator', schedule: 'C' },
  { trade: 'Masonry/Facade (exterior > 3 stories)', schedule: 'C' },
  { trade: 'Pile Driving', schedule: 'C' },
  { trade: 'Roofing (exterior > 3 stories)', schedule: 'C' },
  { trade: 'Scaffold/Sidewalk Bridge', schedule: 'C' },
  { trade: 'Shoring/Underpinning', schedule: 'C' },
  { trade: 'Steel - Ornamental (exterior > 3 stories)', schedule: 'C' },
  { trade: 'Steel - Superstructure', schedule: 'C' },
  { trade: 'Window Installation (exterior > 3 stories)', schedule: 'C' },
  { trade: 'All Other Exterior > 3 Stories', schedule: 'C' },
]

// ---------------------------------------------------------------------------
// classifyTrade — fuzzy match a trade string to its schedule
//
// Returns the matched schedule definition, or null if no match is found.
// Uses case-insensitive keyword matching against the TRADE_SCHEDULE_MAP.
// ---------------------------------------------------------------------------
export function classifyTrade(
  tradeInput: string
): { schedule: ScheduleDefinition; matchedTrade: string } | null {
  if (!tradeInput || !tradeInput.trim()) return null

  const input = tradeInput.toLowerCase().trim()

  // 1. Exact match (case-insensitive)
  for (const entry of TRADE_SCHEDULE_MAP) {
    if (entry.trade.toLowerCase() === input) {
      return {
        schedule: SCHEDULE_DEFINITIONS[entry.schedule],
        matchedTrade: entry.trade,
      }
    }
  }

  // 2. Substring match — check if the input contains or is contained in a mapped trade
  for (const entry of TRADE_SCHEDULE_MAP) {
    const mapped = entry.trade.toLowerCase()
    if (input.includes(mapped) || mapped.includes(input)) {
      return {
        schedule: SCHEDULE_DEFINITIONS[entry.schedule],
        matchedTrade: entry.trade,
      }
    }
  }

  // 3. Keyword match — split into words and look for the best overlap
  const inputWords = input.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  let bestMatch: { entry: (typeof TRADE_SCHEDULE_MAP)[0]; score: number } | null = null

  for (const entry of TRADE_SCHEDULE_MAP) {
    const tradeWords = entry.trade
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
    const overlap = inputWords.filter((w) => tradeWords.some((tw) => tw.includes(w) || w.includes(tw)))
    const score = overlap.length / Math.max(inputWords.length, tradeWords.length)
    if (score > 0.4 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entry, score }
    }
  }

  if (bestMatch) {
    return {
      schedule: SCHEDULE_DEFINITIONS[bestMatch.entry.schedule],
      matchedTrade: bestMatch.entry.trade,
    }
  }

  return null
}

// All unique trade names for use in dropdowns
export function getTradeOptions(): string[] {
  return TRADE_SCHEDULE_MAP.map((t) => t.trade)
}
