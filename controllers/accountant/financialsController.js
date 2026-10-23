const { getDB } = require('../../config/db');
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const PDFDocument = require('pdfkit');

// 1. Calculate GSTR-1 Details
async function getGSTR1(req, res) {
  const { month } = req.query;
  const username = req.user?.username || req.query.username;
  if (!username) return res.status(400).json({ success: false, message: 'Username required' });

  try {
    const db = getDB();
    const query = { username };
    
    if (month) {
      query.date = { $regex: `^${month}` };
    }

    const sales = await db.collection('sales').find(query).toArray();
    const parties = await db.collection('parties').find({ username }).toArray();
    const settings = await db.collection('settings').findOne({ username }) || {};
    const shopState = settings.state || 'Maharashtra';

    const b2b = [];
    const b2c = [];
    const summaryBySlab = {};

    sales.forEach(sale => {
      const customerName = sale.customer || 'Walk-in Customer';
      const matchedParty = parties.find(p => p.name.toLowerCase() === customerName.toLowerCase());
      const gstin = sale.customerGstin || matchedParty?.gstin || '';
      
      const isB2B = gstin && gstin.trim().length >= 15;
      const partyState = matchedParty?.state || shopState;
      const isInterState = partyState.toLowerCase() !== shopState.toLowerCase();

      const items = Array.isArray(sale.items) ? sale.items : [];
      let saleTaxable = 0;
      let saleCGST = 0;
      let saleSGST = 0;
      let saleIGST = 0;

      items.forEach(item => {
        const rateStr = item.taxSlab || '18%';
        const rateNum = parseFloat(rateStr.replace('%', '')) || 0;
        const total = parseFloat(item.total || item.amount) || 0;
        const isTaxInclusive = item.isTaxInclusive === true || item.isTaxInclusive === 'true';
        
        let taxableValue = total;
        let itemTax = 0;
        if (isTaxInclusive) {
          taxableValue = total / (1 + rateNum / 100);
          itemTax = total - taxableValue;
        } else {
          itemTax = total * (rateNum / 100);
        }

        saleTaxable += taxableValue;

        let cgst = 0, sgst = 0, igst = 0;
        if (isInterState) {
          igst = itemTax;
          saleIGST += igst;
        } else {
          cgst = itemTax / 2;
          sgst = itemTax / 2;
          saleCGST += cgst;
          saleSGST += sgst;
        }

        if (!summaryBySlab[rateStr]) {
          summaryBySlab[rateStr] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, totalValue: 0 };
        }
        summaryBySlab[rateStr].taxableValue += taxableValue;
        summaryBySlab[rateStr].cgst += cgst;
        summaryBySlab[rateStr].sgst += sgst;
        summaryBySlab[rateStr].igst += igst;
        summaryBySlab[rateStr].totalTax += itemTax;
        summaryBySlab[rateStr].totalValue += (taxableValue + itemTax);
      });

      if (items.length === 0) {
        const amt = parseFloat(sale.amount) || 0;
        const tax = parseFloat(sale.taxAmount || sale.gstAmount || 0);
        const taxable = amt - tax;
        saleTaxable = taxable;
        if (isInterState) {
          saleIGST = tax;
        } else {
          saleCGST = tax / 2;
          saleSGST = tax / 2;
        }

        const rateStr = sale.taxSlab || '18%';
        if (!summaryBySlab[rateStr]) {
          summaryBySlab[rateStr] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, totalValue: 0 };
        }
        summaryBySlab[rateStr].taxableValue += taxable;
        summaryBySlab[rateStr].cgst += saleCGST;
        summaryBySlab[rateStr].sgst += saleSGST;
        summaryBySlab[rateStr].igst += saleIGST;
        summaryBySlab[rateStr].totalTax += tax;
        summaryBySlab[rateStr].totalValue += amt;
      }

      const entry = {
        invoiceNumber: sale.id,
        date: sale.date || sale.createdAt,
        customerName,
        customerGstin: gstin,
        taxableValue: saleTaxable,
        cgst: saleCGST,
        sgst: saleSGST,
        igst: saleIGST,
        totalTax: saleCGST + saleSGST + saleIGST,
        totalAmount: parseFloat(sale.amount) || 0
      };

      if (isB2B) {
        b2b.push(entry);
      } else {
        b2c.push(entry);
      }
    });

    const totalSales = sales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const totalTaxable = Object.values(summaryBySlab).reduce((sum, sl) => sum + sl.taxableValue, 0);
    const totalTax = Object.values(summaryBySlab).reduce((sum, sl) => sum + sl.totalTax, 0);

    return res.json({
      success: true,
      data: {
        b2b,
        b2c,
        summaryBySlab,
        totalSales,
        totalTaxable,
        totalTax
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// 2. Calculate GSTR-3B Details
async function getGSTR3B(req, res) {
  const { month } = req.query;
  const username = req.user?.username || req.query.username;
  if (!username) return res.status(400).json({ success: false, message: 'Username required' });

  try {
    const db = getDB();
    const query = { username };
    if (month) {
      query.date = { $regex: `^${month}` };
    }

    const sales = await db.collection('sales').find(query).toArray();
    const purchases = await db.collection('purchases').find(query).toArray();
    const parties = await db.collection('parties').find({ username }).toArray();
    const settings = await db.collection('settings').findOne({ username }) || {};
    const shopState = settings.state || 'Maharashtra';

    // Outward Liability (Sales)
    let outwardTaxable = 0;
    let outwardCGST = 0;
    let outwardSGST = 0;
    let outwardIGST = 0;

    sales.forEach(sale => {
      const customerName = sale.customer || 'Walk-in Customer';
      const matchedParty = parties.find(p => p.name.toLowerCase() === customerName.toLowerCase());
      const partyState = matchedParty?.state || shopState;
      const isInterState = partyState.toLowerCase() !== shopState.toLowerCase();

      const items = Array.isArray(sale.items) ? sale.items : [];
      items.forEach(item => {
        const rateStr = item.taxSlab || '18%';
        const rateNum = parseFloat(rateStr.replace('%', '')) || 0;
        const total = parseFloat(item.total || item.amount) || 0;
        const isTaxInclusive = item.isTaxInclusive === true || item.isTaxInclusive === 'true';

        let taxableValue = total;
        let itemTax = 0;
        if (isTaxInclusive) {
          taxableValue = total / (1 + rateNum / 100);
          itemTax = total - taxableValue;
        } else {
          itemTax = total * (rateNum / 100);
        }

        outwardTaxable += taxableValue;
        if (isInterState) {
          outwardIGST += itemTax;
        } else {
          outwardCGST += itemTax / 2;
          outwardSGST += itemTax / 2;
        }
      });

      if (items.length === 0) {
        const amt = parseFloat(sale.amount) || 0;
        const tax = parseFloat(sale.taxAmount || sale.gstAmount || 0);
        outwardTaxable += (amt - tax);
        if (isInterState) {
          outwardIGST += tax;
        } else {
          outwardCGST += tax / 2;
          outwardSGST += tax / 2;
        }
      }
    });

    // Inward ITC Eligibility (Purchases)
    let inwardTaxable = 0;
    let inwardCGST = 0;
    let inwardSGST = 0;
    let inwardIGST = 0;

    purchases.forEach(pur => {
      const supplierName = pur.supplier || '';
      const matchedParty = parties.find(p => p.name.toLowerCase() === supplierName.toLowerCase());
      const partyState = matchedParty?.state || shopState;
      const isInterState = partyState.toLowerCase() !== shopState.toLowerCase();

      const items = Array.isArray(pur.items) ? pur.items : [];
      items.forEach(item => {
        const rateStr = item.taxSlab || '18%';
        const rateNum = parseFloat(rateStr.replace('%', '')) || 0;
        const total = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        const isTaxInclusive = item.isTaxInclusive === true || item.isTaxInclusive === 'true';

        let taxableValue = total;
        let itemTax = 0;
        if (isTaxInclusive) {
          taxableValue = total / (1 + rateNum / 100);
          itemTax = total - taxableValue;
        } else {
          itemTax = total * (rateNum / 100);
        }

        inwardTaxable += taxableValue;
        if (isInterState) {
          inwardIGST += itemTax;
        } else {
          inwardCGST += itemTax / 2;
          inwardSGST += itemTax / 2;
        }
      });

      if (items.length === 0) {
        const amt = parseFloat(pur.amount) || 0;
        const tax = parseFloat(pur.taxAmount || pur.gstAmount || 0);
        inwardTaxable += (amt - tax);
        if (isInterState) {
          inwardIGST += tax;
        } else {
          inwardCGST += tax / 2;
          inwardSGST += tax / 2;
        }
      }
    });

    const netCGST = Math.max(0, outwardCGST - inwardCGST);
    const netSGST = Math.max(0, outwardSGST - inwardSGST);
    const netIGST = Math.max(0, outwardIGST - inwardIGST);

    return res.json({
      success: true,
      data: {
        outward: {
          taxableValue: outwardTaxable,
          cgst: outwardCGST,
          sgst: outwardSGST,
          igst: outwardIGST,
          totalTax: outwardCGST + outwardSGST + outwardIGST
        },
        inwardITC: {
          taxableValue: inwardTaxable,
          cgst: inwardCGST,
          sgst: inwardSGST,
          igst: inwardIGST,
          totalTax: inwardCGST + inwardSGST + inwardIGST
        },
        netPayable: {
          cgst: netCGST,
          sgst: netSGST,
          igst: netIGST,
          total: netCGST + netSGST + netIGST
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// 3. Export Ledger Statement as PDF
async function getLedgerPDF(req, res) {
  const { ledgerId } = req.params;
  const username = req.user?.username || req.query.username;

  try {
    const ledger = await Ledger.findById(ledgerId);
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'Ledger not found' });
    }

    const journalEntries = await JournalEntry.find({
      'entries.ledger': ledgerId
    }).sort({ date: 1 });

    const db = getDB();
    const settings = await db.collection('settings').findOne({ username }) || {};

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Ledger_${ledger.name.replace(/\s+/g, '_')}.pdf`);
    doc.pipe(res);

    // PDF Styling
    doc.fillColor('#0c223c').fontSize(22).text('LEDGER STATEMENT', { align: 'center' });
    doc.moveDown(0.5);
    
    // Business Details
    doc.fillColor('#475569').fontSize(10).text(settings.bizName || 'Vyapar Business Owner', { align: 'center' });
    if (settings.addressLine1 || settings.city) {
      doc.text(`${settings.addressLine1 || ''}, ${settings.city || ''}, ${settings.state || ''}`, { align: 'center' });
    }
    if (settings.gstin) {
      doc.text(`GSTIN: ${settings.gstin}`, { align: 'center' });
    }
    
    doc.moveDown(1.5);
    
    // Ledger Account Details Card
    doc.rect(50, doc.y, 512, 60).fill('#f8fafc');
    doc.fillColor('#0f172a').fontSize(12).text(`Account Name: ${ledger.name}`, 60, doc.y + 12);
    doc.text(`Account Type: ${ledger.type.toUpperCase()}`, 60, doc.y + 24);
    doc.moveDown(2);

    // Table Header
    const tableTop = doc.y;
    doc.rect(50, tableTop, 512, 20).fill('#0c223c');
    doc.fillColor('#ffffff').fontSize(9);
    doc.text('Date', 60, tableTop + 6);
    doc.text('Particulars / Narration', 130, tableTop + 6);
    doc.text('Debit', 340, tableTop + 6, { width: 50, align: 'right' });
    doc.text('Credit', 400, tableTop + 6, { width: 50, align: 'right' });
    doc.text('Balance', 470, tableTop + 6, { width: 70, align: 'right' });

    let currentY = tableTop + 20;
    let runningBalance = 0; // Starting calculation

    // Draw rows
    doc.fillColor('#0f172a');
    
    journalEntries.forEach(entry => {
      const targetEntry = entry.entries.find(e => e.ledger.toString() === ledgerId);
      if (!targetEntry) return;

      const isDebit = targetEntry.type === 'debit';
      const debitVal = isDebit ? targetEntry.amount : 0;
      const creditVal = !isDebit ? targetEntry.amount : 0;

      // Adjust running balance
      if (ledger.type === 'asset' || ledger.type === 'expense') {
        runningBalance += (debitVal - creditVal);
      } else {
        runningBalance += (creditVal - debitVal);
      }

      // Check height bounds
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
        // Reprint header on new page
        doc.rect(50, currentY, 512, 20).fill('#0c223c');
        doc.fillColor('#ffffff');
        doc.text('Date', 60, currentY + 6);
        doc.text('Particulars / Narration', 130, currentY + 6);
        doc.text('Debit', 340, currentY + 6, { width: 50, align: 'right' });
        doc.text('Credit', 400, currentY + 6, { width: 50, align: 'right' });
        doc.text('Balance', 470, currentY + 6, { width: 70, align: 'right' });
        currentY += 20;
        doc.fillColor('#0f172a');
      }

      const formattedDate = new Date(entry.date).toLocaleDateString('en-IN');
      doc.text(formattedDate, 60, currentY + 6);
      doc.text(entry.narration || 'Journal Voucher', 130, currentY + 6, { width: 200 });
      doc.text(debitVal > 0 ? `₹${debitVal.toFixed(2)}` : '—', 340, currentY + 6, { width: 50, align: 'right' });
      doc.text(creditVal > 0 ? `₹${creditVal.toFixed(2)}` : '—', 400, currentY + 6, { width: 50, align: 'right' });
      doc.text(`₹${runningBalance.toFixed(2)}`, 470, currentY + 6, { width: 70, align: 'right' });

      // Horizontal separator line
      doc.moveTo(50, currentY + 20).lineTo(562, currentY + 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      currentY += 20;
    });

    // Draw bottom border
    doc.moveDown(1);
    doc.fillColor('#475569').fontSize(10).text(`Statement generated automatically via Vyapar Accounting Ledger Engine on ${new Date().toLocaleDateString('en-IN')}`, 50, doc.y + 20, { align: 'center' });

    doc.end();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

// 4. Export Tally Prime XML (Zero Duplicate Data Creation)
async function exportTallyXML(req, res) {
  const username = req.user?.username || req.query.username;
  try {
    const db = getDB();
    const query = username ? { username } : {};
    const sales = await db.collection('sales').find(query).toArray();
    const purchases = await db.collection('purchases').find(query).toArray();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<ENVELOPE>\n`;
    xml += `  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n`;
    xml += `  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

    sales.forEach(s => {
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
      xml += `          <VOUCHER VCHTYPE="Sales" ACTION="Create">\n`;
      xml += `            <DATE>${(s.date || new Date().toISOString().substring(0, 10)).replace(/-/g, '')}</DATE>\n`;
      xml += `            <VOUCHERNUMBER>${s.id || s.invoiceNumber || 'INV-1'}</VOUCHERNUMBER>\n`;
      xml += `            <PARTYLEDGERNAME>${s.customer || 'Walk-in Customer'}</PARTYLEDGERNAME>\n`;
      xml += `            <NARRATION>Sales bill generated via Vyapar 2.0</NARRATION>\n`;
      xml += `            <AMOUNT>-${s.amount || 0}</AMOUNT>\n`;
      xml += `          </VOUCHER>\n`;
      xml += `        </TALLYMESSAGE>\n`;
    });

    purchases.forEach(p => {
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
      xml += `          <VOUCHER VCHTYPE="Purchase" ACTION="Create">\n`;
      xml += `            <DATE>${(p.date || new Date().toISOString().substring(0, 10)).replace(/-/g, '')}</DATE>\n`;
      xml += `            <VOUCHERNUMBER>${p.id || p.invoiceNumber || 'PUR-1'}</VOUCHERNUMBER>\n`;
      xml += `            <PARTYLEDGERNAME>${p.supplier || 'General Supplier'}</PARTYLEDGERNAME>\n`;
      xml += `            <NARRATION>Purchase entry generated via Vyapar 2.0</NARRATION>\n`;
      xml += `            <AMOUNT>${p.amount || 0}</AMOUNT>\n`;
      xml += `          </VOUCHER>\n`;
      xml += `        </TALLYMESSAGE>\n`;
    });

    xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename=Vyapar_Tally_Import.xml');
    return res.send(xml);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// 5. Export GSTR-1 Official JSON
async function exportGSTR1JSON(req, res) {
  const { month } = req.query;
  const username = req.user?.username || req.query.username;
  try {
    const db = getDB();
    const query = username ? { username } : {};
    if (month) {
      query.date = { $regex: `^${month}` };
    }

    const sales = await db.collection('sales').find(query).toArray();
    const settings = await db.collection('settings').findOne({ username }) || {};

    const gstr1Payload = {
      gstin: settings.gstin || '27AAAAA0000A1Z5',
      fp: month ? month.replace('-', '') : new Date().toISOString().substring(0, 7).replace('-', ''),
      b2b: [],
      b2cs: []
    };

    sales.forEach(s => {
      const isB2B = s.customerGstin && s.customerGstin.length >= 15;
      const invData = {
        inum: s.id || s.invoiceNumber || 'INV-001',
        idt: (s.date || new Date().toISOString().substring(0, 10)).split('-').reverse().join('-'),
        val: parseFloat(s.amount) || 0,
        pos: settings.stateCode || '27',
        rchrg: 'N',
        inv_type: 'R'
      };

      if (isB2B) {
        gstr1Payload.b2b.push({
          ctin: s.customerGstin,
          inv: [invData]
        });
      } else {
        gstr1Payload.b2cs.push(invData);
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=GSTR1_${gstr1Payload.fp}.json`);
    return res.json(gstr1Payload);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getGSTR1,
  getGSTR3B,
  getLedgerPDF,
  exportTallyXML,
  exportGSTR1JSON
};
