import { Business, Membership } from '../database/models';
import { ApiError } from './http';
import { approvedBusiness, hasBusinessPermission } from '../../lib/business-registry';
export type Actor = { id: string; admin: boolean; superAdmin?: boolean };
export async function manage ( actor: Actor, business: unknown, type?: string, ownerOnly = false, operation: 'read' | 'write' = 'write' ) {
  const company = await Business.findOne( { _id: business, ...(type ? { active: true } : {}) } );
  if ( !company || ( type && !( company.types as string[] ).includes( type ) ) ) throw new ApiError( 403, 'Business is inactive or does not provide this service' );
  if ( !actor.admin && !await Membership.exists( { user: actor.id, business: String( business ), role: { $in: ownerOnly ? ['owner'] : ['owner', 'manager', 'staff'] } } ) ) throw new ApiError( 403, 'Business membership required' );
  if (type && !approvedBusiness(company)) throw new ApiError(403, 'Business verification is required before using service tools');
  if (type && !actor.admin) {
    const member = await Membership.findOne({ user: actor.id, business: String(business) });
    if (!member || !hasBusinessPermission(member, type, operation)) throw new ApiError(403, 'This business membership does not permit this operation');
  }
  return company;
}
export function owns ( actor: Actor, customer: unknown ) {
  if ( !actor.admin && String( customer ) !== actor.id ) throw new ApiError( 403, 'Resource belongs to another customer' );
}
export async function manageImages(actor: Actor, business: string) {
  const company = await manage(actor, business);
  if (!approvedBusiness(company)) throw new ApiError(403, 'Business approval is required before uploading listing images');
  const member = actor.admin ? { role: 'manager' } : await Membership.findOne({ user: actor.id, business });
  if (!member || !company.types.some((type: string) => hasBusinessPermission(member, type, 'write'))) throw new ApiError(403, 'Listing image upload permission required');
  return company;
}
