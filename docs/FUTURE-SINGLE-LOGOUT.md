# Future Authentication and Single Logout

| Metadata | Value |
| --- | --- |
| Status | Refresh/revocation foundation implemented; cross-application logout remains future work |
| Date | 2026-08-15 |
| Scope | ATI PH authentication lifecycle and cross-application logout |
| Current client | Shared Keycloak client `ati-one-portal` |
| Target client | Dedicated Keycloak client owned by ATI PH |

## Purpose

ATI PH currently reuses the ATI One Keycloak client as an explicit temporary
decision. It still owns a separate database-backed session and the
`ati_ph_session` cookie. This is sufficient for authentication and local logout,
but it is not a complete single-logout design.

This document records the known limitation and the preferred future design so a
working temporary implementation is not mistaken for the final security model.

## Current behavior

### Sign-in

1. ATI PH checks its own `ati_ph_session` cookie and database session.
2. If no valid application session exists, ATI PH starts an OIDC Authorization
   Code Flow with state, nonce, and PKCE.
3. Keycloak may reuse its existing realm SSO session.
4. ATI PH validates the callback and token set, then creates its own session.

ATI One does not pass its cookie or token to ATI PH. The applications share an
OIDC client registration temporarily, not an application session.

### Local ATI PH logout

ATI PH deletes its own session and cookie. It intentionally does not end the
Keycloak SSO session, so leaving ATI PH does not unexpectedly sign the user out
of ATI One and every other relying party.

Because the Keycloak SSO session remains active, opening ATI PH again can create
a new ATI PH session without asking for credentials.

### Implemented session freshness control

ATI PH does not contact Keycloak on every page request. It checks the encrypted
access-token expiry stored with the server-side session. When the token enters a
configurable 30-second refresh window, ATI PH performs a refresh-token grant.

Concurrent requests for one session share one refresh result per process. The
database update also uses optimistic concurrency so a stale result from another
process cannot overwrite or revoke a newer session state. A successful refresh
replaces the encrypted token payload without extending the absolute session
maximum age. A missing or refused refresh, invalid replacement access token,
inactive user, or unreadable token payload revokes the local database session.

Successful refresh is recorded through operational logging or metrics rather
than a permanent audit row. Login, explicit logout, and security-relevant
revocation are permanent audit events.

This bounds the lifetime of a Keycloak-side revocation by the access-token
lifetime, but it does not replace immediate front-channel or back-channel single
logout.

### ATI One or Keycloak logout

ATI One performs RP-initiated logout and asks Keycloak to end the SSO session
using an ID token hint. ATI One also clears internal-app cookies that match its
cookie naming convention.

The current ATI PH cookie does not follow that convention. More importantly,
clearing a browser cookie alone cannot revoke the corresponding ATI PH database
session. If the ATI PH application session is still valid, ATI PH does not
contact Keycloak on every request and can continue accepting that session after
the Keycloak SSO session has ended.

This is the known single-logout gap.

## Target behavior

### Application-local logout

An explicit **Sign out of ATI PH** action must:

1. Revoke the ATI PH database session.
2. Clear the ATI PH cookie using the exact name, path, and security attributes
   used when it was created.
3. Leave the Keycloak SSO session active.
4. Return the browser to ATI One.

### Global logout

An explicit **Sign out everywhere** action must:

1. Revoke the initiating application's local session.
2. Send the browser to Keycloak's discovered `end_session_endpoint` with a valid
   `id_token_hint` and registered `post_logout_redirect_uri`.
3. End the Keycloak SSO session.
4. Cause Keycloak to notify each registered relying party through OIDC
   Back-Channel Logout.
5. Make ATI PH validate the signed logout token and revoke every matching
   database session.

The browser cookie may remain until the next response, but it becomes harmless
as soon as its server-side session is revoked.

## Why Back-Channel Logout is preferred

Back-channel notification reaches the ATI PH server directly and does not
depend on iframe loading, third-party-cookie behavior, browser timing, or one
application knowing another application's cookie format. It can invalidate the
database session even when the user's browser is closed.

Front-channel logout can remain an optional compatibility mechanism, but it
must not be the only server-side revocation control.

## Dedicated-client prerequisite

