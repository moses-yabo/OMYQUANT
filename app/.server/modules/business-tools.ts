import * as db from '../database/models';
import { manage, type Actor } from '../shared/access';
import { ApiError, id, page } from '../shared/http';
import { approvedBusiness, hasBusinessPermission, approvedBusinessFilter } from '../../lib/business-registry';
import mongoose from 'mongoose';

export const toolDefinitions = {
  products: { type: 'farm', model: db.Product, path: 'farming/products' },
  livestock: { type: 'farm', model: db.Livestock, path: 'farming/livestock' },
  orders: { type: 'farm', model: db.Order, path: 'farming/orders' },
  enquiries: { type: 'farm', model: db.BusinessEnquiry, path: 'farming/enquiries' },
  trailers: { type: 'trailer_rental', model: db.Trailer, path: 'rentals/trailers' },
  reservations: { type: 'trailer_rental', model: db.Reservation, path: 'rentals/reservations' },
  vehicles: { type: 'taxi_operator', model: db.Vehicle, path: 'transport/vehicles' },
  drivers: { type: 'taxi_operator', model: db.Driver, path: 'transport/drivers' },
  deliveryVehicles: { type: 'logistics', model: db.Vehicle, path: 'logistics/vehicles' },
  deliveryPersonnel: { type: 'logistics', model: db.Driver, path: 'logistics/drivers' },
  routes: { type: 'taxi_operator', model: db.Route, path: 'transport/routes' },
  departures: { type: 'taxi_operator', model: db.Departure, path: 'transport/departures' },
  bookings: { type: 'taxi_operator', model: db.Booking, path: 'transport/bookings' },
  deliveries: { type: 'logistics', model: db.Delivery, path: 'logistics/requests' },
  deliveryRequests: { type: 'logistics', model: db.Delivery, path: 'logistics/requests' },
  transportRequests: { type: 'commercial_transport', model: db.TransportRequest, path: 'business-transport/requests' },
} as const;
export type Tool = keyof typeof toolDefinitions;
export type BusinessStatistic = { tool: Tool; count: number; detail: string; label?: string; format?: 'money' };
export async function businessStatistics(business: string, tools: Tool[]) {
  const current: BusinessStatistic[] = await Promise.all(tools.filter(tool => tool !== 'deliveryRequests').map(async tool => {
    const filters: Record<string, Record<string, unknown>> = { bookings: { status: 'confirmed' }, departures: { status: 'scheduled', startsAt: { $gt: new Date() } }, reservations: { status: { $in: ['confirmed', 'picked_up'] } }, orders: { status: { $in: ['placed', 'accepted'] } }, deliveries: { status: { $in: ['assigned', 'collected'] } } };
    const detail: Record<string, string> = { bookings: 'Confirmed passenger reservations', departures: 'Upcoming scheduled trips', reservations: 'Reserved or currently rented', orders: 'Open customer orders', deliveries: 'Active assigned deliveries' };
    return { tool, count: await toolDefinitions[tool].model.countDocuments({ business, ...filters[tool] }), detail: detail[tool] ?? 'Total business records' };
  }));
  const businessId = new mongoose.Types.ObjectId(business);
  const completed: Promise<BusinessStatistic>[] = [];
  const count = (tool: Tool, label: string, filter: Record<string, unknown>, detail: string) => completed.push(toolDefinitions[tool].model.countDocuments({ business, ...filter }).then(value => ({ tool, label, count: value, detail })));
  const sum = (tool: Tool, label: string, filter: Record<string, unknown>, expression: unknown, detail: string, money = true) => completed.push(toolDefinitions[tool].model.aggregate([
    { $match: { business: businessId, ...filter } }, { $group: { _id: null, value: { $sum: expression } } },
  ]).then(rows => ({ tool, label, count: Number(rows[0]?.value ?? 0), detail, ...(money ? { format: 'money' as const } : {}) })));
  if (tools.includes('departures')) count('departures', 'Trips completed', { status: 'completed' }, 'Trips marked completed by your operator or assigned driver');
  if (tools.includes('bookings')) {
    completed.push(db.Booking.aggregate([
      { $match: { business: businessId, status: 'confirmed' } },
      { $lookup: { from: db.Departure.collection.name, localField: 'departure', foreignField: '_id', as: 'trip' } },
      { $unwind: '$trip' }, { $match: { 'trip.business': businessId, 'trip.status': 'completed' } },
      { $group: { _id: null, value: { $sum: { $multiply: ['$seats', '$unitPrice'] } } } },
    ]).then(rows => ({ tool: 'bookings', label: 'Completed trip booking value', count: Number(rows[0]?.value ?? 0), format: 'money', detail: 'Confirmed seats on completed trips. Fare value, not verified money received or profit.' })));
    sum('bookings', 'Cancelled booking value', { status: 'cancelled' }, { $multiply: ['$seats', '$unitPrice'] }, 'Cancelled fares; not an expense or a recorded financial loss.');
  }
  if (tools.includes('orders')) {
    count('orders', 'Orders fulfilled', { status: 'fulfilled' }, 'Completed customer orders, including collection and delivery');
    sum('orders', 'Product units fulfilled', { status: 'fulfilled' }, { $sum: { $map: { input: { $filter: { input: '$items', as: 'line', cond: { $eq: ['$line.kind', 'product'] } } }, as: 'item', in: '$item.quantity' } } }, 'Quantities across fulfilled orders; units can differ between listings.', false);
    completed.push(db.Order.aggregate([
      { $match: { business: businessId, status: { $ne: 'cancelled' }, fulfilment: 'delivery' } },
      { $lookup: { from: db.Delivery.collection.name, localField: 'deliveryRequest', foreignField: '_id', as: 'delivery' } },
      { $unwind: '$delivery' }, { $match: { 'delivery.status': 'delivered', $expr: { $eq: ['$delivery.order', '$_id'] } } },
      { $group: { _id: null, value: { $sum: { $sum: { $map: { input: { $filter: { input: '$items', as: 'line', cond: { $eq: ['$line.kind', 'product'] } } }, as: 'item', in: '$item.quantity' } } } } } },
    ]).then(rows => ({ tool: 'orders', label: 'Product units delivered', count: Number(rows[0]?.value ?? 0), detail: 'Quantities on linked delivery jobs marked delivered. Excludes collections and cancelled orders; listing units may differ.' })));
    sum('orders', 'Fulfilled order value', { status: 'fulfilled' }, '$total', 'Recorded sales value. Payment receipt and costs are not verified.');
    sum('orders', 'Cancelled order value', { status: 'cancelled' }, '$total', 'Cancelled order value; not an expense or an actual loss.');
  }
  if (tools.includes('reservations')) {
    count('reservations', 'Trailers rented', { status: { $in: ['picked_up', 'returned'] } }, 'Rental transactions that reached pickup, including returned rentals');
    count('reservations', 'Rentals completed', { status: 'returned' }, 'Trailers marked returned');
    sum('reservations', 'Completed rental value', { status: 'returned' }, '$total', 'Agreed rental value. Customers pay the provider directly; this is not verified income.');
    sum('reservations', 'Rental payments reported', { status: { $in: ['confirmed', 'picked_up', 'returned'] }, 'externalPayment.verification': 'business_reported' }, '$externalPayment.amount', 'Payments reported by the business, not independently verified.');
    sum('reservations', 'Cancelled rental value', { status: 'cancelled' }, '$total', 'Cancelled request value; not an expense or an actual loss.');
  }
  if (tools.includes('deliveries')) {
    count('deliveries', 'Deliveries completed', { status: 'delivered' }, 'Delivery jobs marked delivered');
    count('deliveries', 'Agricultural deliveries completed', { status: 'delivered', goodsType: 'agricultural' }, 'Completed agricultural delivery jobs, not individual product quantities');
    completed.push(db.Quote.aggregate([
      { $match: { business: businessId, status: 'accepted' } },
      { $lookup: { from: db.Delivery.collection.name, localField: 'request', foreignField: '_id', as: 'delivery' } },
      { $unwind: '$delivery' }, { $match: { 'delivery.business': businessId, 'delivery.status': 'delivered' } },
      { $group: { _id: '$request', value: { $first: '$price' } } }, { $group: { _id: null, value: { $sum: '$value' } } },
    ]).then(rows => ({ tool: 'deliveries', label: 'Completed delivery quote value', count: Number(rows[0]?.value ?? 0), format: 'money', detail: 'Accepted quote value for completed jobs. Payment receipt and costs are not tracked.' })));
  }
  return [...current, ...await Promise.all(completed)];
}
export function toolKey(value: string): Tool {
  if (!Object.hasOwn(toolDefinitions, value)) throw new ApiError(404, 'Business tool not found');
  return value as Tool;
}
export async function businessTool(actor: Actor, businessId: string, tool: Tool, operation: 'read' | 'write' = 'write') {
  if (!/^[a-f0-9]{24}$/i.test(businessId)) throw new ApiError(400, 'Invalid business identifier');
  return manage(actor, businessId, toolDefinitions[tool].type, false, operation);
}
export async function toolsPage(actor: Actor, businessId: string, url: URL) {
  if (!/^[a-f0-9]{24}$/i.test(businessId)) throw new ApiError(400, 'Invalid business identifier');
  const company = await manage(actor, businessId);
  if (!approvedBusiness(company)) throw new ApiError(403, 'Business verification is required before using service tools');
  const member = actor.admin ? { role: 'manager' } : await db.Membership.findOne({ user: actor.id, business: businessId });
  const available = (Object.keys(toolDefinitions) as Tool[]).filter(key => company.types.includes(toolDefinitions[key].type) && member && hasBusinessPermission(member, toolDefinitions[key].type, 'read'));
  const tool = toolKey(url.searchParams.get('tool') ?? available[0] ?? '');
  await businessTool(actor, businessId, tool, 'read');
  const writable = Boolean(member && hasBusinessPermission(member, toolDefinitions[tool].type, 'write'));
  const { page: current, limit } = page.parse({ page: url.searchParams.get('page') ?? 1, limit: 20 });
  const model = toolDefinitions[tool].model;
  const filter = tool === 'deliveryRequests' ? { status: 'requested' } : { business: businessId };
  const [records, total, vehicles, routes, drivers] = await Promise.all([
    model.find(filter).select(tool === 'deliveryRequests' ? '_id pickup.province dropoff.province goodsType weightKg' : '').sort({ _id: -1 }).skip((current - 1) * limit).limit(limit).lean(),
    model.countDocuments(filter),
    ['departures', 'deliveries'].includes(tool) ? db.Vehicle.find({ business: businessId, active: { $ne: false } }).select('_id registration').lean() : [],
    tool === 'departures' ? db.Route.find({ business: businessId }).select('_id name').lean() : [],
    ['vehicles', 'deliveryVehicles', 'deliveries'].includes(tool) ? db.Driver.find({ business: businessId, active: { $ne: false } }).select('_id user').lean() : [],
  ]);
  const businesses = await db.Business.find({ _id: { $in: await db.Membership.distinct('business', { user: actor.id }) }, ...approvedBusinessFilter() }).select('_id name').lean();
  return { business: company, businesses, writable, available, tool, records, total, page: current, limit, vehicles, routes, drivers };
}
export async function toolMutation(actor: Actor, businessId: string, tool: Tool, recordId: string) {
  await businessTool(actor, businessId, tool);
  const record = await toolDefinitions[tool].model.findOne({ _id: id.parse(recordId), ...(tool === 'deliveryRequests' ? { status: 'requested' } : { business: businessId }) });
  if (!record) throw new ApiError(404, 'Business record not found');
  return `${toolDefinitions[tool].path}/${recordId}${tool === 'deliveryRequests' ? '/quotes' : ''}`;
}
