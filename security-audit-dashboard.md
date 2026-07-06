# EuroScale Dashboard — Client-Side Security Audit

**Audit Date:** 2026-07-06  
**Auditor:** Hermes Agent (Agent 2 — Dashboard / Client-Side Security)  
**Scope:** `dashboard/` — Next.js 16 + React 19 frontend  
**Risk Ratings:** CRITICAL · HIGH · MEDIUM · LOW · INFO  

---

## Summary

**Overall Client-Side Risk Level: MEDIUM-HIGH**

The dashboard has solid fundamentals: a proper BFF proxy pattern, HttpOnly session cookies via Better Auth + `nextCookies()`, no XSS vectors (`dangerouslySetInnerHTML`), and secrets are correctly kept server-side. However, **three HIGH-severity gaps** pull the rating up: (1) no Content Security Policy or security headers at all, (2) no server-side middleware for route protection — all auth gating is client-side only, and (3) Next.js 16 is a canary/pre-release version running in what appears to be a production context. Additionally, error messages from the BFF proxies leak internal details, and DB defaults are hardcoded in source.

---

## Findings

### Finding 1 — Missing Content Security Policy & Security Headers [HIGH]

**File:** `dashboard/next.config.ts` (lines 1–7)  
**Description:** The Next.js config contains only `reactStrictMode: true`. No CSP, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Strict-Transport-Security`, no `Referrer-Policy`, no `Permissions-Policy`. This leaves the dashboard completely unhardened against XSS, clickjacking, MIME-sniffing, and downgrade attacks.

**Fix:**
```ts
// next.config.ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'", // Next.js requires 'unsafe-inline' for RSC
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://api.euroscale.app",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
```

---

### Finding 2 — No Server-Side Route Protection (No Middleware) [HIGH]

**File:** `dashboard/` (missing `middleware.ts` at root)  
**Description:** All authentication gating is done client-side via the `AuthGuard` component in `src/app/dashboard/layout.tsx`. An unauthenticated user can still request dashboard pages and the server will render the loading skeleton before the client-side redirect kicks in. There is no `middleware.ts` to intercept requests at the edge and redirect unauthenticated users to `/login` before any page data is sent.

**Fix:** Create `dashboard/src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const PROTECTED = ["/dashboard"];
const PUBLIC = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
```

---

### Finding 3 — Next.js 16 Pre-Release in Production Context [HIGH]

**File:** `dashboard/package.json` (line 34)  
**Description:** `next@^16.2.0` is used. As of July 2026, Next.js 16.x is still a canary/pre-release channel. Using it for a customer-facing dashboard carries stability and security risk. Additionally, `npm audit` reports 2 moderate vulnerabilities: **CWE-79 / GHSA-qx2v-qp2m-jg93** — PostCSS XSS via unescaped `</style>` in CSS stringify output (affects postcss <8.5.10 used by Next.js's bundled PostCSS).

**Fix:** Pin to the latest stable Next.js 15.x (currently 15.3.x), and run `npx next upgrade` when 16 reaches stable. Alternatively, if 16.x features are critical, add `"overrides": { "postcss": ">=8.5.10" }` to `package.json` to mitigate the PostCSS CVE independently.

---

### Finding 4 — BFF Proxy Leaks Internal Error Details [MEDIUM]

**Files:**  
- `src/app/api/rest/[...path]/route.ts` (line 29)  
- `src/app/api/grpc/[...path]/route.ts` (line 31)  

**Description:** Both BFF proxies return raw error details to the client:
```ts
// REST proxy
return NextResponse.json({ error: "REST proxy error", details: String(e) }, { status: 502 });
// gRPC proxy
return NextResponse.json({ error: "API proxy error", details: String(err) }, { status: 502 });
```
`String(err)` can leak internal URLs, stack traces, or backend error messages. This is information disclosure.

**Fix:** Log the full error server-side; return a sanitized message to the client:
```ts
catch (e) {
  console.error("[REST proxy error]", e);
  return NextResponse.json({ error: "Upstream service unavailable" }, { status: 502 });
}
```

---

### Finding 5 — Hardcoded DB Default Credentials in Source [MEDIUM]

**File:** `src/lib/auth-server.ts` (lines 8–12)  
**Description:** Auth DB connection defaults are hardcoded:
```ts
const DB_PASS = process.env.AUTH_DB_PASS || "euroscale-auth";
const DB_USER = process.env.AUTH_DB_USER || "root";
```
If `AUTH_DB_PASS` is not set in production, the DB connects with the password `"euroscale-auth"`. While this likely fails in a properly configured environment, it's a dangerous fallback pattern.

**Fix:** Remove defaults for sensitive values; require explicit configuration or throw:
```ts
const DB_PASS = process.env.AUTH_DB_PASS;
if (!DB_PASS) throw new Error("AUTH_DB_PASS is required");
```

---

### Finding 6 — User ID Exposed in URL Query Parameters [MEDIUM]

**Files:**
- `src/app/dashboard/billing/page.tsx` (line 211) — `?user_id=${session.id}`
- `src/app/dashboard/backups/page.tsx` (line 146) — `?database_id=...&user_id=${session.id}`

**Description:** The billing page fetches invoices via `fetch` with the user ID in a query string. The backups page similarly includes `user_id` in query parameters. These IDs end up in server logs, browser history, and potentially referrer headers when users navigate away.

**Fix:** For the BFF REST proxy, the user ID is already extracted from the session server-side in the route handler. Remove the client-side `user_id` query parameter — the BFF already injects `X-User-ID` header. For the billing page, change:
```ts
// Before
fetch(`${API_BASE_URL}/api/v1/invoices?user_id=${encodeURIComponent(session.id)}`)
// After — the BFF proxy adds X-User-ID server-side
fetch(`${API_BASE_URL}/api/v1/invoices`)
```

---

### Finding 7 — gRPC Proxy Only Exposes POST Method [LOW]

**File:** `src/app/api/grpc/[...path]/route.ts` (line 7)  
**Description:** The gRPC BFF proxy only exports `POST`, while the REST proxy exports `GET`, `POST`, `PUT`, `DELETE`. Connect/gRPC-web only uses POST, so this is functionally fine, but it's inconsistent and could surprise future developers who try to use other HTTP methods through this route.

---

### Finding 8 — `copyToClipboard` Uses Deprecated `execCommand` [LOW]

**File:** `src/lib/utils.ts` (lines 43–69)  
**Description:** The clipboard fallback uses `document.execCommand("copy")` which is deprecated and may be removed from browsers. The credential-copy path (passwords!) relies on this. While a fallback is good hygiene, the deprecated API is an attack-surface concern long-term.

**Fix:** Drop the `execCommand` fallback and rely solely on `navigator.clipboard.writeText()`, which has 97%+ browser support. If a fallback is still needed, surface an error to the user instead.

---

### Finding 9 — Session ID Partially Exposed in Settings UI [LOW]

**File:** `src/app/dashboard/settings/page.tsx` (lines 242–243)  
**Description:** The settings page displays a truncated session/user ID:
```tsx
{session?.id ? "usr_" + session.id.slice(0, 8) : "…"}
```
This exposes the first 8 characters of the user ID. While not directly exploitable, it's unnecessary information disclosure, especially if IDs are UUIDs where the first bytes are predictable.

---

### Finding 10 — External PDF Links Without Integrity Check [LOW]

**File:** `src/app/dashboard/billing/page.tsx` (lines 449–457)  
**Description:** Invoice PDF URLs from the backend (`inv.pdf_url`) are rendered as direct `<a>` links with `target="_blank"`. If the backend returns a URL to a malicious site (compromised backend, MITM), users could be phished.

**Fix:** Validate that `pdf_url` belongs to an expected domain, or route PDF downloads through the BFF proxy.

---

## Good Practices Observed ✅

| Practice | Detail |
|---|---|
| **HttpOnly session cookies** | Better Auth + `nextCookies()` plugin — sessions are never accessible to JS |
| **BFF proxy pattern** | All API calls go through `/api/rest` and `/api/grpc` server routes |
| **Server-side secrets** | `EUROSCALE_API_KEY`, OAuth secrets, DB credentials are `process.env` only (no `NEXT_PUBLIC_` prefix) |
| **No `dangerouslySetInnerHTML`** | Zero instances across the entire codebase |
| **`react-hot-toast` removed** | Cleanly replaced with `sonner` — no stale dependency |
| **Credential one-time display** | `CreateDBForm` shows credentials once with masked defaults and a prominent warning |
| **`suppressHydrationWarning` scoped** | Only on the `<html>` tag, not blanket |
| **`noValidate` on forms** | Prevents browser-native validation from interfering with custom validation |
| **PDF links use `noopener noreferrer`** | Mitigates tab-napping on external links |
| **Client-side logout** | `authClient.signOut()` properly invalidates the session |
| **React Query staleTime** | 30s stale time prevents excessive refetching |

---

## Recommendations Summary (Priority Order)

1. **🔴 Add CSP and security headers** in `next.config.ts` — immediately
2. **🔴 Create `middleware.ts`** for server-side auth gating on all `/dashboard/*` routes
3. **🔴 Pin to stable Next.js** (15.x) or add PostCSS override to fix CVE
4. **🟡 Sanitize BFF proxy error responses** — don't leak `String(err)`
5. **🟡 Remove hardcoded DB defaults** in `auth-server.ts` — require env vars or throw
6. **🟡 Remove `user_id` from client-side query parameters** — the BFF already injects it
7. **🟢 Replace `execCommand("copy")` fallback** with pure Clipboard API
8. **🟢 Add audit logging** for sensitive operations (credential rotation, DB deletion)

---

**Total dependencies:** 23 direct prod · 7 direct dev · 202 total installed (incl. transitive + optional)  
**Known CVEs:** 2 moderate via PostCSS (bundled by Next.js)  
**No `react-hot-toast` or other stale packages found**
