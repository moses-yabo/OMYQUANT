import { expect, test } from "@jest/globals";
import * as models from "../app/.server/database/models.ts";
import { sampleSeedDocuments } from "../app/.server/database/seed.ts";
import { samples } from "../app/lib/marketplace.ts";

test("seed covers every sample with stable IDs and valid related schemas", async () => {
  const now = new Date("2026-10-21T10:00:00Z");
  const documents = sampleSeedDocuments(now);
  const again = sampleSeedDocuments(new Date("2026-10-22T10:00:00Z"));
  expect(documents.map((item) => String(item.document._id))).toEqual(
    again.map((item) => String(item.document._id)),
  );
  expect(new Set(documents.map((item) => String(item.document._id))).size).toBe(
    documents.length,
  );
  const catalog = documents.filter((item) =>
    ["Product", "Livestock", "Trailer", "Departure"].includes(item.model),
  );
  expect(catalog).toHaveLength(samples.length);
  for (const { model, document } of documents)
    await expect(
      new models[model](document).validate(),
    ).resolves.toBeUndefined();
  const departure = documents.find(
    (item) => item.model === "Departure",
  ).document;
  expect(departure.startsAt.getTime()).toBeGreaterThan(now.getTime());
  for (const reference of ["business", "vehicle", "route"])
    expect(
      documents.some(
        (item) => String(item.document._id) === String(departure[reference]),
      ),
    ).toBe(true);
  const owner = documents.find((item) => item.model === "User").document;
  expect(owner).toMatchObject({ active: false, admin: false });
  expect(owner).not.toHaveProperty("passwordHash");
});
