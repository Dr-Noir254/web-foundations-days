# TicketHub: System Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture, and bottlenecks and trade-offs.

---

## 1. Requirements

### Functional requirements

Users can:

- Register, log in and log out.
- Browse and search events by name, date, city and category.
- View an event's details and its seat map, with each seat's current status (available, held or sold) and price.
- Select one or more seats and **hold** them for a limited time (10 minutes) while they pay.
- Pay for held seats and receive a confirmation.
- View their purchased tickets (with a QR code or ticket code) and their order history.
- Release held seats voluntarily or let the hold expire.

Organizers or admins can create events and define their seats and prices (out of scope for the detailed design below).

### Non-functional requirements

| Quality | Requirement | Why it matters |
|---|---|---|
| **Correctness (most important)** | A seat is never sold to two people. A confirmed payment always results in exactly one ticket per seat. No payment is taken for a seat the user does not get. | Double-selling is the one failure that destroys user trust and causes refunds and legal trouble. |
| **Fairness** | During a big sale, users are served roughly first come, first served. No one can hold seats indefinitely, and a single user is limited to a maximum number of seats (e.g. 6) per event. Bots are rate-limited. | A sale with 10 people competing per seat must feel fair, or users will complain about scalpers and queue jumpers. |
| **Speed** | Browsing pages load in under 1 second (p95). Seat map loads in under 1 second. A hold request responds in under 500 ms (p95), even during a big sale. | Slow pages during a sale make users refresh repeatedly, which makes the load worse. |
| **Availability** | 99.9% for browsing; 99.95% during announced big sales. Browsing must keep working even if payment is slow. | Downtime during a sale means lost revenue and bad press. |
| **Durability** | Orders, payments and tickets are never lost once confirmed (replicated, backed up). | A paid ticket that vanishes is unacceptable. |
| **Scalability** | The system must handle roughly 1,000 times the normal traffic for short bursts (see estimates). | Traffic is extremely spiky. |
| **Security** | Passwords hashed, HTTPS everywhere, payment details handled by a payment provider (we never store card numbers). | Basic safety and compliance. |

**Consistency trade-off stated up front:** seat availability and sales need strong consistency (never wrong). Event browsing can be slightly stale (a few seconds old is fine).

---

## 2. Estimates

### Given facts

- 2,000,000 registered users
- Normal day: 50,000 visitors, each viewing 10 pages; 5,000 tickets sold
- Big sale: 200,000 people try to buy 20,000 seats within the first 10 minutes

### Normal traffic

- Page views per day: 50,000 x 10 = **500,000 page views/day**
- Average: 500,000 / 86,400 s = about **6 requests/second**
- Daily traffic is not flat, so assume a peak of about 5x the average: about **30 requests/second**
- Ticket sales: 5,000 / 86,400 = about **0.06 purchases/second** on average (a few per second at the very most)
- Read to write ratio: heavily read-heavy (browsing is about 100x more common than buying)
- Storage: an order with its tickets is about 1 KB, so 5,000 orders/day = about 5 MB/day = **about 2 GB/year**. A seat row is about 100 bytes, and an event with 20,000 seats is about 2 MB. Storage is not a concern; a single relational database holds this easily.

### Big sale peak

- 200,000 users in 600 seconds = about **333 new users/second** arriving
- Each active user is likely to: load the event page, load the seat map (and refresh it every few seconds), try to hold seats, then pay. Assume about 20 requests per user during the window: 200,000 x 20 = 4,000,000 requests in 600 s = about **6,700 requests/second**. With a front-loaded spike (most users arrive in the first minute), plan for **about 10,000 requests/second** peak.
- Hold attempts: if users retry (seats taken, pick another), assume about 3 attempts per user: 600,000 / 600 s = about **1,000 hold attempts/second**, nearly all hitting the **same event's seats**.
- Purchases: 20,000 seats in 10 minutes = about **33 completed purchases/second** at most (fewer in practice, since some holds expire).
- Contention: 200,000 users compete for 20,000 seats, so about **10 people per seat**. Most hold attempts will fail, and this is expected and must be fast and cheap.

### Comparison

| Metric | Normal day | Big sale (10 min) | Ratio |
|---|---|---|---|
| Requests/second (peak) | about 30 | about 10,000 | about 330x |
| Hold/purchase writes/second | about 0.1 | about 1,000 hold attempts, about 33 sales | about 10,000x on writes |
| Concurrent users | hundreds | tens of thousands | about 100x |
| Contention on the same rows | essentially none | extreme (10 users per seat) | n/a |

**Conclusion:** the average load is trivial, but the sale is a spike of more than 300x that is concentrated on one event and a small set of rows. The design must (a) absorb read traffic with caching, (b) protect the database from the write stampede, and (c) stay correct under extreme contention.

