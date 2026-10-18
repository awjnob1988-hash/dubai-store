-- Run once in Cloudflare D1 > dubai-store-catalog > Console.
-- Do not insert products here. The admin migration button imports live Netlify data.
CREATE TABLE IF NOT EXISTS shop_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
