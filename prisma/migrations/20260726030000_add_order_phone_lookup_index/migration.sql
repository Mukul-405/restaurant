-- Exact phone lookups on the order-filter screen, newest first.
CREATE INDEX "Order_phoneNumber_createdAt_idx"
  ON "Order"("phoneNumber", "createdAt" DESC);
