const { getDB } = require('../config/db');
const { logAudit } = require('./authController');

// All master data categories with their defaults
const MASTER_DEFAULTS = {
  product_categories: ['Electronics', 'Groceries', 'Clothing', 'Hardware', 'Services', 'Food & Beverages', 'Stationery', 'Pharmaceuticals'],
  product_subcategories: ['Mobile Phones', 'Laptops', 'Accessories', 'Dairy', 'Snacks', 'Men', 'Women', 'Kids'],
  brand_list: ['Samsung', 'Apple', 'Sony', 'LG', 'Philips', 'Havells', 'HP', 'Dell'],
  uom_list: ['pcs', 'kg', 'gm', 'litre', 'ml', 'metre', 'cm', 'box', 'pack', 'dozen', 'pair', 'set'],
  hsn_sac_codes: ['0101 - Live horses', '0201 - Meat of bovine', '0401 - Milk and cream', '1006 - Rice', '3004 - Medicaments', '8471 - Computers', '9983 - Professional services', '9954 - Construction services'],
  gst_rate_slabs: ['0%', '5%', '12%', '18%', '28%'],
  barcode_formats: ['EAN-13', 'EAN-8', 'UPC-A', 'Code 128', 'Code 39', 'QR Code'],
  invoice_number_formats: ['INV-{YYYY}-{SEQ}', 'BILL-{MMYY}-{SEQ}', 'GST/{YYYY}/{SEQ}', '{PREFIX}/{SEQ}', '{YYYY}{MM}{DD}-{SEQ}'],
  invoice_template_styles: ['Classic', 'Modern', 'Minimal', 'Professional', 'Retail', 'GST Compliant'],
  payment_terms: ['Immediate', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'Due on Receipt', 'Custom'],
  bank_account_template: 'Bank Name: ______\nAccount No: ______\nIFSC: ______\nBranch: ______\nUPI: ______',
  invoice_footer_text: 'Thank you for your business!\nGoods once sold are not returnable.\nSubject to local jurisdiction.',
  discount_types: ['Percentage (%)', 'Flat Amount (₹)', 'Buy X Get Y', 'Bundle Discount', 'Seasonal Offer', 'Loyalty Discount'],
  additional_charges: ['Shipping', 'Packing', 'Handling', 'Insurance', 'Installation', 'Delivery', 'Service Charge', 'Convenience Fee'],
  // GST & Tax Master
  gst_rate_master: ['0%', '5%', '12%', '18%', '28%'],
  hsn_code_master_list: ['0101', '0201', '0401', '1006', '3004', '8471', '9983', '9954'],
  sac_code_master_list: ['9954', '9983', '9984', '9985'],
  state_code_master_list: ['01-Jammu & Kashmir', '02-Himachal Pradesh', '03-Punjab', '07-Delhi', '27-Maharashtra', '29-Karnataka', '33-Tamil Nadu'],
  eway_bill_config: ['Active', 'Inactive', 'Required for > 50,000'],
  composition_scheme_config: ['Not Registered', 'Registered (1%)', 'Registered (5%)'],
  // Party Master
  customer_category_list: ['Retail', 'Wholesale', 'VIP', 'Distributor', 'Corporate'],
  supplier_category_list: ['Local', 'Interstate', 'Import', 'Manufacturer', 'Wholesaler'],
  payment_mode_master_list: ['Cash', 'UPI', 'Card', 'Cheque', 'Credit', 'Bank Transfer'],
  credit_limit_policy_templates: ['No Credit', 'Max 10,000', 'Max 50,000', 'Max 1,00,000', 'Custom'],
  party_payment_terms_templates: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Immediate'],
  // Expense Master
  global_expense_category_list: ['Rent', 'Electricity', 'Staff Salary', 'Transport', 'Marketing', 'Maintenance', 'Office Supplies', 'Other'],
  default_expense_templates: ['Monthly Rent', 'Electricity Bill', 'Internet Bill', 'Office Snacks', 'Travel Allowance'],
  // Delivery Master
  delivery_status_list: ['Pending', 'Assigned', 'Out for Delivery', 'Delivered', 'Failed', 'Cancelled'],
  failed_delivery_reason_list: ['Customer Not Available', 'Address Not Found', 'Customer Refused', 'Payment Pending', 'Vehicle Breakdown', 'Other'],
  delivery_charge_templates: ['Free Delivery', 'Flat ₹50', 'Flat ₹100', 'Distance Based', 'Weight Based'],
  delivery_time_slot_templates: ['9 AM - 12 PM', '12 PM - 3 PM', '3 PM - 6 PM', '6 PM - 9 PM', 'Anytime'],
  // Offers Master
  offer_type_templates: ['Flat Discount', 'Percentage Discount', 'BOGO', 'Free Shipping', 'Cashback'],
  coupon_code_format_config: ['WELCOME{XX}', 'FESTIVE{YYYY}', 'FLAT{AMOUNT}', '{BRAND}SALE', 'CUSTOM']
};

// Seed defaults if not present
async function seedDefaults() {
  const db = getDB();
  for (const [key, value] of Object.entries(MASTER_DEFAULTS)) {
    await db.collection('sa_master_data').updateOne(
      { category_key: key },
      { $setOnInsert: { category_key: key, values: value, updated_at: new Date() } },
      { upsert: true }
    );
  }
}

// GET all master data
async function getMasterData(req, res) {
  try {
    const db = getDB();
    await seedDefaults();
    const docs = await db.collection('sa_master_data').find({}).toArray();
    const result = {};
    docs.forEach(d => { result[d.category_key] = d.values; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// POST update a specific category
async function updateMasterData(req, res) {
  const { category } = req.params;
  const { values } = req.body;

  if (!category) return res.status(400).json({ status: 'error', message: 'Category is required' });
  if (values === undefined) return res.status(400).json({ status: 'error', message: 'Values are required' });

  try {
    const db = getDB();
    await db.collection('sa_master_data').updateOne(
      { category_key: category },
      { $set: { values, updated_at: new Date() } },
      { upsert: true }
    );

    await logAudit(req.user?.username || 'SYSTEM', 'MASTER_DATA_UPDATE', `Updated master data: ${category}`);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getMasterData, updateMasterData };
