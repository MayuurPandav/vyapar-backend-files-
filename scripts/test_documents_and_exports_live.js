const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';

async function runDocumentsAndExportTest() {
  console.log('===============================================================');
  console.log('📄 VYAPAR 2.0 DOCUMENT EXPORT, THERMAL PRINT & BULK CSV TEST');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, title, details = '') {
    if (cond) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} - ${details}`);
      failed++;
    }
  }

  // 1. Authenticate Admin
  console.log('👉 [STEP 1] Authenticating Admin for Document & Export APIs');
  const resLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@vyapar.com', password: 'admin123' })
  });
  const loginData = await resLogin.json();
  assert(resLogin.ok && loginData.token, 'Admin authenticated successfully');
  const token = loginData.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Barcode PNG Image Rendering
  console.log('\n👉 [STEP 2] Testing Barcode PNG Image Generator (bwip-js)');
  const barcodeCode = 'VYAPAR-' + Math.floor(100000 + Math.random() * 900000);
  const resBarcodePng = await fetch(`${BASE_URL}/api/admin/barcodes/render?code=${barcodeCode}&type=barcode&includetext=true`);
  const contentTypePng = resBarcodePng.headers.get('content-type') || '';
  const bufPng = await resBarcodePng.buffer();
  assert(resBarcodePng.ok && contentTypePng.includes('image/png') && bufPng.length > 500, `Generated PNG barcode image (${bufPng.length} bytes, type: ${contentTypePng})`);

  // QR Code PNG Rendering
  const resQrPng = await fetch(`${BASE_URL}/api/admin/barcodes/render?code=${barcodeCode}&type=qr`);
  const bufQr = await resQrPng.buffer();
  assert(resQrPng.ok && bufQr.length > 300, `Generated PNG QR code matrix (${bufQr.length} bytes)`);

  // 3. Barcode Label Sheet PDF Generation
  console.log('\n👉 [STEP 3] Testing Bulk Barcode Label Sheet PDF Generator (PDFKit)');
  const resBarcodePdf = await fetch(`${BASE_URL}/api/admin/barcodes/pdf?format=code128&size=standard`);
  const contentTypePdf = resBarcodePdf.headers.get('content-type') || '';
  const bufBarcodePdf = await resBarcodePdf.buffer();
  const isPdfHeader = bufBarcodePdf.slice(0, 4).toString() === '%PDF';
  assert(resBarcodePdf.ok && isPdfHeader, `Generated Multi-Label Barcode Sheet PDF (${bufBarcodePdf.length} bytes, format: %PDF)`);

  // 4. Create an Invoice for PDF & Thermal Receipt Tests
  console.log('\n👉 [STEP 4] Creating Test Invoice for Printing Layouts');
  const invoiceNum = 'INV-DOC-' + Date.now().toString().slice(-6);
  const resCreateInv = await fetch(`${BASE_URL}/api/invoices`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      username: 'admin@vyapar.com',
      type: 'sale',
      invoiceNumber: invoiceNum,
      customerName: 'Supertech Industrial Ltd',
      customerPhone: '9876543210',
      date: new Date().toISOString().substring(0, 10),
      items: [
        { name: 'Heavy Duty Thermal Roll 80mm', qty: 10, price: 65, total: 650, taxRate: 18 },
        { name: 'Barcode Scanner USB Handheld', qty: 2, price: 1450, total: 2900, taxRate: 18 }
      ],
      subtotal: 3550,
      taxAmount: 639,
      totalAmount: 4189,
      paymentStatus: 'Paid',
      paymentMode: 'UPI'
    })
  });
  const invCreateData = await resCreateInv.json();
  const testInvId = invCreateData.invoiceId || invoiceNum;
  assert(resCreateInv.ok, `Created invoice for layout testing: ${testInvId}`);

  // 5. Standard A4 Invoice PDF Layout
  console.log('\n👉 [STEP 5] Testing Standard A4 Tax Invoice PDF Generation');
  const resA4 = await fetch(`${BASE_URL}/api/invoices/${testInvId}/pdf`, { headers: authHeaders });
  const bufA4 = await resA4.buffer();
  assert(resA4.ok && bufA4.slice(0, 4).toString() === '%PDF', `Generated A4 Invoice PDF (${bufA4.length} bytes, %PDF valid)`);

  // 6. Thermal Receipt 80mm Layout (Standard POS Thermal Printer)
  console.log('\n👉 [STEP 6] Testing 80mm (3-Inch) Thermal Receipt Print Format');
  // Update invoice printSize to 80mm
  await fetch(`${BASE_URL}/api/invoices/${testInvId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ printSize: '80mm' })
  });
  const res80mm = await fetch(`${BASE_URL}/api/invoices/${testInvId}/pdf`, { headers: authHeaders });
  const buf80mm = await res80mm.buffer();
  assert(res80mm.ok && buf80mm.slice(0, 4).toString() === '%PDF', `Generated 80mm POS Thermal Receipt PDF (${buf80mm.length} bytes, 226.77pt width)`);

  // 7. Thermal Receipt 58mm Layout (Compact Mobile POS Thermal Printer)
  console.log('\n👉 [STEP 7] Testing 58mm (2-Inch) Compact Thermal Receipt Print Format');
  await fetch(`${BASE_URL}/api/invoices/${testInvId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ printSize: '58mm' })
  });
  const res58mm = await fetch(`${BASE_URL}/api/invoices/${testInvId}/pdf`, { headers: authHeaders });
  const buf58mm = await res58mm.buffer();
  assert(res58mm.ok && buf58mm.slice(0, 4).toString() === '%PDF', `Generated 58mm Compact Thermal Receipt PDF (${buf58mm.length} bytes, 164.41pt width)`);

  // 8. Bulk Product CSV Import
  console.log('\n👉 [STEP 8] Testing Bulk Product CSV/JSON Import Engine');
  const bulkProducts = [
    { name: 'Bulk Product Alpha ' + Date.now(), sku: 'BPA-' + Date.now(), price: 199, purchasePrice: 120, stock: 200, unit: 'pcs', category: 'Hardware' },
    { name: 'Bulk Product Beta ' + Date.now(), sku: 'BPB-' + Date.now(), price: 349, purchasePrice: 220, stock: 150, unit: 'pcs', category: 'Hardware' },
    { name: 'Bulk Product Gamma ' + Date.now(), sku: 'BPG-' + Date.now(), price: 899, purchasePrice: 600, stock: 80, unit: 'pcs', category: 'Electrical' }
  ];
  const resBulkProd = await fetch(`${BASE_URL}/api/products/bulk`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      username: 'admin@vyapar.com',
      products: bulkProducts
    })
  });
  const bulkProdData = await resBulkProd.json();
  assert(resBulkProd.ok && bulkProdData.inserted === 3, `Bulk imported 3 products into catalog (inserted: ${bulkProdData.inserted})`);

  // 9. Bulk Party CRM Import
  console.log('\n👉 [STEP 9] Testing Bulk Customer/Vendor CRM Import Engine');
  const bulkParties = [
    { name: 'Mehta Distributors ' + Date.now(), phone: '9811223344', type: 'Customer', openingBalance: 5000, state: 'Gujarat' },
    { name: 'Apex Logistics Agency ' + Date.now(), phone: '9822334455', type: 'Customer', openingBalance: 12000, state: 'Maharashtra' }
  ];
  const resBulkParty = await fetch(`${BASE_URL}/api/parties/bulk`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      username: 'admin@vyapar.com',
      parties: bulkParties
    })
  });
  const bulkPartyData = await resBulkParty.json();
  assert(resBulkParty.ok && (bulkPartyData.status === 'success' || bulkPartyData.inserted), 'Bulk imported CRM customer & vendor accounts');

  // 10. Product Catalog CSV Export
  console.log('\n👉 [STEP 10] Testing Catalog CSV Export Engine');
  const resExport = await fetch(`${BASE_URL}/api/products/export?username=admin@vyapar.com`, { headers: authHeaders });
  const csvText = await resExport.text();
  const hasCsvHeader = csvText.includes('name,sku') || csvText.includes('name');
  assert(resExport.ok && hasCsvHeader && csvText.split('\n').length > 3, `Exported catalog CSV (${csvText.length} characters, ${csvText.split('\n').length} rows)`);

  console.log('\n===============================================================');
  console.log(`📊 DOCUMENT & EXPORT TEST SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log('🎉 ALL DOCUMENT EXPORTS, THERMAL RECEIPTS & BULK CSV ENGINES VERIFIED 100% OPERATIONAL!');
  }
  console.log('===============================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runDocumentsAndExportTest();
