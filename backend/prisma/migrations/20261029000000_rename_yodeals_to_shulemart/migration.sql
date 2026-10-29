-- Rebrand: yoDeals is now Shulemart. Updates catalogue text already stored in the database
-- (the catalogue seed only runs on an empty database). Safe to run on a database with no yoDeals text.
UPDATE "products"   SET "brand"       = REPLACE("brand", 'yoDeals', 'Shulemart')       WHERE "brand" LIKE '%yoDeals%';
UPDATE "products"   SET "name"        = REPLACE("name", 'yoDeals', 'Shulemart')        WHERE "name" LIKE '%yoDeals%';
UPDATE "products"   SET "description" = REPLACE("description", 'yoDeals', 'Shulemart') WHERE "description" LIKE '%yoDeals%';
UPDATE "packages"   SET "name"        = REPLACE("name", 'yoDeals', 'Shulemart')        WHERE "name" LIKE '%yoDeals%';
UPDATE "categories" SET "name"        = REPLACE("name", 'yoDeals', 'Shulemart')        WHERE "name" LIKE '%yoDeals%';
UPDATE "categories" SET "subtitle"    = REPLACE("subtitle", 'yoDeals', 'Shulemart')    WHERE "subtitle" LIKE '%yoDeals%';
