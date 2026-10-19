import { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const text = z.string().trim().min(1).max(2000);
export const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const quantity = z.number().int().min(1).max(1000000);
export const location = z.object({ address: text, province: text, latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).strict();
export const page = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
