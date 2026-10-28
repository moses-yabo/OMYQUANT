import type { Actor } from "../shared/access";

export type PublicApiContext = { request: Request; path: string; method: string; url: URL };
export type ApiContext = PublicApiContext & { actor: Actor };
