import type { Route } from "./+types/google-callback";
import { completeGoogle, googleFailure } from "../.server/modules/auth/google";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    return await completeGoogle(request);
  } catch (error) {
    return googleFailure(error);
  }
}
export function action() {
  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
