import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import * as db from "../app/.server/database/models.ts";
import { loader } from "../app/routes/business-document.ts";
import { sessionCookie } from "../app/.server/modules/auth/auth.ts";
const user = "a".repeat(24);
const document = "b".repeat(24);
const saved = { uri: process.env.MONGODB_URI, db: mongoose.connection.db };
let request;
beforeEach(async () => {
  process.env.MONGODB_URI = "mongodb://unused-documents-test";
  mongoose.connection.db = { collection: () => ({}) };
  jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
  jest.spyOn(db.Session, "findOne").mockResolvedValue({ user });
  jest
    .spyOn(db.User, "findOne")
    .mockResolvedValue({ _id: user, active: true, admin: false });
  request = new Request(`https://example.test/business/documents/${document}`, {
    headers: { Cookie: await sessionCookie.serialize("1".repeat(64)) },
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  mongoose.connection.db = saved.db;
  if (saved.uri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = saved.uri;
});

test("an uploader downloads verification evidence privately as an attachment", async () => {
  jest.spyOn(db.Membership, "distinct").mockResolvedValue(["c".repeat(24)]);
  jest.spyOn(db.Business, "exists").mockResolvedValue({});
  jest
    .spyOn(mongoose.mongo.GridFSBucket.prototype, "find")
    .mockReturnValue({
      next: async () => ({
        _id: new mongoose.Types.ObjectId(document),
        filename: "Proof.pdf",
        metadata: { user },
      }),
    });
  jest
    .spyOn(mongoose.mongo.GridFSBucket.prototype, "openDownloadStream")
    .mockReturnValue(Readable.from([Buffer.from("%PDF-1.7 sample")]));
  const response = await loader({ request, params: { id: document } });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Disposition")).toBe(
    'attachment; filename="Proof.pdf"',
  );
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  expect(await response.text()).toContain("%PDF-");
});

test("being the original uploader does not retain access after business membership is removed", async () => {
  jest
    .spyOn(mongoose.mongo.GridFSBucket.prototype, "find")
    .mockReturnValue({
      next: async () => ({
        _id: new mongoose.Types.ObjectId(document),
        filename: "Proof.pdf",
        metadata: { user },
      }),
    });
  jest.spyOn(db.Membership, "distinct").mockResolvedValue([]);
  jest.spyOn(db.Business, "exists").mockResolvedValue(null);
  await expect(
    loader({ request, params: { id: document } }),
  ).rejects.toMatchObject({ status: 404 });
});

test("another customer cannot download private verification evidence using a known file ID", async () => {
  jest
    .spyOn(mongoose.mongo.GridFSBucket.prototype, "find")
    .mockReturnValue({
      next: async () => ({
        _id: new mongoose.Types.ObjectId(document),
        filename: "Proof.pdf",
        metadata: { user: "c".repeat(24) },
      }),
    });
  const memberships = jest
    .spyOn(db.Membership, "distinct")
    .mockResolvedValue([]);
  jest.spyOn(db.Business, "exists").mockResolvedValue(null);
  const stream = jest.spyOn(
    mongoose.mongo.GridFSBucket.prototype,
    "openDownloadStream",
  );
  await expect(
    loader({ request, params: { id: document } }),
  ).rejects.toMatchObject({ status: 404 });
  expect(memberships).toHaveBeenCalledWith("business", {
    user,
    role: { $in: ["owner", "manager"] },
  });
  expect(stream).not.toHaveBeenCalled();
});

test("anonymous document requests must sign in before accessing GridFS", async () => {
  const read = jest.spyOn(mongoose.mongo.GridFSBucket.prototype, "find");
  await expect(
    loader({ request: new Request(request.url), params: { id: document } }),
  ).rejects.toMatchObject({ status: 302 });
  expect(read).not.toHaveBeenCalled();
});
