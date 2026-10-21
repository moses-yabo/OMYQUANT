# OMYQUANT product vision

OMYQUANT is a South African marketplace connecting customers with independent agricultural sellers, transport operators and trailer rental businesses. It follows an asset-light model: OMYQUANT does not own the taxi fleets or trailers. This document describes intent; [FEATURE_MATRIX.md](FEATURE_MATRIX.md) records implementation status.

## OMYQUANT Market (formerly YM Farm)

Small-scale farmers and agricultural businesses need an alternative to word-of-mouth discovery, scattered seller information and limited price transparency. Buyers need to find sellers by location, compare prices and quantities, and enquire or place orders.

The market covers farmer/business profiles, livestock (including cattle, sheep, goats and poultry), produce such as maize, cabbages and spinach, and animal feed such as hay. Livestock may be purchased for ceremonies, breeding, farming or other lawful purposes. Transportation can be linked to an agricultural order, with specialist requirements for livestock.

## OMYQUANT Transport & Logistics (formerly Quanter Deliver)

- Long-distance minibus taxi seat bookings between cities and provinces, including Eastern Cape and KwaZulu-Natal destinations.
- Interprovincial parcels through participating independent operators and existing minibus taxi networks.
- Local parcels, for example Cape Town to Paarl, where actual operator routes and capacity permit.
- Trailer discovery and rentals from independent rental businesses.

Delivery times depend on routes, departure times, capacity and collection arrangements. There are no guaranteed delivery speeds. Generic delivery requests already exist; discovery of taxi parcel routes remains planned.

## Booking and payment principles

Passenger seats and trailer rentals should eventually confirm instantly when the backend can secure availability and verify provider conditions. A saved request or demo confirmation is not evidence of a real reservation. Unverifiable conditions must not produce a confirmed booking.

MVP trailer customers pay rental businesses directly. Reported external payments remain explicitly unverified by OMYQUANT. Payment gateways, commissions and automated payouts are outside the current approved scope.

## Shared platform direction

Keep one maintainable modular monolith with shared identity, businesses and permissions. One business can offer several services. Separate customer-facing experiences may be considered later while sharing platform infrastructure; splitting applications or services requires an explicit decision.

Preserve the existing UI. Prioritise trustworthy availability, ownership checks, reliable operations and clear service information before expanding workflows. See [ROADMAP.md](ROADMAP.md).
