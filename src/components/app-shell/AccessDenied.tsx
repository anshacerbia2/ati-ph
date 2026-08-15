export function AccessDenied() {
  return (
    <section className="ati-card access-denied">
      <p className="eyebrow">Access control</p>
      <h2>Permission required</h2>
      <p>
        Your Keycloak identity is authenticated, but your ATI PH application
        role does not grant access to this page.
      </p>
    </section>
  );
}
