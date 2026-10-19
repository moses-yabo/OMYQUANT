import type { Route } from "./+types/api";
import { handleApi } from "../.server/api";
export function loader({ request, params }: Route.LoaderArgs) {
  return handleApi(request, params["*"] ?? "");
}
export function action({ request, params }: Route.ActionArgs) {
  return handleApi(request, params["*"] ?? "");
}
