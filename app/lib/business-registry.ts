// Public registration names map to existing service keys, preserving stored data.
export const businessRegistry = {
  LIVESTOCK_FARMER: { label: 'Livestock farmer', services: ['farm'], documents: 'Business registration or proof of farming activity' },
  AGRICULTURAL_SELLER: { label: 'Agricultural seller', services: ['farm'], documents: 'Business registration or proof of trading activity' },
  TRAILER_RENTAL: { label: 'Trailer rental', services: ['trailer_rental'], documents: 'Business registration and proof of trailer ownership' },
  TAXI_OPERATOR: { label: 'Taxi operator', services: ['taxi_operator'], documents: 'Business registration and operating permit' },
  LOGISTICS_PROVIDER: { label: 'Logistics provider', services: ['logistics'], documents: 'Business registration and operating documents' },
  COMMERCIAL_TRANSPORT: { label: 'Commercial transport', services: ['commercial_transport'], documents: 'Business registration and operating permit' },
} as const;
export type BusinessKind = keyof typeof businessRegistry;
export const serviceTypes = ['farm', 'taxi_operator', 'trailer_rental', 'logistics', 'commercial_transport'] as const;
export type ServiceType = typeof serviceTypes[number];
export const verificationStatuses = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type VerificationStatus = typeof verificationStatuses[number];
export function verificationStatus(business: { verificationStatus?: string; verified?: boolean }): VerificationStatus {
  return (business.verificationStatus as VerificationStatus | undefined) ?? (business.verified ? 'APPROVED' : 'PENDING');
}
export function approvedBusiness(business: { verificationStatus?: string; verified?: boolean; active?: boolean }) {
  return business.active !== false && business.verified === true && verificationStatus(business) === 'APPROVED';
}
export function approvedBusinessFilter() {
  return { active: true, verified: true, $or: [{ verificationStatus: 'APPROVED' }, { verificationStatus: { $exists: false } }] };
}
export const businessPermissions = serviceTypes.flatMap(type => [`${type}:read`, `${type}:write`]);
export function hasBusinessPermission(member: { role: string; permissions?: string[] }, service: string, operation: 'read' | 'write') {
  if (member.role === 'owner' || member.role === 'manager') return true;
  if (member.role !== 'staff') return false;
  return member.permissions?.includes(`${service}:${operation}`) === true;
}
