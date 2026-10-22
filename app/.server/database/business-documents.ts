import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { connectToDatabase } from './connect';
import { imageLimit, imageType } from './images';
import { ApiError } from '../shared/http';

export async function documentBucket() {
  await connectToDatabase();
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'verificationDocuments' });
}
export async function storeBusinessDocument(file: File, user: string) {
  if (!file.size || file.size > imageLimit) throw new ApiError(413, 'Verification documents must be between 1 byte and 5 MiB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = Buffer.from(bytes).subarray(0, 5).toString() === '%PDF-';
  const contentType = pdf && file.type === 'application/pdf' ? 'application/pdf' : imageType(bytes, file.type);
  const name = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'verification-document';
  const bucket = await documentBucket();
  const stream = bucket.openUploadStream(name, { metadata: { user, contentType } });
  try { await pipeline(Readable.from([bytes]), stream); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
  return { file: String(stream.id), name };
}
export async function validateBusinessDocuments(user: string, documents: { file: string; name: string }[]) {
  if (!documents.length) return;
  const bucket = await documentBucket();
  const files = await bucket.find({ _id: { $in: documents.map(doc => new mongoose.Types.ObjectId(doc.file)) }, 'metadata.user': user }).toArray();
  if (documents.some(doc => !files.some(file => String(file._id) === doc.file))) throw new ApiError(400, 'Verification documents must be your own existing private uploads');
}
