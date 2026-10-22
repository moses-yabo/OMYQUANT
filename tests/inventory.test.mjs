import { afterEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import * as db from '../app/.server/database/models.ts';
import { bookSeats, cancelBooking } from '../app/.server/modules/inventory.ts';
import { resources } from '../app/.server/modules/resources.ts';
import { taxiSeatsAvailable } from '../app/lib/taxi-capacity.ts';

afterEach(() => jest.restoreAllMocks());

// These tests check service decisions and transaction participation, not MongoDB
// rollback, write conflicts or retries. Those require a replica-set integration suite.
function persistence({ active = true, departureAvailable = true } = {}) {
  const session = { testSession: true };
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(callback => callback(session));
  const departure = { _id: 'b'.repeat(24), business: 'c'.repeat(24), price: 45000 };
  const decrement = jest.spyOn(db.Departure, 'findOneAndUpdate').mockResolvedValue(departureAvailable ? departure : null);
  jest.spyOn(db.Departure, 'findOne').mockReturnValue({ session: async () => null });
  const lookup = jest.fn().mockResolvedValue(active ? { _id: departure.business } : null);
  const business = jest.spyOn(db.Business, 'exists').mockReturnValue({ session: lookup });
  const create = jest.spyOn(db.Booking, 'create').mockResolvedValue([{ _id: 'd'.repeat(24), status: 'confirmed' }]);
  return { session, decrement, lookup, business, create };
}

const actor = { id: 'a'.repeat(24), admin: false };
const input = { departure: 'b'.repeat(24), seats: 2 };

test('seat booking rejects an inactive operator before creating a confirmed record', async () => {
  const { create, lookup } = persistence({ active: false });
  await expect(bookSeats(actor, input)).rejects.toMatchObject({ status: 409, message: 'Operator is not verified or available' });
  expect(lookup).toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

test('active operator seat booking uses the inventory transaction and price snapshot', async () => {
  const { session, decrement, business, lookup, create } = persistence();
  await expect(bookSeats(actor, input)).resolves.toMatchObject({ status: 'confirmed' });
  expect(decrement).toHaveBeenCalledWith(expect.objectContaining({
    _id: input.departure, status: 'scheduled', remaining: { $gte: 2 }, startsAt: { $gt: expect.any(Date) },
  }), { $inc: { remaining: -2 } }, { new: true, session });
  expect(business).toHaveBeenCalledWith({ _id: 'c'.repeat(24), active: true, verified: true, $or: [{ verificationStatus: 'APPROVED' }, { verificationStatus: { $exists: false } }], types: 'taxi_operator' });
  expect(lookup).toHaveBeenCalledWith(session);
  expect(create).toHaveBeenCalledWith([expect.objectContaining({
    customer: actor.id, business: 'c'.repeat(24), departure: input.departure, seats: 2, unitPrice: 45000,
  })], { session });
});

test('unavailable seat inventory never creates a booking', async () => {
  const { business, create } = persistence({ departureAvailable: false });
  await expect(bookSeats(actor, input)).rejects.toMatchObject({ status: 409 });
  expect(business).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

test('full taxis allocate the whole group to the next separately scheduled taxi at the quoted fare', async () => {
  const { session, decrement, create } = persistence();
  const selected = { _id: input.departure, business: 'c'.repeat(24), route: 'e'.repeat(24), vehicle: 'f'.repeat(24), startsAt: new Date(Date.now() + 86400000), price: 45000 };
  const next = { ...selected, _id: '2'.repeat(24), vehicle: '3'.repeat(24), startsAt: new Date(Date.now() + 90000000) };
  db.Departure.findOne.mockReturnValue({ session: async () => selected });
  decrement.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(next);
  await bookSeats(actor, input);
  expect(decrement).toHaveBeenLastCalledWith(expect.objectContaining({
    _id: { $ne: selected._id }, business: selected.business, route: selected.route,
    vehicle: { $ne: selected.vehicle }, price: selected.price, status: 'scheduled', remaining: { $gte: 2 },
    startsAt: { $gte: selected.startsAt, $gt: expect.any(Date) },
  }), { $inc: { remaining: -2 } }, { new: true, session, sort: { startsAt: 1, _id: 1 } });
  expect(create).toHaveBeenCalledWith([expect.objectContaining({ departure: next._id, vehicle: next.vehicle, startsAt: next.startsAt, seats: 2, unitPrice: 45000 })], { session });
});

test('a full route never invents a vehicle or splits a group when no scheduled taxi fits', async () => {
  const { decrement, create } = persistence({ departureAvailable: false });
  db.Departure.findOne.mockReturnValue({ session: async () => ({ _id: input.departure, business: 'c'.repeat(24), route: 'e'.repeat(24), vehicle: 'f'.repeat(24), startsAt: new Date(Date.now() + 86400000), price: 45000 }) });
  await expect(bookSeats(actor, { ...input, seats: 15 })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('No matching taxi') });
  expect(decrement).toHaveBeenCalledTimes(2);
  expect(create).not.toHaveBeenCalled();
});

test('passenger groups are capped at 15 and taxi registration defaults to 15', async () => {
  const decrement = jest.spyOn(db.Departure, 'findOneAndUpdate');
  await expect(bookSeats(actor, { ...input, seats: 16 })).rejects.toThrow();
  expect(decrement).not.toHaveBeenCalled();
  const vehicle = { business: 'c'.repeat(24), registration: 'TEST-001', documents: [] };
  expect(resources['transport/vehicles'].schema.parse(vehicle).capacity).toBe(15);
  expect(resources['transport/vehicles'].schema.safeParse({ ...vehicle, capacity: 16 }).success).toBe(false);
  expect(resources['transport/vehicles'].schema.parse({ ...vehicle, capacity: 10 }).capacity).toBe(10);
});

test('conditional seat writes enforce the 15 passenger ceiling even on a legacy larger departure', async () => {
  const { decrement } = persistence();
  await bookSeats(actor, { ...input, seats: 1 });
  expect(decrement.mock.calls[0][0].$expr).toEqual({ $lte: [{ $add: [{ $subtract: ['$capacity', '$remaining'] }, 1] }, { $min: ['$capacity', 15] }] });
  expect(taxiSeatsAvailable(20, 6)).toBe(1);
  expect(taxiSeatsAvailable(20, 5)).toBe(0);
  expect(taxiSeatsAvailable(10, 3)).toBe(3);
});

test('cancellation restores seats to the allocated taxi rather than the original selection', async () => {
  const { session, decrement } = persistence();
  const allocated = '2'.repeat(24);
  const save = jest.fn();
  jest.spyOn(db.Booking, 'findById').mockReturnValue({ session: async () => ({ _id: '4'.repeat(24), customer: actor.id, departure: allocated, seats: 2, status: 'confirmed', save }) });
  await cancelBooking(actor, '4'.repeat(24));
  expect(decrement).toHaveBeenCalledWith(expect.objectContaining({ _id: allocated }), { $inc: { remaining: 2 } }, { session });
  expect(save).toHaveBeenCalledWith({ session });
});
