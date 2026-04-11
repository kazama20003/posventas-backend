-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING_FLOAT', 'SALE', 'REFUND', 'CASH_IN', 'CASH_OUT', 'ADJUSTMENT', 'CLOSING');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cashRegisterId" UUID,
ADD COLUMN     "cashSessionId" UUID;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cashRegisterId" UUID,
ADD COLUMN     "cashSessionId" UUID;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "cashRegisterId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "closedById" UUID,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "expectedClosingAmount" DECIMAL(12,2),
    "countedClosingAmount" DECIMAL(12,2),
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "cashRegisterId" UUID NOT NULL,
    "cashSessionId" UUID,
    "orderId" UUID,
    "paymentId" UUID,
    "createdById" UUID,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");

-- CreateIndex
CREATE INDEX "CashRegister_storeId_idx" ON "CashRegister"("storeId");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_storeId_idx" ON "CashRegister"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_isActive_idx" ON "CashRegister"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_deletedAt_idx" ON "CashRegister"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_storeId_code_key" ON "CashRegister"("storeId", "code");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_idx" ON "CashSession"("tenantId");

-- CreateIndex
CREATE INDEX "CashSession_storeId_idx" ON "CashSession"("storeId");

-- CreateIndex
CREATE INDEX "CashSession_cashRegisterId_idx" ON "CashSession"("cashRegisterId");

-- CreateIndex
CREATE INDEX "CashSession_openedById_idx" ON "CashSession"("openedById");

-- CreateIndex
CREATE INDEX "CashSession_closedById_idx" ON "CashSession"("closedById");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_status_idx" ON "CashSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CashSession_cashRegisterId_status_idx" ON "CashSession"("cashRegisterId", "status");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_openedAt_idx" ON "CashSession"("tenantId", "openedAt");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_deletedAt_idx" ON "CashSession"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_one_open_per_register_idx"
ON "CashSession"("cashRegisterId")
WHERE "status" = 'OPEN' AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_idx" ON "CashMovement"("tenantId");

-- CreateIndex
CREATE INDEX "CashMovement_storeId_idx" ON "CashMovement"("storeId");

-- CreateIndex
CREATE INDEX "CashMovement_cashRegisterId_idx" ON "CashMovement"("cashRegisterId");

-- CreateIndex
CREATE INDEX "CashMovement_cashSessionId_idx" ON "CashMovement"("cashSessionId");

-- CreateIndex
CREATE INDEX "CashMovement_orderId_idx" ON "CashMovement"("orderId");

-- CreateIndex
CREATE INDEX "CashMovement_paymentId_idx" ON "CashMovement"("paymentId");

-- CreateIndex
CREATE INDEX "CashMovement_createdById_idx" ON "CashMovement"("createdById");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_type_createdAt_idx" ON "CashMovement"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_deletedAt_idx" ON "CashMovement"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_cashRegisterId_idx" ON "Order"("cashRegisterId");

-- CreateIndex
CREATE INDEX "Order_cashSessionId_idx" ON "Order"("cashSessionId");

-- CreateIndex
CREATE INDEX "Payment_cashRegisterId_idx" ON "Payment"("cashRegisterId");

-- CreateIndex
CREATE INDEX "Payment_cashSessionId_idx" ON "Payment"("cashSessionId");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
