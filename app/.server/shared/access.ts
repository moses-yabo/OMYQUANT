import { Business, Membership } from '../database/models';
import { ApiError } from './http';
export type Actor = { id: string; admin: boolean; superAdmin?: boolean };
export async function manage ( actor: Actor, business: unknown, type?: string, ownerOnly = false ) {
  const company = await Business.findOne( { _id: business, active: true } );
  if ( !company || ( type && !( company.types as string[] ).includes( type ) ) ) throw new ApiError( 403, 'Business is inactive or does not provide this service' );
  if ( !actor.admin && !await Membership.exists( { user: actor.id, business: String( business ), role: { $in: ownerOnly ? ['owner'] : ['owner', 'manager', 'staff'] } } ) ) throw new ApiError( 403, 'Business membership required' );
  if (type && !company.verified) throw new ApiError(403, 'Business verification is required before using service tools');
  return company;
}
export function owns ( actor: Actor, customer: unknown ) {
  if ( !actor.admin && String( customer ) !== actor.id ) throw new ApiError( 403, 'Resource belongs to another customer' );
}