The preferred production model gives ATI PH its own Keycloak client, for
example `ati-ph-app`. That client owns its own:

- Client secret and rotation lifecycle
- Redirect URI allow-list
- Post-logout redirect URI allow-list
- Front-channel or back-channel logout URL
- Token `azp`, audience, and policy
- Incident and revocation boundary

The shared `ati-one-portal` client makes relying-party attribution and logout
endpoint ownership ambiguous. It is acceptable only as a time-bounded internal
exception. A dedicated client should be created before relying on Keycloak to
deliver independent logout notifications to ATI PH.

## Proposed implementation

### Session model

Persist the Keycloak session identifier from the validated ID token alongside
the ATI PH session:

```text
auth_session.id
auth_session.user_id
auth_session.keycloak_sid
auth_session.keycloak_sub
auth_session.keycloak_client_id
auth_session.revoked_at
auth_session.expires_at
```

Do not use email as a logout or identity key.

### Back-channel endpoint

Add a public server-to-server endpoint under the mounted application path:

```text
/apps/ph-notification/app/api/auth/backchannel-logout
```

The endpoint must:

1. Accept the OIDC `logout_token` form parameter.
2. Verify its signature using the Keycloak realm JWKS.
3. Validate issuer, audience, issued time, expiry, and token type constraints.
4. Require the back-channel logout event claim.
5. Require `sid`, `sub`, or both according to the registered Keycloak behavior.
6. Reject a token containing `nonce`.
7. Prevent replay using `jti` for the token's usable lifetime.
8. Revoke matching ATI PH sessions idempotently.
9. Return a generic response without exposing whether a user or session existed.

No user account, holiday data, audit history, or application role is deleted by
a logout notification.

### Session enforcement

Every protected request continues to resolve the opaque ATI PH cookie against
the database. A revoked, expired, or missing session is rejected before domain
data is accessed. ATI PH does not call Keycloak on every application request.

Refresh refusal and verified logout notification both revoke the local session.

## Delivery sequence

1. Approve a dedicated ATI PH Keycloak client and named credential owner.
2. Register production, staging, and local callback/logout URI allow-lists.
3. Add `sid`, `sub`, client, and revocation data to the ATI PH persistence model.
   **Implemented 2026-08-15.** Logout-token replay storage remains future work.
4. Capture the validated Keycloak `sid` during login. **Implemented 2026-08-15.**
5. Implement and test the back-channel logout endpoint.
6. Configure the ATI PH back-channel logout URL in Keycloak.
7. Separate **Sign out of ATI PH** from **Sign out everywhere** in the UI.
8. Run end-to-end tests initiated from ATI PH, ATI One, Keycloak administration,
   and another relying party.
9. Remove the shared-client exception after migration evidence is accepted.

## Acceptance criteria

| Scenario | Expected result |
| --- | --- |
| User signs out of ATI PH only | ATI PH session is revoked; ATI One and Keycloak SSO remain active |
| User signs out everywhere from ATI PH | ATI PH session, Keycloak SSO, and notified relying-party sessions are revoked |
| User signs out from ATI One | Keycloak SSO ends and ATI PH receives a verified logout notification that revokes its database session |
| Administrator terminates the Keycloak session | ATI PH session becomes unusable without waiting for its normal maximum age |
| Browser replays a cookie after back-channel logout | ATI PH rejects it because the database session is revoked |
| Logout token is unsigned, expired, for another client, or replayed | ATI PH rejects it without changing sessions |
| Keycloak is temporarily unavailable during local logout | ATI PH local session is still revoked |

## Explicit non-solutions

- Do not treat deletion of another application's cookie as server-side session
  revocation.
- Do not share ATI One's application session secret, cookie, or session table.
- Do not poll or introspect Keycloak on every protected request.
- Do not accept an unverified `sid` or `sub` from a browser request as a logout
  instruction.
- Do not keep the shared Keycloak client indefinitely merely to avoid client
  registration work.
- Do not modify ATI One source as part of the ATI PH implementation without a
  separately approved ATI One change request.

## Standards references

- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [OpenID Connect Front-Channel Logout 1.0](https://openid.net/specs/openid-connect-frontchannel-1_0.html)
