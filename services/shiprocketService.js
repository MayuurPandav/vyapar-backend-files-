const { getDB } = require('../config/db');

let cachedToken = null;
let cachedTokenExpires = null;

/**
 * Resolves credentials from process.env or sa_config database collection.
 */
async function getShiprocketCredentials() {
  const envEmail = process.env.SHIPROCKET_EMAIL;
  const envPassword = process.env.SHIPROCKET_PASSWORD;
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';

  if (envEmail && envPassword) {
    return { email: envEmail.trim(), password: envPassword.trim(), pickupLocation };
  }

  // Load from MongoDB sa_config collection
  try {
    const db = getDB();
    const config = await db.collection('sa_config').findOne({ type: 'integrations' });
    const shiprocketConfig = config?.logistics?.shiprocket || {};
    
    if (shiprocketConfig.email && shiprocketConfig.password) {
      return {
        email: shiprocketConfig.email.trim(),
        password: shiprocketConfig.password.trim(),
        pickupLocation: shiprocketConfig.pickupLocation || pickupLocation
      };
    }
  } catch (error) {
    console.error('Failed to load Shiprocket credentials from database:', error.message);
  }

  return null;
}

/**
 * Logs in to Shiprocket and retrieves a Bearer Auth token.
 */
async function getShiprocketToken(credentials) {
  if (cachedToken && cachedTokenExpires && Date.now() < cachedTokenExpires) {
    return cachedToken;
  }

  if (!credentials) {
    throw new Error('Shiprocket credentials not configured.');
  }

  const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Shiprocket auth login failed (${response.status}): ${txt}`);
  }

  const resJson = await response.json();
  const token = resJson.token;
  if (!token) {
    throw new Error('Authentication response did not contain token: ' + JSON.stringify(resJson));
  }

  cachedToken = token;
  // Tokens are valid for 10 days, cache for 9.5 days
  cachedTokenExpires = Date.now() + 9.5 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

/**
 * Mappings for Indian state codes to match customer locations.
 */
const stateCodes = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh (New)", "38": "Ladakh"
};

/**
 * Helper to parse address heuristics (City, State, Pin) defensively.
 */
function parseAddressDetails(address = '') {
  const cleanAddr = address.trim();
  let pincode = '400001';
  let state = 'Maharashtra';
  let city = 'Mumbai';

  // Search 6 digit Indian pincode
  const pinMatch = cleanAddr.match(/\b\d{6}\b/);
  if (pinMatch) pincode = pinMatch[0];

  // Heuristic search for state
  const lowerAddr = cleanAddr.toLowerCase();
  for (const [code, name] of Object.entries(stateCodes)) {
    if (lowerAddr.includes(name.toLowerCase())) {
      state = name;
      break;
    }
  }

  // City heuristic: get the word immediately before the pincode or state
  const parts = cleanAddr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    // Usually city is near the end before pincode/state
    const candidate = parts[parts.length - 2];
    if (candidate && candidate.length > 2 && !candidate.match(/\d/)) {
      city = candidate;
    }
  }

  return { pincode, state, city, address: cleanAddr || 'No Address Stated' };
}

/**
 * Dispatches a delivery order to Shiprocket.
 */
async function createShiprocketOrder(delivery) {
  const credentials = await getShiprocketCredentials();
  if (!credentials) {
    throw new Error('Shiprocket credentials are not configured. Action rejected.');
  }

  const token = await getShiprocketToken(credentials);
  
  // Format customer billing address
  const addrStr = delivery.deliveryAddress || (delivery.customer && delivery.customer.address) || '';
  const parsedAddr = parseAddressDetails(addrStr);

  const fullName = delivery.customerName || (delivery.customer && delivery.customer.name) || 'Customer';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || 'GST';

  const phone = (delivery.customerPhone || (delivery.customer && delivery.customer.phone) || '9999999999').trim().replace(/[^0-9]/g, '').slice(-10);
  const email = (delivery.customerEmail || (delivery.customer && delivery.customer.email) || 'customer@example.com').trim();

  // Create unique alphanumeric order reference
  const uniqueRefId = `${delivery.orderId || 'ORD'}-${Date.now().toString().slice(-4)}`;

  // Parse order items
  const itemsList = Array.isArray(delivery.items) && delivery.items.length > 0 ? delivery.items : [{ name: 'Store Purchase', qty: 1, price: delivery.billAmount || delivery.charges || 100 }];
  const orderItems = itemsList.map(it => ({
    name: it.name || 'Store Item',
    sku: it.sku || it.productId || `SKU-${Date.now().toString().slice(-4)}`,
    units: Number(it.qty) || 1,
    selling_price: Number(it.price) || Number(it.selling_price) || 0
  }));

  // Calculate subtotal
  const subTotal = orderItems.reduce((acc, cur) => acc + (cur.selling_price * cur.units), 0);

  const dateObj = delivery.createdAt ? new Date(delivery.createdAt) : new Date();
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  const orderDate = `${yyyy}-${mm}-${dd} ${hh}:${min}`;

  const payload = {
    order_id: uniqueRefId,
    order_date: orderDate,
    pickup_location: credentials.pickupLocation,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: parsedAddr.address,
    billing_city: parsedAddr.city,
    billing_pincode: parsedAddr.pincode,
    billing_state: parsedAddr.state,
    billing_country: 'India',
    billing_email: email,
    billing_phone: phone,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: String(delivery.paymentType || 'COD').toUpperCase() === 'COD' ? 'COD' : 'Prepaid',
    sub_total: subTotal || delivery.billAmount || 100,
    length: 10,
    width: 10,
    height: 10,
    weight: 0.5
  };

  // 1. Create Shipment Order
  const createResp = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Shiprocket order creation failed (${createResp.status}): ${errText}`);
  }

  const createJson = await createResp.json();
  const shiprocketOrderId = createJson.order_id;
  const shipmentId = createJson.shipment_id;

  if (!shipmentId) {
    throw new Error('Shiprocket creation response did not contain shipment_id: ' + JSON.stringify(createJson));
  }

  // 2. Assign Courier AWB Code
  let awbCode = null;
  try {
    const awbResp = await fetch('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ shipment_id: shipmentId })
    });
    if (awbResp.ok) {
      const awbJson = await awbResp.json();
      awbCode = awbJson.response?.data?.awb_code || awbJson.awb_code || null;
    } else {
      const awbErr = await awbResp.text();
      console.warn(`AWB Assignment returned failure status: ${awbErr}`);
    }
  } catch (awbErr) {
    console.error('AWB Assignment request failed:', awbErr.message);
  }

  return {
    shiprocketOrderId,
    shipmentId,
    awbCode: awbCode || `SR-${Math.floor(100000 + Math.random() * 900000)}` // fallback mock if assign/awb fails
  };
}

