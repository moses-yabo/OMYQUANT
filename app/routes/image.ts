import { approvedBusinessFilter } from "../lib/business-registry";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import type { Route } from "./+types/image";
import { authenticate, sessionToken } from "../.server/modules/auth/auth";
import { manage, manageImages } from "../.server/shared/access";
import { mutationOrigin } from "../.server/frontend";
import { ApiError, id } from "../.server/shared/http";
import {
  boundedBody,
  imageBucket,
  ImageError,
  storeImage,
} from "../.server/database/images";
import {
  Business,
  Product,
  Livestock,
  Trailer,
} from "../.server/database/models";

function failure(error: unknown) {
  if (error instanceof Response) {
    error.headers.set("Cache-Control", "no-store");
    return error;
  }
  const status =
    error instanceof ApiError || error instanceof ImageError
      ? error.status
      : 503;
  return Response.json(
    {
      error: {
        message:
          status === 503
            ? "Image storage is temporarily unavailable."
            : (error as Error).message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export async function action({ request, params }: Route.ActionArgs) {
  try {
    mutationOrigin(request);
    if (request.method !== "POST" || params.id)
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: params.id ? "GET, HEAD" : "POST" },
      });
    if (!(await sessionToken(request)))
      throw new ApiError(401, "Authentication required");
    await imageBucket();
    const actor = await authenticate(request);
    const business = new URL(request.url).searchParams.get("business");
    if (!id.safeParse(business).success)
      throw new ApiError(400, "A valid business ID is required.");
    await manageImages(actor, business!);
    const image = await storeImage(
      await boundedBody(request),
      business!,
      request.headers.get("Content-Type") ?? "",
    );
    return Response.json(
      { data: image },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function loader({ request, params }: Route.LoaderArgs) {
  try {
    if (!params.id || !id.safeParse(params.id).success)
      throw new ApiError(404, "Image not found.");
    const bucket = await imageBucket();
    const objectId = new mongoose.Types.ObjectId(params.id);
    const file = await bucket.find({ _id: objectId }).next();
    if (
      !file ||
      typeof file.metadata?.business !== "string" ||
      typeof file.metadata.contentType !== "string"
    )
      throw new ApiError(404, "Image not found.");
    const path = `/media/images/${params.id}`;
    const images = { $in: [path, new URL(path, request.url).href] };
    const business = file.metadata.business;
    const active = await Business.exists({
      _id: business,
      ...approvedBusinessFilter(),
    });
    const visible =
      active &&
      (
        await Promise.all([
          Product.exists({ business, images, status: "published" }),
          Livestock.exists({ business, images, status: "published" }),
          Trailer.exists({ business, images, active: true }),
        ])
      ).some(Boolean);
    if (!visible) await manage(await authenticate(request), business);
    const headers = {
      "Content-Type": file.metadata.contentType,
      "Content-Length": String(file.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": visible ? "public, max-age=60" : "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(
      Readable.toWeb(
        bucket.openDownloadStream(objectId),
      ) as ReadableStream<Uint8Array>,
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
