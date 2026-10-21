import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import * as db from '../app/.server/database/models.ts';
import { createComplaint, complaintQueue, complaintDetail, updateComplaint } from '../app/.server/modules/support.ts';
import { handleApi } from '../app/.server/api.ts';
import { sessionCookie } from '../app/.server/modules/auth/auth.ts';
import { supportEvents } from '../scripts/support-events.ts';

const reporter = { id: 'a'.repeat(24), admin: false };
const administrator = { id: 'b'.repeat(24), admin: true };
const ticketId = 'c'.repeat(24);
const transactionId = 'd'.repeat(24);
const originalUri = process.env.MONGODB_URI;
beforeEach(() => { process.env.MONGODB_URI = 'mongodb://unused-support-tests'; jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose); });
afterEach(() => { jest.restoreAllMocks(); if (originalUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = originalUri; });
const complaint = { subject: 'Goods arrived spoiled', category: 'spoiled_goods', description: 'The vegetables arrived spoiled and damaged.' };
test('short chat messages persist as support cases and only publish an opaque activity signal', async () => {
  const create = jest.spyOn(db.SupportTicket, 'create').mockResolvedValue({ _id: ticketId });
  const changed = jest.fn();
  supportEvents.once('changed', changed);
  await createComplaint(reporter, { category: 'other', subject: 'Chat: Hi', description: 'Hi', channel: 'chat' });
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ channel: 'chat', description: 'Hi', reporter: reporter.id }));
  expect(changed).toHaveBeenCalledWith({ ticketId, reporter: reporter.id });
  await expect(createComplaint(reporter, { ...complaint, description: 'Hi' })).rejects.toThrow();
});
function query(value) { return { populate() { return this; }, select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value }; }

test('complaints are owned by the authenticated reporter and reject forged status or identity', async () => {
  const create = jest.spyOn(db.SupportTicket, 'create').mockResolvedValue({ _id: ticketId });
  await createComplaint(reporter, complaint);
  expect(create).toHaveBeenCalledWith({ ...complaint, reporter: reporter.id });
  for (const extra of [{ reporter: administrator.id }, { status: 'resolved' }, { history: [] }]) await expect(createComplaint(reporter, { ...complaint, ...extra })).rejects.toThrow();
  expect(create).toHaveBeenCalledTimes(1);
});

test('only transaction customers or business members may link an existing transaction', async () => {
  const record = jest.spyOn(db.Order, 'findById').mockReturnValue(query({ customer: administrator.id, business: 'e'.repeat(24) }));
  const member = jest.spyOn(db.Membership, 'exists').mockResolvedValue(null);
  const create = jest.spyOn(db.SupportTicket, 'create').mockResolvedValue({ _id: ticketId });
  const input = { ...complaint, relatedKind: 'order', relatedId: transactionId };
  await expect(createComplaint(reporter, input)).rejects.toMatchObject({ status: 403 });
  expect(create).not.toHaveBeenCalled();
  member.mockResolvedValue({ _id: 'membership' });
  await expect(createComplaint(reporter, input)).resolves.toMatchObject({ _id: ticketId });
  record.mockReturnValue(query({ customer: reporter.id }));
  member.mockResolvedValue(null);
  await expect(createComplaint(reporter, input)).resolves.toMatchObject({ _id: ticketId });
  await expect(createComplaint(reporter, { ...complaint, relatedId: transactionId })).rejects.toThrow();
});

test('non-admin queue queries are restricted to the reporter; admin access is checked first', async () => {
  const find = jest.spyOn(db.SupportTicket, 'find').mockReturnValue(query([]));
  jest.spyOn(db.SupportTicket, 'countDocuments').mockResolvedValue(0);
  await complaintQueue(reporter, new URL('https://example.test/api/v1/support?status=all'));
  expect(find).toHaveBeenCalledWith({ reporter: reporter.id });
  find.mockClear();
  await expect(complaintQueue(reporter, new URL('https://example.test/api/v1/admin/support'), true)).rejects.toMatchObject({ status: 403 });
  expect(find).not.toHaveBeenCalled();
  await complaintQueue(administrator, new URL('https://example.test/api/v1/admin/support?category=sick_livestock'), true);
  expect(find).toHaveBeenCalledWith({ status: { $in: ['open', 'in_review'] }, category: 'sick_livestock' });
});