---

## 3. API Design

REST over HTTPS, JSON bodies. All endpoints except browsing require an auth token (`Authorization: Bearer <token>`).

| # | Method and path | Purpose | Notes |
|---|---|---|---|
| 1 | `GET /events?city=&date=&category=&page=` | Browse and search events | Public, heavily cached |
| 2 | `GET /events/{event_id}` | Event details | Public, cached |
| 3 | `GET /events/{event_id}/seats` | Seat map with each seat's status and price | Public, cached for 1-2 seconds; may be slightly stale |
| 4 | `POST /events/{event_id}/holds` | Hold seats | Body: `{ "seat_ids": [101, 102] }`. Returns `201` with `hold_id` and `expires_at`, or `409 Conflict` if any seat is unavailable (all-or-nothing) |
| 5 | `DELETE /holds/{hold_id}` | Release a hold early | Frees the seats |
| 6 | `POST /orders` | Pay for a hold and create the order | Body: `{ "hold_id": "...", "payment_token": "..." }`. Requires an `Idempotency-Key` header. Returns `201` with the order and tickets, `410 Gone` if the hold expired, or `402` if payment failed |
| 7 | `GET /orders/{order_id}` | View one order and its status | Owner only |
| 8 | `GET /me/tickets` | View my tickets | Owner only; returns ticket codes |
| 9 | `POST /auth/register`, `POST /auth/login` | Account creation and login | Rate-limited |

### Example: hold seats

Request:

```http
POST /events/42/holds
Authorization: Bearer <token>
Content-Type: application/json

{ "seat_ids": [101, 102] }
```

Success response (`201 Created`):

```json
{ "hold_id": "h_9f3a", "event_id": 42, "seat_ids": [101, 102],
  "expires_at": "2026-11-01T20:10:00Z" }
```

Failure response (`409 Conflict`):

```json
{ "error": "SEAT_UNAVAILABLE", "unavailable_seat_ids": [102] }
```

### Design decisions

- **Hold and pay are separate steps.** Holding is quick and cheap; paying involves an external provider and can be slow. The hold protects the seat during payment.
- **Holds are all-or-nothing.** A user never ends up with half of the seats they wanted.
- **`POST /orders` is idempotent** through the `Idempotency-Key` header, so a retried request after a network failure cannot charge or create a ticket twice.
- Error codes are meaningful: `409` seat taken, `410` hold expired, `429` too many requests.

---

## 4. Data Model

Relational database (PostgreSQL). Transactions and constraints are the main tool for correctness, so a relational database is the natural fit.

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  city        TEXT NOT NULL,
  category    TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  on_sale_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_city_date ON events (city, starts_at);

CREATE TABLE seats (
  id          BIGSERIAL PRIMARY KEY,
  event_id    BIGINT NOT NULL REFERENCES events(id),
  section     TEXT NOT NULL,
  row_label   TEXT NOT NULL,
  seat_number INT  NOT NULL,
  price_cents INT  NOT NULL CHECK (price_cents >= 0),
  status      TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'held', 'sold')),
  held_by     BIGINT REFERENCES users(id),
  held_until  TIMESTAMPTZ,
  hold_id     TEXT,
  UNIQUE (event_id, section, row_label, seat_number),
  -- a held seat must always say who holds it and until when
  CHECK (status <> 'held' OR (held_by IS NOT NULL AND held_until IS NOT NULL))
);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);

CREATE TABLE orders (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id),
  event_id         BIGINT NOT NULL REFERENCES events(id),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_cents      INT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  payment_ref      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- one row per ticket: the safety net against double-selling
CREATE TABLE tickets (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id),
  seat_id     BIGINT NOT NULL REFERENCES seats(id),
  code        TEXT NOT NULL UNIQUE,
  UNIQUE (seat_id)      -- a seat can appear on at most one ticket, ever
);
```

### Relationships

- `users` 1 to many `orders` (a user places many orders)
- `events` 1 to many `seats` (an event has many seats)
- `events` 1 to many `orders`
- `orders` 1 to many `tickets` (an order contains one or more tickets)
- `seats` 1 to 0 or 1 `tickets` (enforced by `UNIQUE (seat_id)`: a seat is sold at most once)
- `users` 1 to many held `seats` (via `held_by`, only while a hold is active)

Events are read far more often than written, so reads can be served from cache and read replicas. Seats and tickets are the hot, correctness-critical tables.

---

## 5. How Double-Booking Is Prevented

Double-booking happens when two users both read "seat 101 is available" and both then succeed in buying it (a race condition, or "check-then-act" bug). The design removes the gap between the check and the action, and adds a backstop.

### Layer 1: atomic conditional hold (the main defense)

Instead of reading the seat and then updating it, the hold is a **single atomic `UPDATE` with the condition inside it**, run inside a transaction:

```sql
BEGIN;

