import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Dashboard from 'supertokens-node/recipe/dashboard';

let initialized = false;

export function initSuperTokens(): void {
  if (initialized) return;
  initialized = true;

  const apiDomain = process.env.API_DOMAIN ?? `http://localhost:${process.env.PORT ?? 3000}`;
  // WEB_ORIGIN may be a comma-separated list of allowed CORS origins
  // (e.g. "https://invest.example.com,https://api.invest.example.com,...").
  // SuperTokens' websiteDomain must be a single URL — the SPA's public origin —
  // so take the first entry. CORS still allows all of them (see main.ts).
  const webDomain =
    (process.env.WEB_ORIGIN ?? 'http://localhost:4200')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? 'http://localhost:4200';
  // In prod set this to ".invest.example.com" so the session cookie issued by
  // auth.invest.example.com is also sent from invest.example.com and api.*.
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  supertokens.init({
    framework: 'express',
    supertokens: {
      connectionURI:
        process.env.SUPERTOKENS_CONNECTION_URI ?? 'http://localhost:3567',
      apiKey: process.env.SUPERTOKENS_API_KEY,
    },
    appInfo: {
      appName: 'Investment Plan',
      apiDomain,
      websiteDomain: webDomain,
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      EmailPassword.init(),
      Session.init({ cookieDomain }),
      Dashboard.init(),
    ],
  });
}
