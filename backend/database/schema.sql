-- ============================================================================
-- WeBake Crumbs N' Rolls Bakery (CRB) System — Database Schema
-- Target: PostgreSQL / Supabase
-- Designed for: Scalability, Human-Readable Naming, and Zero Dependency Cycles
-- ============================================================================

-- Enable UUID extension for cryptographically secure, non-sequential public identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TIER 0: ROOT ENUMS, LOOKUPS & UNREFERENCED AUDIT TABLES
-- ============================================================================

-- Roles: Defines permissions across customer, wholesale partner, staff, and admin
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,          -- 'customer', 'partner', 'staff', 'admin'
    display_title VARCHAR(100) NOT NULL,           -- 'Registered Customer', 'Wholesale Reseller', etc.
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO roles (role_name, display_title, description) VALUES
    ('customer', 'Customer', 'Retail customer with registered account'),
    ('partner', 'Wholesale Partner', 'Approved wholesale partner / reseller'),
    ('staff', 'Bakery Staff', 'Production, baking, and rider fulfillment staff'),
    ('admin', 'Administrator', 'Full system administrator and store owner');

-- Product Categories: Categorization for customer browsing and admin filtering
CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,              -- 'all', 'bestsellers', 'breads', 'bundles'
    display_order INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO product_categories (category_name, slug, display_order) VALUES
    ('All Products', 'all', 1),
    ('Bestsellers', 'bestsellers', 2),
    ('Traditional Breads', 'breads', 3),
    ('Wholesale Bundles', 'bundles', 4);

-- OTP Verifications: Ephemeral 6-digit verification codes for registration, password reset, checkout
CREATE TABLE otp_verifications (
    id BIGSERIAL PRIMARY KEY,
    email_address VARCHAR(255) NOT NULL,
    otp_code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,                   -- 'register', 'forgot_password', 'checkout'
    attempt_count INT DEFAULT 0 NOT NULL,
    resend_available_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,                        -- NULL until successfully verified
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_otp_verifications_lookup 
    ON otp_verifications (email_address, purpose, expires_at);

-- ============================================================================
-- TIER 1: CORE INDEPENDENT ENTITIES (USERS & PRODUCTS)
-- ============================================================================

-- Users: Core user profiles (customers, wholesale partners, bakery staff, admins)
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    full_name VARCHAR(150) NOT NULL,
    email_address VARCHAR(255) NOT NULL UNIQUE,
    contact_number VARCHAR(20) NOT NULL,            -- Validated 11-digit mobile: 09xxxxxxxxx
    password_hash VARCHAR(255) NOT NULL,
    partner_status VARCHAR(30) DEFAULT 'none' NOT NULL 
        CHECK (partner_status IN ('none', 'pending', 'active', 'rejected', 'cancelled')),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,        -- Allows admin soft-suspension
    email_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_email ON users(LOWER(email_address));
CREATE INDEX idx_users_contact ON users(contact_number);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_partner_status ON users(partner_status);

-- Products: Master catalog of bakery items
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
    product_name VARCHAR(150) NOT NULL UNIQUE,      -- 'Mamon', 'Otap', 'Eggnog', 'Buttertoast'
    slug VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,        -- Admin toggle for item availability
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);

-- Store Settings: Global configurable parameters editable by admins
CREATE TABLE store_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO store_settings (setting_key, setting_value, description) VALUES
    ('downpayment_percentage', '50', 'Required wholesale downpayment percentage (50%)'),
    ('standard_delivery_fee', '50.00', 'Standard local delivery fee in Philippine Pesos'),
    ('bakery_name', 'Crumbs N'' Rolls Bakery', 'Official commercial business name'),
    ('bakery_contact', '09171234567', 'Official customer support phone number'),
    ('bakery_address', '1356 Cordero St., Lambakin, Marilao, Bulacan', 'Physical production bakery address');

-- ============================================================================
-- TIER 2: DEPENDENT USER DETAILS, PRODUCT BUNDLES & PARTNER APPLICATIONS
-- ============================================================================

