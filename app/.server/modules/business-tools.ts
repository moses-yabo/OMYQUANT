import * as db from '../database/models';
import { manage, type Actor } from '../shared/access';
import { ApiError, id, page } from '../shared/http';
import { approvedBusiness, hasBusinessPermission, approvedBusinessFilter } from '../../lib/business-registry';

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
