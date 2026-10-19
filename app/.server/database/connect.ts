import mongoose from "mongoose";
let pending: Promise<typeof mongoose> | undefined;
export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  pending ??= mongoose
    .connect(uri, { serverSelectionTimeoutMS: 5000 })
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
