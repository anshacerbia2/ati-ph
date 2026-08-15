import { mountedPath } from "@/config/app";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true">PH</div>
        <h1>ATI One session required</h1>
        <p>
          Silent sign-in was unavailable inside the embedded view. Continue at
          the top level so Keycloak can safely complete authentication, then
          reopen Public Holiday Notifications from ATI One.
        </p>
        <a
          className="primary-button"
          href={`${mountedPath("/api/auth/login")}?interactive=1`}
          target="_top"
        >
          Continue with ATI One
        </a>
      </section>
    </main>
  );
}
