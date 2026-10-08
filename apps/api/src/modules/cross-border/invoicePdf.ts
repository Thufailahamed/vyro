import { PDFDocument, StandardFonts } from 'pdf-lib';

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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export async function renderCommercialInvoice(
  order: OrderLite,
  items: ItemLite[],
  supplier: PartyLite,
  buyer: PartyLite,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  let y = height - 50;

  const title = 'COMMERCIAL INVOICE';
  const titleWidth = fontBold.widthOfTextAtSize(title, 20);
  page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold });
  y -= 35;

  page.drawText(`PO: ${order.poNumber}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Incoterms: ${order.incoterms ?? '-'}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Currency: ${order.currency}`, { x: 50, y, size: 10, font });
  y -= 25;

  page.drawText(`Supplier: ${supplier.name} (${supplier.taxId ?? '-'})`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Address: ${supplier.address}`, { x: 50, y, size: 10, font });
  y -= 25;

  page.drawText(`Buyer: ${buyer.name} (${buyer.countryCode ?? '-'}, ${buyer.taxId ?? '-'})`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Address: ${buyer.address}`, { x: 50, y, size: 10, font });
  y -= 25;

  page.drawText('Items', { x: 50, y, size: 12, font: fontBold });
  y -= 18;

  items.forEach((i) => {
    page.drawText(`${i.name}  HS:${i.hsCode ?? '-'}  qty:${i.qty}  unit:${i.unitPriceCents}c`, { x: 50, y, size: 10, font });
    y -= 15;
  });
  y -= 15;

  page.drawText(`Total: ${order.totalCents} cents`, { x: 50, y, size: 12, font: fontBold });

  const pdfBytes = await doc.save();
  return toArrayBuffer(pdfBytes);
}

export async function renderPackingList(
  order: OrderLite,
  items: ItemLite[],
  supplier: PartyLite,
  buyer: PartyLite,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  let y = height - 50;

  const title = 'PACKING LIST';
  const titleWidth = fontBold.widthOfTextAtSize(title, 20);
  page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold });
  y -= 35;

  page.drawText(`PO: ${order.poNumber}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Supplier: ${supplier.name}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Buyer: ${buyer.name} (${buyer.countryCode ?? '-'})`, { x: 50, y, size: 10, font });
  y -= 25;

  page.drawText('Contents', { x: 50, y, size: 12, font: fontBold });
  y -= 18;

  items.forEach((i, idx) => {
    page.drawText(`${idx + 1}. ${i.name}  qty:${i.qty}  HS:${i.hsCode ?? '-'}`, { x: 50, y, size: 10, font });
    y -= 15;
  });

  const pdfBytes = await doc.save();
  return toArrayBuffer(pdfBytes);
}

export async function renderCertificateOfOrigin(
  order: OrderLite,
  supplier: PartyLite,
  buyer: PartyLite,
  countryOfOrigin: string,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  let y = height - 50;

  const title = 'CERTIFICATE OF ORIGIN';
  const titleWidth = fontBold.widthOfTextAtSize(title, 20);
  page.drawText(title, { x: (width - titleWidth) / 2, y, size: 20, font: fontBold });
  y -= 35;

  page.drawText(`PO: ${order.poNumber}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Exporter: ${supplier.name}, ${supplier.address}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Consignee: ${buyer.name}, ${buyer.address}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Country of Origin: ${countryOfOrigin}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Country of Destination: ${buyer.countryCode ?? '-'}`, { x: 50, y, size: 10, font });
  y -= 25;

  page.drawText('The undersigned hereby declares that the above-described goods originate in the country shown.', {
    x: 50,
    y,
    size: 10,
    font,
  });

  const pdfBytes = await doc.save();
  return toArrayBuffer(pdfBytes);
}