UPDATE seats
SET    status = 'held', held_by = :user_id,
       held_until = now() + interval '10 minutes', hold_id = :hold_id
WHERE  id = ANY(:seat_ids)
  AND  event_id = :event_id
  AND (status = 'available'
       OR (status = 'held' AND held_until < now()));   -- expired holds can be taken

-- if affected rows <> number of requested seats -> ROLLBACK and return 409
COMMIT;
```

The database takes a row lock on each seat during the `UPDATE`. If two users run this at the same moment for seat 101, one gets the lock first and changes the status to `held`. The second waits, then re-evaluates the `WHERE` clause, finds the seat is no longer `available`, and updates **zero rows**. That user gets a `409`. Exactly one winner, decided by the database, with no application-level race. Because it is all-or-nothing, a user cannot end up holding some seats but not others. Seat IDs are always locked in ascending order to avoid deadlocks between two users who want overlapping seats.

### Layer 2: payment only against a valid hold

When the user pays, one transaction does all of the following:

1. Lock and verify the seats: `SELECT ... FOR UPDATE` where `status = 'held' AND held_by = :user AND held_until > now()` for every seat in the hold. If any seat is no longer validly held by this user (the hold expired and someone else took it), abort with `410 Gone` **before charging**.
2. Charge the payment provider using the idempotency key (so retries cannot double-charge).
3. On success: insert the order and tickets, and set seats to `sold`; then commit.

If payment fails, the seats stay held until expiry or are released. If the commit fails after a successful charge (rare), a reconciliation job detects the paid order without tickets and issues a refund.

### Layer 3: database constraints as a safety net

Even if there were a bug in the application code, `UNIQUE (seat_id)` on `tickets` makes it **physically impossible** for two tickets to exist for the same seat; the second insert fails and the whole transaction rolls back. The `CHECK` constraints keep seat state consistent. Correctness therefore does not depend on application code being perfect.

### Layer 4: holds expire

A seat held by someone who abandons the page must not stay locked forever. Holds carry `held_until`, and the hold query treats expired holds as available (so no cleanup job is needed for correctness). A background job also resets expired holds to `available` every few seconds so the seat map shows them correctly.

### What users can see

The seat map is cached for 1-2 seconds, so it may show a seat as available that was just taken. That is acceptable: the cache is only a hint. The hold step is the only authority, and it always checks the real database. The user just sees "seat no longer available, please choose another".

---

## 6. Architecture

```
                         Users (browsers / mobile apps)
                                      |
                                      v
                           +---------------------+
                           |   CDN (static files, |
                           |   images, cached     |
                           |   event pages)       |
                           +----------+----------+
                                      |
                                      v
                           +---------------------+
                           |  Load balancer +     |
                           |  rate limiting / WAF |
                           +----------+----------+
                                      |
              +-----------------------+------------------------+
              |                                                |
              v                                                v
   +---------------------+                         +---------------------+
   | Browse / read        |                         | Waiting room        |
   | service (stateless,  |                         | (virtual queue,     |
   | many instances)      |                         | big sales only)     |
   +----+-------------+---+                         +----------+----------+
        |             |                                        |
        v             v                                        v
 +------------+  +-------------+                    +---------------------+
 |   Redis    |  | Read        |                    | Booking service     |
 |   cache    |  | replicas    |                    | (stateless; holds   |
 | (events,   |  | (Postgres)  |                    | and orders)         |
 | seat maps) |  +------+------+                    +----+-----------+----+
 +------------+         ^                                |           |
                        | replication                    v           v
                        |                     +----------------+  +-----------------+
                        +---------------------| PostgreSQL      |  | Payment provider|
                                              | PRIMARY         |  | (external)      |
                                              | (seats, orders, |  +-----------------+
                                              | tickets)        |
                                              +--------+--------+
                                                       |
                                                       v
                                              +-----------------+
                                              | Queue + workers |
                                              | (emails, ticket |
                                              | PDFs, expiry    |
                                              | job, reconcile) |
                                              +-----------------+
