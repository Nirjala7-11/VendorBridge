---------------------------------------------------------------------------
-- STEP 1: DROP EVERYTHING CLEANLY (safe to run multiple times)
-- ---------------------------------------------------------------------------
drop policy if exists "audit_logs_insert_only" on public.audit_logs;
drop policy if exists "audit_logs_select_all"  on public.audit_logs;
drop policy if exists "open_users"             on public.users;
drop policy if exists "open_vendors"           on public.vendors;
drop policy if exists "open_rfqs"              on public.rfqs;
drop policy if exists "open_quotations"        on public.quotations;
drop policy if exists "open_approvals"         on public.approvals;

drop table if exists public.audit_logs  cascade;
drop table if exists public.approvals   cascade;
drop table if exists public.quotations  cascade;
drop table if exists public.rfqs        cascade;
drop table if exists public.vendors     cascade;
drop table if exists public.users       cascade;

-- ---------------------------------------------------------------------------
-- STEP 2: CREATE TABLES
-- ---------------------------------------------------------------------------

create table public.users (
    id              bigint generated always as identity primary key,
    firstname       text not null,
    lastname        text not null,
    email           text not null unique,
    phone           text,
    role            text not null default 'Procurement Officer',
    country         text,
    additional_info text,
    password_hash   text not null,
    status          text not null default 'Active',
    created_at      timestamptz not null default now()
);

create table public.vendors (
    id          bigint generated always as identity primary key,
    name        text not null,
    category    text not null default 'Other',
    gst_number  text,
    email       text,
    status      text not null default 'Active',
    created_at  timestamptz not null default now()
);

create table public.rfqs (
    id              bigint generated always as identity primary key,
    title           text not null,
    category        text not null default 'Other',
    deadline        date,
    details         text,
    vendor_targets  text,
    line_items      jsonb,
    status          text not null default 'Draft',
    created_by      text,
    created_at      timestamptz not null default now()
);

create table public.quotations (
    id              bigint generated always as identity primary key,
    rfq_reference   text,
    subtotal        text,
    grand_total     text,
    status          text not null default 'Draft',
    created_at      timestamptz not null default now()
);

create table public.approvals (
    id                  bigint generated always as identity primary key,
    decision            text not null,
    approver_role       text,
    approver_name       text,
    remarks             text,
    target_quotation    text,
    created_at          timestamptz not null default now()
);

-- IMMUTABLE audit log — no updated_at, no edit/delete ever
create table public.audit_logs (
    id                  bigint generated always as identity primary key,
    action_description  text not null,
    actor_profile       text not null,
    status              text not null default 'Success',
    created_at          timestamptz not null default now()
);

-- Password resets table for OTP flow
create table if not exists public.password_resets (
    id          bigint generated always as identity primary key,
    email       text not null unique,
    otp         text not null,
    expires_at  timestamptz not null,
    used        boolean not null default false,
    created_at  timestamptz not null default now()
);
-- ---------------------------------------------------------------------------
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.users       enable row level security;
alter table public.vendors     enable row level security;
alter table public.rfqs        enable row level security;
alter table public.quotations  enable row level security;
alter table public.approvals   enable row level security;
alter table public.audit_logs  enable row level security;
alter table public.password_resets enable row level security;
-- ---------------------------------------------------------------------------
-- STEP 4: RLS POLICIES
-- ---------------------------------------------------------------------------

-- Open access for all tables (hackathon demo)
create policy "open_users"
    on public.users for all to anon, authenticated
    using (true) with check (true);

create policy "open_vendors"
    on public.vendors for all to anon, authenticated
    using (true) with check (true);

create policy "open_rfqs"
    on public.rfqs for all to anon, authenticated
    using (true) with check (true);

create policy "open_quotations"
    on public.quotations for all to anon, authenticated
    using (true) with check (true);

create policy "open_approvals"
    on public.approvals for all to anon, authenticated
    using (true) with check (true);

create policy "open_password_resets"
    on public.password_resets for all to anon, authenticated
    using (true) with check (true);
    
-- audit_logs: INSERT and SELECT only — no UPDATE, no DELETE policy = blocked by default
create policy "audit_logs_insert_only"
    on public.audit_logs for insert to anon, authenticated
    with check (true);

create policy "audit_logs_select_all"
    on public.audit_logs for select to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- STEP 5: SEED DATA
-- ---------------------------------------------------------------------------
insert into public.vendors (name, category, gst_number, email, status) values
    ('TechCore Ltd',             'IT & Infra', '27AABCT1234A1Z5', 'sales@techcore.io',     'Active'),
    ('Infra Supplies',           'IT & Infra', '27AABCI5678B2Z3', 'contact@infrasup.com',  'Active'),
    ('Comfort Office Logistics', 'Furniture',  '27AABCC9012C3Z1', 'hello@comfortol.com',   'Active'),
    ('Global Spares Inc',        'Other',      '27AABCG3456D4Z9', 'info@globalspares.com', 'Pending');

insert into public.users (firstname, lastname, email, phone, role, country, password_hash, status) values
    ('Sarah', 'Jenkins', 'sarah@vendorbridge.com', '9876543210', 'Admin', 'India', 'admin123', 'Active'),
    ('Raj',   'Mehta',   'raj@vendorbridge.com',   '9123456789', 'Procurement Officer', 'India', 'officer123', 'Active');

insert into public.audit_logs (action_description, actor_profile, status) values
    ('System initialized — schema deployed successfully', 'System / Admin', 'Success'),
    ('Vendor TechCore Ltd registered',                    'System / Admin', 'Success'),
    ('Vendor Infra Supplies registered',                  'System / Admin', 'Success'),
    ('Vendor Comfort Office Logistics registered',        'System / Admin', 'Success'),
    ('Vendor Global Spares Inc registered',               'System / Admin', 'Success'),
    ('Demo user Sarah Jenkins (Admin) created',           'System / Admin', 'Success'),
    ('Demo user Raj Mehta (Procurement Officer) created', 'System / Admin', 'Success');

