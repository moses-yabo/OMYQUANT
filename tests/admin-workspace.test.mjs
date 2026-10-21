import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { createRequestHandler } from 'react-router';
import * as build from '../build/server/index.js';
import * as db from '../app/.server/database/models.ts';
import { sessionCookie } from '../app/.server/modules/auth/auth.ts';

const handle = createRequestHandler(build, 'production');
const saved = { uri: process.env.MONGODB_URI, demo: process.env.DEMO_MODE };
let user;
beforeEach(() => {
  process.env.MONGODB_URI = 'mongodb://unused-workspace-test';
  process.env.DEMO_MODE = 'false';
  user = { _id: 'a'.repeat(24), name: 'Platform owner', active: true, admin: true, superAdmin: true };
  jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: user._id });
  jest.spyOn(db.User, 'findOne').mockImplementation(async () => user);
  jest.spyOn(db.User, 'findById').mockImplementation(async () => user);
  jest.spyOn(db.User, 'countDocuments').mockResolvedValue(2);
  jest.spyOn(db.Business, 'countDocuments').mockResolvedValue(3);
  jest.spyOn(db.Business, 'distinct').mockResolvedValue([]);
  const query = () => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => [] });
  for (const model of [db.BusinessReview, db.Product, db.Livestock, db.Trailer, db.Departure]) jest.spyOn(model, 'find').mockImplementation(query);
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of [['MONGODB_URI', saved.uri], ['DEMO_MODE', saved.demo]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
async function request(path) { return new Request(`https://example.test${path}`, { headers: { Cookie: await sessionCookie.serialize('1'.repeat(64)) } }); }

test('super administrators receive administration content without customer promotions', async () => {
  const response = await handle(await request('/admin'));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Your administration workspace.');
  expect(html).toContain('Manage administrators');
  expect(html).toContain('Verify businesses');
  expect(html).toContain('Recent business decisions');
  expect(html).toContain('Sign out');
  for (const text of ['List your business', 'Explore marketplace', 'Become a partner', 'Saved listings', 'Need group transport?', 'Grow with OMYQUANT']) expect(html).not.toContain(text);
});
test('super administrators opening the marketplace land in their workspace', async () => {
  const response = await handle(await request('/'));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('/admin');
});
test('regular administrators retain their business verification destination', async () => {
  user.superAdmin = false;
  const response = await handle(await request('/admin'));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('/admin/businesses');
});
test('workspace sign out clears the session and redirects to login', async () => {
  const remove = jest.spyOn(db.Session, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
  const req = await request('/account');
  const response = await handle(new Request(req.url, { method: 'POST', headers: { Cookie: req.headers.get('Cookie'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=logout' }));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('/login');
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  expect(remove).toHaveBeenCalled();
});

test.each([true, false])('both admin roles can render the support queue (super admin: %s)', async superAdmin => {
  user.superAdmin = superAdmin;
  const chain = { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  jest.spyOn(db.SupportTicket, 'find').mockReturnValue(chain);
  jest.spyOn(db.SupportTicket, 'countDocuments').mockResolvedValue(0);
  const response = await handle(await request('/admin/support'));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Complaint queue');
  expect(html).not.toContain('Chat with support');
  expect(html).toContain('Verify businesses');
  expect(html).not.toContain('List your business');
  expect(html).not.toContain('Explore marketplace');
  if (!superAdmin) expect(html).not.toContain('Manage administrators');
});

test('reporter support page strips private notes from rendered HTML and serialized route data', async () => {
  user.superAdmin = false;
  user.admin = false;
  const ticketId = 'c'.repeat(24);
  const ticket = { _id: ticketId, reporter: { name: user.name }, subject: 'Damaged delivery', category: 'damaged_delivery', status: 'in_review', description: 'The delivery arrived broken.', version: 2, createdAt: new Date().toISOString(), history: [{ _id: 'public', author: { name: 'Support' }, text: 'We are investigating', internal: false, createdAt: new Date().toISOString() }, { _id: 'private', author: { name: 'Support' }, text: 'PRIVATE_STAFF_ONLY_DETAILS', internal: true, createdAt: new Date().toISOString() }] };
  const chain = { populate() { return this; }, lean: async () => ticket };
  jest.spyOn(db.SupportTicket, 'findOne').mockReturnValue(chain);
  const response = await handle(await request(`/support/${ticketId}`));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('We are investigating');
  expect(html).not.toContain('PRIVATE_STAFF_ONLY_DETAILS');
  expect(html).toContain('Chat with support');
  expect(html).not.toContain('Internal staff note');
});

test('customer support form submits through the authenticated route action', async () => {
  user.superAdmin = false;
  user.admin = false;
  const create = jest.spyOn(db.SupportTicket, 'create').mockResolvedValue({ _id: 'c'.repeat(24) });
  const req = await request('/support');
  const response = await handle(new Request(req.url, { method: 'POST', headers: { Cookie: req.headers.get('Cookie'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ category: 'sick_livestock', subject: 'Livestock condition', description: 'The delivered livestock seems unwell.' }) }));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe(`/support/${'c'.repeat(24)}?saved=1`);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ reporter: user._id, category: 'sick_livestock' }));
});
