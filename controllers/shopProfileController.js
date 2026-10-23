const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// Get the central Shop Profile
const getShopProfile = async (req, res) => {
  try {
    const db = getDB();
    const profile = await db.collection('sa_shop_profile').findOne({ isCentral: true }) || {};
    res.json(profile);
  } catch (err) {
    console.error('Error fetching shop profile:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch shop profile' });
  }
};

// Create or Update Shop Profile
const upsertShopProfile = async (req, res) => {
  try {
    const db = getDB();
    const { 
      shopName, ownerName, shopType, gstin, pan, fssai, regNumber, 
      email, phone, whatsapp, 
      addressLine1, addressLine2, city, state, pincode, country
    } = req.body;

    const payload = {
      isCentral: true,
      shopName, ownerName, shopType, gstin, pan, fssai, regNumber,
      email, phone, whatsapp,
      addressLine1, addressLine2, city, state, pincode, country,
      updatedAt: new Date()
    };

    const existing = await db.collection('sa_shop_profile').findOne({ isCentral: true });
    if (!existing) {
      payload.createdAt = new Date();
      payload.registrationDate = new Date();
      payload.accountStatus = 'Active';
    }

    await db.collection('sa_shop_profile').updateOne(
      { isCentral: true },
      { $set: payload },
      { upsert: true }
    );

    res.json({ status: 'success', message: 'Shop profile saved successfully' });
  } catch (err) {
    console.error('Error saving shop profile:', err);
    res.status(500).json({ status: 'error', message: 'Failed to save shop profile' });
  }
};

// Upload Shop Logo
const uploadShopLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }
    const db = getDB();
    const logoUrl = `/uploads/${req.file.filename}`;
    
    await db.collection('sa_shop_profile').updateOne(
      { isCentral: true },
      { $set: { logoUrl, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ status: 'success', logoUrl, message: 'Logo uploaded successfully' });
  } catch (err) {
    console.error('Error uploading logo:', err);
    res.status(500).json({ status: 'error', message: 'Failed to upload logo' });
  }
};

// Branches Management
const getBranches = async (req, res) => {
  try {
    const db = getDB();
    const branches = await db.collection('sa_shop_branches').find({}).toArray();
    res.json(branches);
  } catch (err) {
    console.error('Error fetching branches:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch branches' });
  }
};

const addBranch = async (req, res) => {
  try {
    const db = getDB();
    const { name, contact, address, manager, status } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ status: 'error', message: 'Branch name and contact are required' });
    }

    const newBranch = {
      name, contact, address, manager, status: status || 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('sa_shop_branches').insertOne(newBranch);
    res.json({ status: 'success', message: 'Branch added successfully' });
  } catch (err) {
    console.error('Error adding branch:', err);
    res.status(500).json({ status: 'error', message: 'Failed to add branch' });
  }
};

const editBranch = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { name, contact, address, manager, status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid branch ID' });
    }

    await db.collection('sa_shop_branches').updateOne(
      { _id: new ObjectId(id) },
      { $set: { name, contact, address, manager, status, updatedAt: new Date() } }
    );

    res.json({ status: 'success', message: 'Branch updated successfully' });
  } catch (err) {
    console.error('Error updating branch:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update branch' });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid branch ID' });
    }

    await db.collection('sa_shop_branches').deleteOne({ _id: new ObjectId(id) });
    res.json({ status: 'success', message: 'Branch deleted successfully' });
  } catch (err) {
    console.error('Error deleting branch:', err);
    res.status(500).json({ status: 'error', message: 'Failed to delete branch' });
  }
};

// Business Settings Update
const updateBusinessSettings = async (req, res) => {
  try {
    const db = getDB();
    const { financialYearStart, financialYearEnd, openingTime, closingTime, weeklyHoliday, language, currency } = req.body;

    const payload = {
      financialYearStart,
      financialYearEnd,
      workingHours: { openingTime, closingTime },
      weeklyHoliday,
      languagePreference: language,
      currencyPreference: currency,
      updatedAt: new Date()
    };

    await db.collection('sa_shop_profile').updateOne(
      { isCentral: true },
      { $set: payload },
      { upsert: true }
    );

    res.json({ status: 'success', message: 'Business settings updated successfully' });
  } catch (err) {
    console.error('Error updating business settings:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update business settings' });
  }
};

