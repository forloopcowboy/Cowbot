import SuperTokens from 'supertokens-auth-react';
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword';
import Session from 'supertokens-auth-react/recipe/session';

// SuperTokens lives on its own subdomain in prod (auth.invest.example.com) so
// session cookies can be issued against the apex .invest.example.com and shared
// with invest.* and api.*. In dev this is unset and the vite proxy forwards
// /auth from window.location.origin.
const apiDomain =
  import.meta.env.VITE_AUTH_ORIGIN ??
  import.meta.env.VITE_API_DOMAIN ??
  window.location.origin;
const webDomain = window.location.origin;

let initialized = false;
export function initSuperTokensWeb(): void {
  if (initialized) return;
  initialized = true;
  SuperTokens.init({
    appInfo: {
      appName: 'Investment Plan',
      apiDomain,
      websiteDomain: webDomain,
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
