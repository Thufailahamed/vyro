import PDFDocument from 'pdfkit';

interface OrderLite {
  poNumber: string;
  totalCents: number;
  currency: string;
  incoterms?: string | null;
}
interface ItemLite {
  name: string;
  hsCode?: string | null;
  qty: number;
  unitPriceCents: number;
}
interface PartyLite {
  name: string;
  taxId?: string | null;
  countryCode?: string;
  address: string;
}

export function renderCommercialInvoice(
  order: OrderLite,
  items: ItemLite[],
  supplier: PartyLite,
  buyer: PartyLite,
): Promise<ArrayBuffer> {
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

    doc.fontSize(20).text('COMMERCIAL INVOICE', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`PO: ${order.poNumber}`)
      .text(`Incoterms: ${order.incoterms ?? '-'}`)
      .text(`Currency: ${order.currency}`);
    doc.moveDown();
    doc
      .text(`Supplier: ${supplier.name} (${supplier.taxId ?? '-'})`)
      .text(`Address: ${supplier.address}`);
    doc.moveDown();
    doc
      .text(`Buyer: ${buyer.name} (${buyer.countryCode ?? '-'}, ${buyer.taxId ?? '-'})`)
      .text(`Address: ${buyer.address}`);
    doc.moveDown();
    doc.fontSize(12).text('Items', { underline: true });
    items.forEach((i) => {
      doc
        .fontSize(10)
        .text(`${i.name}  HS:${i.hsCode ?? '-'}  qty:${i.qty}  unit:${i.unitPriceCents}c`);
    });
    doc.moveDown();
    doc.fontSize(12).text(`Total: ${order.totalCents} cents`);
    doc.end();
  });
}

export function renderPackingList(
  order: OrderLite,
  items: ItemLite[],
  supplier: PartyLite,
  buyer: PartyLite,
): Promise<ArrayBuffer> {
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

    doc.fontSize(20).text('PACKING LIST', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`PO: ${order.poNumber}`);
    doc.text(`Supplier: ${supplier.name}`).text(`Buyer: ${buyer.name} (${buyer.countryCode ?? '-'})`);
    doc.moveDown();
    doc.fontSize(12).text('Contents', { underline: true });
    items.forEach((i, idx) => {
      doc.fontSize(10).text(`${idx + 1}. ${i.name}  qty:${i.qty}  HS:${i.hsCode ?? '-'}`);
    });
    doc.end();
  });
}

export function renderCertificateOfOrigin(
  order: OrderLite,
  supplier: PartyLite,
  buyer: PartyLite,
  countryOfOrigin: string,
): Promise<ArrayBuffer> {
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

    doc.fontSize(20).text('CERTIFICATE OF ORIGIN', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`PO: ${order.poNumber}`)
      .text(`Exporter: ${supplier.name}, ${supplier.address}`)
      .text(`Consignee: ${buyer.name}, ${buyer.address}`)
      .text(`Country of Origin: ${countryOfOrigin}`)
      .text(`Country of Destination: ${buyer.countryCode ?? '-'}`);
    doc.moveDown();
    doc.text(
      'The undersigned hereby declares that the above-described goods originate in the country shown.',
    );
    doc.end();
  });
}