const Customer = require('../models/accountant/Customer');
const Ledger = require('../models/accountant/Ledger');
const Invoice = require('../models/accountant/Invoice');
const Expense = require('../models/accountant/Expense');
const JournalEntry = require('../models/accountant/JournalEntry');
const GstFiling = require('../models/accountant/GstFiling');

async function seedAccountantData() {
  console.log('=== SEEDING ACCOUNTANT TRANSACTIONAL DATA ===');
  try {
    // 1. Seed Ledgers
    let ledgers = await Ledger.find();
    if (ledgers.length === 0) {
      console.log('Seeding default Ledgers...');
      const defaultLedgers = [
        { name: 'Cash', type: 'asset', balance: 15000 },
        { name: 'Bank', type: 'asset', balance: 85000 },
        { name: 'Accounts Receivable', type: 'asset', balance: 35000 },
        { name: 'Accounts Payable', type: 'liability', balance: 20000 },
        { name: 'Sales Revenue', type: 'income', balance: 120000 },
        { name: 'Cost of Goods Sold', type: 'expense', balance: 80000 },
        { name: 'Retained Earnings', type: 'equity', balance: 5000 }
      ];
      ledgers = await Ledger.insertMany(defaultLedgers);
      console.log(`Seeded ${ledgers.length} ledgers.`);
    }

    // 2. Seed Customers
    let customers = await Customer.find();
    if (customers.length === 0) {
      console.log('Seeding default Accountant Customers...');
      const defaultCustomers = [
        { name: 'Rajiv Mehta', phone: '9822334455', openingBalance: 15000 },
        { name: 'Vikas Kumar', phone: '9123456789', openingBalance: 20000 },
        { name: 'Sania Mirza', phone: '9844005511', openingBalance: 0 }
      ];
      customers = await Customer.insertMany(defaultCustomers);
      console.log(`Seeded ${customers.length} customers.`);
    }

    // 3. Seed Invoices
    const invoiceCount = await Invoice.countDocuments();
    if (invoiceCount === 0) {
      console.log('Seeding default Accountant Invoices...');
      const rajiv = customers.find(c => c.name === 'Rajiv Mehta');
      const vikas = customers.find(c => c.name === 'Vikas Kumar');
      
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      
      const defaultInvoices = [
        {
          invoiceNumber: 'INV-1001',
          customer: rajiv ? rajiv._id : null,
          customerName: rajiv ? rajiv.name : 'Rajiv Mehta',
          amount: 15000,
          dueDate: tomorrow,
          status: 'unpaid'
        },
        {
          invoiceNumber: 'INV-1002',
          customer: vikas ? vikas._id : null,
          customerName: vikas ? vikas.name : 'Vikas Kumar',
          amount: 20000,
          dueDate: yesterday,
          status: 'overdue'
        }
      ];
      await Invoice.insertMany(defaultInvoices);
      console.log('Seeded default invoices.');
    }

    // 4. Seed Expenses
    const expenseCount = await Expense.countDocuments();
    if (expenseCount === 0) {
      console.log('Seeding default Accountant Expenses...');
      const defaultExpenses = [
        { title: 'Office Rent', amount: 12000, category: 'Rent', approved: true, description: 'Monthly rent for headquarters' },
        { title: 'Internet Bill', amount: 1500, category: 'Utilities', approved: false, description: 'High speed fiber internet' },
        { title: 'Office Stationery', amount: 800, category: 'Supplies', approved: false, description: 'Pens, notebooks and printer paper' }
      ];
      await Expense.insertMany(defaultExpenses);
      console.log('Seeded default expenses.');
    }

    // 5. Seed GST Filings
    const filingCount = await GstFiling.countDocuments();
    if (filingCount === 0) {
      console.log('Seeding default Accountant GST Filings...');
      const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
      const defaultFilings = [
        {
          period: 'Q4 FY25',
          cgst: 5000,
          sgst: 5000,
          igst: 2000,
          totalGstPaid: 12000,
          filedAt: lastMonth,
          status: 'Filed'
        }
      ];
      await GstFiling.insertMany(defaultFilings);
      console.log('Seeded default GST filings.');
    }

    // 6. Seed Journal Entries
    const journalCount = await JournalEntry.countDocuments();
    if (journalCount === 0) {
      console.log('Seeding default Accountant Journal Entries...');
      const cash = ledgers.find(l => l.name === 'Cash');
      const equity = ledgers.find(l => l.name === 'Retained Earnings');
      if (cash && equity) {
        const defaultJournals = [
          {
            narration: 'Capital introduction',
            entries: [
              { ledger: cash._id, type: 'debit', amount: 100000 },
              { ledger: equity._id, type: 'credit', amount: 100000 }
            ],
            date: new Date()
          }
        ];
        await JournalEntry.create(defaultJournals);
        console.log('Seeded default journal entries.');
      }
    }
    console.log('✅ Accountant data seeding checks completed successfully.');
  } catch (err) {
    console.error('❌ Error seeding accountant data:', err.message || err);
  }
}

module.exports = seedAccountantData;
