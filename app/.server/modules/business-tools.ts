import * as db from '../database/models';
import { manage, type Actor } from '../shared/access';
import { ApiError, id, page } from '../shared/http';

export const toolDefinitions = {
  products: { type: 'farm', model: db.Product, path: 'farming/products' },
  livestock: { type: 'farm', model: db.Livestock, path: 'farming/livestock' },
  orders: { type: 'farm', model: db.Order, path: 'farming/orders' },
  trailers: { type: 'trailer_rental', model: db.Trailer, path: 'rentals/trailers' },
  reservations: { type: 'trailer_rental', model: db.Reservation, path: 'rentals/reservations' },
  vehicles: { type: 'taxi_operator', model: db.Vehicle, path: 'transport/vehicles' },
  routes: { type: 'taxi_operator', model: db.Route, path: 'transport/routes' },
  departures: { type: 'taxi_operator', model: db.Departure, path: 'transport/departures' },
  bookings: { type: 'taxi_operator', model: db.Booking, path: 'transport/bookings' },
  deliveries: { type: 'logistics', model: db.Delivery, path: 'logistics/requests' },
  transportRequests: { type: 'commercial_transport', model: db.TransportRequest, path: 'business-transport/requests' },
} as const;
export type Tool = keyof typeof toolDefinitions;
export function toolKey(value: string): Tool {
  if (!Object.hasOwn(toolDefinitions, value)) throw new ApiError(404, 'Business tool not found');
  return value as Tool;
}
export async function businessTool(actor: Actor, businessId: string, tool: Tool) {
  if (!/^[a-f0-9]{24}$/i.test(businessId)) throw new ApiError(400, 'Invalid business identifier');
  return manage(actor, businessId, toolDefinitions[tool].type);
}
export async function toolsPage(actor: Actor, businessId: string, url: URL) {
  if (!/^[a-f0-9]{24}$/i.test(businessId)) throw new ApiError(400, 'Invalid business identifier');
  const company = await manage(actor, businessId);
  if (!company.verified) throw new ApiError(403, 'Business verification is required before using service tools');
  const available = (Object.keys(toolDefinitions) as Tool[]).filter(key => company.types.includes(toolDefinitions[key].type));
  const tool = toolKey(url.searchParams.get('tool') ?? available[0] ?? '');
  await businessTool(actor, businessId, tool);
  const { page: current, limit } = page.parse({ page: url.searchParams.get('page') ?? 1, limit: 20 });
  const model = toolDefinitions[tool].model;
  const [records, total, vehicles, routes] = await Promise.all([
    model.find({ business: businessId }).sort({ _id: -1 }).skip((current - 1) * limit).limit(limit).lean(),
    model.countDocuments({ business: businessId }),
    tool === 'departures' ? db.Vehicle.find({ business: businessId }).select('_id registration').lean() : [],
    tool === 'departures' ? db.Route.find({ business: businessId }).select('_id name').lean() : [],
  ]);
  return { business: company, available, tool, records, total, page: current, limit, vehicles, routes };
}
export async function toolMutation(actor: Actor, businessId: string, tool: Tool, recordId: string) {
  await businessTool(actor, businessId, tool);
  const record = await toolDefinitions[tool].model.findOne({ _id: id.parse(recordId), business: businessId });
  if (!record) throw new ApiError(404, 'Business record not found');
  return `${toolDefinitions[tool].path}/${recordId}`;
}