test('private investigation notes never appear in a reporter response', async () => {
  const find = jest.spyOn(db.SupportTicket, 'findOne').mockReturnValue(query({ _id: ticketId, history: [{ text: 'Public reply', internal: false }, { text: 'Private investigation details', internal: true }] }));
  const own = await complaintDetail(reporter, ticketId);
  expect(find).toHaveBeenCalledWith({ _id: ticketId, reporter: reporter.id });
  expect(own.history).toEqual([{ text: 'Public reply', internal: false }]);
  const staff = await complaintDetail(administrator, ticketId, true);
  expect(staff.history).toHaveLength(2);
  find.mockReturnValue(query(null));
  await expect(complaintDetail(reporter, ticketId)).rejects.toMatchObject({ status: 404 });
});

test('customers cannot set complaint status, impersonate staff or add private notes', async () => {
  const write = jest.spyOn(db.SupportTicket, 'findOneAndUpdate');
  for (const extra of [{ internal: true }, { status: 'closed' }]) await expect(updateComplaint(reporter, ticketId, { message: 'Please help', version: 0, ...extra })).rejects.toMatchObject({ status: 403 });
  await expect(updateComplaint(reporter, ticketId, { message: 'Please help', version: 0 }, true)).rejects.toMatchObject({ status: 403 });
  expect(write).not.toHaveBeenCalled();
});

test('staff updates atomically record status, author, visibility and version', async () => {
  const write = jest.spyOn(db.SupportTicket, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: ticketId }) });
  await updateComplaint(administrator, ticketId, { message: 'Investigating the delivery', version: 3, status: 'in_review', internal: true }, true);
  expect(write).toHaveBeenCalledWith({ _id: ticketId, version: 3, 'history.99': { $exists: false } }, {
    $set: { status: 'in_review' }, $inc: { version: 1 }, $push: { history: { author: administrator.id, text: 'Investigating the delivery', internal: true, status: 'in_review', createdAt: expect.any(Date) } },
  }, { new: true, runValidators: true });
  write.mockReturnValue({ select: async () => null });
  await expect(updateComplaint(administrator, ticketId, { message: 'Stale update', version: 3 }, true)).rejects.toMatchObject({ status: 409 });
});

test('reporter follow-up reopens a resolved case and remains scoped to its owner', async () => {
  jest.spyOn(db.SupportTicket, 'findOne').mockReturnValue(query({ status: 'resolved' }));
  const write = jest.spyOn(db.SupportTicket, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: ticketId }) });
  await updateComplaint(reporter, ticketId, { message: 'The problem is still unresolved', version: 4 });
  expect(write.mock.calls[0][0]).toMatchObject({ reporter: reporter.id, version: 4 });
  expect(write.mock.calls[0][1].$set).toEqual({ status: 'open' });
});

test('support API protects admin queue access while allowing a customer complaint', async () => {
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: reporter.id });
  jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: reporter.id, active: true, admin: false });
  const cookie = await sessionCookie.serialize('1'.repeat(64));
  const denied = await handleApi(new Request('https://example.test/api/v1/admin/support', { headers: { Cookie: cookie } }), 'admin/support');
  expect(denied.status).toBe(403);
  jest.spyOn(db.SupportTicket, 'create').mockResolvedValue({ _id: ticketId });
  const created = await handleApi(new Request('https://example.test/api/v1/support', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(complaint) }), 'support');
  expect(created.status).toBe(201);
  const anonymous = await handleApi(new Request('https://example.test/api/v1/support'), 'support');
  expect(anonymous.status).toBe(401);
});
