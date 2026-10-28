import { EventEmitter } from "node:events";
const key = Symbol.for("omyquant.support.events");
const processState = globalThis as typeof globalThis & { [key]?: EventEmitter };
export const supportEvents = (processState[key] ??= new EventEmitter());
export type SupportChange = {
  ticketId: string;
  reporter: string;
  staffOnly?: boolean;
};
export function publishSupportChange(change: SupportChange) {
  supportEvents.emit("changed", change);
}
