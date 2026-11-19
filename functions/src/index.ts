import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';

if (!admin.apps.length) {
  admin.initializeApp();
}

const FIRESTORE_DATABASE_ID = 'ai-studio-bfbc8476-e0fd-4707-ada3-a7a797bafba9';
const DEFAULT_ADMIN_EMAIL = 'itzz.nischit@gmail.com';
const DEFAULT_LOW_STOCK_THRESHOLD = Math.max(1, Number(process.env.LOW_STOCK_THRESHOLD) || 5);

const smtpPassSecret = defineSecret('SMTP_PASS');

interface ProductRecord {
  id?: string;
  name?: string;
  sku?: string;
  category?: string;
  price?: number;
  unit?: string;
  stock?: number;
  inStock?: boolean;
  lastOrderId?: string;
}

interface InventorySettingsRecord {
  lowStockEmailEnabled?: boolean;
  recipientEmail?: string;
  lowStockThreshold?: number;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStock(record: ProductRecord | undefined): number | null {
  if (!record || typeof record.stock !== 'number' || !Number.isFinite(record.stock)) {
    return null;
  }
  return Math.max(0, Math.floor(record.stock));
}

export const notifyAdminOnLowStock = onDocumentWritten(
  {
    document: 'products/{productId}',
    database: FIRESTORE_DATABASE_ID,
    region: 'asia-south1',
    secrets: [smtpPassSecret],
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) {
      return;
    }

    const beforeData = event.data?.before.exists
      ? (event.data.before.data() as ProductRecord)
      : undefined;
    const afterData = afterSnap.data() as ProductRecord;

    const previousStock = normalizeStock(beforeData);
    const currentStock = normalizeStock(afterData);

    if (currentStock === null) {
      return;
    }

    // Read admin toggle setting from Firestore (/settings/inventoryAlerts)
    const db = getFirestore(FIRESTORE_DATABASE_ID);
    let settingsData: InventorySettingsRecord | undefined;
    try {
      const settingsSnap = await db.collection('settings').doc('inventoryAlerts').get();
      if (settingsSnap.exists) {
        settingsData = settingsSnap.data() as InventorySettingsRecord;
      }
    } catch (err) {
      logger.warn('Could not read /settings/inventoryAlerts; falling back to default enabled state.', err);
    }

    if (settingsData?.lowStockEmailEnabled === false) {
      logger.info('Low-stock email alert skipped because admin turned off alerts on the website.', {
        productId: event.params.productId,
        currentStock,
      });
      return;
    }

    const threshold =
      typeof settingsData?.lowStockThreshold === 'number' &&
      Number.isFinite(settingsData.lowStockThreshold) &&
      settingsData.lowStockThreshold >= 1
        ? Math.floor(settingsData.lowStockThreshold)
        : DEFAULT_LOW_STOCK_THRESHOLD;

    const crossedBelowThreshold =
      (previousStock === null || previousStock >= threshold) &&
      currentStock < threshold;
    const becameOutOfStock =
      (previousStock !== null && previousStock > 0 && currentStock === 0) ||
      (beforeData?.inStock !== false && afterData.inStock === false);

    if (!crossedBelowThreshold && !becameOutOfStock) {
      return;
    }

    const productId = event.params.productId;
    const productName = afterData.name || productId;
    const sku = afterData.sku || 'N/A';
    const category = afterData.category || 'Electronics';
    const unit = afterData.unit || 'pc';
    const price = typeof afterData.price === 'number' ? afterData.price : 0;
    const lastOrderId = afterData.lastOrderId || 'Admin / Manual Update';

    const recipientEmail =
      settingsData?.recipientEmail?.trim() ||
      process.env.ALERT_RECIPIENT_EMAIL?.trim() ||
      DEFAULT_ADMIN_EMAIL;
    const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const smtpSecure = process.env.SMTP_SECURE !== 'false';
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = smtpPassSecret.value().trim();

    if (!smtpUser || !smtpPass) {
      logger.error('Low-stock email not sent: missing SMTP_USER env var or SMTP_PASS secret.', {
        productId,
        productName,
        previousStock,
        currentStock,
        recipientEmail,
      });
      return;
    }

    const isOut = currentStock === 0 || afterData.inStock === false;
    const subject = isOut
      ? `[OUT OF STOCK] ${productName} (${sku}) — Tronic World Inventory`
      : `[LOW STOCK: ${currentStock} left] ${productName} (${sku}) — Tronic World Inventory`;

    const textBody = [
      'Tronic World Inventory Alert',
      '',
      `Status: ${isOut ? 'OUT OF STOCK (0 units available)' : `LIMITED STOCK (${currentStock} ${unit} left — below threshold of ${threshold})`}`,
      `Product: ${productName}`,
      `SKU: ${sku}`,
      `Category: ${category}`,
      `Unit Price: Rs. ${price} / ${unit}`,
      `Previous Stock: ${previousStock === null ? 'New product' : previousStock}`,
      `Current Stock: ${currentStock}`,
      `Trigger Reference: ${lastOrderId}`,
      '',
      'You can manage stock or pause these email alerts anytime in the Tronic World Admin Console.',
    ].join('\n');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <div style="background: ${isOut ? '#be123c' : '#d97706'}; color: #ffffff; padding: 16px 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">
            ${isOut ? 'Urgent: Component Out of Stock' : `Low Stock Alert (< ${threshold} Units)`}
          </h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.92;">
            Tronic World Pune · Automated Inventory Monitor
          </p>
        </div>
        <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 10px 10px; background: #ffffff;">
          <p style="margin-top: 0; font-size: 14px;">
            <strong>${escapeHtml(productName)}</strong> is now
            <strong style="color: ${isOut ? '#be123c' : '#b45309'};">${isOut ? 'Out of Stock' : `${currentStock} ${escapeHtml(unit)} left`}</strong>.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;">
            <tr><td style="padding: 6px 0; color: #64748b;">SKU</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(sku)}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Category</td><td style="padding: 6px 0;">${escapeHtml(category)}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Unit Price</td><td style="padding: 6px 0;">&#8377;${price.toLocaleString('en-IN')} / ${escapeHtml(unit)}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Previous Stock</td><td style="padding: 6px 0;">${previousStock === null ? 'New listing' : previousStock}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Remaining Stock</td><td style="padding: 6px 0; font-weight: 700; color: ${isOut ? '#be123c' : '#b45309'};">${currentStock}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Reference</td><td style="padding: 6px 0;">${escapeHtml(lastOrderId)}</td></tr>
          </table>
          <p style="margin-bottom: 0; font-size: 12px; color: #64748b;">
            Sign in at Tronic World Admin Console with ${escapeHtml(recipientEmail)} to restock items or toggle email notifications off anytime.
          </p>
        </div>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || `"Tronic World Alerts" <${smtpUser}>`,
      to: recipientEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    logger.info('Low-stock alert email sent successfully.', {
      productId,
      productName,
      previousStock,
      currentStock,
      recipientEmail,
    });
  }
);
