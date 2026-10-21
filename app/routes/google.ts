import type { Route } from "./+types/google";
import { startGoogle, googleFailure } from "../.server/modules/auth/google";

export function loader() {
  return new Response("Use the Google sign-in form.", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
export async function action({ request }: Route.ActionArgs) {
  try {
    return await startGoogle(request);
  } catch (error) {
    return googleFailure(error);
  }
}
