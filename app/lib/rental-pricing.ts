export const rentalPeriods = {
  hour: 3600000,
  day: 86400000,
  month: 30 * 86400000,
} as const;
export type RentalUnit = keyof typeof rentalPeriods;
export function rentalUnits(start: number, end: number, unit: RentalUnit) {
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? Math.ceil((end - start) / rentalPeriods[unit])
    : 0;
}
