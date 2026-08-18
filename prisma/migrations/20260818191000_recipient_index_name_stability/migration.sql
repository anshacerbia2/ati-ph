-- PostgreSQL truncates identifiers to 63 bytes. The historical generated
-- recipient index name was longer than that limit, which left the physical
-- database name different from Prisma's desired canonical name after the
-- multi-schema rebaseline.
ALTER INDEX "routing"."subscription_recipients_subscriptionId_recipientType_isActive_i"
RENAME TO "subscription_recipients_subscription_recipient_active_idx";
