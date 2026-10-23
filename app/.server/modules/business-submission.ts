import { z } from "zod";
import { digest } from "./auth/auth";

// MongoDB's existing unique _id serializes retries across server instances.
// The token is scoped to the authenticated owner, never trusted as an identity.
export function businessSubmissionId(owner: string, token: string | null) {
  if (token === null) return undefined; // Existing API clients remain compatible.
  const key = z.string().uuid().parse(token);
  return digest(`business-registration:${owner}:${key}`).slice(0, 24);
}
