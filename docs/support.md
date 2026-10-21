# Customer and business complaints

The customer/business interface also has a floating **Chat with support** popup. Signed-in non-admin users can start conversations, reopen recent cases and exchange messages without leaving the page. Visitors are prompted to sign in; browser demo identities cannot send messages. Chats use the same MongoDB SupportTicket records (`channel=chat`) and appear in both admin roles' inbox. Short first messages are accepted for chat; ordinary complaint descriptions still require 10 characters.

Socket.IO `/support` authenticates the existing HttpOnly server session through a server-side account lookup. Demo room keys cannot authenticate it. Each outgoing signal rechecks the session and role; only current admins and the relevant reporter receive an opaque ticket ID. Message text is fetched through the authorized API, retaining private-note filtering. Clients cannot publish support signals or choose another user's room. Activity is published after a successful database write.

Staff see new-activity notices on other admin pages. Open support pages refresh on socket activity, with automatic refresh deferred while a form/draft is active. The popup also checks every 15 seconds while visible, and support pages every 30 seconds, as a reconnect/multi-instance fallback. Signals use an in-process bus, without a shared adapter or durable outbox, so immediate cross-instance delivery is not guaranteed. Messages remain in MongoDB across reconnects. Connected means the transport is connected, not that an agent is online. Background push and reply-time guarantees are not provided.

Signed-in MongoDB customers and business members can open **Help and complaints** from My activity or My business. **Report a problem** beside a transaction pre-fills its type and reference. The `/support` page lists only complaints created by that account and provides a submission form. Demo/preview complaints are not stored or sent to staff.

Categories cover damaged/broken deliveries, late delivery/service delays, spoiled farm goods, sick livestock, taxi bookings, trailer rentals and other complaints. Each complaint has a subject, description and optional linked order/booking/reservation/delivery/transport request. Linking requires ownership as the transaction customer or membership of its business; platform admins may link an existing transaction. Unverified businesses can still report problems.

Both regular admins and super admins have **Support complaints** at `/admin/support`. Super admins also have an overview shortcut. The queue defaults to open/under-review cases and supports status/category filters and pagination. Open a complaint to see the reporter, description, linked reference and history. Staff can post public replies, add internal notes and set Open, Under review, Resolved or Closed with a note. A reporter follow-up to a resolved/closed case reopens it.

Only the reporter and platform administrators can read a complaint. Business membership permits linking a transaction but does not expose another person's complaint. Internal notes are removed on the server from reporter responses. Public replies and current status remain visible. Administrator permissions are checked for each request.

SupportTicket stores status and embedded history with author, timestamp, text, visibility and any status decision. Atomic updates record history and status together; a version check rejects stale updates with 409. Text is bounded to a 160-character subject and 4,000-character description/reply. History is capped at 100 updates per ticket; a case reaching the limit requires a new case referencing the original. No automatic deletion or TTL is configured.

All API paths are under `/api/v1`:

| Path | Behavior |
| --- | --- |
| `/support` | GET own queue; POST `{category, subject, description, relatedKind?, relatedId?}` |
| `/support/:id` | GET own detail without internal notes; PATCH `{message, version}` |
| `/admin/support` | GET all complaints, admin only |
| `/admin/support/:id` | GET full history; PATCH `{message, version, internal?, status?}`, admin only |

Queues accept `status=active|all|open|in_review|resolved|closed`, optional `category`, `page` and `limit`. Forms use 20 records per page. Reporter APIs reject status changes or private notes. Responses retain `{data}`/`{error}` and no-store headers; forms enforce mutation-origin protection.

Current scope is text-based case management. Evidence uploads, automatic refunds/suspension, support email/push notifications, staff assignment, response-time guarantees and per-case rate limiting are not implemented. Reporters check replies on the support page. Automated tests use mocked persistence for ownership, private-note filtering, role guards, transaction linking and versioned updates; live MongoDB and browser integration still need verification.
