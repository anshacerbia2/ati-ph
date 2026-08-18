CREATE TYPE "SubscriptionRecipientType" AS ENUM ('TO', 'CC');

ALTER TABLE "subscription_recipients"
ADD COLUMN "recipientType" "SubscriptionRecipientType" NOT NULL DEFAULT 'TO';

CREATE INDEX "subscription_recipients_subscriptionId_recipientType_isActive_idx"
ON "subscription_recipients"("subscriptionId", "recipientType", "isActive");
