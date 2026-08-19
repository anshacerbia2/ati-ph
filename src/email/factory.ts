import type { ServerEnv } from "@/config/server-env";
import {
  EmailDeliveryEngine,
  EmailTransportRegistry,
} from "@/email/engine";
import { StaticEmailRouteResolver } from "@/email/static-routing";
import { SmtpEmailTransport } from "@/email/transports/smtp";
import { StreamEmailTransport } from "@/email/transports/stream";

export function createConfiguredEmailDelivery(env: ServerEnv) {
  if (env.EMAIL_DELIVERY_MODE === "DISABLED") return null;
  if (!env.EMAIL_FROM_ADDRESS) {
    throw new Error("EMAIL_FROM_ADDRESS is required when email delivery is enabled.");
  }

  const routes = new StaticEmailRouteResolver({
    identities: [
      {
        code: env.EMAIL_SENDER_IDENTITY_CODE,
        from: {
          email: env.EMAIL_FROM_ADDRESS,
          name: env.EMAIL_FROM_NAME,
        },
        replyTo: env.EMAIL_REPLY_TO ? { email: env.EMAIL_REPLY_TO } : null,
      },
    ],
    routes: [
      {
        senderIdentityCode: env.EMAIL_SENDER_IDENTITY_CODE,
        transportCode: env.EMAIL_TRANSPORT_CODE,
      },
    ],
  });

  const registry = new EmailTransportRegistry();

  if (env.EMAIL_DELIVERY_MODE === "STREAM") {
    registry.register(new StreamEmailTransport(env.EMAIL_TRANSPORT_CODE));
  } else {
    if (!env.EMAIL_SMTP_HOST) {
      throw new Error("EMAIL_SMTP_HOST is required for SMTP delivery.");
    }

    registry.register(
      new SmtpEmailTransport({
        code: env.EMAIL_TRANSPORT_CODE,
        host: env.EMAIL_SMTP_HOST,
        port: env.EMAIL_SMTP_PORT,
        secure: env.EMAIL_SMTP_SECURE === "true",
        requireTls: env.EMAIL_SMTP_REQUIRE_TLS === "true",
        username: env.EMAIL_SMTP_USER,
        password: env.EMAIL_SMTP_PASSWORD,
        connectionTimeoutMs: env.EMAIL_SMTP_CONNECTION_TIMEOUT_MS,
      }),
    );
  }

  return {
    engine: new EmailDeliveryEngine(routes, registry),
    senderIdentityCode: env.EMAIL_SENDER_IDENTITY_CODE,
    transportCode: env.EMAIL_TRANSPORT_CODE,
    mode: env.EMAIL_DELIVERY_MODE,
  };
}
