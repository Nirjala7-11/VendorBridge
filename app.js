const SUPABASE_URL = 'https://obcslpgrfkjsiqsmnegl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jVeWA30bIzvr6bkLUnGiQA_n6HAwr7i';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

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

function requireAuth() {
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome back, ${session.firstname} 👋`;
    }
    return session;
}

async function logAction(action, status = 'Success') {
    const session = getSession();
    const actor = session
        ? `${session.firstname} ${session.lastname} (${session.role})`
        : 'System / Guest';

    const { error } = await db.from('audit_logs').insert([{
        action_description: action,
        actor_profile:      actor,
        status:             status,
    }]);

    if (error) console.error('[AuditLog] Insert failed:', error.message);
}

function toggleAuth(view) {
    // Hide all three sections first
    ['login-section', 'register-section', 'forgot-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show the requested one
    const targetId =
        view === 'register' ? 'register-section' :
        view === 'forgot'   ? 'forgot-section'   :
                              'login-section';

    const target = document.getElementById(targetId);
    if (target) target.style.display = 'block';

    // Always reset forgot flow when opening it
    if (view === 'forgot') resetForgotSteps();
}
async function handleLogin() {
    const email    = document.getElementById('login-username')?.value.trim().toLowerCase();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        alert('Please enter your email and password.');
        return;
    }

    // Use array result (no .single()) so missing rows return [] not an error
    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password_hash', password)
        .limit(1);

    if (error) {
        alert('A network error occurred. Please try again.');
        console.error('[Login] DB error:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert('Invalid email or password. Please try again.');
        await logAction(`Failed login attempt: ${email}`, 'Failed');
        return;
    }

    const user = data[0];
    setSession(user);
    await logAction(`User logged in: ${user.firstname} ${user.lastname}`, 'Success');
    window.location.href = 'dashboard.html';
}

async function handleRegister() {
    const firstname   = document.getElementById('reg-firstname')?.value.trim();
    const lastname    = document.getElementById('reg-lastname')?.value.trim();
    const email       = document.getElementById('reg-email')?.value.trim().toLowerCase();
    const phone       = document.getElementById('reg-phone')?.value.trim();
    const role        = document.getElementById('reg-role')?.value;
    const country     = document.getElementById('reg-country')?.value.trim();
    const additional  = document.getElementById('reg-additional')?.value.trim();
    const password    = document.getElementById('reg-password')?.value;
    const confirmPass = document.getElementById('reg-confirm-password')?.value;

    // Field validation
    if (!firstname || !lastname || !email || !phone || !country || !password) {
        alert('Please fill in all required fields.');
        return;
    }
    if (!role) {
        alert('Please select a role.');
        return;
    }
    if (password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }
    if (password !== confirmPass) {
        alert('Passwords do not match. Please try again.');
        return;
    }

    // Check duplicate email — use array NOT .single() to avoid false errors
    const { data: existingList, error: checkError } = await db
        .from('users')
        .select('id')
        .eq('email', email)
        .limit(1);

    if (checkError) {
        alert('Could not verify email. Please try again.');
        console.error('[Register] Duplicate check error:', checkError.message);
        return;
    }

    if (existingList && existingList.length > 0) {
        alert('An account with this email already exists. Please log in instead.');
        return;
    }

    // Insert new user
    const { data, error } = await db.from('users').insert([{
        firstname,
        lastname,
        email,
        phone,
        role,
        country,
        additional_info: additional || '',
        password_hash:   password,
        status:          'Active'
    }]).select().single();

    if (error) {
        alert('Registration failed: ' + error.message);
        console.error('[Register] Insert error:', error);
        return;
    }

    await logAction(`New user registered: ${firstname} ${lastname} as ${role}`, 'Success');
    alert(`Registration successful! Welcome, ${firstname}.\n\nPlease log in with your credentials.`);

    // Clear register form
    ['reg-firstname','reg-lastname','reg-email','reg-phone','reg-country',
     'reg-password','reg-confirm-password','reg-additional'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('reg-role').selectedIndex = 0;

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

let otpTimerInterval = null;
let generatedOTP     = null;
let otpExpiry        = null;
let forgotUserEmail  = null;

/** Reset the forgot password UI back to step 1 */
function resetForgotSteps() {
    const show = id => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };
    const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none';  };
    const clear = id => { const el = document.getElementById(id); if (el) el.value = ''; };

    show('forgot-step-1');
    hide('forgot-step-2');
    hide('forgot-step-3');

    clear('forgot-email');
    clear('forgot-otp');
    clear('forgot-new-password');
    clear('forgot-confirm-password');

    clearInterval(otpTimerInterval);
    generatedOTP    = null;
    otpExpiry       = null;
    forgotUserEmail = null;
}

/** STEP 1 — Verify email exists, generate and display OTP */
async function sendOTP(isResend = false) {
    const emailInput  = document.getElementById('forgot-email');
    const email       = (forgotUserEmail || emailInput?.value.trim()).toLowerCase();

    if (!email) {
        alert('Please enter your registered email address.');
        return;
    }

    // Use array (not .single()) to avoid false errors when email not found
    const { data, error } = await db
        .from('users')
        .select('id, firstname')
        .eq('email', email)
        .limit(1);

    if (error) {
        alert('A network error occurred. Please try again.');
        console.error('[sendOTP] DB error:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert('No account found with that email address. Please check and try again.');
        return;
    }

    forgotUserEmail = email;

    // Generate 6-digit OTP
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    otpExpiry    = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Persist OTP to password_resets table (upsert — one row per email)
    await db.from('password_resets').upsert([{
        email,
        otp:        generatedOTP,
        expires_at: new Date(otpExpiry).toISOString(),
        used:       false
    }], { onConflict: 'email' });

    await logAction(
        `Password reset OTP ${isResend ? 'resent' : 'requested'} for: ${email}`,
        'Pending'
    );

    alert(`Your verification code is:\n\n${generatedOTP}\n\n(Demo mode — in production this would be emailed to ${email})`);
    // ──────────────────────────────────────────────────────────────────────

    // Move to step 2
    document.getElementById('forgot-step-1').style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'block';

    const displayEl = document.getElementById('forgot-email-display');
    if (displayEl) displayEl.textContent = email;

    // Start countdown
    clearInterval(otpTimerInterval);
    startOTPTimer();
}

/** Countdown timer for OTP expiry */
function startOTPTimer() {
    const timerEl = document.getElementById('otp-timer');
    otpTimerInterval = setInterval(() => {
        const remaining = otpExpiry - Date.now();
        if (remaining <= 0) {
            clearInterval(otpTimerInterval);
            if (timerEl) {
                timerEl.textContent  = 'Expired';
                timerEl.style.color  = 'var(--accent-red)';
            }
            generatedOTP = null;
            return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        if (timerEl) {
            timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        }
    }, 1000);
}

/** STEP 2 — Validate entered OTP */
async function verifyOTP() {
    const entered = document.getElementById('forgot-otp')?.value.trim();

    if (!entered || entered.length !== 6) {
        alert('Please enter the full 6-digit code.');
        return;
    }

    if (!generatedOTP || Date.now() > otpExpiry) {
        alert('Your code has expired. Please request a new one.');
        document.getElementById('forgot-step-2').style.display = 'none';
        document.getElementById('forgot-step-1').style.display = 'block';
        forgotUserEmail = null;
        return;
    }

    if (entered !== generatedOTP) {
        alert('Incorrect code. Please check and try again.');
        document.getElementById('forgot-otp').value = '';
        return;
    }

    // Mark OTP as used
    await db.from('password_resets')
        .update({ used: true })
        .eq('email', forgotUserEmail);

    clearInterval(otpTimerInterval);
    await logAction(`OTP verified successfully for: ${forgotUserEmail}`, 'Success');

    // Move to step 3
    document.getElementById('forgot-step-2').style.display = 'none';
    document.getElementById('forgot-step-3').style.display = 'block';
}

/** STEP 3 — Update password in DB */
async function resetPassword() {
    const newPass     = document.getElementById('forgot-new-password')?.value;
    const confirmPass = document.getElementById('forgot-confirm-password')?.value;

    if (!newPass || !confirmPass) {
        alert('Please fill in both password fields.');
        return;
    }
    if (newPass.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }
    if (newPass !== confirmPass) {
        alert('Passwords do not match. Please try again.');
        return;
    }

    const { error } = await db
        .from('users')
        .update({ password_hash: newPass })
        .eq('email', forgotUserEmail);

    if (error) {
        alert('Failed to update password: ' + error.message);
        return;
    }

    // Clean up reset record
    await db.from('password_resets').delete().eq('email', forgotUserEmail);
    await logAction(`Password successfully reset for: ${forgotUserEmail}`, 'Success');

    alert(' Password updated successfully!\n\nPlease log in with your new password.');
    resetForgotSteps();
    toggleAuth('login');
}

function routeTo(page) {
    window.location.href = page;
}

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
        name, category, gst_number: gst, email, status: 'Active'
    }]);

    if (error) { alert('Failed to add vendor: ' + error.message); return; }

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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;
            color:var(--text-muted); padding:30px;">
            ${error ? 'Error loading vendors.' : 'No vendors found.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(v => `
        <tr>
            <td><strong>${escHtml(v.name)}</strong></td>
            <td>${escHtml(v.category)}</td>
            <td style="font-family:monospace; font-size:13px;">${escHtml(v.gst_number)}</td>
            <td>${escHtml(v.email)}</td>
            <td><span style="color:${statusColor(v.status)}; font-weight:600;">${escHtml(v.status)}</span></td>
            <td>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;"
                    onclick="updateVendorStatus(${v.id}, 'Blocked')">Block</button>
            </td>
        </tr>`).join('');
}

async function updateVendorStatus(id, newStatus) {
    if (!confirm(`Set vendor status to "${newStatus}"?`)) return;
    const { error } = await db.from('vendors').update({ status: newStatus }).eq('id', id);
    if (error) { alert('Update failed: ' + error.message); return; }
    await logAction(`Vendor ID ${id} status changed to: ${newStatus}`, 'Success');
    loadVendors(vendorFilterState);
}

function filterVendors(filter) { loadVendors(filter); }

let rfqLineItemCount = 0;

function addRFQLineItem() {
    rfqLineItemCount++;
    const container = document.getElementById('rfqLineItemsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.id = `rfq-line-${rfqLineItemCount}`;
    row.style.cssText = 'display:flex; gap:10px; align-items:center;';
    row.innerHTML = `
        <input type="text" class="form-control rfq-item-name" placeholder="Item description" style="flex:2;" required>
        <input type="number" class="form-control rfq-item-qty" placeholder="Qty" style="flex:0.6; min-width:60px;" min="1" required>
        <input type="text" class="form-control rfq-item-unit" placeholder="Unit" style="flex:0.8;">
        <button type="button" onclick="removeRFQLineItem(${rfqLineItemCount})"
            style="background:var(--accent-red); border:none; color:#fff;
                   border-radius:4px; padding:8px 10px; cursor:pointer; font-size:16px;">✕</button>`;
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

    if (!title || !deadline) { alert('RFQ Title and Deadline are required.'); return; }

    const lineItems = [];
    document.querySelectorAll('#rfqLineItemsContainer > div').forEach(row => {
        const name = row.querySelector('.rfq-item-name')?.value.trim();
        const qty  = row.querySelector('.rfq-item-qty')?.value;
        const unit = row.querySelector('.rfq-item-unit')?.value.trim();
        if (name) lineItems.push({ name, qty: parseInt(qty) || 1, unit });
    });

    const session = getSession();
    const { error } = await db.from('rfqs').insert([{
        title, category, deadline, details,
        vendor_targets: vendors,
        line_items: lineItems,
        status: statusValue,
        created_by: session ? `${session.firstname} ${session.lastname}` : 'Unknown'
    }]);

    if (error) { alert('Failed to save RFQ: ' + error.message); return; }

    await logAction(
        `RFQ ${statusValue === 'Draft' ? 'saved as draft' : 'published'}: "${title}"`,
        'Success'
    );
    alert(`RFQ "${title}" ${statusValue === 'Draft' ? 'saved as draft' : 'broadcast to vendors'} successfully.`);
    if (statusValue === 'Open') routeTo('quotations.html');
}