-- User Addresses: Saved delivery locations for checkout
CREATE TABLE user_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city VARCHAR(100) DEFAULT 'Marilao' NOT NULL,
    province VARCHAR(100) DEFAULT 'Bulacan' NOT NULL,
    postal_code VARCHAR(20),
    is_default BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);

-- User Sessions: Managed refresh tokens / active browser sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_user_sessions_lookup ON user_sessions(token_hash, expires_at);

-- Product Bundles: Wholesale packaging tiers (e.g. 1 bundle = 25 pieces @ ₱105)
CREATE TABLE product_bundles (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    bundle_title VARCHAR(100) NOT NULL,             -- '1 Bundle'
    pieces_per_bundle INT NOT NULL CHECK (pieces_per_bundle > 0), -- e.g. 25 pcs
    wholesale_price NUMERIC(10, 2) NOT NULL CHECK (wholesale_price >= 0), -- e.g. 105.00
    min_order_bundles INT DEFAULT 1 NOT NULL CHECK (min_order_bundles > 0),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_product_bundles_product ON product_bundles(product_id);

-- Wholesale Partner Applications: Inbound reseller requests
CREATE TABLE partner_applications (
    id BIGSERIAL PRIMARY KEY,
    application_code VARCHAR(30) NOT NULL UNIQUE,   -- 'WB-PRT-58291'
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- Nullable for guest applicants
    applicant_name VARCHAR(150) NOT NULL,
    applicant_email VARCHAR(255) NOT NULL,
    applicant_phone VARCHAR(20) NOT NULL,
    business_name VARCHAR(150) NOT NULL,
    business_type VARCHAR(50) NOT NULL 
        CHECK (business_type IN ('sari_sari', 'cafe', 'direct_selling', 'online_shop', 'bakery', 'other')),
    years_in_operation VARCHAR(50),
    estimated_weekly_volume VARCHAR(100),
    delivery_address TEXT NOT NULL,
    products_of_interest TEXT[],                    -- Array of requested products: ['Mamon', 'Otap']
    additional_notes TEXT,
    agreed_to_terms BOOLEAN DEFAULT TRUE NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL 
        CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),
    admin_notes TEXT,
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_partner_apps_code ON partner_applications(application_code);
CREATE INDEX idx_partner_apps_lookup ON partner_applications(applicant_email, applicant_phone);
CREATE INDEX idx_partner_apps_status ON partner_applications(status);

-- Carts: Shopping carts persisted across devices for logged-in and guest visitors
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, -- NULL for guest carts
    guest_session_id VARCHAR(100),                         -- Links guest cookie/localStorage
    status VARCHAR(30) DEFAULT 'active' NOT NULL 
        CHECK (status IN ('active', 'converted', 'abandoned')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_carts_user ON carts(user_id) WHERE status = 'active';
CREATE INDEX idx_carts_guest ON carts(guest_session_id) WHERE status = 'active';

-- ============================================================================
-- TIER 3: ORDERS & ACTIVE CART ITEMS
-- ============================================================================

-- Cart Items: Line items inside a cart
CREATE TABLE cart_items (
    id BIGSERIAL PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_bundle_id INT NOT NULL REFERENCES product_bundles(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_cart_bundle UNIQUE (cart_id, product_bundle_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

-- Orders: Master wholesale bread orders
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    order_code VARCHAR(30) NOT NULL UNIQUE,         -- 'WB-84920'
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- NULL for guest checkouts
    customer_name VARCHAR(150) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_contact VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    delivery_time VARCHAR(50),
    special_notes TEXT,
    
    -- Financials & 50% Downpayment Policy (Precise 2 decimal NUMERIC)
    subtotal_amount NUMERIC(10, 2) NOT NULL CHECK (subtotal_amount >= 0),
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (delivery_fee >= 0),
    grand_total NUMERIC(10, 2) NOT NULL CHECK (grand_total >= 0),
    downpayment_rate NUMERIC(4, 2) DEFAULT 0.50 NOT NULL,
    downpayment_required NUMERIC(10, 2) NOT NULL CHECK (downpayment_required >= 0),
    downpayment_paid NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (downpayment_paid >= 0),
    balance_due NUMERIC(10, 2) NOT NULL CHECK (balance_due >= 0),
    
    payment_method VARCHAR(50) NOT NULL 
        CHECK (payment_method IN ('gcash', 'maya', 'bank_transfer', 'cod')),
    status VARCHAR(40) DEFAULT 'pending' NOT NULL 
        CHECK (status IN (
            'pending',
            'downpayment_confirmed',
            'baking',
            'out_for_delivery',
            'delivered',
            'cancellation_requested',
            'cancelled',
            'refunded'
        )),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_code ON orders(order_code);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_tracking ON orders(order_code, customer_contact);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ============================================================================
-- TIER 4: ORDER DETAILS, AUDIT LOGS, PAYMENTS & CANCELLATIONS
-- ============================================================================

-- Order Items: Historical snapshot of purchased bundles (immutable price lock)
CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_bundle_id INT NOT NULL REFERENCES product_bundles(id) ON DELETE RESTRICT,
    product_name VARCHAR(150) NOT NULL,
    pieces_per_bundle INT NOT NULL CHECK (pieces_per_bundle > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Order Status History: Full audit trail of status transitions for admin and customer
CREATE TABLE order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(40),
    new_status VARCHAR(40) NOT NULL,
    changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- NULL for automated customer/system changes
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

-- Payments: Payment logs for downpayment and remaining balance
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_channel VARCHAR(50) NOT NULL 
        CHECK (payment_channel IN ('gcash', 'maya', 'bank_transfer', 'cod', 'cash')),
    payment_stage VARCHAR(30) NOT NULL 
        CHECK (payment_stage IN ('downpayment', 'balance', 'full')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reference_number VARCHAR(100),                  -- GCash / Maya reference code
    receipt_image_url TEXT,                         -- Supabase Storage receipt URL
    verification_status VARCHAR(30) DEFAULT 'unverified' NOT NULL 
        CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
    verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- Admin user ID
    verified_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_ref ON payments(reference_number);

-- Cancellation Requests: Customer-initiated cancellation & refund requests
CREATE TABLE cancellation_requests (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, -- Exactly 1 cancellation request per order
    requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(100) NOT NULL,
    reason_details TEXT,
    refund_channel VARCHAR(50) NOT NULL 
        CHECK (refund_channel IN ('gcash', 'maya', 'bank_transfer')),
    refund_account_name VARCHAR(150) NOT NULL,
    refund_account_number VARCHAR(50) NOT NULL,     -- 11-digit mobile number for e-wallet
    eligible_refund_amount NUMERIC(10, 2) NOT NULL CHECK (eligible_refund_amount >= 0), -- 50% downpayment
    status VARCHAR(30) DEFAULT 'pending_review' NOT NULL 
        CHECK (status IN ('pending_review', 'approved', 'processed', 'rejected')),
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_cancellations_order ON cancellation_requests(order_id);
CREATE INDEX idx_cancellations_status ON cancellation_requests(status);

-- ============================================================================
-- TIER 5: REFUND TRANSACTIONS (DISBURSEMENT AUDIT)
-- ============================================================================

-- Refund Transactions: Record of completed 50% downpayment refunds sent to customer
CREATE TABLE refund_transactions (
    id BIGSERIAL PRIMARY KEY,
    cancellation_request_id BIGINT NOT NULL REFERENCES cancellation_requests(id) ON DELETE RESTRICT,
    original_payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
    refund_amount NUMERIC(10, 2) NOT NULL CHECK (refund_amount > 0),
    transaction_reference VARCHAR(100) NOT NULL,    -- E-wallet reference ID of outgoing refund
    processed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    admin_notes TEXT
);

CREATE INDEX idx_refunds_request ON refund_transactions(cancellation_request_id);

-- ============================================================================
-- AUDIT TRIGGER: AUTOMATIC updated_at REFRESH
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at 
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_products_updated_at 
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_product_bundles_updated_at 
    BEFORE UPDATE ON product_bundles FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_partner_apps_updated_at 
    BEFORE UPDATE ON partner_applications FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_carts_updated_at 
    BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_orders_updated_at 
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_cancellations_updated_at 
    BEFORE UPDATE ON cancellation_requests FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_store_settings_updated_at 
    BEFORE UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
