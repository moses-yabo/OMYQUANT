import { z } from 'zod';
import * as db from '../database/models';
import { id, text, money, quantity, location } from '../shared/http';
import { TAXI_PASSENGER_CAPACITY } from '../../lib/taxi-capacity';

const images = z.array(z.url()).max(20).default([]);
const listingImages = z.array(z.string().regex(/^\/media\/images\/[a-f0-9]{24}$/i, 'Upload listing images to GridFS before attaching them.')).max(20).default([]);
const business = { business: id };
const listing = { ...business, name: text, description: text, price: money, quantity: money, location, images: listingImages, status: z.enum(['draft', 'published', 'inactive']).default('draft') };
const dimensions = z.object({ length: z.number().positive(), width: z.number().positive(), height: z.number().positive() }).strict();
export const businessTypes = ['farm', 'taxi_operator', 'trailer_rental', 'logistics', 'commercial_transport'] as const;
export const resources = {
  'farming/farmers': { model: db.Farmer, type: 'farm', public: true, schema: z.object({ ...business, name: text, description: text, location }).strict() },
  'farming/products': { model: db.Product, type: 'farm', public: true, schema: z.object({ ...listing, category: z.enum(['produce', 'feed', 'hay_straw', 'equipment', 'supplies', 'other']), unit: text }).strict() },
  'farming/livestock': { model: db.Livestock, type: 'farm', public: true, schema: z.object({ ...listing, animalCategory: text, breed: text, ageMonths: money, sex: z.enum(['male', 'female', 'mixed', 'unknown']), healthDocuments: images }).strict() },
  'transport/drivers': { model: db.Driver, type: 'taxi_operator', public: false, schema: z.object({ ...business, user: id, licenceDocuments: images }).strict() },
  'transport/vehicles': { model: db.Vehicle, type: 'taxi_operator', public: false, schema: z.object({ ...business, registration: text, capacity: quantity.max(TAXI_PASSENGER_CAPACITY).default(TAXI_PASSENGER_CAPACITY), documents: images, driver: id.optional() }).strict() },
  'transport/routes': { model: db.Route, type: 'taxi_operator', public: true, schema: z.object({ ...business, name: text, mode: z.enum(['local', 'long_distance']), stops: z.array(location).min(2).max(100), scheduled: z.boolean() }).strict() },
  'rentals/trailers': { model: db.Trailer, type: 'trailer_rental', public: true, schema: z.object({ ...business, name: text, trailerType: text, dimensions, payloadKg: z.number().positive(), grossMassKg: z.number().positive().optional(), dailyPrice: money, location, images: listingImages, documents: images, active: z.boolean().default(true) }).strict() },
} as const;
export const businessSchema = z.object({ name: text, description: text, types: z.array(z.enum(businessTypes)).min(1), contact: z.object({ email: z.email(), phone: text }).strict(), locations: z.array(location).min(1).max(50) }).strict();
export const deliverySchema = z.object({ order: id.optional(), pickup: location, dropoff: location, goodsType: z.enum(['parcel', 'agricultural', 'livestock']), description: text, weightKg: z.number().positive(), dimensions, requirements: z.array(text).max(20).default([]) }).strict();