function calculateQuoteTotals() {
    let subtotal = 0;
    document.querySelectorAll('#quoteItemTableBody tr').forEach(row => {
        const qtyEl   = row.cells[1];
        const priceEl = row.querySelector('.unit-price-input');
        const totalEl = row.querySelector('.line-total');
        if (!qtyEl || !priceEl || !totalEl) return;
        const qty  = parseFloat(qtyEl.textContent) || 0;
        const price = parseFloat(priceEl.value) || 0;
        const line  = qty * price;
        totalEl.textContent = `$${line.toFixed(2)}`;
        subtotal += line;
    });

    const taxRate = parseFloat(document.getElementById('taxRateInput')?.value) || 0;
    const gst     = subtotal * (taxRate / 100);
    const grand   = subtotal + gst;
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
        `Quotation ${statusValue === 'Draft' ? 'saved as draft' : 'submitted'}: ${document.getElementById('rfqSummaryRef')?.textContent}`,
        statusValue === 'Draft' ? 'Pending' : 'Success'
    );

    alert(statusValue === 'Draft' ? 'Quotation saved as draft.' : 'Quotation submitted successfully.');
    if (statusValue !== 'Draft') routeTo('approvals.html');
}

async function processApprovalStage(decision, approverRole) {
    const remarks = document.getElementById('approvalRemarks')?.value.trim();
    if (!remarks) { alert('Please enter audit remarks before proceeding.'); return; }

    const session = getSession();
    const actor   = session ? `${session.firstname} ${session.lastname}` : approverRole;

    const { error } = await db.from('approvals').insert([{
        decision, approver_role: approverRole, approver_name: actor,
        remarks, target_quotation: 'RFQ-2026-89A / TechCore Ltd — $33,630.00'
    }]);

    if (error) { alert('Failed to record approval: ' + error.message); return; }

    await logAction(
        `Approval [${decision}] by ${actor} (${approverRole}): ${remarks.substring(0, 80)}`,
        decision
    );

    if (decision === 'Approved') {
        alert('✅ Authorized. Purchase Order generation initiated.');
        routeTo('purchase_orders.html');
    } else {
        alert('❌ Rejected and bounced back to procurement pipeline.');
        routeTo('rfqs.html');
    }
}

