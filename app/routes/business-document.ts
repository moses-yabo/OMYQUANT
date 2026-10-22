import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import type { Route } from './+types/business-document';
import { documentBucket } from '../.server/database/business-documents';
import { requireCustomerPage } from '../.server/customer-access';
import { Business, Membership } from '../.server/database/models';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!params.id || !/^[a-f0-9]{24}$/i.test(params.id)) throw new Response('Not found', { status: 404 });
  const actor = await requireCustomerPage(request);
  const bucket = await documentBucket();
  const file = await bucket.find({ _id: new mongoose.Types.ObjectId(params.id) }).next();
  if (!file) throw new Response('Not found', { status: 404 });
  if (!actor.admin) {
    const businesses = await Membership.distinct('business', { user: actor.id, role: { $in: ['owner', 'manager'] } });
    if (!await Business.exists({ _id: { $in: businesses }, 'verificationDocuments.file': file._id })) throw new Response('Not found', { status: 404 });
  }
  return new Response(Readable.toWeb(bucket.openDownloadStream(file._id)) as ReadableStream<Uint8Array>, { headers: {
    'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
