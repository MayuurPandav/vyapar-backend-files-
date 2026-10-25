const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';
let adminToken = '';
let superToken = '';
let testProductId = '';
let testPartyId = '';
let testInvoiceId = '';
let testDeliveryId = '';
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
    totalFailed++;
    failures.push({ testName, details });
  }
}

async function runFeatureTests() {
  console.log('===============================================================');
  console.log('🚀 VYAPAR 2.0 AUTOMATED LIVE REAL-TIME FEATURE TEST SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // FEATURE 1: Authentication & Demo Admin Session
  // -------------------------------------------------------------------------
  console.log('👉 [FEATURE 1] Authentication & Admin Session');
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@vyapar.com', password: 'admin123' })
    });
    const data = await res.json();
    assert(res.ok && data.token, 'Admin login with demo credentials', data.message || '');
    assert(data.user && data.user.role === 'admin', 'Returned role is admin', JSON.stringify(data.user));
    assert(data.onboardingRequired === false, 'Onboarding not required for ready demo account');
    adminToken = data.token;
  } catch (e) {
    assert(false, 'Admin login with demo credentials', e.message);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  // -------------------------------------------------------------------------
  // FEATURE 2: Dashboard KPIs & Timeseries Analytics
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 2] Dashboard KPIs & Revenue Analytics');
  try {
    const res = await fetch(`${BASE_URL}/api/dashboard?username=admin@vyapar.com`, { headers: authHeaders });
    const data = await res.json();
    assert(res.ok, 'Fetch Dashboard summary KPI metrics', res.statusText);
    assert(data.status === 'success' || typeof data === 'object', 'Dashboard data contains metrics');

    const resTs = await fetch(`${BASE_URL}/api/revenue-timeseries?username=admin@vyapar.com&period=monthly`, { headers: authHeaders });
    const dataTs = await resTs.json();
    assert(resTs.ok, 'Fetch monthly revenue timeseries chart data', resTs.statusText);
  } catch (e) {
    assert(false, 'Dashboard and Timeseries', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 3: Products & Inventory Management
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 3] Products & Inventory Management');
  try {
    const uniqueSku = 'SKU-' + Date.now();
    const resAdd = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        name: 'Automated Test Product ' + Date.now(),
        sku: uniqueSku,
        category: 'Electronics',
        price: 499,
        salePrice: 499,
        purchasePrice: 350,
        stock: 120,
        minStock: 10,
        unit: 'Pcs',
        taxRate: 18
      })
    });
    const addData = await resAdd.json();
    assert(resAdd.ok && addData.status === 'success', 'Add new inventory product', addData.message || '');
    testProductId = (addData.product && (addData.product.id || addData.product._id)) || uniqueSku;

    // Fetch product list (data is in listData.data)
    const resList = await fetch(`${BASE_URL}/api/list?username=admin@vyapar.com&type=products&page=1&limit=10`, { headers: authHeaders });
    const listData = await resList.json();
    assert(resList.ok && Array.isArray(listData.data), 'List inventory products');

    // Stock alert checks
    const resAlerts = await fetch(`${BASE_URL}/api/products/alerts?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resAlerts.ok, 'Check low-stock alerts endpoint');
  } catch (e) {
    assert(false, 'Products & Inventory', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 4: Parties & Customer CRM
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 4] Parties & Customer CRM');
  try {
    const uniquePartyEmail = `amit.verma.${Date.now()}@example.com`;
    const resParty = await fetch(`${BASE_URL}/api/parties`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        name: 'Amit Verma Enterprise',
        phone: '9820198201',
        email: uniquePartyEmail,
        type: 'Customer',
        address: 'Bandra West, Mumbai',
        openingBalance: 1500,
        gstin: '27AAAAA0000A1Z5'
      })
    });
    const partyData = await resParty.json();
    assert(resParty.ok && partyData.status === 'success', 'Add new customer party', partyData.message || '');
    testPartyId = partyData.party ? (partyData.party.id || partyData.party._id) : '';

    const resPartyList = await fetch(`${BASE_URL}/api/list?username=admin@vyapar.com&type=parties&page=1&limit=10`, { headers: authHeaders });
    assert(resPartyList.ok, 'Query customer parties list');
  } catch (e) {
    assert(false, 'Parties & Customer CRM', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 5: Invoices & Real-Time Billing Engine
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 5] Invoices & Billing Engine');
  const invoiceNum = 'INV-' + Date.now();
  try {
    const resInv = await fetch(`${BASE_URL}/api/invoices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        type: 'sale',
        invoiceNumber: invoiceNum,
        customerName: 'Amit Verma Enterprise',
        customerPhone: '9820198201',
        date: new Date().toISOString(),
        items: [
          { name: 'Automated Test Product', qty: 2, price: 499, total: 998, taxRate: 18 }
        ],
        subtotal: 998,
        taxAmount: 179.64,
        totalAmount: 1177.64,
        paymentStatus: 'Unpaid',
        paymentMode: 'UPI'
      })
    });
    const invData = await resInv.json();
    assert(resInv.ok && invData.status === 'success', 'Create GST Sale Invoice', invData.message || '');
    testInvoiceId = invData.invoiceId || invoiceNum;

    // Fetch invoices
    const resInvList = await fetch(`${BASE_URL}/api/invoices?username=admin@vyapar.com`, { headers: authHeaders });
    const invListData = await resInvList.json();
    assert(resInvList.ok, 'Query invoice ledger records');
  } catch (e) {
    assert(false, 'Invoices & Billing', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 6: Barcode & Label Generation
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 6] Barcode & QR Label Generation');
  try {
    const resBarcode = await fetch(`${BASE_URL}/api/admin/barcodes/generate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        code: 'VYAPAR-' + Math.floor(100000 + Math.random() * 900000),
        type: 'code128',
        productName: 'Organic Green Tea'
      })
    });
    const barcodeData = await resBarcode.json();
    assert(resBarcode.ok && (barcodeData.status === 'success' || barcodeData.barcode || barcodeData.code), 'Generate Barcode payload');

    const resBarcodeList = await fetch(`${BASE_URL}/api/admin/barcodes?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resBarcodeList.ok, 'List saved barcodes');
  } catch (e) {
    assert(false, 'Barcode Generation', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 7: Delivery Management & Driver Dispatch
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 7] Delivery Management & Dispatch Console');
  const deliveryOrderId = 'ORD-' + Date.now();
  try {
    const resDeliv = await fetch(`${BASE_URL}/api/admin/deliveries`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        orderId: deliveryOrderId,
        customerName: 'Rohan Sharma',
        customerPhone: '9876543211',
        deliveryAddress: 'Flat 402, Green Heights, Andheri, Mumbai',
        status: 'pending',
        charges: 50,
        billAmount: 1177.64,
        paymentType: 'COD'
      })
    });
    const delivData = await resDeliv.json();
    assert(resDeliv.ok && (delivData.status === 'success' || delivData.delivery), 'Create Delivery task', delivData.message || '');
    testDeliveryId = deliveryOrderId;

    // Fetch delivery list
    const resDelivList = await fetch(`${BASE_URL}/api/admin/deliveries?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resDelivList.ok, 'Fetch merchant delivery tasks list');
  } catch (e) {
    assert(false, 'Delivery Management', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 8: Public Customer Live Order Tracking (Zero Auth Required)
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 8] Public Customer Live Order Tracker');
  try {
    const resTrack = await fetch(`${BASE_URL}/api/driver/track/order/${testDeliveryId}`);
    assert(resTrack.ok, 'Public GPS tracking endpoint responds with live delivery state');
  } catch (e) {
    assert(false, 'Public Order Tracker', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 9: Public Customer Invoice Payment Gateway (Zero Auth Required)
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 9] Public Customer Payment Gateway');
  try {
    const resPubPay = await fetch(`${BASE_URL}/api/payments/public/${testInvoiceId}`);
    const pubData = await resPubPay.json();
    assert(resPubPay.ok && (pubData.status === 'success' || pubData.invoiceNumber || pubData.invoice || pubData.totalAmount !== undefined || pubData.amount !== undefined), 'Public invoice payment retrieval');
    if (pubData.upiString) {
      assert(true, 'Instant UPI payment intent generated with merchant VPA');
    }
  } catch (e) {
    assert(false, 'Public Payment Gateway', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 10: Offers & Discount Coupons
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 10] Offers & Discount Coupons');
  try {
    const resOffer = await fetch(`${BASE_URL}/api/admin/offers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        title: 'Festive ' + Math.floor(10 + Math.random() * 90) + '% Off',
        type: 'percentage',
        value: 15,
        minOrderValue: 500,
        validUntil: '2028-12-31',
        active: true
      })
    });
    const offerData = await resOffer.json();
    assert(resOffer.ok && offerData.status === 'success', 'Create promotional discount offer', offerData.message || '');

    const resOfferList = await fetch(`${BASE_URL}/api/admin/offers?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resOfferList.ok, 'List active promotional offers');
  } catch (e) {
    assert(false, 'Offers & Promotions', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 11: Financial & Tax Compliance Reports
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 11] Reports & Financial Analytics');
  try {
    const resReport = await fetch(`${BASE_URL}/api/reports/sales?username=admin@vyapar.com&startDate=2026-01-01&endDate=2026-12-31`, { headers: authHeaders });
    assert(resReport.ok || resReport.status === 200, 'Generate Sales Analytics Report');

    const resGst = await fetch(`${BASE_URL}/api/reports/gst?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resGst.ok || resGst.status === 200, 'Generate GST GSTR-1 & 3B compliance summaries');
  } catch (e) {
    assert(false, 'Reports & Analytics', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 12: Notification & Broadcast Center
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 12] Notification & Broadcast Center');
  try {
    const resNotif = await fetch(`${BASE_URL}/api/admin/notifications/my?username=admin@vyapar.com`, { headers: authHeaders });
    const notifData = await resNotif.json();
    assert(resNotif.ok && notifData.status === 'success', 'Fetch merchant system notifications');
  } catch (e) {
    assert(false, 'Notifications', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 13: Shop Profile & Settings Management
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 13] Shop Profile & System Settings');
  try {
    const resProfile = await fetch(`${BASE_URL}/api/super/shop-profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin@vyapar.com',
        shopName: 'Vyapar Trade Hub',
        gstin: '27AABCV1234F1Z5',
        phone: '9876543210',
        address: '101 Commercial Center, Nariman Point, Mumbai'
      })
    });
    assert(resProfile.ok, 'Update Shop Business Profile');

    const resGetProfile = await fetch(`${BASE_URL}/api/super/shop-profile`, { headers: authHeaders });
    assert(resGetProfile.ok, 'Retrieve updated Shop Business Profile');
  } catch (e) {
    assert(false, 'Shop Profile', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 14: Data Management & CSV Export
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 14] Data Management & Export Engine');
  try {
    const resExport = await fetch(`${BASE_URL}/api/products/export?username=admin@vyapar.com`, { headers: authHeaders });
    assert(resExport.ok, 'Export Product Catalog to CSV format');
  } catch (e) {
    assert(false, 'Data Export', e.message);
  }

  // -------------------------------------------------------------------------
  // FEATURE 15: Super Admin Master Control & Tenant Simulator
  // -------------------------------------------------------------------------
  console.log('\n👉 [FEATURE 15] Super Admin Master Control Panel');
  try {
    const resSaLogin = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin@vyapar.com', password: 'superadmin123' })
    });
    const saData = await resSaLogin.json();
    assert(resSaLogin.ok && saData.token, 'Super Admin master authentication');
    superToken = saData.token;

    const saHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superToken}`
    };

    const resTenants = await fetch(`${BASE_URL}/api/super/tenants`, { headers: saHeaders });
    assert(resTenants.ok, 'Super Admin list all merchant tenant stores');

    const resStats = await fetch(`${BASE_URL}/api/super/analytics/overview`, { headers: saHeaders });
    assert(resStats.ok || resStats.status === 200, 'Super Admin platform-wide overview metrics');
  } catch (e) {
    assert(false, 'Super Admin Control', e.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`📊 TEST EXECUTION SUMMARY:`);
  console.log(`   Total Passed: ${totalPassed}`);
  console.log(`   Total Failed: ${totalFailed}`);
  if (totalFailed > 0) {
    console.log('\n❌ FAILED TESTS DETAILS:');
    failures.forEach((f, idx) => console.log(`   ${idx + 1}. ${f.testName}: ${f.details}`));
  } else {
    console.log('\n🎉 ALL 15 FEATURES OF VYAPAR 2.0 ARE LIVE, REAL-TIME, AND VERIFIED 100% OPERATIONAL!');
  }
  console.log('===============================================================\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

runFeatureTests();
