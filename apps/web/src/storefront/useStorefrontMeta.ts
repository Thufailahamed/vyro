import type { JSX } from 'react';
import { SeoHead } from '@/components/SeoHead';

export interface StorefrontMetaInput {
  name: string;
  city: string | null | undefined;
  productCount: number;
}

export function StorefrontMeta({ name, city, productCount }: StorefrontMetaInput): JSX.Element {
  const title = `${name} — Vyro Wholesale Supplier`;
  const description = city
    ? `${name} — wholesale supplier in ${city}, ${productCount} published products on Vyro.`
    : `${name} — wholesale supplier on Vyro, ${productCount} published products.`;
  return <SeoHead title={title} description={description} />;
}
