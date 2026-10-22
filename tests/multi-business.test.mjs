import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import * as db from '../app/.server/database/models.ts';
import { handleApi } from '../app/.server/api.ts';
import { manage } from '../app/.server/shared/access.ts';
import { verifyBusiness } from '../app/.server/modules/admin.ts';
import { toolsPage } from '../app/.server/modules/business-tools.ts';
import { approvedBusiness, verificationStatus } from '../app/lib/business-registry.ts';
import { sessionCookie } from '../app/.server/modules/auth/auth.ts';
import { updateMyAssignment } from '../app/.server/modules/assignments.ts';
import { rentalUnits } from '../app/lib/rental-pricing.ts';

const actor = { id: 'a'.repeat(24), admin: false };
const business = 'b'.repeat(24);
const saved = { uri: process.env.MONGODB_URI, origin: process.env.APP_ORIGIN, db: mongoose.connection.db, geocodingKey: process.env.GEOAPIFY_API_KEY };
const chain = records => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => records });
let cookie;
beforeEach(async () => {
  process.env.MONGODB_URI = 'mongodb://unused-multi-business-test';
  delete process.env.GEOAPIFY_API_KEY;
  delete process.env.APP_ORIGIN;
  jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: actor.id });
  jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: actor.id, admin: false, active: true });
  cookie = await sessionCookie.serialize('1'.repeat(64));
});
afterEach(() => {
  jest.restoreAllMocks();
  mongoose.connection.db = saved.db;
  if (saved.geocodingKey === undefined) delete process.env.GEOAPIFY_API_KEY; else process.env.GEOAPIFY_API_KEY = saved.geocodingKey;
  for (const [key, value] of [['MONGODB_URI', saved.uri], ['APP_ORIGIN', saved.origin]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
async function call(path, method = 'GET', body) {
  return handleApi(new Request(`https://example.test/api/v1/${path}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), path.split('?')[0]);
}
const details = { name: 'Independent provider', description: 'A registered business', contact: { email: 'business@example.test', phone: '0123456789' }, locations: [{ address: 'Pretoria', province: 'Gauteng' }] };

test('a customer with zero businesses receives an empty list without being forced to register', async () => {
  jest.spyOn(db.Membership, 'distinct').mockResolvedValue([]);
  const read = jest.spyOn(db.Business, 'find').mockReturnValue(chain([]));
  const response = await call('businesses');
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual([]);
  expect(read).toHaveBeenCalledWith({ _id: { $in: [] } });
});

test('one customer registers multiple independently pending businesses of different types without platform role changes', async () => {
  mongoose.connection.db = { collection: () => ({}) };
  const file = new mongoose.Types.ObjectId('f'.repeat(24));
  jest.spyOn(mongoose.mongo.GridFSBucket.prototype, 'find').mockReturnValue({ toArray: async () => [{ _id: file }] });
  const session = {};
  const transaction = jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work(session));
  const created = [];
  jest.spyOn(db.Business, 'create').mockImplementation(async records => { const record = { _id: new mongoose.Types.ObjectId(), ...records[0] }; created.push(record); return [record]; });
  const membership = jest.spyOn(db.Membership, 'create').mockResolvedValue([{}]);
  const userWrite = jest.spyOn(db.User, 'findOneAndUpdate');
  for (const types of [['farm'], ['taxi_operator'], ['trailer_rental']]) {
    const response = await call('businesses', 'POST', { ...details, types, verificationDocuments: [{ file: String(file), name: 'Proof.pdf' }] });
    expect(response.status).toBe(201);
  }
  expect(created).toHaveLength(3);
  expect(new Set(created.map(record => String(record._id))).size).toBe(3);
  expect(created.every(record => record.owner === actor.id && record.verificationStatus === 'PENDING' && record.verified === false)).toBe(true);
  expect(membership).toHaveBeenCalledTimes(3);
  expect(transaction).toHaveBeenCalledTimes(3);
  expect(userWrite).not.toHaveBeenCalled();
});

test('new typed registration requires private verification documents and rejects role injection', async () => {
  const write = jest.spyOn(db.Business, 'create');
  expect((await call('businesses', 'POST', { ...details, types: ['farm'], kind: 'LIVESTOCK_FARMER' })).status).toBe(400);
  expect((await call('businesses', 'POST', { ...details, types: ['farm'], verified: true, admin: true })).status).toBe(400);
  expect(write).not.toHaveBeenCalled();
});

test('typed registration checks document ownership before creating the business', async () => {
  mongoose.connection.db = { collection: () => ({}) };
  const find = jest.spyOn(mongoose.mongo.GridFSBucket.prototype, 'find').mockReturnValue({ toArray: async () => [] });
  const write = jest.spyOn(db.Business, 'create');
  const response = await call('businesses', 'POST', { ...details, types: ['farm'], kind: 'AGRICULTURAL_SELLER', verificationDocuments: [{ file: 'c'.repeat(24), name: 'Proof.pdf' }] });
  expect(response.status).toBe(400);
  expect(find).toHaveBeenCalledWith({ _id: { $in: [new mongoose.Types.ObjectId('c'.repeat(24))] }, 'metadata.user': actor.id });
  expect(write).not.toHaveBeenCalled();
});

test.each(['REJECTED', 'SUSPENDED', 'UNDER_REVIEW', 'PENDING'])('%s businesses cannot operate even if an old verified flag is true', async status => {
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ active: true, verified: true, verificationStatus: status, types: ['farm'] });
  jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  await expect(manage(actor, business, 'farm')).rejects.toMatchObject({ status: 403 });
});

test('legacy verified records remain approved without rewriting them', () => {
  expect(verificationStatus({ verified: true })).toBe('APPROVED');
  expect(approvedBusiness({ verified: true, active: true })).toBe(true);
  expect(approvedBusiness({ verified: false, verificationStatus: 'APPROVED' })).toBe(false);
});

test('staff read permission never grants writes, other services, or another business', async () => {
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ active: true, verified: true, types: ['farm', 'trailer_rental'] });
  const exists = jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  jest.spyOn(db.Membership, 'findOne').mockResolvedValue({ role: 'staff', permissions: ['farm:read'] });
  await expect(manage(actor, business, 'farm', false, 'read')).resolves.toBeTruthy();
  await expect(manage(actor, business, 'farm')).rejects.toMatchObject({ status: 403 });
  await expect(manage(actor, business, 'trailer_rental', false, 'read')).rejects.toMatchObject({ status: 403 });
  exists.mockResolvedValue(null);
  await expect(manage(actor, 'd'.repeat(24), 'farm', false, 'read')).rejects.toMatchObject({ status: 403 });
});

test('business switching is membership scoped and shows only authorized tool navigation', async () => {
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ _id: business, active: true, verified: true, types: ['farm', 'taxi_operator'] });
  jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  jest.spyOn(db.Membership, 'findOne').mockResolvedValue({ role: 'staff', permissions: ['farm:read'] });
  jest.spyOn(db.Membership, 'distinct').mockResolvedValue([business, 'c'.repeat(24)]);
  const companies = [{ _id: business, name: 'Farm' }, { _id: 'c'.repeat(24), name: 'Taxi business' }];
  const selector = jest.spyOn(db.Business, 'find').mockReturnValue(chain(companies));
  jest.spyOn(db.Product, 'find').mockReturnValue(chain([]));
  jest.spyOn(db.Product, 'countDocuments').mockResolvedValue(0);
  const loaded = await toolsPage(actor, business, new URL('https://example.test/business'));
  expect(loaded.available).toEqual(['products', 'livestock', 'orders', 'enquiries']);
  expect(loaded.writable).toBe(false);
  expect(loaded.businesses).toEqual(companies);
  expect(selector.mock.calls[0][0]._id.$in).toEqual([business, 'c'.repeat(24)]);
});

test('verification affects only the selected business and records status, reviewer and reason', async () => {
  const session = {};
  const company = { _id: business, verified: true, verificationStatus: 'APPROVED', save: jest.fn() };
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work(session));
  jest.spyOn(db.BusinessReview, 'init').mockResolvedValue(db.BusinessReview);
  const lookup = jest.spyOn(db.Business, 'findById').mockReturnValue({ session: async () => company });
  jest.spyOn(db.Membership, 'exists').mockReturnValue({ session: async () => null });
  const audit = jest.spyOn(db.BusinessReview, 'create').mockResolvedValue([{}]);
  await verifyBusiness({ id: 'e'.repeat(24), admin: true }, business, { status: 'SUSPENDED', reason: 'Permit expired' });
  expect(company.verified).toBe(false);
  expect(company.verificationStatus).toBe('SUSPENDED');
  expect(lookup).toHaveBeenCalledWith(business);
  expect(audit).toHaveBeenCalledWith([expect.objectContaining({ business, status: 'SUSPENDED', previousStatus: 'APPROVED', reason: 'Permit expired' })], { session });
});

test('an administrator cannot approve their own business or one they belong to', async () => {
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work({}));
  jest.spyOn(db.BusinessReview, 'init').mockResolvedValue(db.BusinessReview);
  jest.spyOn(db.Business, 'findById').mockReturnValue({ session: async () => ({ _id: business, verified: false }) });
  jest.spyOn(db.Membership, 'exists').mockReturnValue({ session: async () => ({ _id: 'membership' }) });
  await expect(verifyBusiness({ ...actor, admin: true }, business, { status: 'APPROVED' })).rejects.toMatchObject({ status: 403 });
});

test('a taxi business owner still reserves another provider trailer as a customer', async () => {
  const companyAccess = jest.spyOn(db.Membership, 'findOne');
  jest.spyOn(db.Trailer, 'findOne').mockResolvedValue({ business, dailyPrice: 10000 });
  jest.spyOn(db.Business, 'exists').mockResolvedValue({});
  const create = jest.spyOn(db.Reservation, 'create').mockImplementation(async input => input);
  const response = await call('rentals/reservations', 'POST', { trailer: 'c'.repeat(24), start: new Date(Date.now() + 86400000), end: new Date(Date.now() + 172800000) });
  expect(response.status).toBe(201);
  expect(create.mock.calls[0][0].customer).toBe(actor.id);
  expect(companyAccess).not.toHaveBeenCalled();
});

test('drivers can update only records assigned through their own active driver profiles', async () => {
  jest.spyOn(db.Business, 'distinct').mockResolvedValue([business]);
  const drivers = jest.spyOn(db.Driver, 'distinct').mockResolvedValue(['c'.repeat(24)]);
  jest.spyOn(db.Vehicle, 'distinct').mockResolvedValue(['d'.repeat(24)]);
  const update = jest.spyOn(db.Delivery, 'findOneAndUpdate').mockResolvedValue(null);
  await expect(updateMyAssignment(actor, 'delivery', 'e'.repeat(24), { status: 'collected' })).rejects.toMatchObject({ status: 409 });
  expect(drivers).toHaveBeenCalledWith('_id', { user: actor.id, business: { $in: [business] }, active: { $ne: false } });
  expect(update).toHaveBeenCalledWith({ _id: 'e'.repeat(24), driver: { $in: ['c'.repeat(24)] }, business: { $in: [business] }, status: 'assigned' }, { $set: { status: 'collected' } }, { new: true });
  await expect(updateMyAssignment(actor, 'delivery', 'e'.repeat(24), { status: 'delivered' })).rejects.toMatchObject({ status: 400 });
});

test('staff cannot bypass write permissions through the resource API', async () => {
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ active: true, verified: true, types: ['taxi_operator'] });
  jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  jest.spyOn(db.Membership, 'findOne').mockResolvedValue({ role: 'staff', permissions: ['taxi_operator:read'] });
  const write = jest.spyOn(db.Vehicle, 'create');
  const response = await call('transport/vehicles', 'POST', { business, registration: 'TEST', capacity: 15, documents: [] });
  expect(response.status).toBe(403);
  expect(write).not.toHaveBeenCalled();
});

test.each([['hour', 3600001, 2], ['day', 86400001, 2], ['month', 31 * 86400000, 2]])('rental %s periods round up consistently', (unit, duration, expected) => {
  expect(rentalUnits(0, duration, unit)).toBe(expected);
  expect(rentalUnits(1, 0, unit)).toBe(0);
});

test('rental requests snapshot the selected offered rate and keep direct provider payment', async () => {
  jest.spyOn(db.Trailer, 'findOne').mockResolvedValue({ business, dailyPrice: 10000, hourlyPrice: 2000 });
  jest.spyOn(db.Business, 'exists').mockResolvedValue({});
  const create = jest.spyOn(db.Reservation, 'create').mockImplementation(async input => input);
  const start = Date.now() + 86400000;
  const response = await call('rentals/reservations', 'POST', { trailer: 'c'.repeat(24), rateUnit: 'hour', start: new Date(start), end: new Date(start + 5400000) });
  expect(response.status).toBe(201);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ customer: actor.id, rateUnit: 'hour', unitPrice: 2000, total: 4000 }));
  expect((await call('rentals/reservations', 'POST', { trailer: 'c'.repeat(24), rateUnit: 'month', start: new Date(start), end: new Date(start + 86400000) })).status).toBe(400);
});
