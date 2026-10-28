// Passenger seats only; the driver is not included.
export const TAXI_PASSENGER_CAPACITY = 15;
export function taxiSeatsAvailable(capacity: number, remaining: number) {
  return Math.max(
    0,
    Math.min(
      remaining,
      Math.min(capacity, TAXI_PASSENGER_CAPACITY) - (capacity - remaining),
    ),
  );
}
