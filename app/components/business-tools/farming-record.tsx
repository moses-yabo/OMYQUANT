import { SubmissionForm as Form, SubmissionButton } from "../submission-feedback";
import type { RecordProps } from "./types";

export function CustomerEnquiry({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  return (<>{tool === "enquiries" && (<>
    <p>{record.question}</p>
    <p>{record.answer || "No reply yet."}</p>
    {loaded.writable && (<Form method="post">
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="intent" value="reply" />
      <input type="hidden" name="record" value={record._id} />
      <label>
        Reply to customer
        <textarea name="answer" maxLength={4000} required defaultValue={record.answer} />
      </label>
      <SubmissionButton className="button small" disabled={pending}>
        Send reply
      </SubmissionButton>
    </Form>)}
  </>)}</>);
}
