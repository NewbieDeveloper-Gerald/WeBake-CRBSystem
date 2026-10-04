<div align="center">
  <img src="frontend/customer/img/webake-logo.png" alt="WeBake — Crumbs N' Rolls Bakery" width="340">
  
  # WeBake — Crumbs N' Rolls Bakery Management & Ordering System
</div>

![Vercel Deployment](https://img.shields.io/badge/Vercel-Serverless%20Functions-black?style=flat&logo=vercel)
![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=flat&logo=supabase)
![Security](https://img.shields.io/badge/Security-OWASP%20Hardened-green?style=flat&logo=shield)
![Node.js](https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-339933?style=flat&logo=node.js)
![Tests](https://img.shields.io/badge/Tests-131%2F131%20Passed-brightgreen?style=flat)

**WeBake (CRBSystem)** is a bakery e-commerce, wholesale distribution, and order tracking platform developed for **Crumbs N' Rolls Bakery** (Marilao, Bulacan). The system handles wholesale and retail bakery ordering, multi-channel e-wallet payments (GCash, PayMaya), downpayment validation, live order status tracking, digital receipts, wholesale reseller applications, and customer order management.

The platform runs in production on **Vercel Serverless Functions** backed by **Supabase PostgreSQL**, adhering strictly to the Vercel Hobby tier function constraints ($\le 12$ serverless functions) with complete enterprise-grade security hardening. The local Express development server directly mounts the same `/api/*` serverless handlers to ensure 100% parity between local development and cloud production.

---

## Table of Contents
1. [Core Features](#core-features)
2. [Security Architecture](#security-architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Database Schema](#database-schema)
7. [Environment Variables](#environment-variables)
8. [Local Development & Setup](#local-development--setup)
9. [Automated Test Suites](#automated-test-suites)
10. [Deployment to Vercel](#deployment-to-vercel)

---

## Core Features

### 1. Authoritative Server-Side Ordering & Pricing
* **Catalog Protection**: All pricing is calculated server-side from live database catalog bundles. Any tampered prices, subtotal overrides, or fake discounts submitted in HTTP payloads are completely ignored.
* **Pricing Model**:
  $$\text{Subtotal} = \sum (\text{Catalog Bundle Price} \times \text{Quantity})$$
  $$\text{Grand Total} = \text{Subtotal} \quad \text{(Delivery fee is communicated & settled outside the system)}$$
  $$\text{50\% Downpayment Required} = \text{Round}(\text{Grand Total} \times 0.50)$$
  $$\text{Balance Due upon Delivery} = \text{Grand Total} - \text{Downpayment Required}$$
* **Order Idempotency**: Prevents accidental duplicate charges and orders caused by network retries or rapid double-clicks through unique client-generated `Idempotency-Key` headers.

### 2. Multi-Tier Authentication & Password Security
* **210,000-Iteration PBKDF2**: Uses Node.js crypto PBKDF2 with 210,000 iterations and cryptographic salts, compliant with current OWASP password storage recommendations.
* **HttpOnly Session Cookies**: Session tokens are signed using HMAC-SHA256 and transmitted with `HttpOnly`, `SameSite=Lax`, and `Secure` attributes (`weBakeSessionToken`), preventing XSS session hijacking.
* **Timing-Attack Defense**: Uniform error messaging (`"Invalid email or password"`) and constant-time dummy hashing when an email does not exist to prevent account enumeration.

### 3. Purpose-Bound OTP Verification
* **Cryptographic Proof Tokens**: OTP codes are verified server-side. Upon successful verification, the backend issues an HMAC-SHA256 **Proof Token** bound to the email and specific purpose (`registration`, `password_reset`, or `checkout`).
* **Single-Use Replay Protection**: Each OTP verification record is stamped with `verified_at = NOW()`. Proof tokens cannot be reused or replayed.

### 4. Order Tracking & Privacy Protection
* **Proof of Ownership**: Order lookup requires both the Order ID (e.g. `WB-84920`) and the customer's registered email or phone number. Public snooping of names, addresses, and purchase amounts is prevented.
* **Digital Receipt Resending**: Sends rich HTML receipts directly from the verified database record via Nodemailer. Protected by hourly rate-limiting (max 3 resends per hour per order).
* **Controlled Order Cancellation**: Cancellation requests insert records directly into the `cancellation_requests` database table. Cancellations are restricted to `pending` and `downpayment_confirmed` orders; orders already baking or delivered cannot be cancelled.

### 5. Wholesale / Reseller Partnership Hub
* **Partner Onboarding**: Dedicated application workflow for businesses, sari-sari stores, and regional resellers.
* **Application Integrity**: Generates unique reference codes (`WB-PRT-XXXXX`) with collision retries, protects approved partners from being downgraded, and prevents unauthorized application overwrites.

### 6. Dynamic Cart Synchronization
* **Guest & Cloud Cart Merge**: When a guest shopper adds items and later logs in, `mergeCarts()` merges their guest selections with their saved database cart by product ID, summing quantities and capping items up to 99 pieces.

---

## Security Architecture

```
[ Customer Browser ]
       │
       ▼  (HTTPS / CSP / Strict Headers)
[ Vercel Edge / CDN / Express Local Adapter ]
       │
       ├─► (Static Assets: HTML, CSS, JS, Images)
       │     └─► shared/formatters.js (Strict HTML entity escaping against XSS)
       │     └─► shared/config.js (Frozen centralized configuration)
       │     └─► localStorage (Zero plaintext password policy)
       │
       ▼  (Serverless API Handlers (/api/*))
[ Node.js API Functions (/api/*) ]
       │
       ├─► _lib/session.js (HMAC-SHA256 HttpOnly session validation)
       ├─► _lib/password-hasher.js (210,000 iteration PBKDF2 hashing)
       ├─► _lib/user-profile.js (Aggregated profile, orders, and partner loader)
       ├─► otp/index.js (Proof token generation & verified_at gating)
       ├─► orders/index.js (Authoritative catalog lookup & idempotency)
       │
       ▼  (SSL / TLS Connection Pool)
[ Supabase PostgreSQL ]
       ├─► Parameterized SQL Queries ($1, $2, ...)
       ├─► Unique constraints (idempotency_key, order_code, email_address)
       └─► Audit tables (cancellation_requests, otp_verifications)
```

---

## Technology Stack

* **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, FontAwesome 6, Google Fonts (Poppins, Playfair Display).
* **Backend Runtime**: Node.js (v18.x / v20.x) running on Vercel Serverless Functions (`/api/*`) and local Express development server (`backend/server.js`).
* **Database**: PostgreSQL 15 hosted on Supabase with connection pooling (`pg` / `pg-pool`).
* **Email Service**: Nodemailer (SMTP over TLS via Gmail App Password).
* **Deployment & Hosting**: Vercel with custom `vercel.json` headers and rewrites.

---

## Project Structure

```
WeBake-CRBSystem/
├── api/                                # Vercel Serverless API Functions (11 functions, limit 12)
│   ├── _lib/                           # Shared internal serverless utilities
│   │   ├── db.js                       # PostgreSQL connection pooling with SSL
│   │   ├── http.js                     # CORS, JSON response, and sanitized error handlers
│   │   ├── mailer.js                   # Nodemailer transporter & email dispatch
│   │   ├── password-hasher.js          # PBKDF2 (210k rounds) hashing and validation
│   │   ├── session.js                  # HMAC-SHA256 session and OTP proof tokens
│   │   └── user-profile.js             # Aggregated profile, orders, and partner loader
│   ├── auth/
│   │   ├── check.js                    # Email availability checker
│   │   ├── login.js                    # Authenticates user and sets session cookie
│   │   ├── register.js                 # Proof-token gated account registration
│   │   ├── reset.js                    # Proof-token gated password reset
│   │   └── sync.js                     # Authenticated user profile reader/writer
│   ├── cart/
│   │   └── sync.js                     # Authenticated cart cloud persistence & retrieval
│   ├── orders/
│   │   └── index.js                    # Create, track, cancel, and resend receipt handlers
│   ├── otp/
│   │   └── index.js                    # OTP generator, Nodemailer mailer, and proof-token verifier
│   ├── partner/
│   │   └── index.js                    # Wholesale partner application management
│   ├── products/
│   │   └── index.js                    # Authoritative catalog reader and store settings
│   └── health.js                       # Service status and database latency monitor
│
├── backend/                            # Standalone / Local backend resources
│   ├── database/
│   │   ├── migrations/
│   │   │   └── 001_align_schema.sql    # Idempotent database schema migration script
│   │   ├── seeds/
│   │   │   └── seed-products.js        # Seed script for bakery product catalog
│   │   ├── db.js                       # Standalone PostgreSQL pool helper
│   │   └── schema.sql                  # Comprehensive PostgreSQL database definition
│   ├── services/
│   │   └── mailer.js                   # Standalone Nodemailer email service
│   ├── .env.example                    # Reference environment configuration template
│   ├── package.json                    # Backend dependencies (Express, CORS, etc.)
│   └── server.js                       # Express adapter mounting /api/* for 100% cloud parity
│
├── frontend/customer/                  # Customer-facing web application
│   ├── css/
│   │   ├── base/
│   │   │   ├── components.css          # Buttons, form controls, modals, and badges
│   │   │   ├── globals.css             # CSS reset, body, header, footer, animations
│   │   │   └── variables.css           # Bakery design system variables & color palette
│   │   └── pages/
│   │       ├── dashboard.css           # Customer portal styling
│   │       ├── home.css                # Landing page hero & showcase styling
│   │       ├── partner.css             # Reseller application form styling
│   │       └── products.css            # Catalog grid and order modal styling
│   ├── html/
│   │   ├── dashboard.html              # Customer portal (order history, saved cart, refunds)
│   │   ├── home.html                   # Landing page, hero, product highlights, and reviews
│   │   ├── partner.html                # Wholesale reseller application portal
│   │   └── products.html               # Product catalog, bundle selector, and cart drawer
│   ├── img/                            # Bakery product images, banners, and logos
│   │   ├── favicon.png                 # Webake browser tab icon
│   │   ├── gcash-qr.svg                # GCash payment QR code
│   │   ├── paymaya-qr.svg              # PayMaya payment QR code
│   │   └── webake-logo.png             # Official Crumbs N' Rolls logo
│   ├── js/
│   │   ├── features/
│   │   │   ├── auth.js                 # User login, registration, and session sync
│   │   │   ├── dashboard.js            # Customer account dashboard controller
│   │   │   ├── partner.js              # Wholesale application form submission
│   │   │   ├── storefront.js           # Core catalog, cart drawer, and checkout handler
│   │   │   └── tracking.js             # Transaction lookup for orders and partner apps
│   │   └── shared/
│   │       ├── config.js               # Central frozen configuration (WEBAKE_CONFIG)
│   │       ├── formatters.js           # Sanitization, XSS escaping, and currency formatters
│   │       ├── modals.js               # Reusable confirmation and alert modals
│   │       └── otp.js                  # OTP modal interaction and resend timers
│   └── index.html                      # Redirect helper to home.html
│
├── tests/                              # Automated test suites (131 assertions)
│   ├── acceptance/
│   │   ├── orders-and-pricing.test.js  # Orders, catalog pricing, and idempotency (24 checks)
│   │   ├── partner-application.test.js # Partner applications & reference codes (9 checks)
│   │   ├── platform-contract.test.js   # Health, escaping, cart merge, CSP, Vercel budget (50 checks)
│   │   └── security-and-auth.test.js   # Auth, PBKDF2 (210k), sessions & proof tokens (24 checks)
│   ├── helpers/
│   │   └── load-env.js                 # Environment variable resolver for test execution
│   └── integration/
│       └── express-parity.test.js      # Express server adapter HTTP parity suite (24 checks)
│
├── tools/                              # Project maintenance tools
│   ├── check-references.js             # Static reference integrity checker
│   └── generate-brand-assets.js        # Automated branding asset generator
│
├── .gitignore                          # Git ignored patterns
├── .vercelignore                       # Excludes test suites, docs, and backend from Vercel
├── favicon.ico                         # Root favicon
├── index.html                          # Root redirect to /frontend/customer/html/home.html
├── package.json                        # Root npm scripts and dependencies
└── vercel.json                         # Vercel deployment configuration, CSP, and rewrites
```

---

## API Endpoints Reference

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | No | Service liveness check & database ping latency |
| `GET` | `/api/products` | No | Authoritative product catalog and store settings |
| `GET` | `/api/auth/check?email=...` | No | Checks if an email is already registered |
| `POST` | `/api/auth/register` | Proof Token | Creates a new account (requires verified registration proof token) |
| `POST` | `/api/auth/login` | No | Validates credentials and sets `weBakeSessionToken` cookie |
| `POST` | `/api/auth/reset` | Proof Token | Resets user password (requires verified password reset proof token) |
| `GET/POST`| `/api/auth/sync` | Session Cookie | Synchronizes profile information for authenticated user |
| `POST` | `/api/otp/send` | No | Generates and emails 6-digit verification code |
| `POST` | `/api/otp/verify` | No | Verifies code and issues 10-minute HMAC proof token |
| `GET/POST`| `/api/cart/sync` | Session Cookie | Reads and persists saved cart items for authenticated customer |
| `POST` | `/api/orders` | Session or Proof | Places a new order with server pricing and idempotency check |
| `GET` | `/api/orders/track` | Proof of Ownership| Looks up order/partner record by ID + matching email/phone |
| `POST` | `/api/orders/cancel` | Matching Owner | Requests cancellation & downpayment refund for pending order |
| `POST` | `/api/orders/receipt`| Matching Owner | Resends digital order receipt (rate limited to 3/hr) |
| `POST` | `/api/partner` | No (Protected) | Submits or updates wholesale reseller partnership application |

---

## Database Schema

The system uses PostgreSQL running on Supabase with the following primary relational tables:

```mermaid
erDiagram
    users ||--o{ orders : places
    users ||--o{ user_addresses : has
    users ||--o{ partner_applications : submits
    roles ||--o{ users : assigns
    categories ||--o{ products : categorizes
    products ||--o{ product_bundles : packages
    orders ||--o{ order_items : contains
    orders ||--o{ cancellation_requests : requests
    orders ||--o{ payment_transactions : records

    users {
        bigint id PK
        string full_name
        string email_address UK
        string password_hash
        string contact_number
        jsonb saved_cart
        string partner_status
    }

    orders {
        bigint id PK
        string order_code UK
        string customer_name
        string customer_email
        numeric subtotal_amount
        numeric delivery_fee
        numeric grand_total
        numeric downpayment_required
        numeric balance_due
        string status
        string idempotency_key UK
    }

    cancellation_requests {
        bigint id PK
        string cancellation_code UK
        bigint order_id FK
        string customer_email
        numeric downpayment_amount
        string refund_wallet
        string refund_account_number
        string status
    }

    partner_applications {
        bigint id PK
        string reference_id UK
        string business_name
        string contact_person
        string email
        string phone
        string status
    }

    otp_verifications {
        bigint id PK
        string email
        string otp_code
        string purpose
        timestamptz expires_at
        timestamptz verified_at
    }
```

---

## Environment Variables

Configure these environment variables in your Vercel Project Settings or local `backend/.env` file:

```ini
# Supabase PostgreSQL Database Connection
DATABASE_URL=postgresql://postgres.yourproject:yourpassword@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
DB_USER=postgres.yourproject
DB_PASSWORD=your_secure_password
DB_NAME=postgres
DB_PORT=6543

# Cryptographic Session & Proof Secrets
SESSION_SECRET=your_super_secret_session_hmac_key_min_32_chars
OTP_SECRET=your_super_secret_otp_proof_hmac_key_min_32_chars

# Nodemailer / Gmail SMTP Credentials (for OTPs and Digital Receipts)
GMAIL_USER=crbwebake@gmail.com
GMAIL_APP_PASS=your_gmail_16_digit_app_password
```

---

## Local Development & Setup

### Prerequisites
* Node.js $\ge$ 18.0.0
* Git
* Access to a Supabase PostgreSQL instance

### 1. Clone the Repository
```bash
git clone https://github.com/NewbieDeveloper-Gerald/WeBake-CRBSystem.git
cd WeBake-CRBSystem
```

### 2. Install Dependencies
```bash
npm install
```
> [!NOTE]
> If your environment is behind corporate SSL proxy inspection, use `npm install --strict-ssl=false`.

### 3. Configure Environment Variables
Copy `backend/.env.example` to `backend/.env` and update with your actual Supabase database connection and Gmail credentials:
```bash
cp backend/.env.example backend/.env
```

### 4. Database Setup & Migrations
Always initialize the base schema before running migrations:

1. **Base Schema**: Run `backend/database/schema.sql` to initialize all baseline tables, enums, and foreign keys:
   ```bash
   psql -d "$DATABASE_URL" -f backend/database/schema.sql
   ```
2. **Schema Migration**: Run `backend/database/migrations/001_align_schema.sql` to ensure idempotent column alignments, audit tables, and constraint adjustments:
   ```bash
   psql -d "$DATABASE_URL" -f backend/database/migrations/001_align_schema.sql
   ```
3. **(Optional) Seed Default Products**: Populate the product catalog bundles:
   ```bash
   npm run seed
   ```

### 5. Start Local Express Server
Run the local Express server on port 5000 (which mounts the tested `/api/*` handlers with 100% parity):
```bash
npm run dev
```

---

## Automated Test Suites

The project includes acceptance and integration test suites covering **131 automated assertions** against live PostgreSQL:

```bash
# Run all acceptance test suites (107 checks)
npm test

# Run individual acceptance suites
npm run test:auth      # Security, PBKDF2 (210k rounds), Sessions & Proof Tokens (24/24)
npm run test:orders    # Orders, Catalog Pricing, Idempotency & Rate Limiting (24/24)
npm run test:platform  # Health, Cart Merge, XSS Escaping & Vercel Function Budget (50/50)
npm run test:partner   # Wholesale Reseller Applications & Reference Codes (9/9)

# Run the Express Adapter Parity integration suite (24 checks)
npm run test:parity

# Run the static reference integrity checker (205 checks)
npm run check
```

### Test Gate Coverage:
* **24 / 24 Tests Passed** (`test:auth`): PBKDF2 upgrades, timing-safe verification, proof token purposes, session cookies, tracking authorization, and cancellation table rows.
* **24 / 24 Tests Passed** (`test:orders`): Live catalog loading, unknown product rejection, price tampering immunity, idempotency deduplication, receipt resend rate limiting (429), and partner integrity.
* **50 / 50 Tests Passed** (`test:platform`): Health endpoint contract, authenticated cart sync, guest cart merge logic, zero plaintext passwords, XSS entity escaping, central config validation, CSP security headers, and Vercel serverless function budget ($\le 12$).
* **9 / 9 Tests Passed** (`test:partner`): Partner creation, unique reference code generation, status preservation, and anti-downgrade validation.
* **24 / 24 Tests Passed** (`test:parity`): Full HTTP end-to-end parity testing of Express mounting `/api/*` serverless handlers.
* **205 / 205 Checks Passed** (`check`): Static verification of all HTML `<script>` and `<link>` tags, JS imports, and asset paths.

---

## Deployment to Vercel

The application is optimized for zero-configuration deployment on **Vercel**:

1. Link your GitHub repository to Vercel.
2. In **Project Settings** $\rightarrow$ **Environment Variables**, add the production keys (`DATABASE_URL`, `SESSION_SECRET`, `OTP_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASS`).
3. Deploy! Vercel automatically:
   * Maps serverless endpoints in `/api/*` (11 functions, safely within the 12-function Hobby limit).
   * Enforces security headers from `vercel.json` (`Content-Security-Policy`, `nosniff`, `SAMEORIGIN`).
   * Ignores test suites, documentation, and the backend directory via `.vercelignore`.

---

## License

This project is proprietary software created for **Crumbs N' Rolls Bakery**. All rights reserved.
