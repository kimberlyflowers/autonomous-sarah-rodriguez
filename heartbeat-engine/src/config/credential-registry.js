// Credential Registry for Sarah's Browser Automation
// Stores site credentials as references to environment variables (never plain text in code)
// Sarah looks up credentials by site name when browser_task needs to log in

import { createLogger } from '../logging/logger.js';
const logger = createLogger('credential-registry');

/**
 * Site registry — maps site names to their env var keys and login metadata.
 * Actual credentials live ONLY in Railway environment variables.
 *
 * To add a new site:
 * 1. Add an entry here with the env var names
 * 2. Set the actual values in Railway dashboard → Variables
 *
 * Env var naming convention: SITE_{SITENAME}_{FIELD}
 * Example: SITE_QUORA_EMAIL, SITE_QUORA_PASSWORD
 */
const SITE_REGISTRY = {
  // ── Social / Forum Sites ──
  quora: {
    name: 'Quora',
    domain: 'quora.com',
    loginUrl: 'https://www.quora.com/login',
    emailEnv: 'SITE_QUORA_EMAIL',
    passwordEnv: 'SITE_QUORA_PASSWORD',
    loginSelectors: {
      email: 'input[name="email"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]'
    },
    notes: 'Use email/password login. May require CAPTCHA bypass.'
  },

  reddit: {
    name: 'Reddit',
    domain: 'reddit.com',
    loginUrl: 'https://www.reddit.com/login',
    emailEnv: 'SITE_REDDIT_EMAIL',
    passwordEnv: 'SITE_REDDIT_PASSWORD',
    loginSelectors: {
      email: '#login-username',
      password: '#login-password',
      submit: 'button[type="submit"]'
    },
    notes: 'Use username/password. May have 2FA.'
  },

  facebook: {
    name: 'Facebook',
    domain: 'facebook.com',
    loginUrl: 'https://www.facebook.com/login',
    emailEnv: 'SITE_FACEBOOK_EMAIL',
    passwordEnv: 'SITE_FACEBOOK_PASSWORD',
    loginSelectors: {
      email: '#email',
      password: '#pass',
      submit: 'button[name="login"]'
    },
    notes: 'Business account preferred. May trigger security check.'
  },

  linkedin: {
    name: 'LinkedIn',
    domain: 'linkedin.com',
    loginUrl: 'https://www.linkedin.com/login',
    emailEnv: 'SITE_LINKEDIN_EMAIL',
    passwordEnv: 'SITE_LINKEDIN_PASSWORD',
    loginSelectors: {
      email: '#username',
      password: '#password',
      submit: 'button[type="submit"]'
    },
    notes: 'Professional account. Rate limited on actions.'
  },

  twitter: {
    name: 'Twitter / X',
    domain: 'x.com',
    loginUrl: 'https://x.com/i/flow/login',
    emailEnv: 'SITE_TWITTER_EMAIL',
    passwordEnv: 'SITE_TWITTER_PASSWORD',
    loginSelectors: {
      email: 'input[autocomplete="username"]',
      password: 'input[type="password"]',
      submit: 'button[data-testid="LoginForm_Login_Button"]'
    },
    notes: 'May require phone verification.'
  },

  instagram: {
    name: 'Instagram',
    domain: 'instagram.com',
    loginUrl: 'https://www.instagram.com/accounts/login/',
    emailEnv: 'SITE_INSTAGRAM_EMAIL',
    passwordEnv: 'SITE_INSTAGRAM_PASSWORD',
    loginSelectors: {
      email: 'input[name="username"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]'
    },
    notes: 'Business account. May require 2FA.'
  },

  // ── Business Tools ──
  canva: {
    name: 'Canva',
    domain: 'canva.com',
    loginUrl: 'https://www.canva.com/login',
    emailEnv: 'SITE_CANVA_EMAIL',
    passwordEnv: 'SITE_CANVA_PASSWORD',
    loginSelectors: {},
    notes: 'Use Google SSO if available.'
  },

  wordpress: {
    name: 'WordPress',
    domain: '',
    loginUrl: '',
    emailEnv: 'SITE_WORDPRESS_EMAIL',
    passwordEnv: 'SITE_WORDPRESS_PASSWORD',
    loginSelectors: {
      email: '#user_login',
      password: '#user_pass',
      submit: '#wp-submit'
    },
    notes: 'Domain-specific. Set loginUrl in metadata.'
  },

  // ── Email (already wired via Gmail API, this is for browser fallback) ──
  gmail: {
    name: 'Gmail',
    domain: 'gmail.com',
    loginUrl: 'https://accounts.google.com/signin',
    emailEnv: 'SITE_GMAIL_EMAIL',
    passwordEnv: 'SITE_GMAIL_PASSWORD',
    loginSelectors: {
      email: 'input[type="email"]',
      password: 'input[type="password"]'
    },
    notes: 'Prefer Gmail API tools over browser login. Browser login as fallback only.'
  }
};

/**
 * Get credentials for a site
 * Returns { email, password, ...siteConfig } or null if not configured
 */
export function getCredentials(siteName) {
  const site = SITE_REGISTRY[siteName.toLowerCase()];
  if (!site) {
    logger.warn(`Site "${siteName}" not found in credential registry`);
    return null;
  }

  const email = process.env[site.emailEnv];
  const password = process.env[site.passwordEnv];

  if (!email || !password) {
    logger.warn(`Credentials not configured for ${site.name}. Set ${site.emailEnv} and ${site.passwordEnv} in Railway env vars.`);
    return { ...site, configured: false, email: null, password: null };
  }

  return {
    ...site,
    configured: true,
    email,
    password
  };
}

/**
 * List all registered sites and their configuration status
 */
export function listSites() {
  return Object.entries(SITE_REGISTRY).map(([key, site]) => ({
    key,
    name: site.name,
    domain: site.domain,
    configured: !!(process.env[site.emailEnv] && process.env[site.passwordEnv]),
    emailEnv: site.emailEnv,
    passwordEnv: site.passwordEnv
  }));
}

/**
 * Check if a site has credentials configured
 */
export function isSiteConfigured(siteName) {
  const site = SITE_REGISTRY[siteName.toLowerCase()];
  if (!site) return false;
  return !!(process.env[site.emailEnv] && process.env[site.passwordEnv]);
}

/**
 * Get login instructions for browser_task
 * Returns a formatted instruction string Sarah can pass to browser_task
 */
export function getLoginInstructions(siteName) {
  const creds = getCredentials(siteName);
  if (!creds) return null;
  if (!creds.configured) return { error: `Credentials not set. Ask Kimberly to add ${creds.emailEnv} and ${creds.passwordEnv} to Railway.` };

  return {
    url: creds.loginUrl,
    steps: [
      `Navigate to ${creds.loginUrl}`,
      `Enter email: ${creds.email}`,
      `Enter password: ${creds.password}`,
      `Click submit/login button`,
      `Wait for dashboard or home page to load`
    ],
    selectors: creds.loginSelectors,
    notes: creds.notes
  };
}

/**
 * Get the full registry (for dashboard display — never exposes passwords)
 */
export function getRegistrySummary() {
  return Object.entries(SITE_REGISTRY).map(([key, site]) => ({
    key,
    name: site.name,
    domain: site.domain,
    loginUrl: site.loginUrl,
    configured: !!(process.env[site.emailEnv] && process.env[site.passwordEnv]),
    emailEnv: site.emailEnv,
    passwordEnv: site.passwordEnv,
    notes: site.notes
  }));
}

export { SITE_REGISTRY };