// Social Media Links Update
const updateSocialMedia = async (req, res) => {
  try {
    const db = getDB();
    const { facebook, instagram, twitter, linkedin, website } = req.body;

    await db.collection('sa_shop_profile').updateOne(
      { isCentral: true },
      { $set: { socialMedia: { facebook, instagram, twitter, linkedin, website }, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ status: 'success', message: 'Social media updated successfully' });
  } catch (err) {
    console.error('Error updating social media:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update social media' });
  }
};

// Analytics Overview
const getAnalytics = async (req, res) => {
  try {
    const db = getDB();
    // In a real scenario, this would aggregate from multiple collections.
    // Here we'll query relevant collections.
    const totalBranches = await db.collection('sa_shop_branches').countDocuments();
    const totalCustomers = await db.collection('parties').countDocuments({ type: /customer/i });
    
    // Total Employees: Count of users other than super_admin
    const totalEmployees = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' } });

    // Assuming we have sales/invoices
    const invoicesData = await db.collection('sales').aggregate([
      { $group: { _id: null, totalInvoices: { $sum: 1 }, totalRevenue: { $sum: { $toDouble: "$amount" } } } }
    ]).toArray();

    const revenue = invoicesData.length > 0 ? invoicesData[0].totalRevenue : 0;
    const invoices = invoicesData.length > 0 ? invoicesData[0].totalInvoices : 0;

    res.json({
      revenue,
      invoices,
      branches: totalBranches,
      employees: totalEmployees,
      customers: totalCustomers
    });

  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch analytics' });
  }
};

const getAnalyticsInvoices = async (req, res) => {
  try {
    const db = getDB();
    const invoices = await db.collection('sales').find({}).sort({ date: -1 }).toArray();
    res.json(invoices);
  } catch (err) {
    console.error('Error fetching analytics invoices:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch invoices' });
  }
};

const getAnalyticsEmployees = async (req, res) => {
  try {
    const db = getDB();
    const employees = await db.collection('users').find({ role: { $ne: 'super_admin' } }, { projection: { password: 0 } }).toArray();
    res.json(employees);
  } catch (err) {
    console.error('Error fetching analytics employees:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch employees' });
  }
};

// Thermal Receipt Settings (Zero Duplicates - Upserts to existing document)
const getReceiptSettings = async (req, res) => {
  try {
    const db = getDB();
    const username = req.user?.username || 'admin@vyapar.com';
    const profile = await db.collection('sa_shop_profile').findOne({ isCentral: true }) || {};
    const settings = await db.collection('settings').findOne({ username }) || {};

    const receiptSettings = settings.receiptSettings || profile.receiptSettings || {
      headerTagline: 'Thank you for shopping with us!',
      footerTerms: 'Goods once sold will not be taken back without original bill.',
      showLogo: true,
      paperSize: '3inch',
      autoPrint: true,
      showGstin: true
    };

    res.json({ status: 'success', receiptSettings });
  } catch (err) {
    console.error('Error fetching receipt settings:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch receipt settings' });
  }
};

const updateReceiptSettings = async (req, res) => {
  try {
    const db = getDB();
    const username = req.user?.username || 'admin@vyapar.com';
    const { headerTagline, footerTerms, showLogo, paperSize, autoPrint, showGstin } = req.body;

    const receiptSettings = {
      headerTagline: headerTagline !== undefined ? headerTagline : 'Thank you for shopping with us!',
      footerTerms: footerTerms !== undefined ? footerTerms : 'Goods once sold will not be taken back without original bill.',
      showLogo: Boolean(showLogo),
      paperSize: paperSize === '2inch' ? '2inch' : '3inch',
      autoPrint: Boolean(autoPrint),
      showGstin: Boolean(showGstin),
      updatedAt: new Date()
    };

    await db.collection('settings').updateOne(
      { username },
      { $set: { receiptSettings } },
      { upsert: true }
    );

    await db.collection('sa_shop_profile').updateOne(
      { isCentral: true },
      { $set: { receiptSettings } }
    );

    res.json({ status: 'success', receiptSettings, message: 'Thermal receipt settings saved successfully' });
  } catch (err) {
    console.error('Error updating receipt settings:', err);
    res.status(500).json({ status: 'error', message: 'Failed to save receipt settings' });
  }
};

module.exports = {
  getShopProfile,
  upsertShopProfile,
  uploadShopLogo,
  getBranches,
  addBranch,
  editBranch,
  deleteBranch,
  updateBusinessSettings,
  updateSocialMedia,
  getAnalytics,
  getAnalyticsInvoices,
  getAnalyticsEmployees,
  getReceiptSettings,
  updateReceiptSettings
};
