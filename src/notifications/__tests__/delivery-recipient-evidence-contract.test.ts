import fs from "node:fs";import path from "node:path";import { describe, expect, it } from "vitest";
const root=process.cwd(),migration=fs.readFileSync(path.join(root,"prisma/migrations/20260820131500_notification_delivery_recipient_outcome_evidence/migration.sql"),"utf8"),schema=fs.readFileSync(path.join(root,"prisma/schema.prisma"),"utf8"),delivery=fs.readFileSync(path.join(root,"src/notifications/delivery.ts"),"utf8"),worker=fs.readFileSync(path.join(root,"src/worker/main.ts"),"utf8");
describe("recipient outcome evidence",()=>{
it("persists accepted/rejected arrays",()=>{expect(migration).toContain('"acceptedRecipients" JSONB');expect(migration).toContain('"rejectedRecipients" JSONB');expect(schema).toContain("acceptedRecipients Json?");expect(schema).toContain("rejectedRecipients Json?");expect(delivery).toContain("normalizeRecipientEvidence")});
it("keeps automatic SMTP worker gated",()=>{expect(worker).not.toContain("executeSmtpNotificationDelivery");expect(worker).toContain("notification external delivery remains gated")});
});
