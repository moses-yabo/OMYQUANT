import { Business, Membership } from '../database/models';
import { approvedBusinessFilter, hasBusinessPermission } from '../../lib/business-registry';
import { toolDefinitions, type Tool } from './business-tools';

export async function businessWorkspaces(user: string) {
  const members = await Membership.find({ user }).select('business role permissions').lean();
  const businesses = await Business.find({ _id: { $in: members.map(member => member.business) }, ...approvedBusinessFilter() }).select('_id name types').lean();
  return businesses.flatMap(business => {
    const member = members.find(member => String(member.business) === String(business._id));
    const tools = (Object.keys(toolDefinitions) as Tool[]).filter(tool => member && (business.types ?? []).includes(toolDefinitions[tool].type) && hasBusinessPermission(member as unknown as { role: string; permissions?: string[] }, toolDefinitions[tool].type, 'read'));
    return tools.length ? [{ id: String(business._id), name: String(business.name), tools }] : [];
  });
}
