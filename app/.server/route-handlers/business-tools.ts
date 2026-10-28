import { data, redirect } from "react-router";
import { api, result, mutationOrigin } from "../frontend";
import { authenticate, sessionToken } from "../modules/auth/auth";
import { connectToDatabase } from "../database/connect";
import {
  businessTool,
  toolsPage,
  toolKey,
  toolMutation,
  toolDefinitions,
  businessStatistics,
} from "../modules/business-tools";
import { ApiError } from "../shared/http";
import {
  boundedBody,
  imageBucket,
  imageLimit,
  ImageError,
  storeImage,
} from "../database/images";
import { z } from "zod";
import type { ToolsData } from "../../lib/business-tool-data";

type ToolRequest = { request: Request; params: { id?: string } };

async function actorFor(request: Request) {
  if (!(await sessionToken(request))) throw redirect("/login");
  await connectToDatabase();
  try {
    return await authenticate(request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      throw redirect("/login");
    throw error;
  }
}
export async function loadBusinessTools({ request, params }: ToolRequest) {
  const actor = await actorFor(request);
  try {
    const loaded = await toolsPage(actor, params.id!, new URL(request.url));
    const overview = !new URL(request.url).searchParams.has("tool");
    const statistics = overview
      ? await businessStatistics(params.id!, loaded.available)
      : [];
    // Serialize database values explicitly for the route boundary.
    return data(
      JSON.parse(
        JSON.stringify({ ...loaded, overview, statistics }),
      ) as ToolsData,
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ApiError)
      throw new Response(error.message, { status: error.status });
    if (error instanceof z.ZodError)
      throw new Response("Invalid business tool filters.", { status: 400 });
    throw error;
  }
}
export async function saveBusinessTool({ request, params }: ToolRequest) {
  mutationOrigin(request);
  const actor = await actorFor(request);
  let uploaded: { id: string; url: string } | undefined;
  try {
    if (request.method !== "POST")
      throw new ApiError(405, "Method not allowed");
    const bytes = await boundedBody(request, imageLimit + 65536);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    }).formData();
    const get = (key: string) => String(form.get(key) ?? "");
    const num = (key: string) => Number(get(key));
    const tool = toolKey(get("tool"));
    await businessTool(actor, params.id!, tool);
    let path: string = toolDefinitions[tool].path;
    let method = "POST";
    let payload: Record<string, unknown> = { business: params.id };
    const location = { address: get("address"), province: get("province") };
    if (get("intent") === "quote") {
      if (tool !== "deliveryRequests")
        throw new ApiError(400, "Invalid quote request");
      path = await toolMutation(actor, params.id!, tool, get("record"));
      payload = {
        business: params.id,
        price: Math.round(num("price") * 100),
        capabilities: [get("goodsType")],
      };
    } else if (get("intent") === "reply") {
      path = await toolMutation(actor, params.id!, tool, get("record"));
      method = "PATCH";
      payload = { answer: get("answer") };
    } else if (get("intent") === "edit") {
      path = await toolMutation(actor, params.id!, tool, get("record"));
      method = "PATCH";
      payload = {};
      if (["products", "livestock"].includes(tool))
        payload = {
          name: get("name"),
          price: Math.round(num("price") * 100),
          quantity: num("quantity"),
        };
      else if (tool === "trailers")
        payload = {
          name: get("name"),
          dailyPrice: Math.round(num("price") * 100),
          ...(get("hourlyPrice")
            ? { hourlyPrice: Math.round(num("hourlyPrice") * 100) }
            : {}),
          ...(get("monthlyPrice")
            ? { monthlyPrice: Math.round(num("monthlyPrice") * 100) }
            : {}),
        };
      else if (["vehicles", "deliveryVehicles"].includes(tool))
        payload = {
          active: get("active") === "true",
          ...(get("driver") ? { driver: get("driver") } : {}),
        };
      else if (["drivers", "deliveryPersonnel"].includes(tool))
        payload = { active: get("active") === "true" };
      else throw new ApiError(400, "This record cannot be edited here");
    } else if (get("intent") === "assign") {
      path = `${await toolMutation(actor, params.id!, tool, get("record"))}/assignment`;
      method = "PATCH";
      payload = { vehicle: get("vehicle"), driver: get("driver") };
    } else if (get("intent") === "status") {
      path = await toolMutation(actor, params.id!, tool, get("record"));
      method = "PATCH";
      if (["orders", "departures", "deliveries"].includes(tool))
        path += "/status";
      if (
        [
          "orders",
          "departures",
          "reservations",
          "products",
          "livestock",
          "deliveries",
        ].includes(tool)
      )
        payload = { status: get("status") };
      else if (tool === "trailers")
        payload = { active: get("status") === "active" };
      else throw new ApiError(400, "Unsupported status action");
      if (tool === "deliveries" && get("proof")) payload.proof = get("proof");
    } else if (get("intent") === "create") {
      if (["products", "livestock", "trailers"].includes(tool)) {
        const file = form.get("imageFile");
        if (file instanceof File && file.size)
          uploaded = await storeImage(
            new Uint8Array(await file.arrayBuffer()),
            params.id!,
            file.type,
          );
        payload = {
          ...payload,
          name: get("name"),
          location,
          images: uploaded ? [uploaded.url] : [],
        };
      }
      if (tool === "products" || tool === "livestock")
        payload = {
          ...payload,
          description: get("description"),
          price: Math.round(num("price") * 100),
          quantity: num("quantity"),
          status: get("status"),
          ...(tool === "products"
            ? { category: get("category"), unit: get("unit") }
            : {
                animalCategory: get("animalCategory"),
                breed: get("breed"),
                ageMonths: num("ageMonths"),
                sex: get("sex"),
                healthDocuments: [],
              }),
        };
      else if (tool === "trailers")
        payload = {
          ...payload,
          trailerType: get("trailerType"),
          dimensions: {
            length: num("length"),
            width: num("width"),
            height: num("height"),
          },
          payloadKg: num("payloadKg"),
          dailyPrice: Math.round(num("price") * 100),
          ...(get("hourlyPrice")
            ? { hourlyPrice: Math.round(num("hourlyPrice") * 100) }
            : {}),
          ...(get("monthlyPrice")
            ? { monthlyPrice: Math.round(num("monthlyPrice") * 100) }
            : {}),
          documents: [],
          active: true,
        };
      else if (tool === "vehicles" || tool === "deliveryVehicles")
        payload = {
          ...payload,
          registration: get("registration"),
          ...(tool === "vehicles"
            ? { capacity: num("capacity") }
            : { payloadKg: num("payloadKg") }),
          ...(get("driver") ? { driver: get("driver") } : {}),
          documents: [],
        };
      else if (tool === "drivers" || tool === "deliveryPersonnel")
        payload = { ...payload, user: get("user"), licenceDocuments: [] };
      else if (tool === "routes")
        payload = {
          ...payload,
          name: get("name"),
          mode: get("mode"),
          scheduled: true,
          stops: [
            location,
            {
              address: get("dropoffAddress"),
              province: get("dropoffProvince"),
            },
          ],
        };
      else if (tool === "departures")
        payload = {
          ...payload,
          vehicle: get("vehicle"),
          route: get("route"),
          startsAt: `${get("startsAt")}:00+02:00`,
          price: Math.round(num("price") * 100),
        };
      else throw new ApiError(400, "This tool does not create listings");
    } else throw new ApiError(400, "Unknown action");
    const response = await api(request, path, method, payload);
    const parsed = await result(response);
    if (!response.ok) {
      if (uploaded && response.status < 500)
        await imageBucket()
          .then(async (bucket) => {
            const { default: mongoose } = await import("mongoose");
            await bucket.delete(new mongoose.Types.ObjectId(uploaded!.id));
          })
          .catch(() => {});
      return data(
        {
          error:
            parsed.error?.issues
              ?.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ") ||
            parsed.error?.message ||
            "Unable to save.",
          success: "",
        },
        { status: response.status },
      );
    }
    return data({ error: "", success: "Saved successfully." });
  } catch (error) {
    if (error instanceof ApiError || error instanceof ImageError)
      return data(
        { error: error.message, success: "" },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return data(
        { error: "Invalid business tool input.", success: "" },
        { status: 400 },
      );
    throw error;
  }
}
