import { loadEnv } from "vite";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { samples } from "../app/lib/marketplace.ts";
import { seedId } from "../app/.server/database/seed.ts";
import { Product, Livestock, Trailer } from "../app/.server/database/models.ts";
import {
  boundedBody,
  imageBucket,
  storeImage,
} from "../app/.server/database/images.ts";
import { createRequestHandler, type ServerBuild } from "react-router";

const env = loadEnv("development", process.cwd(), "");
for (const key of [
  "MONGODB_URI",
  "MONGODB_DB_USERNAME",
  "MONGODB_PASSWORD",
  "MONGODB_DB_NAME",
]) {
  if (process.env[key] === undefined && env[key] !== undefined)
    process.env[key] = env[key];
}
const timeout = setTimeout(() => {
  console.error("Image migration timed out; rerun to resume.");
  process.exit(1);
}, 300000);
let migrated = 0;
let skipped = 0;
let failed = 0;
try {
  await imageBucket();
  for (const item of samples) {
    const model =
      item.kind === "products"
        ? Product
        : item.kind === "livestock"
          ? Livestock
          : item.kind === "trailers"
            ? Trailer
            : null;
    if (!model) continue; // Departure images are not part of its current schema.
    try {
      const listing = await model.findById(seedId(item.id));
      if (!listing || listing.images?.[0] !== item.image) {
        skipped++;
        continue;
      }
      let bytes: Uint8Array;
      let type: string;
      const trustedSvg = item.image === "/images/trailer.svg";
      if (trustedSvg) {
        bytes = await readFile("public/images/trailer.svg");
        type = "image/svg+xml";
      } else {
        const url = new URL(item.image);
        if (url.protocol !== "https:" || url.hostname !== "images.unsplash.com")
          throw new Error("Unapproved sample image source");
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Image source unavailable");
        type = response.headers.get("Content-Type") ?? "";
        bytes = await boundedBody(
          new Request("https://sample-image.invalid", {
            method: "POST",
            body: response.body,
            duplex: "half",
          } as RequestInit),
        );
      }
      const image = await storeImage(bytes, String(listing.business), type, {
        seedKey: item.id,
        trustedSeedSvg: trustedSvg,
      });
      const result = await model.updateOne(
        { _id: listing._id, "images.0": item.image },
        { $set: { "images.0": image.url } },
        { timestamps: false },
      );
      if (result.modifiedCount) migrated++;
      else skipped++;
      console.log("GridFS image ready:", item.id);
    } catch (error) {
      failed++;
      console.error(
        "Sample image migration failed:",
        item.id,
        error instanceof Error ? error.name : "UnknownError",
      );
    }
  }
  console.log({ migrated, skipped, failed });
  if (process.argv.includes("--verify")) {
    const buildPath = "../build/server/index.js";
    const handler = createRequestHandler(
      (await import(buildPath)) as ServerBuild,
      "production",
    );
    let verified = 0;
    for (const item of samples) {
      const model =
        item.kind === "products"
          ? Product
          : item.kind === "livestock"
            ? Livestock
            : item.kind === "trailers"
              ? Trailer
              : null;
      if (!model) continue;
      const listing = await model.findById(seedId(item.id));
      const path: unknown = listing?.images?.[0];
      if (typeof path !== "string" || !path.startsWith("/media/images/"))
        throw new Error("Sample image was not migrated");
      const response = await handler(
        new Request(new URL(path, "http://localhost")),
      );
      if (
        response.status !== 200 ||
        response.headers.get("X-Content-Type-Options") !== "nosniff" ||
        !(await response.arrayBuffer()).byteLength
      )
        throw new Error("GridFS resource verification failed");
      verified++;
    }
    console.log(
      "GridFS images served successfully by the production resource route:",
      verified,
    );
  }
  if (failed) process.exitCode = 1;
} catch {
  console.error("Image migration could not connect to the database.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  clearTimeout(timeout);
}
