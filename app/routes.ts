import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/v1/*", "routes/api.ts"),
  route("media/images/:id?", "routes/image.ts"),
  route("auth/google", "routes/google.ts"),
  route("auth/google/callback", "routes/google-callback.ts"),
  route(":mode", "routes/auth.tsx"),
  route("reserve", "routes/reserve.ts"),
  route("account", "routes/account.tsx"),
  route("request/:kind", "routes/request.tsx"),
  route("business", "routes/business.tsx"),
  route('business/:id/tools', 'routes/business-tools.tsx'),
  route('admin', 'routes/admin-index.ts'),
  route('admin/users', 'routes/admin-users.tsx'),
  route('admin/businesses/:id?', 'routes/admin-businesses.tsx'),
] satisfies RouteConfig;
