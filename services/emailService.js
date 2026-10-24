const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { getDB } = require('../config/db');

/**
 * Logs email attempts to the database for audit and dry-run tracking
 */
async function logEmailAttempt({ to, subject, html, attachments = [], status, error = null, isDryRun = false }) {
  try {
    const db = getDB();
    await db.collection('sa_notifications_log').insertOne({
      channel: 'email',
      provider: process.env.SENDGRID_API_KEY ? 'sendgrid' : (process.env.SMTP_HOST ? 'smtp' : 'dryrun'),
      to,
      subject,
      attachmentCount: attachments.length,
      status, // 'sent' | 'failed' | 'dryrun'
      error,
      isDryRun,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[EMAIL-LOG] Failed to log email attempt:', err.message);
  }
}

/**
 * Creates Nodemailer SMTP transport if SMTP credentials are provided
 */
let smtpTransport = null;
function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return smtpTransport;
}

/**
 * Dispatches email via SendGrid REST API v3
 */
async function sendViaSendGrid({ to, subject, html, text, attachments = [], fromName = null }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM || 'noreply@vyapar.com';
  const name = fromName || 'Vyapar Retail';

  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name },
    subject: subject,
    content: []
  };

  if (text) {
    body.content.push({ type: 'text/plain', value: text });
  }
  if (html) {
    body.content.push({ type: 'text/html', value: html });
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    body.attachments = attachments.map(att => {
      let contentBase64 = '';
      if (Buffer.isBuffer(att.content)) {
        contentBase64 = att.content.toString('base64');
      } else if (typeof att.content === 'string') {
        contentBase64 = Buffer.from(att.content).toString('base64');
      }
      return {
        content: contentBase64,
        filename: att.filename || 'attachment.pdf',
        type: att.contentType || 'application/pdf',
        disposition: 'attachment'
      };
    });
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok && response.status !== 202) {
    const errorText = await response.text();
    throw new Error(`SendGrid API error (${response.status}): ${errorText}`);
  }

  return { ok: true, provider: 'sendgrid', status: response.status };
}

/**
 * Unified sendEmail dispatcher:
 * SendGrid REST > SMTP > Dryrun
 */
