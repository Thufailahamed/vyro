ALTER TABLE suppliers ADD COLUMN slug TEXT;

--> statement-breakpoint

CREATE UNIQUE INDEX suppliers_slug_unique ON suppliers(slug) WHERE slug IS NOT NULL;

--> statement-breakpoint

UPDATE suppliers
SET slug = LOWER(
  SUBSTR(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            city || '-' || name,
          ' ', '-'),
        '.', ''),
      ',', ''),
    '/', '-'),
  1, 60)
)
WHERE slug IS NULL AND verification_status = 'verified';
