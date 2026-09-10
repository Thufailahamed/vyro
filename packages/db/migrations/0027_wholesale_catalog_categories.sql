-- 0027_wholesale_catalog_categories.sql
-- Add wholesale categories including food, furniture, equipment, and industrial hardware
INSERT OR IGNORE INTO `categories` (`id`, `slug`, `name`, `parent_id`, `sort_order`, `active`) VALUES
  ('cat-food', 'food', 'Food, Groceries & Provisions', NULL, 1, 1),
  ('cat-furniture', 'furniture', 'Commercial Furniture & Fitouts', NULL, 5, 1),
  ('cat-equipment', 'equipment', 'Kitchen Equipment & Appliances', NULL, 8, 1),
  ('cat-hardware', 'hardware', 'Hardware, Tools & Industrial', NULL, 9, 1);

INSERT OR IGNORE INTO `products` (`id`, `name`, `description`, `category_id`, `brand`, `unit`, `pack_size`, `active`, `created_at`, `updated_at`) VALUES
  ('p-furn-steel-table', 'Stainless Steel Commercial Prep Table', 'Commercial grade 304 stainless steel kitchen preparation table with undershelf (150x60x85cm).', 'cat-furniture', 'MasterSteel', 'unit', '1 unit', 1, 1725450000000, 1725450000000),
  ('p-furn-banquet-chair', 'Stackable Banquet Dining Chairs (Set of 10)', 'Heavy-duty commercial steel frame banquet chairs with high-density foam upholstery for hotels and event venues.', 'cat-furniture', 'RegalFit', 'set', '10 chairs', 1, 1725450000000, 1725450000000),
  ('p-furn-warehouse-rack', 'Heavy-Duty Industrial Storage Shelving Rack', 'Modular boltless powder-coated steel warehouse racking unit (4-tier, 500kg per shelf capacity).', 'cat-furniture', 'RaxStore', 'unit', '1 unit', 1, 1725450000000, 1725450000000),
  ('p-food-dhal-25kg', 'Mysore Red Dhal 25kg', 'Top grade unpolished red split lentils, cleaned and sorted for wholesale hotel and institutional catering.', 'cat-food', 'Araliya', 'bag', '25kg', 1, 1725450000000, 1725450000000);

INSERT OR IGNORE INTO `product_images` (`id`, `product_id`, `r2_key`, `sort_order`, `alt_text`) VALUES
  ('img-table-1', 'p-furn-steel-table', 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80', 1, 'Commercial stainless steel prep table'),
  ('img-chair-1', 'p-furn-banquet-chair', 'https://images.unsplash.com/photo-1580481077167-33a466471809?auto=format&fit=crop&w=800&q=80', 1, 'Commercial banquet dining chairs'),
  ('img-rack-1', 'p-furn-warehouse-rack', 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80', 1, 'Industrial warehouse shelving rack'),
  ('img-dhal-1', 'p-food-dhal-25kg', 'https://images.unsplash.com/photo-1585996746979-37f2fe9a3a91?auto=format&fit=crop&w=800&q=80', 1, 'Red split lentils wholesale bag');