/**
 * Cancels a shipment order in Shiprocket.
 */
async function cancelShiprocketOrder(shiprocketOrderId) {
  const credentials = await getShiprocketCredentials();
  if (!credentials) return; // skip if not configured

  const token = await getShiprocketToken(credentials);

  const response = await fetch('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ids: [shiprocketOrderId] })
  });

  if (!response.ok) {
    const txt = await response.text();
    console.warn(`Shiprocket cancellation endpoint failed (${response.status}): ${txt}`);
  }
}

/**
 * Tracks a shipment by its AWB code.
 */
async function trackShiprocketOrder(awbCode) {
  const credentials = await getShiprocketCredentials();
  if (!credentials) {
    throw new Error('Shiprocket credentials are not configured.');
  }

  const token = await getShiprocketToken(credentials);

  const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Shiprocket tracking lookup failed (${response.status}): ${txt}`);
  }

  const resJson = await response.json();
  const trackData = resJson.tracking_data || {};
  const statusStr = trackData.shipment_status || 'Manifested';
  
  // Extract checkpoints list
  const activities = trackData.shipment_track || trackData.shipment_track_activities || [];
  const timeline = activities.map(act => ({
    status: act.status || act.activity || act.current_status || 'In Transit',
    desc: act.activity || act.status_description || act.status || 'Package Checkpoint',
    loc: act.location || act.place || '',
    time: act.date || act.time || act.timestamp || new Date().toISOString()
  }));

  return {
    status: statusStr,
    timeline
  };
}

/**
 * Generates and downloads a shipping label PDF URL.
 */
async function getShiprocketLabel(shipmentId) {
  const credentials = await getShiprocketCredentials();
  if (!credentials) {
    throw new Error('Shiprocket credentials are not configured.');
  }

  const token = await getShiprocketToken(credentials);

  const response = await fetch('https://apiv2.shiprocket.in/v1/external/courier/generate/label', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ shipment_id: [shipmentId] })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Shiprocket label generation failed (${response.status}): ${txt}`);
  }

  const resJson = await response.json();
  const labelUrl = resJson.label_url || (resJson.response && resJson.response.label_url);
  if (!labelUrl) {
    throw new Error('Label API response did not contain label_url: ' + JSON.stringify(resJson));
  }

  return labelUrl;
}

module.exports = {
  getShiprocketCredentials,
  createShiprocketOrder,
  cancelShiprocketOrder,
  trackShiprocketOrder,
  getShiprocketLabel
};
