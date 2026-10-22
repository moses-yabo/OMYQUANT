import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import * as db from '../app/.server/database/models.ts';
import { businessQueue, businessReview, verifyBusiness, findAdminAccount, setAdminAccess, administrationOverview } from '../app/.server/modules/admin.ts';
import { requireAdminPage } from '../app/.server/admin-access.ts';
import { sessionCookie } from '../app/.server/modules/auth/auth.ts';
import { handleApi } from '../app/.server/api.ts';

const actor = { id: 'a'.repeat(24), admin: true };
const businessId = 'b'.repeat(24);
const initialUri = process.env.MONGODB_URI;

test('overview is restricted to super administrators and returns database counts and recent decisions', async () => {
  const businesses = jest.spyOn(db.Business, 'countDocuments').mockResolvedValueOnce(4).mockResolvedValueOnce(9);
  const users = jest.spyOn(db.User, 'countDocuments').mockResolvedValue(2);
  const query = { sort() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => [] };
  jest.spyOn(db.BusinessReview, 'find').mockReturnValue(query);
  await expect(administrationOverview(actor)).rejects.toMatchObject({ status: 403 });
  expect(businesses).not.toHaveBeenCalled();
  await expect(administrationOverview({ ...actor, superAdmin: true })).resolves.toEqual({ pending: 4, verified: 9, administrators: 2, recent: [] });
  expect(users).toHaveBeenCalledWith({ active: true, admin: true, superAdmin: { $ne: true } });
});
test('regular administrators cannot find accounts or grant roles', async () => {
  const read = jest.spyOn(db.User, 'findOne');
  const write = jest.spyOn(db.User, 'findOneAndUpdate');
  await expect(findAdminAccount(actor, 'person@example.com')).rejects.toMatchObject({ status: 403 });
  await expect(setAdminAccess(actor, businessId, { admin: true })).rejects.toMatchObject({ status: 403 });
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
test('super administrators can grant and revoke regular roles with atomic super admin protection', async () => {
  const write = jest.spyOn(db.User, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: businessId, admin: true }) });
  jest.spyOn(db.AdminAccessReview, 'init').mockResolvedValue(db.AdminAccessReview);
  jest.spyOn(db.AdminAccessReview, 'create').mockResolvedValue([{}]);
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work({}));
  const superActor = { ...actor, superAdmin: true };
  for (const admin of [true, false]) {
    await setAdminAccess(superActor, businessId, { admin });
    expect(write).toHaveBeenLastCalledWith({ _id: businessId, active: true, superAdmin: { $ne: true } }, { $set: { admin } }, { new: true, runValidators: true, session: {} });
  }
  write.mockReturnValue({ select: async () => null });
  await expect(setAdminAccess(superActor, actor.id, { admin: false })).rejects.toMatchObject({ status: 409 });
  await expect(setAdminAccess(superActor, businessId, { admin: true, superAdmin: true })).rejects.toThrow();
});
beforeEach(() => { process.env.MONGODB_URI = 'mongodb://unused-in-admin-test'; jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose); jest.spyOn(db.Membership, 'exists').mockReturnValue({ session: async () => null }); });
afterEach(() => { jest.restoreAllMocks(); if (initialUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = initialUri; });

test('all admin business services reject normal business owners before querying records', async () => {
  const nonAdmin = { ...actor, admin: false };
  const read = jest.spyOn(db.Business, 'find');
  await expect(businessQueue(nonAdmin, new URL('https://example.test/api/v1/admin/businesses'))).rejects.toMatchObject({ status: 403 });
  await expect(businessReview(nonAdmin, businessId)).rejects.toMatchObject({ status: 403 });
  await expect(verifyBusiness(nonAdmin, businessId, { verified: true })).rejects.toMatchObject({ status: 403 });
  expect(read).not.toHaveBeenCalled();
});
test('admin pages redirect anonymous users and reject non-admin server sessions', async () => {
  await expect(requireAdminPage(new Request('https://example.test/admin'))).rejects.toMatchObject({ status: 302 });
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: actor.id });
  const find = jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: actor.id, active: true, admin: false });
  const request = new Request('https://example.test/admin', { headers: { Cookie: await sessionCookie.serialize('1'.repeat(64)) } });
  await expect(requireAdminPage(request)).rejects.toMatchObject({ status: 403 });
  find.mockResolvedValue({ _id: actor.id, active: true, admin: true });
  await expect(requireAdminPage(request)).resolves.toEqual(actor);
});
test('admin API cannot be accessed with only a normal authenticated account', async () => {
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: actor.id });
  jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: actor.id, active: true, admin: false });
  const cookie = await sessionCookie.serialize('1'.repeat(64));
  for (const path of ['admin/businesses', `admin/businesses/${businessId}`]) {
    const response = await handleApi(new Request(`https://example.test/api/v1/${path}`, { headers: { Cookie: cookie } }), path);
    expect(response.status).toBe(403);
  }
  const response = await handleApi(new Request(`https://example.test/api/v1/businesses/${businessId}/verification`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ verified: true }) }), `businesses/${businessId}/verification`);
  expect(response.status).toBe(403);
});

test('regular admin sessions cannot use role-management API endpoints', async () => {
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: actor.id });
  jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: actor.id, active: true, admin: true });
  const cookie = await sessionCookie.serialize('1'.repeat(64));
  const read = await handleApi(new Request('https://example.test/api/v1/admin/users?email=person@example.com', { headers: { Cookie: cookie } }), 'admin/users');
  expect(read.status).toBe(403);
  const path = `users/${businessId}/permissions`;
  const write = await handleApi(new Request(`https://example.test/api/v1/${path}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: true }) }), path);
  expect(write.status).toBe(403);
});
test('verification change and reviewer audit use the same transaction', async () => {
  const session = { unitTest: true };
  const save = jest.fn().mockResolvedValue(undefined);
  const business = { _id: businessId, verified: false, save };
  jest.spyOn(db.BusinessReview, 'init').mockResolvedValue(db.BusinessReview);
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work(session));
  jest.spyOn(db.Business, 'findById').mockReturnValue({ session: async () => business });
  const audit = jest.spyOn(db.BusinessReview, 'create').mockResolvedValue([{}]);
  await expect(verifyBusiness(actor, businessId, { verified: true, reason: 'Details reviewed' })).resolves.toMatchObject({ verified: true });
  expect(save).toHaveBeenCalledWith({ session });
  expect(audit).toHaveBeenCalledWith([{ business: businessId, reviewer: actor.id, verified: true, previousStatus: 'PENDING', status: 'APPROVED', reason: 'Details reviewed' }], { session });
  await expect(verifyBusiness(actor, businessId, { verified: true })).rejects.toMatchObject({ status: 409 });
});
test('missing businesses and invalid review inputs cannot create audit decisions', async () => {
  jest.spyOn(db.BusinessReview, 'init').mockResolvedValue(db.BusinessReview);
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work({}));
  jest.spyOn(db.Business, 'findById').mockReturnValue({ session: async () => null });
  const audit = jest.spyOn(db.BusinessReview, 'create');
  await expect(verifyBusiness(actor, businessId, { verified: true })).rejects.toMatchObject({ status: 404 });
  await expect(verifyBusiness(actor, businessId, { verified: true, admin: true })).rejects.toThrow();
  expect(audit).not.toHaveBeenCalled();
});
