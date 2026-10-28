import type { RecordItem, ToolsData } from "../../lib/business-tool-data";

export type ToolDataProps = { loaded: ToolsData };
export type ViewProps = ToolDataProps & { pending: boolean };
export type RecordProps = ViewProps & { record: RecordItem };
