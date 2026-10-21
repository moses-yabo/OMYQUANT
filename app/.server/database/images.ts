import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { connectToDatabase } from './connect.ts';

export const imageLimit = 5 * 1024 * 1024;
export class ImageError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function imageType(bytes: Uint8Array, declared = '') {
  if (!bytes.length || bytes.length > imageLimit) throw new ImageError(413, 'Choose an image between 1 byte and 5 MiB.');
  const data = Buffer.from(bytes);
  const detected = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'image/jpeg'
      : ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)) ? 'image/gif'
        : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';
  if (!detected || (declared && declared.split(';')[0].trim().toLowerCase() !== detected)) throw new ImageError(415, 'Upload a PNG, JPEG, GIF or WebP image with a matching file type.');
  return detected;
}
export async function boundedBody(request: Request, maximum = imageLimit) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new ImageError(413, 'Image upload is too large (maximum 5 MiB).'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export async function imageBucket() {
  await connectToDatabase();
  if (!mongoose.connection.db) throw new Error('Database unavailable');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'images' });
}
export async function validateListingImages(business: string, images: string[]) {
  const paths = images.map(path => {
    const match = /^\/media\/images\/([a-f0-9]{24})$/i.exec(path);
    if (!match) throw new ImageError(400, 'Upload listing images to GridFS before attaching them.');
    return new mongoose.Types.ObjectId(match[1]);
  });
  if (!paths.length) return [];
  const bucket = await imageBucket();
  const files = await bucket.find({ _id: { $in: paths }, 'metadata.business': business }).toArray();
  const found = new Set(files.map(file => String(file._id)));
  if (paths.some(objectId => !found.has(String(objectId)))) throw new ImageError(400, 'Each image must be an existing GridFS upload belonging to this business.');
  return paths.map(objectId => `/media/images/${objectId}`);
}
export async function storeImage(bytes: Uint8Array, business: string, declared = '', options: { seedKey?: string; trustedSeedSvg?: boolean } = {}) {
  const data = Buffer.from(bytes);
  // SVG is never accepted from user uploads. Only the repository's trusted seed
  // illustration uses this branch; serving adds a restrictive CSP regardless.
  const type = options.trustedSeedSvg && options.seedKey && data.length > 0 && data.length <= imageLimit ? 'image/svg+xml' : imageType(data, declared);
  const bucket = await imageBucket();
  if (options.seedKey) {
    const existing = await bucket.find({ 'metadata.seedKey': options.seedKey, 'metadata.business': business }).next();
    if (existing) return { id: String(existing._id), url: `/media/images/${existing._id}` };
  }
  const stream = bucket.openUploadStream(`image-${createHash('sha256').update(data).digest('hex')}`, { metadata: { business, contentType: type, ...(options.seedKey ? { seedKey: options.seedKey } : {}) } });
  try { await pipeline(Readable.from([data]), stream); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
  return { id: String(stream.id), url: `/media/images/${stream.id}` };
}
