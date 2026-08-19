import type {
  EmailRouteResolver,
  EmailSenderIdentity,
} from "@/email/contracts";

export class StaticEmailRouteResolver implements EmailRouteResolver {
  private readonly identities = new Map<string, EmailSenderIdentity>();
  private readonly routes = new Map<string, string>();

  constructor(input: {
    identities: EmailSenderIdentity[];
    routes: Array<{ senderIdentityCode: string; transportCode: string }>;
  }) {
    for (const identity of input.identities) {
      const code = normalize(identity.code);
      if (this.identities.has(code)) {
        throw new Error(`Duplicate email sender identity ${code}.`);
      }
      this.identities.set(code, { ...identity, code });
    }

    for (const route of input.routes) {
      const code = normalize(route.senderIdentityCode);
      if (this.routes.has(code)) {
        throw new Error(`Duplicate email route for ${code}.`);
      }
      this.routes.set(code, normalize(route.transportCode));
    }
  }

  async resolve(senderIdentityCode: string) {
    const code = normalize(senderIdentityCode);
    const senderIdentity = this.identities.get(code);
    const transportCode = this.routes.get(code);

    if (!senderIdentity) {
      throw new Error(`Email sender identity ${code} is not configured.`);
    }
    if (!transportCode) {
      throw new Error(`Email sender identity ${code} has no transport route.`);
    }

    return { senderIdentity, transportCode };
  }
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}
