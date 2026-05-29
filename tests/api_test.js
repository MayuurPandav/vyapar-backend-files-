const base = 'http://localhost:5000/api/admin';
const baseApi = 'http://localhost:5000/api';
async function call(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${base}${path}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    console.log(`[${method}] ${path} => ${res.status}`);
    console.log('Response:', data);
    return data;
  } catch (e) {
    console.error(`Error ${method} ${path}:`, e);
  }
}
async function callApi(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${baseApi}${path}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    console.log(`[API ${method}] ${path} => ${res.status}`);
    console.log('Response:', data);
    return data;
  } catch (e) {
    console.error(`Error ${method} ${path}:`, e);
  }
}
(async () => {
  // 1. Delivery Management
  const boy = await call('POST', '/delivery-boys', { name: 'Test Boy', phone: '1112223333' });
  const boyId = boy?.id || boy?.boy?.id;
  const delivery = await call('POST', '/deliveries', {
    customer: { name: 'John Doe', phone: '9990001111' },
    address: '123 Test St',
    items: [{ productId: '1', qty: 1 }],
    timeSlot: new Date().toISOString(),
    partner: 'in-house',
    charges: 10
  });
  const delId = delivery?.id;
  if (delId && boyId) {
    await call('POST', `/deliveries/${delId}/assign`, { deliveryBoyId: boyId });
    await call('POST', `/deliveries/${delId}/proof`, { type: 'photo', data: 'data:image/png;base64,iVBORw0KGgo=', uploadedBy: 'tester' });
    await call('POST', `/deliveries/${delId}/return`, { reason: 'Customer not home' });
  }
  // 2. Barcode & QR
  const barcode = await call('POST', '/barcodes/generate', { productId: '1', code: 'TESTBC001', type: 'CODE128' });
  await call('GET', '/barcodes');
  if (barcode?.barcode?.productId) {
    await call('GET', `/barcodes/${barcode.barcode.productId}`);
  }
  await call('GET', '/barcodes/pdf?ids=&format=qr&size=standard');
  // 3. Reports & Analytics
  await call('GET', '/reports/sales?groupBy=day');
  await call('GET', '/reports/inventory/low-stock');
  await call('GET', '/reports/delivery');
  await call('GET', '/reports/financial');
  await call('GET', '/reports/gst');
  await call('GET', '/reports/ageing');
  // party ledger (assume a party exists)
  const parties = await call('GET', '/parties');
  if (Array.isArray(parties) && parties.length) {
    await call('GET', `/reports/party-ledger?partyId=${parties[0]._id}`);
  }
  await call('GET', '/reports/purchase?groupBy=supplier');
  await call('GET', '/reports/inventory/advanced?type=out_of_stock');
  // Offers CRUD smoke
  const offer = await call('POST', '/offers', { title: 'Test 10% off', type: 'percentage', value: 10, active: true });
  const offers = await call('GET', '/offers');
  if (offer && offer.offer) {
    const id = offer.offer._id || offer.offer.id;
    await call('PUT', `/offers/${id}`, { title: 'Updated 12% off', value: 12 });
    await call('DELETE', `/offers/${id}`);
  }
  // Notification test (may be stubbed depending on env)
  await call('POST', '/notifications/send', { to: 'test@example.com', subject: 'API Test', message: 'Hello from test', via: { email: true } });

  // Data Management tests (non-destructive)
  try {
    const res = await fetch('http://localhost:5000/api/db?username=test');
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch (_) { data = txt; }
    console.log('[GET] /api/db =>', res.status);
    console.log('Response:', Array.isArray(data) ? `array(${data.length})` : (typeof data));
  } catch (e) {
    console.error('Error GET /api/db:', e);
  }

  try {
    const res2 = await fetch('http://localhost:5000/api/products/export');
    const csv = await res2.text();
    console.log('[GET] /api/products/export =>', res2.status);
    console.log('CSV length:', csv?.length);
  } catch (e) {
    console.error('Error GET /api/products/export:', e);
  }

  // Additional DB routes: create a staff, invoice, and use /list
  await callApi('POST', '/staff', { username: 'test', name: 'Test Staff' });
  await callApi('GET', '/staff');
  // Create invoice (non destructive minimal)
  await callApi('POST', '/invoices', { username: 'test', type: 'sale' });
  await callApi('GET', '/invoices');
  // List products via /list
  await callApi('GET', '/list?username=test&type=products&page=1&limit=5');

  // Super admin endpoints quick check (not mounted under /api/admin)
  try {
    const r = await fetch('http://localhost:5000/api/super/stats');
    console.log('[GET] /api/super/stats =>', r.status);
  } catch (e) {}
})();
