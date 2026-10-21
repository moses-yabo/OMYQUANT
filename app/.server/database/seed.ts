import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import * as db from './models.ts';
import { samples } from '../../lib/marketplace.ts';

const models = { User: db.User, Membership: db.Membership, Business: db.Business, Farmer: db.Farmer, Product: db.Product, Livestock: db.Livestock, Trailer: db.Trailer, Vehicle: db.Vehicle, Route: db.Route, Departure: db.Departure };
type SeedDocument = { model: keyof typeof models; document: Record<string, unknown> };
export const seedId = (key: string) => new mongoose.Types.ObjectId(createHash('sha256').update(`omyquant-catalog-seed-v1:${key}`).digest('hex').slice(0, 24));

export function sampleSeedDocuments(now = new Date()): SeedDocument[] {
  const documents: SeedDocument[] = [];
  const add = (model: SeedDocument['model'], key: string, fields: Record<string, unknown>) => documents.push({ model, document: { _id: seedId(key), ...fields, createdAt: now, updatedAt: now } });
  const owner = seedId('owner');
  // No password, admin rights or sign-in ability is created for this fixture user.
  add('User', 'owner', { name: 'OMYQUANT Sample Provider', email: 'sample-provider@omyquant.example', active: false, admin: false });
  for (const [key, name, type] of [['farm', 'Sample agricultural seller', 'farm'], ['taxi', 'Sample taxi operator', 'taxi_operator'], ['rental', 'Sample trailer rental business', 'trailer_rental']] as const) {
    const related = samples.filter(item => key === 'farm' ? ['products', 'livestock'].includes(item.kind) : key === 'taxi' ? item.kind === 'taxis' : item.kind === 'trailers');
    const locations = [...new Map(related.map(item => [item.location, { address: item.location, province: item.province }])).values()];
    add('Business', key, { name, description: 'Sample provider for testing only. No real supplier or payment is involved.', types: [type], contact: { email: 'sample-provider@omyquant.example', phone: 'Not a real provider' }, locations, active: true, verified: false });
    add('Membership', `${key}-owner`, { user: owner, business: seedId(key), role: 'owner' });
  }
  add('Farmer', 'farmer-profile', { business: seedId('farm'), name: 'Sample agricultural seller', description: 'Sample farmer profile for marketplace testing.', location: { address: 'Pretoria', province: 'Gauteng' } });
  for (const item of samples) {
    const location = { address: item.location, province: item.province };
    const common = { name: item.name, description: `Sample listing for testing only. ${item.description}`, images: [item.image], location };
    if (item.kind === 'products' || item.kind === 'livestock') {
      const fields = { ...common, business: seedId('farm'), price: item.price, currency: 'ZAR', quantity: item.quantity, status: 'published' };
      if (item.kind === 'products') add('Product', item.id, { ...fields, category: item.tag === 'Animal feed' ? 'hay_straw' : 'produce', unit: item.unit });
      else add('Livestock', item.id, { ...fields, animalCategory: item.tag, sex: 'unknown', healthDocuments: [] });
    } else if (item.kind === 'trailers') {
      add('Trailer', item.id, { name: `${item.name} (sample)`, images: common.images, location, business: seedId('rental'), trailerType: 'utility', dailyPrice: item.price, active: true, calendarVersion: 0, dimensions: { length: 2.4, width: 1.5, height: 0.6 }, payloadKg: 750, documents: [] });
    } else if (item.kind === 'taxis') {
      add('Vehicle', `${item.id}-vehicle`, { business: seedId('taxi'), registration: 'OMYQUANT-SAMPLE-001', capacity: item.quantity, documents: [] });
      add('Route', `${item.id}-route`, { business: seedId('taxi'), name: `${item.name} (sample)`, mode: 'long_distance', scheduled: true, stops: [location, { address: 'Durban', province: 'KwaZulu-Natal' }] });
      const startsAt = new Date(now.getTime() + 7 * 86400000);
      startsAt.setUTCHours(7, 0, 0, 0); // 09:00 South African time, seven days ahead.
      add('Departure', item.id, { business: seedId('taxi'), vehicle: seedId(`${item.id}-vehicle`), route: seedId(`${item.id}-route`), startsAt, capacity: item.quantity, remaining: item.quantity, price: item.price, status: 'scheduled' });
    }
  }
  return documents;
}

export async function seedSampleCatalog() {
  const documents = sampleSeedDocuments();
  await Promise.all([...new Set(documents.map(item => item.model))].map(name => models[name].init()));
  return mongoose.connection.transaction(async session => {
    const counts: Record<string, number> = {};
    for (const { model, document } of documents) {
      // Insert only: never reset stock, reservations, departure times or edits.
      const result = await models[model].updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true, session, timestamps: false, runValidators: true });
      counts[model] = (counts[model] ?? 0) + result.upsertedCount;
    }
    return counts;
  });
}
