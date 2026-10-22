import mongoose, { Schema } from "mongoose";
import { businessRegistry, businessPermissions, verificationStatuses } from '../../lib/business-registry';

const ref = (name: string, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
const options = { timestamps: true, strict: "throw" as const };
const place = {
  address: String,
  province: String,
  latitude: Number,
  longitude: Number,
  geocoding: { provider: String, label: String, precision: String, confidence: Number, reviewed: Boolean, locatedAt: Date },
};
const amount = { type: Number, min: 0, required: true };
const make = (name: string, definition: Record<string, unknown>) =>
  mongoose.models[name] ??
  mongoose.model(name, new Schema(definition, options));
export const User = make("User", {
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, select: false },
  admin: { type: Boolean, default: false },
  superAdmin: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
});
// External identities are separate so compound uniqueness applies to each identity,
// not to an array of providers. Existing users/passwords need no migration.
const identitySchema = new Schema(
  {
    user: ref("User"),
    provider: { type: String, enum: ["google"], required: true },
    providerUserId: { type: String, required: true },
  },
  options,
);
identitySchema.index({ provider: 1, providerUserId: 1 }, { unique: true });
identitySchema.index({ user: 1, provider: 1 }, { unique: true });
export const AuthIdentity =
  mongoose.models.AuthIdentity ??
  mongoose.model("AuthIdentity", identitySchema);
