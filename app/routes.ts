import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"), route("api/v1/*", "routes/api.ts"),
  route(":mode", "routes/auth.tsx"), route("reserve", "routes/reserve.ts"),
  route("account", "routes/account.tsx"), route("request/:kind", "routes/request.tsx"),
  route("business", "routes/business.tsx"),
] satisfies RouteConfig;
