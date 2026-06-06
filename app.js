const SUPABASE_URL = 'https://obcslpgrfkjsiqsmnegl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jVeWA30bIzvr6bkLUnGiQA_n6HAwr7i';
// NOTE: In production, never expose keys in source. Use server-side env vars.

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// 2. SESSION / AUTH HELPERS
// ---------------------------------------------------------------------------

function getSession() {
    try {
        const raw = sessionStorage.getItem('vb_session');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function setSession(user) {
    sessionStorage.setItem('vb_session', JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem('vb_session');
}

/** Redirect to login if no active session (call on every protected page load). */
function requireAuth() {
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    // Populate welcome message on dashboard
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome back, ${session.firstname} 👋`;
    }
    return session;
}

/**
 * Appends one immutable entry to the audit_logs table.
 * @param {string} action  - Human-readable description of what happened.
 * @param {string} status  - e.g. 'Success', 'Failed', 'Pending', 'Approved', 'Rejected'
 */
async function logAction(action, status = 'Success') {
    const session = getSession();
    const actor = session
        ? `${session.firstname} ${session.lastname} (${session.role})`
        : 'System / Guest';

    const entry = {
        action_description: action,
        actor_profile:      actor,
        status:             status,
        // created_at is set server-side by Supabase default (now()); never sent from client.
    };

    const { error } = await db.from('audit_logs').insert([entry]);

    if (error) {
        // Log to console only — never surface internal errors to end-user in prod.
        console.error('[AuditLog] Insert failed:', error.message);
    }
}

// ---------------------------------------------------------------------------
// 4. AUTHENTICATION
// ---------------------------------------------------------------------------

function toggleAuth(view) {
    const loginSection    = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    if (!loginSection || !registerSection) return;

    if (view === 'register') {
        loginSection.style.display    = 'none';
        registerSection.style.display = 'block';
    } else {
        loginSection.style.display    = 'block';
        registerSection.style.display = 'none';
    }
}

async function handleLogin() {
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value.trim();

    if (!username || !password) {
        alert('Please enter both username and email/password.');
        return;
    }

    // Username is stored as email in the users table for simplicity.
    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('email', username)
        .eq('password_hash', password) // In production use proper hashing (bcrypt etc.)
        .single();

    if (error || !data) {
        alert('Invalid credentials. Please try again.');
        await logAction(`Failed login attempt for username: ${username}`, 'Failed');
        return;
    }

    setSession(data);
    await logAction(`User logged in: ${data.firstname} ${data.lastname}`, 'Success');
    window.location.href = 'dashboard.html';
}

async function handleRegister() {
    const firstname   = document.getElementById('reg-firstname')?.value.trim();
    const lastname    = document.getElementById('reg-lastname')?.value.trim();
    const email       = document.getElementById('reg-email')?.value.trim();
    const phone       = document.getElementById('reg-phone')?.value.trim();
    const role        = document.getElementById('reg-role')?.value;
    const country     = document.getElementById('reg-country')?.value.trim();
    const additional  = document.getElementById('reg-additional')?.value.trim();
    const password = document.getElementById('reg-password')?.value;
    const confirmPass = document.getElementById('reg-confirm-password')?.value;

    if (!firstname || !lastname || !email || !phone || !role || !country) {
        alert('Please fill in all required fields.');
        return;
    }
    if (password !== confirmPass) {
        alert('Passwords do not match. Please re-enter.');
        return;
    }
    if (password.length < 6) {
        alert('Password should be at least 6 characters long.');
        return;
    }

    // Check if email already exists
    const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

    if (existing) {
        alert('An account with this email already exists.');
        return;
    }

    const { data, error } = await db.from('users').insert([{
        firstname,
        lastname,
        email,
        phone,
        role,
        country,
        additional_info: additional,
        password_hash: password, // Placeholder — implement proper auth in prod
        status: 'Active'
    }]).select().single();

    if (error) {
        alert('Registration failed: ' + error.message);
        return;
    }

    await logAction(`New user registered: ${firstname} ${lastname} as ${role}`, 'Success');
    alert(`Registration successful! Welcome, ${firstname}. Please log in.`);
    toggleAuth('login');
}

async function logout() {
    const session = getSession();
    if (session) {
        await logAction(`User logged out: ${session.firstname} ${session.lastname}`, 'Success');
    }
    clearSession();
    window.location.href = 'index.html';
}

// ---------------------------------------------------------------------------
// 5. NAVIGATION UTILITY
// ---------------------------------------------------------------------------

function routeTo(page) {
    window.location.href = page;
}

// ---------------------------------------------------------------------------
// 6. VENDOR MANAGEMENT
// ---------------------------------------------------------------------------

let vendorFilterState = 'All';

function toggleVendorForm() {
    const section = document.getElementById('addVendorSection');
    if (!section) return;
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function addVendor() {
    const name     = document.getElementById('vendor-name')?.value.trim();
    const category = document.getElementById('vendor-category')?.value;
    const gst      = document.getElementById('vendor-gst')?.value.trim();
    const email    = document.getElementById('vendor-email')?.value.trim();

    if (!name || !gst || !email) {
        alert('Please fill in all required vendor fields.');
        return;
    }

    const { error } = await db.from('vendors').insert([{
        name,
        category,
        gst_number: gst,
        email,
        status: 'Active'
    }]);

    if (error) {
        alert('Failed to add vendor: ' + error.message);
        return;
    }

    await logAction(`New vendor registered: ${name} (${category})`, 'Success');
    alert(`Vendor "${name}" added successfully.`);
    toggleVendorForm();
    document.getElementById('vendorForm')?.reset();
    loadVendors();
}

async function loadVendors(filter = 'All') {
    vendorFilterState = filter;
    let query = db.from('vendors').select('*').order('created_at', { ascending: false });
    if (filter !== 'All') query = query.eq('status', filter);

    const { data, error } = await query;
    const tbody = document.getElementById('vendorTableBody');
    if (!tbody) return;

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">
            ${error ? 'Error loading vendors.' : 'No vendors found.'}
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(v => `
        <tr>
            <td><strong>${escHtml(v.name)}</strong></td>
            <td>${escHtml(v.category)}</td>
            <td style="font-family:monospace; font-size:13px;">${escHtml(v.gst_number)}</td>
            <td>${escHtml(v.email)}</td>
            <td>
                <span style="color:${statusColor(v.status)}; font-weight:600;">
                    ${escHtml(v.status)}
                </span>
            </td>
            <td>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;"
                    onclick="updateVendorStatus(${v.id}, 'Blocked')">Block</button>
            </td>
        </tr>
    `).join('');
}

async function updateVendorStatus(id, newStatus) {
    if (!confirm(`Set vendor status to "${newStatus}"?`)) return;

    const { error } = await db.from('vendors').update({ status: newStatus }).eq('id', id);
    if (error) { alert('Update failed: ' + error.message); return; }

    await logAction(`Vendor ID ${id} status changed to: ${newStatus}`, 'Success');
    loadVendors(vendorFilterState);
}

function filterVendors(filter) {
    loadVendors(filter);
}

// ---------------------------------------------------------------------------
// 7. RFQ MODULE
// ---------------------------------------------------------------------------

let rfqLineItemCount = 0;

function addRFQLineItem() {
    rfqLineItemCount++;
    const container = document.getElementById('rfqLineItemsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.id = `rfq-line-${rfqLineItemCount}`;
    row.style.cssText = 'display:flex; gap:10px; align-items:center; margin-bottom:8px;';
    row.innerHTML = `
        <input type="text" class="form-control rfq-item-name" placeholder="Item description"
            style="flex:2;" required>
        <input type="number" class="form-control rfq-item-qty" placeholder="Qty"
            style="flex:0.6; min-width:60px;" min="1" required>
        <input type="text" class="form-control rfq-item-unit" placeholder="Unit"
            style="flex:0.8;" >
        <button type="button" onclick="removeRFQLineItem(${rfqLineItemCount})"
            style="background:var(--accent-red); border:none; color:#fff;
                   border-radius:4px; padding:8px 10px; cursor:pointer; font-size:16px;">✕</button>
    `;
    container.appendChild(row);
}

function removeRFQLineItem(id) {
    document.getElementById(`rfq-line-${id}`)?.remove();
}

async function saveRFQ(statusValue) {
    const title    = document.getElementById('rfq-title')?.value.trim();
    const category = document.getElementById('rfq-category')?.value;
    const deadline = document.getElementById('rfq-deadline')?.value;
    const details  = document.getElementById('rfq-details')?.value.trim();
    const vendors  = document.getElementById('rfq-vendors')?.value.trim();

    if (!title || !deadline) {
        alert('RFQ Title and Deadline are required.');
        return;
    }

    // Collect line items
    const lineItems = [];
    document.querySelectorAll('#rfqLineItemsContainer > div').forEach(row => {
        const name = row.querySelector('.rfq-item-name')?.value.trim();
        const qty  = row.querySelector('.rfq-item-qty')?.value;
        const unit = row.querySelector('.rfq-item-unit')?.value.trim();
        if (name) lineItems.push({ name, qty: parseInt(qty) || 1, unit });
    });

    const session = getSession();
    const { data, error } = await db.from('rfqs').insert([{
        title,
        category,
        deadline,
        details,
        vendor_targets: vendors,
        line_items: lineItems,
        status: statusValue,
        created_by: session ? `${session.firstname} ${session.lastname}` : 'Unknown'
    }]).select().single();

    if (error) {
        alert('Failed to save RFQ: ' + error.message);
        return;
    }

    await logAction(
        `RFQ ${statusValue === 'Draft' ? 'saved as draft' : 'published'}: "${title}"`,
        'Success'
    );
    alert(`RFQ "${title}" ${statusValue === 'Draft' ? 'saved as draft' : 'broadcast to vendors'} successfully.`);
    if (statusValue === 'Open') routeTo('quotations.html');
}

// ---------------------------------------------------------------------------
// 8. QUOTATIONS MODULE
// ---------------------------------------------------------------------------

function calculateQuoteTotals() {
    let subtotal = 0;
    document.querySelectorAll('#quoteItemTableBody tr').forEach(row => {
        const qtyEl   = row.cells[1];
        const priceEl = row.querySelector('.unit-price-input');
        const totalEl = row.querySelector('.line-total');
        if (!qtyEl || !priceEl || !totalEl) return;

        const qty   = parseFloat(qtyEl.textContent) || 0;
        const price = parseFloat(priceEl.value) || 0;
        const line  = qty * price;
        totalEl.textContent = `$${line.toFixed(2)}`;
        subtotal += line;
    });

    const taxRate  = parseFloat(document.getElementById('taxRateInput')?.value) || 0;
    const gst      = subtotal * (taxRate / 100);
    const grand    = subtotal + gst;

    const fmt = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('lblSubtotal',   fmt(subtotal));
    setEl('lblGst',        fmt(gst));
    setEl('lblGrandTotal', fmt(grand));
}

async function submitQuotation(statusValue) {
    const subtotalEl   = document.getElementById('lblSubtotal');
    const grandTotalEl = document.getElementById('lblGrandTotal');

    if (!subtotalEl) return;

    const { error } = await db.from('quotations').insert([{
        rfq_reference: document.getElementById('rfqSummaryRef')?.textContent || 'Unknown RFQ',
        subtotal:      subtotalEl.textContent,
        grand_total:   grandTotalEl?.textContent,
        status:        statusValue
    }]);

    if (error) { alert('Failed to submit quotation: ' + error.message); return; }

    await logAction(
        `Quotation ${statusValue === 'Draft' ? 'saved as draft' : 'submitted for RFQ'}: ${document.getElementById('rfqSummaryRef')?.textContent}`,
        statusValue === 'Draft' ? 'Pending' : 'Success'
    );

    alert(statusValue === 'Draft'
        ? 'Quotation saved as draft.'
        : 'Quotation submitted successfully. Awaiting review.'
    );
    if (statusValue !== 'Draft') routeTo('approvals.html');
}

// ---------------------------------------------------------------------------
// 9. APPROVALS MODULE
// ---------------------------------------------------------------------------

async function processApprovalStage(decision, approverRole) {
    const remarks = document.getElementById('approvalRemarks')?.value.trim();

    if (!remarks) {
        alert('Please enter audit evaluation remarks before proceeding.');
        return;
    }

    const session = getSession();
    const actor   = session ? `${session.firstname} ${session.lastname}` : approverRole;

    const { error } = await db.from('approvals').insert([{
        decision,
        approver_role: approverRole,
        approver_name: actor,
        remarks,
        target_quotation: 'RFQ-2026-89A / TechCore Ltd — $33,630.00'
    }]);

    if (error) { alert('Failed to record approval: ' + error.message); return; }

    await logAction(
        `Approval decision [${decision}] by ${actor} (${approverRole}): ${remarks.substring(0, 80)}`,
        decision
    );

    if (decision === 'Approved') {
        alert('✅ Batch authorized. Purchase Order generation initiated.');
        routeTo('purchase_orders.html');
    } else {
        alert('❌ Allocation rejected and bounced back to procurement pipeline.');
        routeTo('rfqs.html');
    }
}

// ---------------------------------------------------------------------------
// 10. ACTIVITY & AUDIT LOGS MODULE
// ---------------------------------------------------------------------------
// READ-ONLY display. No edit/delete controls are rendered or available.

let currentLogFilter = 'All';

const LOG_FILTER_MAP = {
    'All':      null,
    'RFQ':      'RFQ',
    'Approved': 'Approved',
    'Invoices': 'Invoice',
    'Vendors':  'vendor'
};

async function renderActivityModule(filter) {
    currentLogFilter = filter;

    // Update button styles
    document.querySelectorAll('.action-box .btn').forEach(btn => {
        btn.classList.toggle('btn-secondary',
            btn.textContent.trim() !== filterBtnLabel(filter));
    });

    let query = db
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    const keyword = LOG_FILTER_MAP[filter];
    if (keyword) {
        query = query.ilike('action_description', `%${keyword}%`);
    }

    const { data, error } = await query;
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--accent-red); padding:30px;">
            Error loading audit logs: ${escHtml(error.message)}
        </td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px;">
            No log entries found for this filter.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(log => `
        <tr>
            <td style="font-family:monospace; font-size:12px; white-space:nowrap;">
                ${formatTimestamp(log.created_at)}
            </td>
            <td>${escHtml(log.action_description)}</td>
            <td style="font-size:13px;">${escHtml(log.actor_profile)}</td>
            <td>
                <span style="color:${statusColor(log.status)}; font-weight:600; font-size:13px;">
                    ${escHtml(log.status)}
                </span>
            </td>
        </tr>
    `).join('');
}

function filterLogs(filter, btn) {
    // Swap active button styles
    document.querySelectorAll('.action-box .btn').forEach(b => b.classList.add('btn-secondary'));
    if (btn) btn.classList.remove('btn-secondary');
    renderActivityModule(filter);
}

function filterBtnLabel(filter) {
    const map = {
        'All': 'All Transactions',
        'RFQ': 'RFQs Pipeline',
        'Approved': 'Approved Lifecycle',
        'Invoices': 'Invoices Register',
        'Vendors': 'Vendor Relations'
    };
    return map[filter] || filter;
}

// ---------------------------------------------------------------------------
// 11. REPORTS & ANALYTICS MODULE
// ---------------------------------------------------------------------------

let spendChart, trendChartInstance, dashTrendChart;

const CHART_DEFAULTS = {
    color: {
        blue:   '#3b82f6',
        green:  '#10b981',
        orange: '#f59e0b',
        red:    '#ef4444',
        muted:  '#374151'
    },
    grid: 'rgba(255,255,255,0.05)',
    font: '#9ca3af'
};

function renderReportModule() {
    renderSpendCategoryChart();
    renderMonthlyTrendChart();
}

function renderSpendCategoryChart() {
    const ctx = document.getElementById('spendCategoryChart');
    if (!ctx) return;

    if (spendChart) spendChart.destroy();

    spendChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['IT & Infra', 'Furniture', 'Stationery', 'Other'],
            datasets: [{
                data: [145000, 62500, 22000, 8500],
                backgroundColor: [
                    CHART_DEFAULTS.color.blue,
                    CHART_DEFAULTS.color.green,
                    CHART_DEFAULTS.color.orange,
                    CHART_DEFAULTS.color.muted
                ],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: CHART_DEFAULTS.font, padding: 16, font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` $${ctx.parsed.toLocaleString()}`
                    }
                }
            }
        }
    });
}

function renderMonthlyTrendChart() {
    const ctx = document.getElementById('monthlyTrendChart');
    if (!ctx) return;

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Approved Spend ($)',
                data: [32000, 48000, 27000, 61000, 44000, 53000],
                backgroundColor: CHART_DEFAULTS.color.blue + 'bb',
                borderColor: CHART_DEFAULTS.color.blue,
                borderWidth: 1,
                borderRadius: 4
            }, {
                label: 'Pipeline Volume ($)',
                data: [41000, 55000, 33000, 70000, 52000, 67000],
                backgroundColor: CHART_DEFAULTS.color.green + '55',
                borderColor: CHART_DEFAULTS.color.green,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: chartBaseOptions('$')
    });
}

function restoreOutlayTrendMatrix() {
    renderMonthlyTrendChart();
}

function renderDashboardTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (dashTrendChart) dashTrendChart.destroy();

    dashTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Monthly PO Outlay ($)',
                data: [32000, 48000, 27000, 61000, 44000, 53000],
                borderColor: CHART_DEFAULTS.color.blue,
                backgroundColor: CHART_DEFAULTS.color.blue + '22',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: CHART_DEFAULTS.color.blue,
                pointRadius: 4
            }]
        },
        options: chartBaseOptions('$')
    });
}

function chartBaseOptions(prefix = '') {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: CHART_DEFAULTS.font, font: { size: 12 } }
            },
            tooltip: {
                callbacks: {
                    label: ctx => ` ${prefix}${ctx.parsed.y?.toLocaleString() ?? ctx.parsed.toLocaleString()}`
                }
            }
        },
        scales: {
            x: {
                ticks: { color: CHART_DEFAULTS.font },
                grid:  { color: CHART_DEFAULTS.grid }
            },
            y: {
                ticks: {
                    color: CHART_DEFAULTS.font,
                    callback: v => `${prefix}${(v / 1000).toFixed(0)}k`
                },
                grid: { color: CHART_DEFAULTS.grid }
            }
        }
    };
}

function exportProcurementReport() {
    const month = document.getElementById('reportMonth')?.value || '06';
    const year  = document.getElementById('reportYear')?.value  || '2026';

    // Compose a simple CSV export of the vendor table
    const rows = [
        ['Vendor', 'Total Spend', 'PO Count', 'Delivery Accuracy'],
        ['TechCore Ltd', '$145,000.00', '8', '98.4%'],
        ['Infra Supplies', '$62,500.00', '4', '91.2%'],
        ['Comfort Office Logistics', '$22,000.00', '2', '86.5%']
    ];

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `VendorBridge_Report_${year}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    logAction(`Procurement report exported for ${month}/${year}`, 'Success');
}

// ---------------------------------------------------------------------------
// 12. UTILITY HELPERS
// ---------------------------------------------------------------------------

/** Escape HTML to prevent XSS when rendering DB content. */
function escHtml(str) {
    if (str == null) return '—';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Map a status string to a CSS color variable. */
function statusColor(status) {
    const map = {
        'Active':   'var(--accent-green)',
        'Success':  'var(--accent-green)',
        'Approved': 'var(--accent-green)',
        'Pending':  'var(--accent-orange)',
        'Draft':    'var(--accent-orange)',
        'Failed':   'var(--accent-red)',
        'Rejected': 'var(--accent-red)',
        'Blocked':  'var(--accent-red)',
    };
    return map[status] || 'var(--text-muted)';
}

/** Format an ISO timestamp for display. */
function formatTimestamp(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-IN', {
            day:    '2-digit', month: 'short', year: 'numeric',
            hour:   '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
    } catch { return iso; }
}

// ---------------------------------------------------------------------------
// 13. PAGE BOOTSTRAP — auto-run on every page
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname.split('/').pop();

    // Index/login page is always accessible
    if (page === 'index.html' || page === '') return;

    // All other pages require an active session
    requireAuth();

    // Page-specific initializations
    switch (page) {
        case 'dashboard.html':
            renderDashboardTrendChart();
            break;

        case 'vendors.html':
            loadVendors('All');
            break;

        case 'rfqs.html':
            addRFQLineItem(); // Seed first line item
            break;

        case 'quotations.html':
            calculateQuoteTotals(); // Set initial totals
            break;

        case 'activity.html':
            renderActivityModule('All');
            break;

        case 'report.html':
            renderReportModule();
            break;

        default:
            break;
    }
});