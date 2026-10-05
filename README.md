<div align="center">
  <img src="frontend/customer/img/webake-logo.png" alt="WeBake — Crumbs N' Rolls Bakery" width="340">
  
  # WeBake — Crumbs N' Rolls Bakery Management & Ordering System
</div>

![Vercel Deployment](https://img.shields.io/badge/Vercel-Serverless%20Functions-black?style=flat&logo=vercel)
![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=flat&logo=supabase)
![Security](https://img.shields.io/badge/Security-OWASP%20Hardened-green?style=flat&logo=shield)
![Node.js](https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-339933?style=flat&logo=node.js)
![Status](https://img.shields.io/badge/Tests-97%2F97%20Passed-brightgreen?style=flat)

**WeBake (CRBSystem)** is a bakery e-commerce and order tracking platform developed for **Crumbs N' Rolls Bakery** (Marilao, Bulacan). The system handles bakery ordering, multi-channel e-wallet payments (GCash, PayMaya), downpayment validation, live order status tracking, digital receipts, cancellation and refund management, and customer order management.

The platform is designed to run entirely on **Vercel Serverless Functions** backed by **Supabase PostgreSQL**, adhering strictly to the Vercel Hobby tier function constraints ($\le 12$ serverless functions) with complete enterprise-grade security hardening.

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

### 5. Order Management & Refund Processing
* **Cancellation & Downpayment Refund Workflow**: Streamlined customer cancellation request workflow with staff verification and refund tracking.
* **Audit Trail**: Every order and cancellation request has full lifecycle timestamps and payment verification logs.

### 6. Dynamic Cart Synchronization
* **Guest & Cloud Cart Merge**: When a guest shopper adds items and later logs in, `mergeCarts()` merges their guest selections with their saved database cart by product ID, summing quantities and capping items up to 99 pieces.

---

## Security Architecture

```
[ Customer Browser ]
       │
       ▼  (HTTPS / CSP / Strict Headers)
[ Vercel Edge / CDN ]
       │
       ├─► (Static Assets: HTML, CSS, JS, Images)
       │     └─► utils.js (Strict HTML entity escaping against XSS)
       │     └─► config.js (Frozen centralized configuration)
       │     └─► localStorage (Zero plaintext password policy)
       │
       ▼  (Serverless API Route)
[ Node.js API Functions (/api/*) ]
       │
       ├─► session.js (HMAC-SHA256 HttpOnly session validation)
       ├─► authHelper.js (210,000 iteration PBKDF2 hashing)
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
* **Backend Runtime**: Node.js (v18.x / v20.x) running on Vercel Serverless Functions.
* **Database**: PostgreSQL 15 hosted on Supabase with connection pooling (`pg` / `pg-pool`).
* **Email Service**: Nodemailer (SMTP over TLS via Gmail App Password).
* **Deployment & Hosting**: Vercel with custom `vercel.json` headers and rewrites.

---

## Project Structure

```
WeBake-CRBSystem/
├── api/                                # Vercel Serverless API Functions (Max 12 limit)
│   ├── _lib/                           # Shared internal utilities (excluded from route count)
│   │   ├── authHelper.js               # PBKDF2 (210k rounds) hashing and validation
│   │   ├── db.js                       # PostgreSQL connection pooling with SSL
│   │   ├── http.js                     # CORS, JSON response, and sanitized error handlers
│   │   ├── session.js                  # HMAC-SHA256 session and OTP proof tokens
│   │   └── userProfile.js              # Aggregated profile and order history loader
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
│   ├── products/
│   │   └── index.js                    # Authoritative catalog reader and store settings
│   └── health.js                       # Service status and database latency monitor
│
├── backend/                            # Standalone / Local backend resources
│   ├── database/
│   │   ├── migrations/
│   │   │   └── 001_align_schema.sql    # Idempotent database schema migration script
│   │   └── schema.sql                  # Comprehensive PostgreSQL database definition
│   └── .env                            # Local development environment configuration
│
├── frontend/customer/                  # Customer-facing web application
│   ├── css/
│   │   ├── auth.css                    # Authentication & OTP modals styling
│   │   ├── main.css                    # Base theme, typography, layout, and components
│   │   ├── responsive.css              # Mobile, tablet, and desktop responsive breakpoints
│   │   └── tracking.css                # Order timeline and receipt styling
│   ├── html/
│   │   ├── home.html                   # Landing page, hero, product highlights, and reviews
│   │   ├── products.html               # Product catalog, bundle selector, and cart drawer
│   │   └── dashboard.html              # Customer portal (order history, saved cart, profile)
│   ├── js/
│   │   ├── config.js                   # Central frozen configuration (WEBAKE_CONFIG)
│   │   ├── utils.js                    # Sanitization, XSS escaping, and currency formatters
│   │   ├── auth.js                     # User login, registration, and session synchronization
│   │   ├── dashboard.js                # Customer account dashboard controller
│   │   ├── main.js                     # Core catalog, cart drawer, and checkout handler
│   │   ├── otp.js                      # OTP modal interaction and resend timers
│   │   └── tracking.js                 # Transaction lookup for orders
│   └── images/                         # Bakery product images, banners, and icons
│
├── scratch/                            # Automated Acceptance Verification Test Suites
│   ├── test_phase2.js                  # Auth, PBKDF2, OTP proof tokens, and sessions suite
│   ├── test_phase3.js                  # Orders, catalog pricing, and idempotency suite
│   └── test_phase4_5.js                # Frontend escaping, health, cart merge, and CSP suite
│
├── .vercelignore                       # Excludes test scripts, docs, and backend folder
├── index.html                          # Root redirect to /frontend/customer/html/home.html
├── package.json                        # Root dependencies (pg, nodemailer)
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
| `GET` | `/api/orders/track` | Proof of Ownership| Looks up order record by Order ID + matching email/phone |
| `POST` | `/api/orders/cancel` | Matching Owner | Requests cancellation & downpayment refund for pending order |
| `POST` | `/api/orders/receipt`| Matching Owner | Resends digital order receipt (rate limited to 3/hr) |

---

## Database Schema

The system uses PostgreSQL running on Supabase with the following primary relational tables:

```mermaid
erDiagram
    users ||--o{ orders : places
    users ||--o{ user_addresses : has
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
        bigint order_id FK
        string customer_email
        numeric downpayment_amount
        string refund_wallet
        string refund_account_number
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

Configure these environment variables in your Vercel Project Settings or local `.env` file:

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

# Nodemailer / Gmail SMTP Credentials
EMAIL_USER=crbwebake@gmail.com
EMAIL_PASS=your_gmail_16_digit_app_password
```

---

## Local Development & Setup

### Prerequisites
* Node.js $\ge$ 18.0.0
* Git
* Access to Supabase PostgreSQL instance

### 1. Clone the Repository
```bash
git clone https://github.com/NewbieDeveloper-Gerald/WeBake-CRBSystem.git
cd WeBake-CRBSystem
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file inside `backend/.env` with your Supabase database and email credentials (see [Environment Variables](#environment-variables)).

### 4. Run Schema Migrations
Execute the migration script against your PostgreSQL database:
```bash
psql -d "$DATABASE_URL" -f backend/database/migrations/001_align_schema.sql
```

---

## Automated Test Suites

The project includes 3 comprehensive acceptance test suites covering 97 automated assertions against live PostgreSQL:

```bash
# 1. Test Authentication, PBKDF2 (210k rounds), Sessions & Proof Tokens
node scratch/test_phase2.js

# 2. Test Orders, Server-Side Pricing, Idempotency & Rate Limiting
node scratch/test_phase3.js

# 3. Test Health, Cart Merge, XSS Escaping & Vercel Configuration
node scratch/test_phase4_5.js
```

### Test Gate Coverage:
* **24 / 24 Tests Passed**: PBKDF2 upgrades, timing-safe verification, proof token purposes, session cookies, tracking authorization, and cancellation table rows.
* **24 / 24 Tests Passed**: Live catalog loading, unknown product rejection, price tampering immunity, idempotency deduplication, and receipt resend rate limiting (429).
* **49 / 49 Tests Passed**: Health endpoint contract, authenticated cart sync, guest cart merge logic, zero plaintext passwords, XSS entity escaping, central config validation, CSP security headers, and Vercel serverless function budget ($\le 12$).

---

## Deployment to Vercel

The application is optimized for zero-configuration deployment on **Vercel**:

1. Link your GitHub repository to Vercel.
2. In **Project Settings** $\rightarrow$ **Environment Variables**, add the production keys (`DATABASE_URL`, `SESSION_SECRET`, `OTP_SECRET`, `EMAIL_USER`, `EMAIL_PASS`).
3. Deploy! Vercel automatically:
   * Maps serverless endpoints in `/api/*`.
   * Enforces security headers from `vercel.json` (`Content-Security-Policy`, `nosniff`, `SAMEORIGIN`).
   * Ignores test suites, documentation, and the backend directory via `.vercelignore`.

---

## License

This project is proprietary software created for **Crumbs N' Rolls Bakery**. All rights reserved.
