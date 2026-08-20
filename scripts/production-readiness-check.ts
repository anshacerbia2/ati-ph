import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";
import {
  evaluateProductionReadiness,
} from "@/operations/production-readiness";

const report =
  evaluateProductionReadiness(
    process.env,
  );
const smtp =
  resolveEmailAutomaticDeliveryRelease();

console.log(
  JSON.stringify(
    {
      ...report,
      smtp: {
        automaticEnabled:
          smtp.smtpAutomaticDeliveryEnabled,
        killSwitchActive:
          smtp.killSwitchActive,
        productionReleaseRequired:
          smtp.productionReleaseRequired,
        productionReleaseApproved:
          smtp.productionReleaseApproved,
        canExecuteAutomatically:
          smtp.canExecuteSmtpAutomatically,
        reasons: smtp.reasons,
      },
    },
    null,
    2,
  ),
);

if (!report.applicationReady) {
  process.exitCode = 1;
}
