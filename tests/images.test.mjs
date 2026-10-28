import { expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import {
  boundedBody,
  imageLimit,
  imageType,
  validateListingImages,
} from "../app/.server/database/images.ts";
import { action, loader } from "../app/routes/image.ts";
import { resources } from "../app/.server/modules/resources.ts";

test("image validation checks supported signatures and declared MIME types", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(imageType(png, "image/png")).toBe("image/png");
  expect(imageType(Buffer.from([255, 216, 255, 224]), "image/jpeg")).toBe(
    "image/jpeg",
  );
  expect(imageType(Buffer.from("GIF89a"), "image/gif")).toBe("image/gif");
  expect(imageType(Buffer.from("RIFF0000WEBP"), "image/webp")).toBe(
    "image/webp",
  );
  expect(() => imageType(png, "image/jpeg")).toThrow(/matching file type/);
  expect(() =>
    imageType(Buffer.from('<svg onload="alert(1)"/>'), "image/svg+xml"),
  ).toThrow();
  expect(() => imageType(Buffer.from("<html>"), "image/png")).toThrow();
  expect(() => imageType(Buffer.alloc(imageLimit + 1))).toThrow(/5 MiB/);
  expect(() => imageType(Buffer.alloc(0))).toThrow();
});
test("body bounds apply to actual streamed bytes, not client content-length", async () => {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: "too long",
    headers: { "Content-Length": "1" },
  });
  await expect(boundedBody(request, 3)).rejects.toMatchObject({ status: 413 });
});
test("uploads reject missing sessions and foreign origins before storage access", async () => {
  const unauthenticated = await action({
    request: new Request("http://localhost/media/images", { method: "POST" }),
    params: {},
  });
  expect(unauthenticated.status).toBe(401);
  const foreign = await action({
    request: new Request("http://localhost/media/images", {
      method: "POST",
      headers: { Origin: "https://attacker.test" },
    }),
    params: {},
  });
  expect(foreign.status).toBe(403);
});
test("invalid image IDs return 404 without connecting to MongoDB", async () => {
  const response = await loader({
    request: new Request("http://localhost/media/images/invalid"),
    params: { id: "invalid" },
  });
  expect(response.status).toBe(404);
});
test("listing image schemas accept GridFS paths while private documents keep URL validation", () => {
  const image = "/media/images/" + "a".repeat(24);
  const schema = resources["farming/products"].schema.shape.images;
  expect(schema.parse([image])).toEqual([image]);
  expect(() => schema.parse(["/media/images/not-an-id"])).toThrow();
  expect(() => schema.parse(["https://example.test/image.jpg"])).toThrow();
  expect(() => schema.parse(["data:image/png;base64,abcd"])).toThrow();
  expect(() =>
    resources["transport/drivers"].schema.shape.licenceDocuments.parse([image]),
  ).toThrow();
});

test("listing attachments must exist in GridFS under the same business", async () => {
  const previousDb = mongoose.connection.db;
  mongoose.connection.db = { collection: () => ({}), options: {} };
  const connect = jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
  const objectId = new mongoose.Types.ObjectId("a".repeat(24));
  const find = jest
    .spyOn(mongoose.mongo.GridFSBucket.prototype, "find")
    .mockReturnValue({ toArray: async () => [{ _id: objectId }] });
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-in-image-test";
  try {
    expect(
      await validateListingImages("business-one", [
        "/media/images/" + "A".repeat(24),
      ]),
    ).toEqual(["/media/images/" + objectId]);
    expect(find).toHaveBeenCalledWith({
      _id: { $in: [objectId] },
      "metadata.business": "business-one",
    });
    find.mockReturnValue({ toArray: async () => [] });
    await expect(
      validateListingImages("business-two", ["/media/images/" + objectId]),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      validateListingImages("business-one", ["https://example.test/image.jpg"]),
    ).rejects.toMatchObject({ status: 400 });
    expect(await validateListingImages("business-one", [])).toEqual([]);
  } finally {
    find.mockRestore();
    connect.mockRestore();
    mongoose.connection.db = previousDb;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }
});
