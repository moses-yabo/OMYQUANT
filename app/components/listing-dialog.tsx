import { LoadingImage } from "./loading";
import { SubmissionForm as Form, SubmissionButton, useFetcherSubmission } from "./submission-feedback";
import { useEffect, useState, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { Icon } from "./icon";
import { zar, type Listing } from "../lib/marketplace";
import { rentalUnits, type RentalUnit } from "../lib/rental-pricing";

export function ListingDialog({
  listing,
  preview,
  demo,
  close,
}: {
  listing: Listing;
  preview: boolean;
  demo: boolean;
  close: () => void;
}) {
  const fetcher = useFetcher<{
    error?: string;
    success?: string;
    reference?: string;
  }>();
  const beginSubmission = useFetcherSubmission(fetcher.state, fetcher.data);
  const confirmation = useRef<HTMLElement>(null);
  const completed = fetcher.state === "idle" && Boolean(fetcher.data?.success);
  const isOrder = listing.kind === "products" || listing.kind === "livestock";
  const isRental = listing.kind === "trailers";
  useEffect(() => {
    if (completed) confirmation.current?.scrollIntoView({ block: "nearest" });
  }, [completed]);
  const [count, setCount] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rateUnit, setRateUnit] = useState<RentalUnit>("day");
  const days = rentalUnits(Date.parse(start), Date.parse(end), rateUnit);
  const rate =
    rateUnit === "hour"
      ? (listing.hourlyPrice ?? listing.price)
      : rateUnit === "month"
        ? (listing.monthlyPrice ?? listing.price)
        : listing.price;
  const units = listing.kind === "trailers" ? Math.max(0, days) : count;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <dialog
        className="listing-modal"
        aria-labelledby="listing-title"
        ref={(node) => {
          if (node && !node.open) node.showModal();
        }}
        onCancel={close}
        onClick={(e) => e.stopPropagation()}
      >
        <SubmissionButton
          autoFocus
          className="modal-close"
          aria-label="Close listing"
          onClick={close}
        >
          <Icon name="close" />
        </SubmissionButton>
        {listing.image && (
          <LoadingImage
            className="modal-image"
            src={listing.image}
            alt={listing.name}
          />
        )}
        <div className="modal-content">
          <span className="eyebrow">{listing.tag}</span>
          <h2 id="listing-title">{listing.name}</h2>
          <p>{listing.description}</p>
          <p className="listing-location">
            <Icon name="pin" size={16} />
            {listing.location}, {listing.province}
          </p>
          <h3>
            {zar(listing.price)} <small>/ {listing.unit}</small>
          </h3>
          {preview ? (
            <p className="notice">
              This is a sample listing. Booking isn’t available in preview mode.
            </p>
          ) : completed ? (
            <section
              className="booking-success"
              ref={confirmation}
              aria-label={
                isOrder
                  ? "Order confirmation"
                  : isRental
                    ? "Rental request confirmation"
                    : "Booking confirmation"
              }
            >
              <div
                className="booking-success-message"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="booking-success-icon">
                  <Icon name="check" size={26} />
                </span>
                <div>
                  <h3>
                    {isRental
                      ? "Rental request sent successfully!"
                      : listing.kind === "taxis"
                        ? "Seats reserved!"
                        : "Order placed successfully!"}
                  </h3>
                  <p>{fetcher.data?.success}</p>
                  {fetcher.data?.reference && (
                    <p className="booking-reference">
                      {isOrder
                        ? "Order reference"
                        : isRental
                          ? "Rental reference"
                          : "Reference"}
                      : {fetcher.data.reference}
                    </p>
                  )}
                </div>
              </div>
              <div className="booking-success-actions">
                <Link
                  className="button"
                  to={
                    isOrder
                      ? "/account#orders"
                      : isRental
                        ? "/account#reservations"
                        : "/account"
                  }
                >
                  {isOrder
                    ? "View my orders"
                    : isRental
                      ? "View my rentals"
                      : "View my activity"}{" "}
                  <Icon name="arrow" size={16} />
                </Link>
                <SubmissionButton
                  type="button"
                  className="button outline"
                  onClick={close}
                >
                  Done
                </SubmissionButton>
              </div>
            </section>
          ) : (
            <fetcher.Form
              method="post"
              action="/reserve"
              onSubmit={(event) => {
                if (!beginSubmission()) event.preventDefault();
              }}
            >
              <input type="hidden" name="demo" value={String(demo)} />
              <input type="hidden" name="id" value={listing.id} />
              <input type="hidden" name="kind" value={listing.kind} />
              {isOrder && !demo && !preview && (
                <Link
                  className="text-button"
                  to={`/enquiries?${new URLSearchParams({ listing: listing.id, kind: listing.kind === "products" ? "product" : "livestock" })}`}
                >
                  Ask the seller
                </Link>
              )}
              {isRental && (
                <label>
                  Rental rate
                  <select
                    name="rateUnit"
                    value={rateUnit}
                    onChange={(event) => {
                      setRateUnit(event.target.value as RentalUnit);
                      setStart("");
                      setEnd("");
                    }}
                  >
                    <option value="day">Per day — {zar(listing.price)}</option>
                    {listing.hourlyPrice !== undefined && (
                      <option value="hour">
                        Per hour — {zar(listing.hourlyPrice)}
                      </option>
                    )}
                    {listing.monthlyPrice !== undefined && (
                      <option value="month">
                        Per 30-day month — {zar(listing.monthlyPrice)}
                      </option>
                    )}
                  </select>
                </label>
              )}
              {listing.kind === "trailers" ? (
                <div className="form-grid">
                  <label>
                    Collection date
                    <input
                      type={rateUnit === "hour" ? "datetime-local" : "date"}
                      name="start"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </label>
                  <label>
                    Return date
                    <input
                      type={rateUnit === "hour" ? "datetime-local" : "date"}
                      name="end"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      min={start || new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </label>
                </div>
              ) : (
                <label>
                  {listing.kind === "taxis" ? "Seats" : "Quantity"}
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    max={listing.quantity}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    required
                  />
                </label>
              )}
              {listing.kind !== "taxis" && listing.kind !== "trailers" && (
                <label>
                  Fulfilment
                  <select name="fulfilment">
                    <option value="collection">Collect from seller</option>
                    <option value="delivery">Arrange delivery</option>
                  </select>
                </label>
              )}
              {listing.kind === "trailers" && (
                <p className="muted">
                  The rental business confirms your request. Pay the business
                  directly.
                </p>
              )}
              {listing.kind === "taxis" && (
                <p className="muted">
                  Up to 15 passengers per taxi. If this taxi fills before you
                  confirm, your group may move to the next scheduled taxi on the
                  same operator and route at the same fare. The departure time
                  may be later; check your confirmation.
                </p>
              )}
              <div className="notice">
                <strong>
                  Estimated total:{" "}
                  {zar((isRental ? rate : listing.price) * units)}
                </strong>
                <br />
                {listing.kind === "trailers"
                  ? `${units} rental ${rateUnit}(s), rounded up. Times are South African time. A month is 30 days. Subject to business confirmation.`
                  : `${units} × ${zar(listing.price)}`}
              </div>
              <SubmissionButton
                className="button full"
                disabled={
                  fetcher.state !== "idle" ||
                  listing.quantity < 1 ||
                  (listing.kind === "trailers" && days <= 0)
                }
              >
                {fetcher.state !== "idle" && (
                  <span className="submission-spinner" aria-hidden="true" />
                )}
                {fetcher.state !== "idle"
                  ? "Submitting…"
                  : listing.kind === "trailers"
                    ? "Request reservation"
                    : listing.kind === "taxis"
                      ? "Reserve seats"
                      : "Place order"}
              </SubmissionButton>
            </fetcher.Form>
          )}
          {fetcher.data?.error && (
            <p role="alert" className="notice error">
              {fetcher.data.error} <Link to="/login">Sign in</Link>
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}
