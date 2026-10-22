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
  for (const model of [db.Product, db.Livestock, db.Order, db.BusinessEnquiry, db.Vehicle, db.Driver, db.Route, db.Departure, db.Booking]) jest.spyOn(model, 'countDocuments').mockResolvedValue(0);
  for (const model of [db.Order, db.Booking, db.Reservation, db.Quote]) jest.spyOn(model, 'aggregate').mockResolvedValue([]);
  jest.spyOn(db.Business, 'distinct').mockResolvedValue([]);
  jest.spyOn(db.Membership, 'find').mockReturnValue({ select() { return this; }, lean: async () => [] });
  jest.spyOn(db.Business, 'find').mockReturnValue({ select() { return this; }, lean: async () => [] });
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

test.each([true, false])('both admin roles render the Leaflet map shell without browser globals during SSR: %s', async superAdmin => {
  user.superAdmin = superAdmin;
  db.Business.find.mockReturnValue({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [{ _id: 'b'.repeat(24), name: 'Registered taxi operator', types: ['taxi_operator'], active: true, verified: true, locations: [{ address: 'Test street', province: 'Gauteng' }] }] });
  const response = await handle(await request('/admin/map'));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Interactive business locations map');
  expect(html).toContain('Registered taxi operator');
  expect(html).toContain('Needs coordinates');
  expect(html).toContain('Search businesses');
  expect(html).toContain('Business map');
  expect(html).not.toContain('GEOAPIFY_API_KEY');
});

test('approved taxi operators land in their business dashboard after sign-in', async () => {
  user.admin = false; user.superAdmin = false;
  const business = 'b'.repeat(24);
  db.Membership.find.mockReturnValue({ select() { return this; }, lean: async () => [{ business, role: 'owner' }] });
  db.Business.find.mockReturnValue({ select() { return this; }, lean: async () => [{ _id: business, name: 'Taxi operator', types: ['taxi_operator'] }] });
  const response = await handle(await request('/business?welcome=1'));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe(`/business/${business}/tools`);
});

test('approved business users opening customer pages are routed to their business overview', async () => {
  user.admin = false; user.superAdmin = false;
  const business = 'b'.repeat(24);
  db.Membership.find.mockReturnValue({ select() { return this; }, lean: async () => [{ business, role: 'owner' }] });
  db.Business.find.mockReturnValue({ select() { return this; }, lean: async () => [{ _id: business, name: 'Taxi operator', types: ['taxi_operator'] }] });
  const response = await handle(await request('/'));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe(`/business/${business}/tools`);
});

test('customers without an approved business keep the normal account landing', async () => {
  user.admin = false; user.superAdmin = false;
  const response = await handle(await request('/business?welcome=1'));
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('/account');
});

test('taxi driver management uses business navigation and exposes the add-driver form', async () => {
  user.admin = false; user.superAdmin = false;
  const business = 'b'.repeat(24);
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ _id: business, name: 'Taxi operator', active: true, verified: true, types: ['taxi_operator'] });
  jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  jest.spyOn(db.Membership, 'findOne').mockResolvedValue({ role: 'owner' });
  jest.spyOn(db.Membership, 'distinct').mockResolvedValue([business]);
  db.Business.find.mockReturnValue({ select() { return this; }, lean: async () => [{ _id: business, name: 'Taxi operator' }] });
  jest.spyOn(db.Driver, 'find').mockReturnValue({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] });
  jest.spyOn(db.Driver, 'countDocuments').mockResolvedValue(0);
  const response = await handle(await request(`/business/${business}/tools?tool=drivers`));
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of ['Business management', 'Taxi drivers', 'Vehicles', 'Taxi routes', 'Scheduled departures', 'Seat bookings', 'Existing driver account ID', 'Business overview']) expect(html).toContain(text);
  expect(html.replace(/<!--.*?-->/g, '')).toMatch(/Add\s+driver/);
  expect(html).not.toContain('YOUR EVERYDAY, CONNECTED');
  expect(html).not.toContain('Become a partner');
});

test('customer business registration is optional and includes distinct types and private verification uploads', async () => {
  user.admin = false; user.superAdmin = false;
  jest.spyOn(db.Membership, 'distinct').mockResolvedValue([]);
  jest.spyOn(db.Business, 'find').mockReturnValue({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] });
  const response = await handle(await request('/business'));
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of ['Business registration is optional', 'LIVESTOCK_FARMER', 'AGRICULTURAL_SELLER', 'TRAILER_RENTAL', 'TAXI_OPERATOR', 'LOGISTICS_PROVIDER', 'verificationDocuments', 'Return to personal marketplace']) expect(html).toContain(text);
  expect(html).not.toContain('Manage administrators');
});

test('business dashboards include a membership-scoped selector and business statistics', async () => {
  user.admin = false; user.superAdmin = false;
  db.Order.aggregate.mockResolvedValue([{ value: 12500 }]);
  const business = 'b'.repeat(24);
  jest.spyOn(db.Business, 'findOne').mockResolvedValue({ _id: business, name: 'Approved farm', active: true, verified: true, types: ['farm'] });
  jest.spyOn(db.Membership, 'exists').mockResolvedValue({});
  jest.spyOn(db.Membership, 'findOne').mockResolvedValue({ role: 'staff', permissions: ['farm:read'] });
  jest.spyOn(db.Membership, 'distinct').mockResolvedValue([business]);
  jest.spyOn(db.Business, 'find').mockReturnValue({ select() { return this; }, lean: async () => [{ _id: business, name: 'Approved farm' }] });
  jest.spyOn(db.Product, 'find').mockReturnValue({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] });
  jest.spyOn(db.Product, 'countDocuments').mockResolvedValue(0);
  const response = await handle(await request(`/business/${business}/tools`));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Switch business');
  expect(html).toContain('Business statistics');
  expect(html).toContain('aria-label="Color theme"');
  expect(html).toContain('Fulfilled order value');
  expect(html).toMatch(/R\s*125/);
  expect(html).toContain('Profit / loss: unavailable');
  expect(html).not.toContain('Personal marketplace');
  expect(html).toContain('Customer enquiries');
  expect(html).not.toContain('Add product');
  expect(html).not.toContain('Scheduled departures');
});

test('super administrators receive administration content without customer promotions', async () => {
  const response = await handle(await request('/admin'));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Your administration workspace.');
  expect(html).toContain('aria-label="Color theme"');
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

test('root revalidates cached role data on client navigation', () => {
  expect(build.routes.root.module.shouldRevalidate()).toBe(true);
});

test('account lookup failures do not silently render the customer marketplace', async () => {
  jest.spyOn(db.Session, 'findOne').mockRejectedValue(Object.assign(new Error('connection-details-must-not-leak'), { name: 'MongooseServerSelectionError' }));
  const response = await handle(await request('/'));
  expect(response.status).toBe(503);
  const html = await response.text();
  expect(html).toContain('Unable to verify your account');
  expect(html).not.toContain('Explore the marketplace');
  expect(html).not.toContain('connection-details-must-not-leak');
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
