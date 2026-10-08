import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  invoice: {
    number: string;
    type: 'receipt' | 'tax_invoice' | 'credit_note';
    currency: string;
    issuedAt: number;
    subtotalCents: number;
    vatCents: number;
    ssclCents: number;
    totalCents: number;
    supplierVatNo: string | null;
    buyerTaxId: string | null;
  };
  items: Array<{ description: string; quantity: number; unitCents: number; lineTotalCents: number }>;
  business: { name: string };
  supplier: { name: string };
  po: { poNumber: string };
}

const TITLES: Record<InvoicePdfData['invoice']['type'], string> = {
  receipt: 'RECEIPT',
  tax_invoice: 'TAX INVOICE',
  credit_note: 'CREDIT NOTE',
};

const amount = (cents: number) => (cents / 100).toFixed(2);

export function renderInvoicePdf(data: InvoicePdfData): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (c: Uint8Array) => chunks.push(c));
    doc.on('end', () => {
      const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.byteLength;
      }
      resolve(merged.buffer);
    });
    doc.on('error', reject);

    doc.fontSize(20).text(TITLES[data.invoice.type], { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Invoice: ${data.invoice.number}`)
      .text(`Issued: ${new Date(data.invoice.issuedAt).toISOString().slice(0, 10)}`)
      .text(`PO: ${data.po.poNumber}`)
      .text(`Currency: ${data.invoice.currency}`);
    doc.moveDown();
    doc
      .text(`Supplier: ${data.supplier.name}${data.invoice.supplierVatNo ? ` (VAT ${data.invoice.supplierVatNo})` : ''}`)
      .text(`Buyer: ${data.business.name}${data.invoice.buyerTaxId ? ` (Tax ID ${data.invoice.buyerTaxId})` : ''}`);
    doc.moveDown();
    doc.fontSize(12).text('Items', { underline: true });
    for (const item of data.items) {
      doc
        .fontSize(10)
        .text(
          `${item.description}  qty:${item.quantity}  unit:${amount(item.unitCents)}  total:${amount(item.lineTotalCents)}`,
        );
    }
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Subtotal: ${amount(data.invoice.subtotalCents)}`)
      .text(`VAT: ${amount(data.invoice.vatCents)}`)
      .text(`SSCL: ${amount(data.invoice.ssclCents)}`)
      .fontSize(12)
      .text(`Total: ${data.invoice.currency} ${amount(data.invoice.totalCents)}`);
    doc.end();
  });
}
