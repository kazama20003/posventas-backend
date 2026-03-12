DROP INDEX IF EXISTS "Store_tenantId_code_key";

CREATE UNIQUE INDEX "Store_tenantId_code_active_key"
ON "Store"("tenantId", "code")
WHERE "deletedAt" IS NULL AND "code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Store_tenantId_code_idx"
ON "Store"("tenantId", "code");
