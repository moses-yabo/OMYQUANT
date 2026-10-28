import {
  SubmissionForm as Form,
  SubmissionButton,
} from "../components/submission-feedback";
import { redirect } from "react-router";
import { data, Link, useNavigation } from "react-router";
import type { Route } from "./+types/business-profile";
import { Shell } from "../components/shell";
import { api, mutationOrigin, result } from "../.server/frontend";
import {
  businessPermissions,
  verificationStatus,
} from "../lib/business-registry";
import { boundedBody, imageLimit } from "../.server/database/images";
import { storeBusinessDocument } from "../.server/database/business-documents";
import { authenticate } from "../.server/modules/auth/auth";
import { manage } from "../.server/shared/access";
import { connectToDatabase } from "../.server/database/connect";
import { ApiError } from "../.server/shared/http";

type Business = {
  _id: string;
  name: string;
  description: string;
  types: string[];
  verified: boolean;
  active: boolean;
  verificationStatus?: string;
  verification?: { reason?: string };
  verificationDocuments?: { file: string; name: string }[];
  logisticsProfile?: {
    serviceAreas: string[];
    basePrice: number;
    perKmPrice: number;
    available: boolean;
  };
  contact: { email: string; phone: string };
  locations: {
    address: string;
    province: string;
    latitude?: number;
    longitude?: number;
  }[];
};
type Member = {
  _id: string;
  user: string;
  role: string;
  permissions: string[];
};
export async function loader({ request, params }: Route.LoaderArgs) {
  const response = await api(request, `businesses/${params.id}`);
  if (response.status === 401) throw redirect("/login");
  const payload = await result<Business>(response);
  if (!response.ok || !payload.data)
    throw new Response(payload.error?.message ?? "Business unavailable", {
      status: response.status,
    });
  const teamResponse = await api(
    request,
    `businesses/${params.id}/memberships`,
  );
  const team = await result<Member[]>(teamResponse);
  return data(
    {
      business: payload.data,
      canEdit: teamResponse.ok,
      members: team.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  try {
    await connectToDatabase();
    const actor = await authenticate(request);
    await manage(actor, params.id!, undefined, true);
    const bytes = await boundedBody(request, imageLimit * 5 + 65536);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    }).formData();
    const get = (key: string) => String(form.get(key) ?? "");
    const intent = get("intent");
    let path = `businesses/${params.id}`;
    let method = "PATCH";
    let body: unknown;
    if (intent === "profile") {
      const currentResponse = await api(request, path);
      const current = await result<Business>(currentResponse);
      if (!currentResponse.ok || !current.data)
        throw new ApiError(
          currentResponse.status,
          "Unable to load current business locations",
        );
      const additional = current.data.locations
        .slice(1)
        .map((location) => ({
          address: location.address,
          province: location.province,
          ...(typeof location.latitude === "number"
            ? { latitude: location.latitude }
            : {}),
          ...(typeof location.longitude === "number"
            ? { longitude: location.longitude }
            : {}),
        }));
      body = {
        name: get("name"),
        description: get("description"),
        contact: { email: get("email"), phone: get("phone") },
        locations: [
          { address: get("address"), province: get("province") },
          ...additional,
        ],
      };
    } else if (intent === "availability")
      body = { active: get("active") === "true" };
    else if (intent === "logistics")
      body = {
        logisticsProfile: {
          serviceAreas: get("serviceAreas")
            .split("\n")
            .map((area) => area.trim())
            .filter(Boolean),
          basePrice: Math.round(Number(get("basePrice")) * 100),
          perKmPrice: Math.round(Number(get("perKmPrice")) * 100),
          available: get("available") === "true",
        },
      };
    else if (intent === "documents") {
      const files = form
        .getAll("documents")
        .filter((file): file is File => file instanceof File && file.size > 0);
      if (!files.length || files.length > 5)
        throw new ApiError(400, "Upload one to five documents");
      const documents = [];
      for (const file of files)
        documents.push(await storeBusinessDocument(file, actor.id));
      body = { verificationDocuments: documents };
    } else if (intent === "member") {
      path += "/memberships";
      method = "POST";
      body = {
        user: get("user"),
        role: get("role"),
        permissions: form.getAll("permissions").map(String),
      };
    } else if (intent === "remove") {
      if (!/^[a-f0-9]{24}$/i.test(get("user")))
        throw new ApiError(400, "Invalid member");
      path += `/memberships/${get("user")}`;
      method = "DELETE";
    } else throw new ApiError(400, "Unknown business action");
    const response = await api(request, path, method, body);
    const payload = await result(response);
    return data(
      {
        error: response.ok ? "" : (payload.error?.message ?? "Unable to save"),
        success: response.ok ? "Business changes saved." : "",
      },
      { status: response.status },
    );
  } catch (error) {
    if (
      error instanceof ApiError ||
      (error instanceof Error && "status" in error)
    )
      return data(
        { error: error.message, success: "" },
        { status: Number((error as { status: number }).status) },
      );
    throw error;
  }
}
export default function BusinessProfile({
  loaderData: loaded,
  actionData,
}: Route.ComponentProps) {
  const business = loaded.business;
  const pending = useNavigation().state !== "idle";
  return (
    <Shell>
      <div className="form-page">
        <Link to="/business">My businesses</Link>
        {" · "}
        <Link to="/">Personal marketplace</Link>
        <h1>{business.name}</h1>
        <p className="notice">
          {verificationStatus(business).replaceAll("_", " ")}
          {business.verification?.reason
            ? `: ${business.verification.reason}`
            : ""}
        </p>
        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.success && (
          <p className="notice" role="status">
            {actionData.success}
          </p>
        )}
        {business.verified && (
          <Link
            className="button outline small"
            to={`/business/${business._id}/tools`}
          >
            Business dashboard
          </Link>
        )}
        <Form method="post" className="form-panel">
          <h2>Business profile</h2>
          <input type="hidden" name="intent" value="profile" />
          <fieldset disabled={!loaded.canEdit || pending}>
            <label>
              Business name
              <input name="name" required defaultValue={business.name} />
            </label>
            <label>
              Description
              <textarea
                name="description"
                required
                defaultValue={business.description}
              />
            </label>
            <label>
              Contact email
              <input
                name="email"
                type="email"
                required
                defaultValue={business.contact?.email}
              />
            </label>
            <label>
              Contact phone
              <input
                name="phone"
                required
                defaultValue={business.contact?.phone}
              />
            </label>
            <label>
              Physical address
              <input
                name="address"
                required
                defaultValue={business.locations?.[0]?.address}
              />
              <span className="muted">
                Use a full street address, suburb and town. Geoapify can convert
                it into an administration map location.
              </span>
            </label>
            <label>
              Province
              <input
                name="province"
                required
                defaultValue={business.locations?.[0]?.province}
              />
            </label>
            <SubmissionButton className="button">Save profile</SubmissionButton>
          </fieldset>
        </Form>
        {loaded.canEdit && (
          <>
            <Form method="post" className="form-panel">
              <h2>Operational status</h2>
              <input type="hidden" name="intent" value="availability" />
              <label>
                Business availability
                <select name="active" defaultValue={String(business.active)}>
                  <option value="true">Active</option>
                  <option value="false">Paused</option>
                </select>
              </label>
              <p className="muted">
                Pausing hides public listings. Resuming still requires approval.
              </p>
              <SubmissionButton className="button" disabled={pending}>
                Save availability
              </SubmissionButton>
            </Form>
            {business.types.includes("logistics") && (
              <Form method="post" className="form-panel">
                <h2>Delivery service settings</h2>
                <input type="hidden" name="intent" value="logistics" />
                <label>
                  Service areas (one per line)
                  <textarea
                    name="serviceAreas"
                    required
                    defaultValue={business.logisticsProfile?.serviceAreas?.join(
                      "\n",
                    )}
                  />
                </label>
                <label>
                  Base price (R)
                  <input
                    name="basePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={
                      (business.logisticsProfile?.basePrice ?? 0) / 100
                    }
                  />
                </label>
                <label>
                  Price per kilometre (R)
                  <input
                    name="perKmPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={
                      (business.logisticsProfile?.perKmPrice ?? 0) / 100
                    }
                  />
                </label>
                <label>
                  Accepting new delivery work
                  <select
                    name="available"
                    defaultValue={String(
                      business.logisticsProfile?.available !== false,
                    )}
                  >
                    <option value="true">Available</option>
                    <option value="false">Unavailable</option>
                  </select>
                </label>
                <p className="muted">
                  These settings guide your quotes. Customers accept a specific
                  quote before work is assigned.
                </p>
                <SubmissionButton className="button" disabled={pending}>
                  Save delivery settings
                </SubmissionButton>
              </Form>
            )}
            <section className="form-panel">
              <h2>Verification documents</h2>
              {business.verificationDocuments?.map((document) => (
                <p key={document.file}>
                  <a href={`/business/documents/${document.file}`}>
                    {document.name}
                  </a>
                </p>
              ))}
              <Form method="post" resetOnSuccess encType="multipart/form-data">
                <input type="hidden" name="intent" value="documents" />
                <label>
                  Replace documents
                  <input
                    name="documents"
                    type="file"
                    multiple
                    required
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                  />
                </label>
                <p className="muted">
                  Up to five files, 5 MiB each. Submitting documents returns the
                  application to pending review and pauses public listings until
                  approval.
                </p>
                <SubmissionButton className="button" disabled={pending}>
                  Submit for review
                </SubmissionButton>
              </Form>
            </section>
            <section className="form-panel">
              <h2>Business team</h2>
              <p className="muted">
                These permissions apply only to this business. Managers manage
                all enabled services; staff receive only the permissions
                selected below. Platform admin roles are separate.
              </p>
              {loaded.members.map((member) => (
                <div key={member._id} className="activity-card">
                  <p>
                    {member.user} · {member.role}
                  </p>
                  <p>{member.permissions?.join(", ")}</p>
                  {member.role !== "owner" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="user" value={member.user} />
                      <SubmissionButton
                        className="button outline small"
                        disabled={pending}
                      >
                        Remove access
                      </SubmissionButton>
                    </Form>
                  )}
                </div>
              ))}
              <Form method="post" resetOnSuccess>
                <input type="hidden" name="intent" value="member" />
                <label>
                  Existing user ID
                  <input name="user" pattern="[a-fA-F0-9]{24}" required />
                </label>
                <label>
                  Business role
                  <select name="role">
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
                <fieldset>
                  <legend>Staff service permissions</legend>
                  {businessPermissions
                    .filter((permission) =>
                      business.types.includes(permission.split(":")[0]),
                    )
                    .map((permission) => (
                      <label key={permission}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={permission}
                        />
                        {permission}
                      </label>
                    ))}
                </fieldset>
                <SubmissionButton className="button" disabled={pending}>
                  Add business member
                </SubmissionButton>
              </Form>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