const oauthTransactionSchema = new Schema(
  {
    digest: { type: String, required: true, unique: true },
    state: { type: String, required: true },
    nonce: { type: String, required: true },
    verifier: { type: String, required: true },
    intent: { type: String, enum: ["login", "link"], required: true },
    user: ref("User", false),
    sessionDigest: String,
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  options,
);
export const OAuthTransaction =
  mongoose.models.OAuthTransaction ??
  mongoose.model("OAuthTransaction", oauthTransactionSchema);
const sessionSchema = new Schema(
  {
    user: ref("User"),
    digest: { type: String, unique: true },
    expiresAt: { type: Date, expires: 0 },
  },
  options,
);
export const Session =
  mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
const loginAttemptSchema = new Schema({
  key: { type: String, unique: true },
  count: Number,
  expiresAt: { type: Date, expires: 0 },
});
export const LoginAttempt =
  mongoose.models.LoginAttempt ??
  mongoose.model("LoginAttempt", loginAttemptSchema);
export const Business = make("Business", {
  owner: ref('User', false),
  kind: { type: String, enum: Object.keys(businessRegistry) },
  verificationStatus: { type: String, enum: verificationStatuses },
  verification: { reviewer: ref('User', false), reviewedAt: Date, reason: String },
  verificationDocuments: [{ file: Schema.Types.ObjectId, name: String }],
  logisticsProfile: { serviceAreas: [String], basePrice: Number, perKmPrice: Number, available: Boolean },
  name: String,
  description: String,
  types: [String],
  contact: { email: String, phone: String },
  locations: [place],
  verified: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
});
Business.schema.index({ owner: 1, createdAt: -1 });
Business.schema.index({ verificationStatus: 1, createdAt: -1 });
const membershipSchema = new Schema(
  {
    business: ref("Business"),
    user: ref("User"),
    role: { type: String, enum: ["owner", "manager", "staff"], required: true },
    permissions: { type: [String], enum: businessPermissions, default: [] },
  },
  options,
);
membershipSchema.index({ business: 1, user: 1 }, { unique: true });
export const Membership =
  mongoose.models.Membership ?? mongoose.model("Membership", membershipSchema);
export const Farmer = make("Farmer", {
  business: { ...ref("Business"), unique: true },
  name: String,
  description: String,
  location: place,
});
const listing = {
  business: ref("Business"),
  name: String,
  description: String,
  price: amount,
  currency: { type: String, default: "ZAR", enum: ["ZAR"] },
  quantity: amount,
  images: [String],
  location: place,
  status: {
    type: String,
    enum: ["draft", "published", "inactive"],
    default: "draft",
  },
};
export const Product = make("Product", {
  ...listing,
  category: String,
  unit: String,
});
export const Livestock = make("Livestock", {
  ...listing,
  animalCategory: String,
  breed: String,
  ageMonths: Number,
  sex: String,
  healthDocuments: [String],
});
export const BusinessEnquiry = make('BusinessEnquiry', {
  customer: ref('User'), business: ref('Business'), listing: Schema.Types.ObjectId,
  kind: { type: String, enum: ['product', 'livestock'] }, question: { type: String, maxlength: 4000 },
  answer: { type: String, maxlength: 4000 }, answeredBy: ref('User', false), answeredAt: Date,
});
BusinessEnquiry.schema.index({ business: 1, createdAt: -1 });
BusinessEnquiry.schema.index({ customer: 1, createdAt: -1 });
export const Order = make("Order", {
  customer: ref("User"),
  business: ref("Business"),
  items: [
    {
      listing: Schema.Types.ObjectId,
      kind: String,
      name: String,
      quantity: Number,
      unitPrice: Number,
    },
  ],
  total: amount,
  currency: { type: String, default: "ZAR" },
  status: {
    type: String,
    default: "placed",
    enum: ["placed", "accepted", "fulfilled", "cancelled"],
  },
  fulfilment: String,
  deliveryRequest: ref("Delivery", false),
  payment: { type: String, default: "external_unverified" },
});
export const Driver = make("Driver", {
  business: ref("Business"),
  user: ref("User"),
  licenceDocuments: [String],
  active: { type: Boolean, default: true },
});
export const Vehicle = make("Vehicle", {
  business: ref("Business"),
  registration: { type: String, unique: true },
  capacity: Number,
  scheduleVersion: { type: Number, default: 0 },
  documents: [String],
  driver: ref("Driver", false),
  payloadKg: Number,
  active: { type: Boolean, default: true },
});
export const Route = make("Route", {
  business: ref("Business"),
  name: String,
  mode: { type: String, enum: ["local", "long_distance"] },
  stops: [place],
  scheduled: Boolean,
});
export const Departure = make("Departure", {
  business: ref("Business"),
  vehicle: ref("Vehicle"),
  route: ref("Route"),
  startsAt: Date,
  capacity: Number,
  remaining: amount,
  price: amount,
  status: {
    type: String,
    enum: ["scheduled", "departed", "completed", "cancelled"],
    default: "scheduled",
  },
});
export const Booking = make("Booking", {
  customer: ref("User"),
  business: ref("Business"),
  departure: ref("Departure"),
  seats: Number,
  unitPrice: amount,
  startsAt: Date,
  vehicle: ref('Vehicle', false),
  status: {
    type: String,
    enum: ["confirmed", "cancelled"],
    default: "confirmed",
  },
});
export const Trailer = make("Trailer", {
  business: ref("Business"),
  name: String,
  trailerType: String,
  dimensions: { length: Number, width: Number, height: Number },
  payloadKg: Number,
  grossMassKg: Number,
  dailyPrice: amount,
  hourlyPrice: { type: Number, min: 0 },
  monthlyPrice: { type: Number, min: 0 },
  location: place,
  images: [String],
  documents: [String],
  active: { type: Boolean, default: true },
  calendarVersion: { type: Number, default: 0 },
});
const reservationSchema = new Schema(
  {
    customer: ref("User"),
    business: ref("Business"),
    trailer: ref("Trailer"),
    start: Date,
    end: Date,
    total: amount,
    rateUnit: { type: String, enum: ['hour', 'day', 'month'], default: 'day' },
    unitPrice: Number,
    status: {
      type: String,
      enum: [
        "requested",
        "confirmed",
        "rejected",
        "cancelled",
        "picked_up",
        "returned",
      ],
      default: "requested",
    },
    pickedUpAt: Date,
    returnedAt: Date,
    externalPayment: {
      amount: Number,
      reference: String,
      recordedBy: Schema.Types.ObjectId,
      recordedAt: Date,
      verification: { type: String, enum: ["business_reported"] },
    },
  },
  options,
);
reservationSchema.index({ trailer: 1, status: 1, start: 1, end: 1 });
export const Reservation =
  mongoose.models.Reservation ??
  mongoose.model("Reservation", reservationSchema);
export const Delivery = make("Delivery", {
  customer: ref("User"),
  order: ref("Order", false),
  pickup: place,
  dropoff: place,
  goodsType: { type: String, enum: ["parcel", "agricultural", "livestock"] },
  description: String,
  weightKg: Number,
  dimensions: { length: Number, width: Number, height: Number },
  requirements: [String],
  business: ref("Business", false),
  vehicle: ref('Vehicle', false),
  driver: ref('Driver', false),
  status: {
    type: String,
    enum: ["requested", "assigned", "collected", "delivered", "cancelled"],
    default: "requested",
  },
  proof: String,
});
export const Quote = make("Quote", {
  request: ref("Delivery"),
  business: ref("Business"),
  price: amount,
  capabilities: [String],
  status: { type: String, enum: ["offered", "accepted"], default: "offered" },
});
export const TransportRequest = make("TransportRequest", {
  customer: ref("User"),
  kind: String,
  passengers: Number,
  pickup: place,
  dropoff: place,
  startsAt: Date,
  status: { type: String, default: "requested" },
});
export const TransportQuote = make("TransportQuote", {
  request: ref("TransportRequest"),
  business: ref("Business"),
  price: amount,
  description: String,
  status: { type: String, default: "offered", enum: ["offered", "accepted"] },
});
export const Category = make("Category", {
  name: { type: String, required: true, unique: true },
  description: String,
  active: { type: Boolean, default: true },
});
const businessReviewSchema = new Schema({ business: ref('Business'), reviewer: ref('User'), verified: { type: Boolean, required: true }, previousStatus: { type: String, enum: verificationStatuses }, status: { type: String, enum: verificationStatuses }, reason: { type: String, maxlength: 2000, default: '' } }, options);
businessReviewSchema.index({ business: 1, createdAt: -1 });
export const BusinessReview = mongoose.models.BusinessReview ?? mongoose.model('BusinessReview', businessReviewSchema);
export const AdminAccessReview = make('AdminAccessReview', { user: ref('User'), reviewer: ref('User'), admin: Boolean });
export const BusinessLocationReview = make('BusinessLocationReview', { business: ref('Business'), reviewer: ref('User'), locationIndex: Number, previous: { latitude: Number, longitude: Number }, coordinates: { latitude: Number, longitude: Number } });

const supportEventSchema = new Schema({
  author: ref('User'), text: { type: String, required: true, maxlength: 4000 },
  internal: { type: Boolean, default: false }, status: { type: String, enum: ['open', 'in_review', 'resolved', 'closed'] },
  createdAt: { type: Date, default: Date.now },
});
const supportTicketSchema = new Schema({
  channel: { type: String, enum: ['complaint', 'chat'], default: 'complaint' },
  reporter: ref('User'), category: { type: String, required: true, enum: ['damaged_delivery', 'late_delivery', 'spoiled_goods', 'sick_livestock', 'booking', 'rental', 'other'] },
  subject: { type: String, required: true, maxlength: 160 }, description: { type: String, required: true, maxlength: 4000 },
  status: { type: String, enum: ['open', 'in_review', 'resolved', 'closed'], default: 'open' },
  relatedKind: { type: String, enum: ['order', 'booking', 'reservation', 'delivery', 'transport'] }, relatedId: Schema.Types.ObjectId,
  version: { type: Number, default: 0 }, history: { type: [supportEventSchema], default: [] },
}, options);
supportTicketSchema.index({ reporter: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, category: 1, updatedAt: -1 });
export const SupportTicket = mongoose.models.SupportTicket ?? mongoose.model('SupportTicket', supportTicketSchema);
