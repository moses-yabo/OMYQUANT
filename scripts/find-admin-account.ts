import { loadEnv } from "vite";
import mongoose from "mongoose";
import { mongoConfiguration } from "../app/.server/database/connect.ts";
import { parseArgs } from "node:util";
import { z } from "zod";

// Read-only lookup of a known account across databases accessible to these credentials.
const { values } = parseArgs({
  options: { email: { type: "string" }, id: { type: "string" } },
});
const email = z.email().parse(values.email).toLowerCase();
const id = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .parse(values.id);
const timer = setTimeout(() => {
  console.error("Account lookup timed out.");
  process.exit(1);
}, 45000);
try {
  const config = mongoConfiguration({
    ...loadEnv("development", process.cwd(), ""),
    ...process.env,
  });
  await mongoose.connect(config.uri, {
    ...config.options,
    autoIndex: false,
    autoCreate: false,
  });
  const current = mongoose.connection.db!;
  const databases = await current
    .admin()
    .listDatabases({ nameOnly: true, authorizedDatabases: true });
  console.log("Workspace database:", current.databaseName);
  let found = false;
  for (const database of databases.databases) {
    if (["admin", "local", "config"].includes(database.name)) continue;
    const account = await mongoose.connection
      .getClient()
      .db(database.name)
      .collection("users")
      .findOne(
        { _id: new mongoose.Types.ObjectId(id), email },
        { projection: { _id: 1, admin: 1, superAdmin: 1, active: 1 } },
      );
    if (account) {
      found = true;
      console.log("Exact account match:", {
        database: database.name,
        id: String(account._id),
        active: account.active,
        admin: account.admin,
        superAdmin: account.superAdmin,
      });
    }
  }
  if (!found) {
    console.log(
      "No matching record in accessible databases. Check the Render database configuration.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Lookup failed:", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  clearTimeout(timer);
}