const LOG_FILTER_MAP = {
    'All': null, 'RFQ': 'RFQ', 'Approved': 'Approved',
    'Invoices': 'Invoice', 'Vendors': 'vendor'
};

async function renderActivityModule(filter) {
    let query = db.from('audit_logs').select('*')
        .order('created_at', { ascending: false }).limit(200);

    const keyword = LOG_FILTER_MAP[filter];
    if (keyword) query = query.ilike('action_description', `%${keyword}%`);

    const { data, error } = await query;
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;
            color:var(--accent-red); padding:30px;">Error: ${escHtml(error.message)}</td></tr>`;
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;
            color:var(--text-muted); padding:30px;">No log entries found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(log => `
        <tr>
            <td style="font-family:monospace; font-size:12px; white-space:nowrap;">
                ${formatTimestamp(log.created_at)}</td>
            <td>${escHtml(log.action_description)}</td>
            <td style="font-size:13px;">${escHtml(log.actor_profile)}</td>
            <td><span style="color:${statusColor(log.status)}; font-weight:600; font-size:13px;">
                ${escHtml(log.status)}</span></td>
        </tr>`).join('');
}

function filterLogs(filter, btn) {
    document.querySelectorAll('.action-box .btn').forEach(b => b.classList.add('btn-secondary'));
    if (btn) btn.classList.remove('btn-secondary');
    renderActivityModule(filter);
}

let spendChart, trendChartInstance, dashTrendChart;

const CHART_DEFAULTS = {
    color: { blue:'#3b82f6', green:'#10b981', orange:'#f59e0b', red:'#ef4444', muted:'#374151' },
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
                    CHART_DEFAULTS.color.blue, CHART_DEFAULTS.color.green,
                    CHART_DEFAULTS.color.orange, CHART_DEFAULTS.color.muted
                ],
                borderWidth: 0, hoverOffset: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position:'bottom', labels:{ color:CHART_DEFAULTS.font, padding:16, font:{size:12} } },
                tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } }
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
            labels: ['Jan','Feb','Mar','Apr','May','Jun'],
            datasets: [
                { label:'Approved Spend ($)', data:[32000,48000,27000,61000,44000,53000],
                  backgroundColor: CHART_DEFAULTS.color.blue+'bb', borderColor: CHART_DEFAULTS.color.blue,
                  borderWidth:1, borderRadius:4 },
                { label:'Pipeline Volume ($)', data:[41000,55000,33000,70000,52000,67000],
                  backgroundColor: CHART_DEFAULTS.color.green+'55', borderColor: CHART_DEFAULTS.color.green,
                  borderWidth:1, borderRadius:4 }
            ]
        },
        options: chartBaseOptions('$')
    });
}

function restoreOutlayTrendMatrix() { renderMonthlyTrendChart(); }

function renderDashboardTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (dashTrendChart) dashTrendChart.destroy();
    dashTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan','Feb','Mar','Apr','May','Jun'],
            datasets: [{
                label: 'Monthly PO Outlay ($)',
                data: [32000,48000,27000,61000,44000,53000],
                borderColor: CHART_DEFAULTS.color.blue,
                backgroundColor: CHART_DEFAULTS.color.blue+'22',
                tension: 0.4, fill: true,
                pointBackgroundColor: CHART_DEFAULTS.color.blue, pointRadius: 4
            }]
        },
        options: chartBaseOptions('$')
    });
}

function chartBaseOptions(prefix = '') {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: CHART_DEFAULTS.font, font: { size: 12 } } },
            tooltip: { callbacks: { label: ctx => ` ${prefix}${ctx.parsed.y?.toLocaleString() ?? ctx.parsed.toLocaleString()}` } }
        },
        scales: {
            x: { ticks: { color: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.grid } },
            y: { ticks: { color: CHART_DEFAULTS.font, callback: v => `${prefix}${(v/1000).toFixed(0)}k` },
                 grid: { color: CHART_DEFAULTS.grid } }
        }
    };
}

function exportProcurementReport() {
    const month = document.getElementById('reportMonth')?.value || '06';
    const year  = document.getElementById('reportYear')?.value  || '2026';
    const rows  = [
        ['Vendor','Total Spend','PO Count','Delivery Accuracy'],
        ['TechCore Ltd','$145,000.00','8','98.4%'],
        ['Infra Supplies','$62,500.00','4','91.2%'],
        ['Comfort Office Logistics','$22,000.00','2','86.5%']
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `VendorBridge_Report_${year}_${month}.csv`; a.click();
    URL.revokeObjectURL(url);
    logAction(`Procurement report exported for ${month}/${year}`, 'Success');
}

function escHtml(str) {
    if (str == null) return '—';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function statusColor(status) {
    const map = {
        'Active':'var(--accent-green)', 'Success':'var(--accent-green)',
        'Approved':'var(--accent-green)', 'Pending':'var(--accent-orange)',
        'Draft':'var(--accent-orange)', 'Failed':'var(--accent-red)',
        'Rejected':'var(--accent-red)', 'Blocked':'var(--accent-red)'
    };
    return map[status] || 'var(--text-muted)';
}

function formatTimestamp(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('en-IN', {
            day:'2-digit', month:'short', year:'numeric',
            hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false
        });
    } catch { return iso; }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname.split('/').pop();

    if (page === 'index.html' || page === '') return;

    requireAuth();

    switch (page) {
        case 'dashboard.html':    renderDashboardTrendChart(); break;
        case 'vendors.html':      loadVendors('All');          break;
        case 'rfqs.html':         addRFQLineItem();            break;
        case 'quotations.html':   calculateQuoteTotals();      break;
        case 'activity.html':     renderActivityModule('All'); break;
        case 'report.html':       renderReportModule();        break;
        default: break;
    }
});