async function sendEmail({ to, subject, html, text = '', attachments = [], fromName = null }) {
  if (!to) throw new Error('Recipient email "to" is required');

  // 1. SendGrid API
  if (process.env.SENDGRID_API_KEY) {
    try {
      const res = await sendViaSendGrid({ to, subject, html, text, attachments, fromName });
      await logEmailAttempt({ to, subject, html, attachments, status: 'sent' });
      return res;
    } catch (err) {
      console.error('[EMAIL-SERVICE] SendGrid failed:', err.message);
      await logEmailAttempt({ to, subject, html, attachments, status: 'failed', error: err.message });
      throw err;
    }
  }

  // 2. SMTP Transport
  const transport = getSmtpTransport();
  if (transport) {
    try {
      const info = await transport.sendMail({
        from: `"${fromName || 'Vyapar Retail'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
        attachments
      });
      await logEmailAttempt({ to, subject, html, attachments, status: 'sent' });
      return { ok: true, provider: 'smtp', info };
    } catch (err) {
      console.error('[EMAIL-SERVICE] SMTP failed:', err.message);
      await logEmailAttempt({ to, subject, html, attachments, status: 'failed', error: err.message });
      throw err;
    }
  }

  // 3. Dry-run Mode
  console.log(`[EMAIL-DRYRUN] to: ${to} | subject: ${subject} | attachments: ${attachments.length}`);
  await logEmailAttempt({ to, subject, html, attachments, status: 'dryrun', isDryRun: true });
  return { ok: true, dryrun: true, provider: 'dryrun' };
}

/**
 * Generates an in-memory PDF Buffer for an Invoice using pdfkit
 */
function generateInvoicePDFBuffer(invoice, business = {}, customer = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const invNo = invoice.invoiceNumber || invoice.id || invoice._id || 'INV';
      const bizName = business.name || business.businessName || 'Vyapar Retail Pvt Ltd';
      const gstin = business.gstin || '27AABCU9603R1ZV';
      const address = business.address || 'Shop 21, Brigade Road, Bangalore, Karnataka, 560025';
      const phone = business.phone || '+91 98765 43210';
      const email = business.email || 'support@vyapar.com';
      const custName = customer.name || invoice.customerName || invoice.customer || 'Valued Customer';
      const custPhone = customer.phone || invoice.customerPhone || invoice.phone || 'N/A';
      const custAddress = customer.address || invoice.billingAddress || 'N/A';
      const dateStr = invoice.billDate || invoice.date ? new Date(invoice.billDate || invoice.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

      const totalAmount = Number(invoice.totalAmount || 0);
      const paidAmount = Number(invoice.paidAmount || 0);
      const balanceDue = Number(invoice.balanceDue ?? (totalAmount - paidAmount));

      // Header Banner
      doc.rect(40, 40, 515, 6).fill('#2563eb');

      // Shop Information
      doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold').text(bizName, 40, 56);
      doc.fontSize(9).font('Helvetica').fillColor('#64748b');
      doc.text(`GSTIN: ${gstin}`, 40, 80);
      doc.text(address, 40, 92);
      doc.text(`Phone: ${phone} | Email: ${email}`, 40, 104);

      // Invoice Badge / Title
      doc.fillColor('#1e293b').fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', 380, 56, { align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text(`Invoice #: ${invNo}`, 380, 78, { align: 'right' });
      doc.text(`Date: ${dateStr}`, 380, 92, { align: 'right' });
      doc.text(`Status: ${balanceDue <= 0 ? 'PAID' : 'PENDING'}`, 380, 106, { align: 'right' });

      // Divider
      doc.moveTo(40, 126).lineTo(555, 126).strokeColor('#e2e8f0').stroke();

      // Bill To Box
      doc.rect(40, 138, 515, 55).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('BILLED TO:', 52, 148);
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(custName, 52, 160);
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(`Phone: ${custPhone} | Address: ${custAddress}`, 52, 174);

      // Items Table Header
      let y = 210;
      doc.rect(40, y, 515, 24).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('#', 50, y + 7, { width: 30 });
      doc.text('ITEM DESCRIPTION', 80, y + 7, { width: 220 });
      doc.text('QTY', 300, y + 7, { width: 50, align: 'right' });
      doc.text('RATE (₹)', 360, y + 7, { width: 70, align: 'right' });
      doc.text('AMOUNT (₹)', 440, y + 7, { width: 100, align: 'right' });

      y += 24;

      // Table Rows
      const items = invoice.products || invoice.items || [];
      if (items.length === 0) {
        doc.rect(40, y, 515, 24).fill('#ffffff').strokeColor('#f1f5f9').stroke();
        doc.fillColor('#64748b').fontSize(9).text('General Items & Services', 80, y + 7);
        doc.text('1', 300, y + 7, { width: 50, align: 'right' });
        doc.text(totalAmount.toFixed(2), 360, y + 7, { width: 70, align: 'right' });
        doc.text(totalAmount.toFixed(2), 440, y + 7, { width: 100, align: 'right' });
        y += 24;
      } else {
        items.forEach((item, idx) => {
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(40, y, 515, 24).fill(bg).strokeColor('#f1f5f9').stroke();
          doc.fillColor('#334155').fontSize(9).font('Helvetica');
          doc.text(String(idx + 1), 50, y + 7, { width: 30 });
          doc.text(item.name || item.productName || 'Item', 80, y + 7, { width: 220 });
          const qty = item.quantity || 1;
          const rate = Number(item.price || item.rate || 0);
          const amt = Number(qty * rate);
          doc.text(String(qty), 300, y + 7, { width: 50, align: 'right' });
          doc.text(rate.toFixed(2), 360, y + 7, { width: 70, align: 'right' });
          doc.font('Helvetica-Bold').text(amt.toFixed(2), 440, y + 7, { width: 100, align: 'right' });
          y += 24;
        });
      }

      // Summary Box
      y += 16;
      doc.rect(330, y, 225, 95).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
      doc.fillColor('#475569').fontSize(9).font('Helvetica');

      doc.text('Subtotal:', 345, y + 12);
      doc.text(`₹${totalAmount.toFixed(2)}`, 440, y + 12, { width: 100, align: 'right' });

      doc.text('Paid Amount:', 345, y + 30);
      doc.fillColor('#10b981').text(`₹${paidAmount.toFixed(2)}`, 440, y + 30, { width: 100, align: 'right' });

      doc.moveTo(345, y + 48).lineTo(540, y + 48).strokeColor('#cbd5e1').stroke();

      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold');
      doc.text('Balance Due:', 345, y + 56);
      doc.fillColor(balanceDue > 0 ? '#ef4444' : '#10b981');
      doc.text(`₹${balanceDue.toFixed(2)}`, 440, y + 56, { width: 100, align: 'right' });

      // Footer
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica');
      doc.text('Thank you for your business! This is a computer-generated tax invoice.', 40, 750, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Sends formatted Invoice Email with PDF Attachment
 */
async function sendInvoiceEmail({ to, invoice, business = {}, customer = {}, customMessage = '', upiPaymentLink = null }) {
  if (!to) throw new Error('Recipient email is required');

  const invNo = invoice.invoiceNumber || invoice.id || invoice._id || 'INV';
  const bizName = business.name || business.businessName || 'Vyapar Retail Pvt Ltd';
  const total = Number(invoice.totalAmount || 0).toLocaleString('en-IN');
  const paid = Number(invoice.paidAmount || 0).toLocaleString('en-IN');
  const balance = Number(invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount || 0))).toLocaleString('en-IN');
  const custName = customer.name || invoice.customerName || 'Valued Customer';

  // Generate PDF Buffer
  const pdfBuffer = await generateInvoicePDFBuffer(invoice, business, customer);

  const subject = `Invoice #${invNo} from ${bizName} - ₹${total}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: #2563eb; color: #ffffff; padding: 28px 32px; }
        .header h1 { margin: 0 0 6px 0; font-size: 22px; }
        .header p { margin: 0; font-size: 13px; opacity: 0.9; }
        .content { padding: 32px; }
        .card { background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
        .divider { height: 1px; background: #e2e8f0; margin: 12px 0; }
        .btn { display: inline-block; background: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 16px; text-align: center; }
        .btn-upi { background: #10b981; }
        .footer { padding: 20px 32px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${bizName}</h1>
          <p>Invoice #${invNo}</p>
        </div>
        <div class="content">
          <p>Dear <strong>${custName}</strong>,</p>
          <p>Thank you for your business. Here is the summary of your invoice:</p>
          
          <div class="card">
            <div class="row"><span>Invoice Number:</span><strong>#${invNo}</strong></div>
            <div class="row"><span>Total Amount:</span><strong>₹${total}</strong></div>
            <div class="row"><span>Amount Paid:</span><span style="color: #10b981;">₹${paid}</span></div>
            <div class="divider"></div>
            <div class="row" style="font-size: 16px;">
              <span><strong>Balance Due:</strong></span>
              <strong style="color: ${Number(balance.replace(/,/g, '')) > 0 ? '#ef4444' : '#10b981'};">₹${balance}</strong>
            </div>
          </div>

          ${customMessage ? `<p style="background: #eff6ff; padding: 12px; border-left: 4px solid #2563eb; border-radius: 4px; font-size: 13px;"><strong>Note:</strong> ${customMessage}</p>` : ''}

          <p style="font-size: 13px; color: #64748b;">
            📎 <em>Your official Tax Invoice PDF is attached to this email for your accounting records.</em>
          </p>

          ${upiPaymentLink ? `
            <div style="text-align: center; margin-top: 24px;">
              <a href="${upiPaymentLink}" class="btn btn-upi">📲 Click Here to Pay via UPI</a>
            </div>
          ` : ''}
        </div>
        <div class="footer">
          <p>Generated by ${bizName} via Vyapar 2.0</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text: `Invoice #${invNo} from ${bizName}. Total: ₹${total}, Balance: ₹${balance}. Please find the PDF attached.`,
    fromName: bizName,
    attachments: [
      {
        filename: `invoice-${invNo}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
}

module.exports = {
  sendEmail,
  sendInvoiceEmail,
  generateInvoicePDFBuffer
};
