const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';

async function runGpsTrackingTest() {
  console.log('===============================================================');
  console.log('🛰️ VYAPAR 2.0 LIVE DRIVER GPS ➔ CUSTOMER TRACKING MAP SYNC TEST');
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

  // 0. Authenticate Admin to create delivery parcel
  const resAdminLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@vyapar.com', password: 'admin123' })
  });
  const adminData = await resAdminLogin.json();
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminData.token}`
  };

  // 1. Authenticate Driver DP-1001
  console.log('👉 [STEP 1] Authenticating Driver DP-1001');
  const resLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'DP-1001', password: 'pass123' })
  });
  const loginData = await resLogin.json();
  assert(resLogin.ok && loginData.token, 'Driver authenticated and received JWT token');
  const driverToken = loginData.token;

  const driverHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${driverToken}`
  };

  // 2. Create an Active Delivery Order assigned to DP-1001
  console.log('\n👉 [STEP 2] Creating Live Delivery Order assigned to Driver');
  const testOrderId = 'ORD-TRACK-' + Date.now().toString().slice(-6);
  const resDeliv = await fetch(`${BASE_URL}/api/admin/deliveries`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      username: 'admin@vyapar.com',
      orderId: testOrderId,
      customerName: 'Priya Sharma',
      customerPhone: '9820011223',
      deliveryAddress: 'Flat 604, Royal Palms, Koramangala, Bengaluru',
      status: 'Out for delivery',
      assignedDriver: 'DP-1001',
      assignedTo: 'DP-1001',
      charges: 40,
      billAmount: 850,
      paymentType: 'COD'
    })
  });
  const delivData = await resDeliv.json();
  assert(resDeliv.ok && (delivData.status === 'success' || delivData.delivery), 'Created live delivery order: ' + testOrderId, delivData.message || '');

  // 3. Verify Customer Tracking Portal Endpoint initially
  console.log('\n👉 [STEP 3] Fetching Customer Live Tracking Radar');
  const resTrack1 = await fetch(`${BASE_URL}/api/track/order/${testOrderId}`);
  const trackData1 = await resTrack1.json();
  assert(resTrack1.ok, 'Tracking portal endpoint responded with 200 OK');
  assert(trackData1.orderId === testOrderId, 'Order ID matches tracking link');
  assert(trackData1.status === 'Out for delivery', 'Order status is "Out for delivery"');
  assert(trackData1.locations && trackData1.locations.driver, 'Driver location coordinates present');
  console.log(`     📍 Initial Distance: ${trackData1.distanceKm} km | Estimated ETA: ${trackData1.etaMinutes} mins`);

  // 4. Driver Streams GPS Update 1 (En route)
  console.log('\n👉 [STEP 4] Driver Streams Live GPS Telematics (Point A -> Point B)');
  const resGps1 = await fetch(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: driverHeaders,
    body: JSON.stringify({
      lat: 12.9534,
      lng: 77.6095,
      speed: 38,
      heading: 135,
      accuracy: 4,
      orderId: testOrderId
    })
  });
  const gpsData1 = await resGps1.json();
  assert(resGps1.ok && gpsData1.status === 'success', 'Driver GPS telematics successfully streamed to server');

  // 5. Verify Customer Portal Updates Location and Recalculates Dynamic ETA
  console.log('\n👉 [STEP 5] Verifying Real-Time Customer Radar Update');
  const resTrack2 = await fetch(`${BASE_URL}/api/track/order/${testOrderId}`);
  const trackData2 = await resTrack2.json();
  assert(trackData2.locations.driver.lat === 12.9534, 'Customer portal received driver updated latitude (12.9534)');
  assert(trackData2.locations.driver.lng === 77.6095, 'Customer portal received driver updated longitude (77.6095)');
  console.log(`     📍 Updated Distance: ${trackData2.distanceKm} km | Dynamic ETA: ${trackData2.etaMinutes} mins`);

  // 6. Driver Moves Closer to Customer (Point B -> Point C)
  console.log('\n👉 [STEP 6] Driver Approaches Customer Destination');
  const resGps2 = await fetch(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: driverHeaders,
    body: JSON.stringify({
      lat: 12.9370,
      lng: 77.6230,
      speed: 15,
      heading: 160,
      accuracy: 3,
      orderId: testOrderId
    })
  });
  assert(resGps2.ok, 'Driver near-destination coordinates updated');

  const resTrack3 = await fetch(`${BASE_URL}/api/track/order/${testOrderId}`);
  const trackData3 = await resTrack3.json();
  assert(trackData3.distanceKm < trackData2.distanceKm, `Distance decreased as driver approached: ${trackData3.distanceKm} km < ${trackData2.distanceKm} km`);
  console.log(`     📍 Near-Destination Distance: ${trackData3.distanceKm} km | Dynamic ETA: ${trackData3.etaMinutes} mins`);

  // 7. Complete Delivery
  console.log('\n👉 [STEP 7] Driver Completes Delivery with Confirmation');
  const targetDelivId = delivData.id || delivData.delivery?._id;
  const resDeliver = await fetch(`${BASE_URL}/api/deliveries/${targetDelivId}/status`, {
    method: 'PATCH',
    headers: driverHeaders,
    body: JSON.stringify({ status: 'Delivered', paymentCollected: true })
  });
  const deliverMsg = await resDeliver.json();
  assert(resDeliver.ok, 'Driver marked parcel as "Delivered"', deliverMsg.message || '');

  const resTrackFinal = await fetch(`${BASE_URL}/api/track/order/${testOrderId}`);
  const trackDataFinal = await resTrackFinal.json();
  assert(trackDataFinal.status === 'Delivered', 'Customer portal confirms delivery status is "Delivered"');
  assert(trackDataFinal.etaMinutes === 0, 'ETA set to 0 upon final delivery arrival');

  console.log('\n===============================================================');
  console.log(`📊 GPS TRACKING SYNC SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log('🎉 REAL-TIME DRIVER GPS ➔ CUSTOMER TRACKING MAP SYNC VERIFIED 100% OPERATIONAL!');
    console.log(`🔗 Live Portal URL: http://localhost:5173/track/${testOrderId}`);
  }
  console.log('===============================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runGpsTrackingTest();
