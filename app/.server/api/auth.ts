import { z } from "zod";
import { setAdminAccess } from "../modules/admin";
import * as db from "../database/models";
import { digest, hashPassword, login, sessionCookie, sessionToken, verifyPassword } from "../modules/auth/auth";
import { ApiError, text } from "../shared/http";
import type { ApiContext, PublicApiContext } from "./context";
import { json, body } from "./http";

const credentials = z
  .object({
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
  })
  .strict();

export async function registrationAndLogin({ request, path, method }: PublicApiContext): Promise<Response | undefined> {
  if (path === "auth/register" && method === "POST") {
    const input = credentials
      .extend({ name: text })
      .parse(await body(request));
    const user = await db.User.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });
    return json({ id: user._id, name: user.name, email: user.email }, 201);
  }
  if (path === "auth/login" && method === "POST") {
    const input = credentials.parse(await body(request));
    // Database-backed account throttling works across app instances; no proxy/IP trust needed.
    const bucket = `${digest(input.email)}:${Math.floor(Date.now() / 900000)}`;
    const attempt = await db.LoginAttempt.findOneAndUpdate(
      { key: bucket },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
      },
      { upsert: true, new: true },
    );
    if (Number(attempt.count) > 10)
      throw new ApiError(429, "Too many login attempts; try later");
    const user = await db.User.findOne({
      email: input.email,
      active: true,
    }).select("+passwordHash");
    const valid = await verifyPassword(
      input.password,
      String(
        user?.passwordHash ??
          "0123456789abcdef0123456789abcdef:" + "00".repeat(64),
      ),
    );
    if (!user || !valid) throw new ApiError(401, "Invalid credentials");
    return json({ id: user._id, expiresIn: 43200 }, 200, {
      "Set-Cookie": await login(user._id),
    });
  }
}

export async function accountRoutes({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "auth/logout" && method === "POST") {
    await db.Session.deleteOne({
      digest: digest(await sessionToken(request)),
    });
    return json(null, 200, {
      "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }),
    });
  }
  if (path === "users/me" && method === "GET")
    return json(await db.User.findById(actor.id));
  const adminMatch = path.match(/^users\/([a-f0-9]{24})\/permissions$/i);
  if (adminMatch && method === "PATCH") {
    return json(
      await setAdminAccess(actor, adminMatch[1], await body(request)),
    );
  }
}
