import { SubmissionForm as Form, SubmissionButton, useFetcherSubmission } from "../components/submission-feedback";
import { useEffect, useState, useRef } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/home";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { samples, sections, zar, type Listing } from "../lib/marketplace";
import { api, configured, result } from "../.server/frontend";
import { demoEnabled } from '../.server/demo-mode';
import { categoryContent } from '../lib/category-content';
import { taxiSeatsAvailable } from '../lib/taxi-capacity';
import { rentalUnits, type RentalUnit } from '../lib/rental-pricing';

type RecordData = {
  _id: string;
  name?: string;
  description?: string;
  price?: number;
  dailyPrice?: number;
  hourlyPrice?: number;
  monthlyPrice?: number;
  unit?: string;
  location?: { address?: string; province?: string };
  images?: string[];
  quantity?: number;
  remaining?: number;
  capacity?: number;
  startsAt?: string;
  route?: { name?: string; stops?: { address?: string; province?: string }[] };
};
export function meta() {
  return [
    { title: "OMYQUANT | Good things, closer to home" },
    {
      name: "description",
      content:
        "Discover local farm produce, livestock, taxi trips, trailer rentals and deliveries. One marketplace, more possibilities.",
    },
  ];
}
export async function loader({ request }: Route.LoaderArgs) {
  if (!configured()) {
    return {
      listings: samples,
      preview: !demoEnabled(),
      demo: demoEnabled(),
      accountId: null,
      error: "",
      page: 1,
      hasNext: false,
    };
  }
  const search = new URL(request.url).searchParams;
  const current = Math.max(1, Math.min(10000, Number(search.get("page")) || 1));
  const filters = new URLSearchParams({ limit: "100", page: String(current) });
  for (const key of ["q", "province", "sort"])
    if (search.get(key)) filters.set(key, search.get(key)!);
  const endpoints = {
    products: "farming/products",
    livestock: "farming/livestock",
    trailers: "rentals/trailers",
    taxis: "transport/departures",
  };
  const responses = await Promise.all(
    Object.entries(endpoints).map(async ([kind, path]) => {
      const response = await api(
        request,
        path +
          "?" +
          (kind === "taxis"
            ? new URLSearchParams({ limit: "100", page: String(current) })
            : filters),
      );
      return { kind, response };
    }),
  );
  const listings: Listing[] = [];
  const errors: string[] = [];
  let hasNext = false;
  for (const { kind, response } of responses) {
    const payload = await result<RecordData[]>(response);
    if (!response.ok) {
      errors.push(kind);
      continue;
    }
    if (payload.data?.length === 100) hasNext = true;
    for (const item of payload.data ?? [])
      listings.push({
        id: item._id,
        kind,
        name: item.name ?? item.route?.name ?? "Scheduled taxi departure",
        description:
          item.description ??
          (item.startsAt
            ? `Departure: ${new Date(item.startsAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}`
            : ""),
        price: item.price ?? item.dailyPrice ?? 0,
        ...(item.hourlyPrice !== undefined ? { hourlyPrice: item.hourlyPrice } : {}),
        ...(item.monthlyPrice !== undefined ? { monthlyPrice: item.monthlyPrice } : {}),
        unit:
          kind === "taxis"
            ? "seat"
            : kind === "trailers"
              ? "day"
              : (item.unit ?? "animal"),
        location:
          item.location?.address ??
          item.route?.stops?.[0]?.address ??
          "South Africa",
        province:
          item.location?.province ?? item.route?.stops?.[0]?.province ?? "",
        image: item.images?.[0] ?? "",
        tag: sections.find((s) => s.id === kind)?.name ?? "",
        quantity: kind === 'taxis' && item.capacity !== undefined && item.remaining !== undefined ? taxiSeatsAvailable(item.capacity, item.remaining) : item.remaining ?? item.quantity ?? 1,
      });
  }
  return {
    listings,
    preview: false,
    demo: false,
    accountId: null,
    error: errors.length
      ? `We couldn’t load ${errors.join(", ")}. Please try again shortly.`
      : "",
    page: current,
    hasNext,
  };
}
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const data = await serverLoader();
  if (!data.demo) return data;
  try { const { localListings } = await import('../lib/local-bookings'); const { currentBrowserUser } = await import('../lib/browser-auth'); return { ...data, listings: localListings((await currentBrowserUser())?.id) }; }
  catch (error) { return { ...data, error: error instanceof Error ? error.message : 'Browser storage is unavailable.' }; }
}
clientLoader.hydrate = true as const;
export function HydrateFallback() { return <Shell><div className="form-page"><p className="notice">Loading your marketplace…</p></div></Shell>; }
export default function Home({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const section = params.get("section") ?? "all";
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const query = params.get("q") ?? "";
  const province = params.get("province") ?? "";
  const sort = params.get("sort") ?? "recent";
  const isLanding = section === 'all' && !params.has('saved') && !query && !province;
  const content = categoryContent[params.has('saved') ? 'saved' : section === 'all' ? 'search' : section] ?? categoryContent.search;
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("omyquant-saved") ?? "[]",
      );
      if (Array.isArray(value))
        setSaved(value.filter((v): v is string => typeof v === "string"));
    } catch {}
  }, []);
  function toggle(id: string) {
    const next = saved.includes(id)
      ? saved.filter((s) => s !== id)
      : [...saved, id];
    setSaved(next);
    try {
      localStorage.setItem("omyquant-saved", JSON.stringify(next));
    } catch {}
  }
  const listings = loaderData.listings
    .filter(
      (l) =>
        (section === "all" || l.kind === section) &&
        (!params.has("saved") || saved.includes(l.id)) &&
        (!province || l.province === province) &&
        `${l.name} ${l.description} ${l.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : 0,
    );
  return (
    <Shell>
      <div className={`marketplace-page ${isLanding ? 'marketplace-landing' : 'marketplace-focused'}`}>
        {isLanding ? <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">ROOTED LOCALLY. CONNECTED NATIONALLY.</div>
            <h1>
              Good things, closer to home<span>.</span>
            </h1>
            <p>
              From the farm to the road. Find what you need, from people near
              you.
            </p>
          </div>
          <span className="intro-stamp">
            <Icon name="sun" size={24} />
            Made for
            <br />
            South Africa
          </span>
        </div>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span /> ONE COMMUNITY. MORE POSSIBILITIES.
            </span>
            <h2>
              Your next good find
              <br />
              starts right here.
            </h2>
            <p>
              Fresh harvests. Open roads. Local businesses.
              <br />
              All connected, in one place.
            </p>
            <Link to="/?section=products#listings" className="button cream">
              Explore the farm market <Icon name="arrow" size={17} />
            </Link>
            <div className="hero-note">
              <Icon name="check" size={15} /> Supporting independent businesses
            </div>
          </div>
          <div
            className="hero-picture"
            role="img"
            aria-label="Lush green agricultural fields"
          >
            <div className="hero-floating">
              <span className="floating-icon">
                <Icon name="leaf" size={22} />
              </span>
              <div>
                <strong>Grown with care.</strong>
                <small>Found on OMYQUANT.</small>
              </div>
              <span className="float-check">✓</span>
            </div>
            <span className="image-caption">
              A little local goes a long way.
            </span>
          </div>
        </section>
        <div className="service-strip">
          {[
            {
              icon: "leaf",
              title: "Farm to your doorstep",
              text: "Discover local growers",
            },
            {
              icon: "bus",
              title: "Your journey, sorted",
              text: "Find your next taxi trip",
            },
            {
              icon: "trailer",
              title: "More room to move",
              text: "Rent from local businesses",
            },
            {
              icon: "box",
              title: "Send it with confidence",
              text: "Connect with delivery providers",
            },
          ].map((s, i) => (
            <Link
              key={s.title}
              to={
                i === 3
                  ? "/request/delivery"
                  : `/?section=${["products", "taxis", "trailers"][i]}#listings`
              }
            >
              <span className={`service-icon tone-${i}`}>
                <Icon name={s.icon} size={23} />
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.text}</small>
              </div>
              <Icon name="arrow" size={16} />
            </Link>
          ))}
        </div>
        </> : <header className="category-intro">
          <span className="category-intro-icon"><Icon name={content.icon} size={28}/></span>
          <div><div className="eyebrow">{params.has('saved') ? 'YOUR SAVED FINDS' : sections.find(s => s.id === section)?.name ?? 'MARKETPLACE SEARCH'}</div><h1>{content.title}</h1><p>{content.description}</p></div>
          <Link className="button" to={`?${params}#listings`}>{content.action}<Icon name="arrow" size={16}/></Link>
        </header>}
        <section id="listings" className="listing-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">FIND YOUR NEXT GOOD THING</div>
              <h2>
                {params.has("saved")
                  ? "Your saved finds"
                  : section === "all"
                    ? "Explore the marketplace"
                    : (sections.find((s) => s.id === section)?.name ??
                      "Explore the marketplace")}
              </h2>
            </div>
            <span className="result-count">
              {listings.length}{" "}
              {loaderData.preview ? "sample listings" : "listings"}
            </span>
          </div>
          <Form method="get" action="/#listings" className="search-bar">
            <input type="hidden" name="section" value={section} />
            {params.has("saved") && (
              <input type="hidden" name="saved" value="1" />
            )}
            <label className="search-field">
              <Icon name="search" />
              <input
                aria-label="Search listings"
                name="q"
                defaultValue={query}
                placeholder={isLanding ? 'What are you looking for?' : content.placeholder}
                key={query}
              />
            </label>
            <label className="province-field">
              <Icon name="pin" size={18} />
              <select
                aria-label="Province"
                name="province"
                defaultValue={province}
                key={province}
              >
                <option value="">All provinces</option>
                {[
                  "Gauteng",
                  "Limpopo",
                  "Free State",
                  "Western Cape",
                  "Eastern Cape",
                  "KwaZulu-Natal",
                  "Mpumalanga",
                  "North West",
                  "Northern Cape",
                ].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <SubmissionButton className="button">
              Search <Icon name="arrow" size={16} />
            </SubmissionButton>
            <label className="sort-field">
              <select
                aria-label="Sort listings"
                name="sort"
                defaultValue={sort}
                key={sort}
              >
                <option value="recent">Latest finds</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
              </select>
            </label>
          </Form>
          <div className="category-tabs">
            {sections.map((s) => (
              <Link
                key={s.id}
                className={section === s.id ? "tab active" : "tab"}
                to={`/?section=${s.id}${params.has("saved") ? "&saved=1" : ""}#listings`}
              >
                <Icon name={s.icon} size={16} />
                {s.id === "all" ? "All listings" : s.name}
              </Link>
            ))}
          </div>
          {loaderData.preview && (
            <div className="preview-note">
              <span className="tiny-dot" /> Marketplace preview · Sample
              listings for exploring the experience. Reservations become
              available when the marketplace is connected.
            </div>
          )}
          {loaderData.demo && <p className="notice">Demo marketplace · Sample listings. Sign in to try orders, trips and rentals. No real payment is taken.</p>}
          {loaderData.error && (
            <p role="alert" className="notice error">
              {loaderData.error} <Link to="/login">Sign in</Link>
            </p>
          )}
          {listings.length === 0 ? (
            <div className="empty-state">
              <Icon name="search" size={34} />
              <h3>No finds just yet</h3>
              <p>Try another search or explore a different category.</p>
              <Link className="button outline" to="/">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="listing-grid">
              {listings.map((listing) => (
                <article className="listing-card" key={listing.id}>
                  <div className="listing-photo">
                    {listing.image ? (
                      <img
                        src={listing.image}
                        alt={listing.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="photo-placeholder">
                        <Icon
                          name={
                            sections.find((s) => s.id === listing.kind)?.icon ??
                            "leaf"
                          }
                          size={48}
                        />
                      </div>
                    )}
                    <span className="listing-tag">{listing.tag}</span>
                    <SubmissionButton
                      className={`save-button ${saved.includes(listing.id) ? "saved" : ""}`}
                      aria-label={`${saved.includes(listing.id) ? "Unsave" : "Save"} ${listing.name}`}
                      aria-pressed={saved.includes(listing.id)}
                      onClick={() => toggle(listing.id)}
                    >
                      <Icon name="heart" size={18} />
                    </SubmissionButton>
                  </div>
                  <SubmissionButton
                    className="listing-details"
                    onClick={() => setSelected(listing)}
                  >
                    <div className="listing-location">
                      <Icon name="pin" size={13} />
                      {listing.location}
                      {listing.province && `, ${listing.province}`}
                    </div>
                    <h3>{listing.name}</h3>
                    <div className="listing-bottom">
                      <div>
                        <strong>{zar(listing.price)}</strong>
                        <span> / {listing.unit}</span>
                      </div>
                      <span className="card-arrow">
                        <Icon name="arrow" size={17} />
                      </span>
                    </div>
                  </SubmissionButton>
                </article>
              ))}
            </div>
          )}
          {(loaderData.page > 1 || loaderData.hasNext) && (
            <div className="pagination">
              {loaderData.page > 1 && (
                <Link
                  className="button outline"
                  to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(loaderData.page - 1) })}`}
                >
                  Previous page
                </Link>
              )}
              <span>Page {loaderData.page}</span>
              {loaderData.hasNext && (
                <Link
                  className="button outline"
                  to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(loaderData.page + 1) })}`}
                >
                  Next page <Icon name="arrow" size={16} />
                </Link>
              )}
            </div>
          )}
        </section>
        <section className="community-banner">
          <span className="community-art">
            <Icon name="store" size={43} />
          </span>
          <div>
            <span className="eyebrow">BIG OPPORTUNITIES START LOCAL</span>
            <h2>Your business belongs here.</h2>
            <p>
              Reach new customers. Build new connections. Grow on your terms.
            </p>
          </div>
          <Link className="button" to="/business">
            Join the community <Icon name="arrow" size={17} />
          </Link>
        </section>
      </div>
      {selected && (
        <ListingDialog
          listing={selected}
          preview={loaderData.preview}
          demo={loaderData.demo}
          close={() => setSelected(null)}
        />
      )}
    </Shell>
  );
}
function ListingDialog({
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
  const fetcher = useFetcher<{ error?: string; success?: string; reference?: string }>();
  const beginSubmission = useFetcherSubmission(fetcher.state, fetcher.data);
  const confirmation = useRef<HTMLElement>(null);
  const completed = fetcher.state === 'idle' && Boolean(fetcher.data?.success);
  const isOrder = listing.kind === 'products' || listing.kind === 'livestock';
  const isRental = listing.kind === 'trailers';
  useEffect(() => {
    if (completed) confirmation.current?.scrollIntoView({ block: 'nearest' });
  }, [completed]);
  const [count, setCount] = useState(1);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rateUnit, setRateUnit] = useState<RentalUnit>('day');
  const days = rentalUnits(Date.parse(start), Date.parse(end), rateUnit);
  const rate = rateUnit === 'hour' ? listing.hourlyPrice ?? listing.price : rateUnit === 'month' ? listing.monthlyPrice ?? listing.price : listing.price;
  const units = listing.kind === 'trailers' ? Math.max(0, days) : count;
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
          <img className="modal-image" src={listing.image} alt={listing.name} />
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
            <section className="booking-success" ref={confirmation} aria-label={isOrder ? 'Order confirmation' : isRental ? 'Rental request confirmation' : 'Booking confirmation'}>
              <div className="booking-success-message" role="status" aria-live="polite" aria-atomic="true">
                <span className="booking-success-icon"><Icon name="check" size={26}/></span>
                <div>
                  <h3>{isRental ? 'Rental request sent successfully!' : listing.kind === 'taxis' ? 'Seats reserved!' : 'Order placed successfully!'}</h3>
                  <p>{fetcher.data?.success}</p>
                  {fetcher.data?.reference && <p className="booking-reference">{isOrder ? 'Order reference' : isRental ? 'Rental reference' : 'Reference'}: {fetcher.data.reference}</p>}
                </div>
              </div>
              <div className="booking-success-actions">
                <Link className="button" to={isOrder ? '/account#orders' : isRental ? '/account#reservations' : '/account'}>{isOrder ? 'View my orders' : isRental ? 'View my rentals' : 'View my activity'} <Icon name="arrow" size={16}/></Link>
                <SubmissionButton type="button" className="button outline" onClick={close}>Done</SubmissionButton>
              </div>
            </section>
          ) : (
            <fetcher.Form method="post" action="/reserve" onSubmit={event => { if (!beginSubmission()) event.preventDefault(); }}>
              <input type="hidden" name="demo" value={String(demo)}/>
              <input type="hidden" name="id" value={listing.id} />
              <input type="hidden" name="kind" value={listing.kind} />
              {isOrder && !demo && !preview && <Link className="text-button" to={`/enquiries?${new URLSearchParams({ listing: listing.id, kind: listing.kind === 'products' ? 'product' : 'livestock' })}`}>Ask the seller</Link>}
              {isRental && <label>Rental rate<select name="rateUnit" value={rateUnit} onChange={event => { setRateUnit(event.target.value as RentalUnit); setStart(''); setEnd(''); }}><option value="day">Per day — {zar(listing.price)}</option>{listing.hourlyPrice !== undefined && <option value="hour">Per hour — {zar(listing.hourlyPrice)}</option>}{listing.monthlyPrice !== undefined && <option value="month">Per 30-day month — {zar(listing.monthlyPrice)}</option>}</select></label>}
              {listing.kind === "trailers" ? (
                <div className="form-grid">
                  <label>
                    Collection date
                    <input type={rateUnit === 'hour' ? 'datetime-local' : 'date'} name="start" value={start} onChange={e => setStart(e.target.value)} min={new Date().toISOString().slice(0, 10)} required />
                  </label>
                  <label>
                    Return date
                    <input type={rateUnit === 'hour' ? 'datetime-local' : 'date'} name="end" value={end} onChange={e => setEnd(e.target.value)} min={start || new Date().toISOString().slice(0, 10)} required />
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
                    onChange={e => setCount(Number(e.target.value))}
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
              {listing.kind === 'taxis' && <p className="muted">Up to 15 passengers per taxi. If this taxi fills before you confirm, your group may move to the next scheduled taxi on the same operator and route at the same fare. The departure time may be later; check your confirmation.</p>}
              <div className="notice"><strong>Estimated total: {zar((isRental ? rate : listing.price) * units)}</strong><br/>{listing.kind === 'trailers' ? `${units} rental ${rateUnit}(s), rounded up. Times are South African time. A month is 30 days. Subject to business confirmation.` : `${units} × ${zar(listing.price)}`}</div>
              <SubmissionButton
                className="button full"
                disabled={fetcher.state !== "idle" || listing.quantity < 1 || (listing.kind === 'trailers' && days <= 0)}
              >
                {fetcher.state !== "idle" && <span className="submission-spinner" aria-hidden="true" />}
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