```

### Components

- **CDN:** serves images, scripts and the cached HTML or JSON of event pages from locations near users. Absorbs most of the browsing load during a sale so it never reaches our servers.
- **Load balancer, rate limiting and WAF:** spreads requests over many instances, limits requests per user and IP (fairness, bot defense, protection from overload), and blocks obvious abuse.
- **Browse / read service:** stateless servers that answer `GET` requests for events and seat maps. Stateless means we can add instances quickly. They read from Redis first, then from read replicas.
- **Redis cache:** holds event data and seat-map snapshots (TTL 1-2 seconds for seat maps, minutes for event details). Turns thousands of identical reads per second into one database read per interval.
- **Read replicas (PostgreSQL):** copies of the database that serve read queries so the primary is free for writes. They can be slightly behind, which is fine for browsing.
- **Waiting room (virtual queue):** for announced big sales, users are admitted to the booking flow at a controlled rate (for example, a few hundred per second) in the order they arrived, with a random or first-come position assigned at the sale start. It protects the booking service and database from the full 200,000-user stampede, and gives fairness: everyone sees their position instead of racing with refreshes.
- **Booking service:** stateless servers handling holds and orders. They run the transactions from section 5 against the primary database. They are the only component that writes seat state.
- **PostgreSQL primary:** the single source of truth for seats, orders and tickets. Holds row-level locks and constraints that guarantee correctness. Writes for one event touch only that event's seat rows, and the database easily handles about 1,000 short conditional updates per second.
- **Payment provider:** external service that charges the card. We never store card data. Called with an idempotency key and a timeout.
- **Queue and workers:** work that does not need to happen inside the user's request: sending confirmation emails, generating ticket PDFs and QR codes, resetting expired holds, and reconciling payments. If emails are slow, purchases are not.

### How it survives the big sale

1. **Reads are offloaded.** The CDN, Redis and replicas absorb the roughly 10,000 requests/second. Most of this is browsing and seat-map refreshes, which are cacheable.
2. **Writes are throttled.** The waiting room limits how many people reach the booking service at once, so the primary database sees a manageable rate of hold attempts instead of a spike.
3. **Failing fast is cheap.** A hold on a taken seat is a single `UPDATE` that touches zero rows and returns `409` within milliseconds, so the 10:1 contention does not overload the database.
4. **Correctness does not depend on scale.** Row locks and the `UNIQUE (seat_id)` constraint work the same with 1 user or 200,000.
5. **Slow things are isolated.** Payment is outside the lock. A hold lasts 10 minutes, so a slow payment provider does not block anyone else, and emails and PDFs go through the queue.
6. **Rate limiting and per-user caps** (maximum 6 seats per event, one active hold per user per event) stop bots and hoarding.
7. **Preparation:** before a known sale, scale out the read and booking services in advance, pre-warm the cache, and load-test with the estimated numbers.

---

## 7. Bottlenecks and Trade-offs

### What breaks first?

1. **The primary database's row contention** on the hot event's seats. Mitigated by the waiting room, short transactions and atomic updates.
2. **The seat-map endpoint**, because every user refreshes it constantly. Mitigated by caching and short TTLs (or pushing updates instead of polling).
3. **The payment provider**, which has its own limits and latency. Mitigated by timeouts, retries with idempotency keys, and holds that do not block other users.
4. **The single primary** is a single point of failure for writes. Mitigated with automatic failover to a synchronous standby.

### Trade-off 1: stale seat map (cache) vs. always-accurate seat map

- **Choice:** cache the seat map for 1-2 seconds.
- **Gain:** cuts database reads by orders of magnitude; fast pages under load.
- **Cost:** users sometimes click a seat that was just taken and get a `409`. This is a worse experience in exchange for speed and stability. Correctness is not affected, since the hold step always checks the database.

### Trade-off 2: strong consistency (single primary, transactions) vs. horizontal write scaling

- **Choice:** one PostgreSQL primary owns all seat state, rather than a distributed or eventually consistent store.
- **Gain:** simple, provably correct double-booking prevention through row locks and constraints.
- **Cost:** write throughput has a ceiling and the primary is a single point of failure. At our estimated peak (about 1,000 hold attempts per second) this is comfortable. If TicketHub grew to many simultaneous mega-sales, we could shard seats by `event_id`, because events are independent.

### Trade-off 3: waiting room (fairness and protection) vs. simplicity and user convenience

- **Choice:** use a virtual queue for big sales.
- **Gain:** protects the system and makes access orderly.
- **Cost:** more components to build and operate, and users must wait even if the system could have coped. Not used on normal days.

### Trade-off 4: 10-minute holds (convenience) vs. seat availability

- **Choice:** hold for 10 minutes.
- **Gain:** users have time to pay without losing the seat.
- **Cost:** abandoned holds make seats look unavailable for a while, so real buyers may be turned away who would have bought later. A shorter hold (for example, 5 minutes) frees seats faster but pressures users and increases failed payments.

### Other risks and future improvements

- Payment succeeds but ticket creation fails: handled by the reconciliation job and refunds.
- Bots and scalpers: add CAPTCHA, account verification and purchase limits.
- Multi-region deployment for lower latency and disaster recovery.
- Monitoring and alerts on hold success rate, p95 latency, queue depth and error rates.
