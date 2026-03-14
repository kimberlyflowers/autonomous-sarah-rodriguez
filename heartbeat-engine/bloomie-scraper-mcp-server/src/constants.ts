/** Max characters in any single tool response */
export const CHARACTER_LIMIT = 25000;

/** Default number of results per scrape */
export const DEFAULT_LIMIT = 30;

/** HTTP request timeout in milliseconds */
export const REQUEST_TIMEOUT = 15000;

/** User-Agent to use for direct scraping requests */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Plan tiers — controls what tools a Bloomie owner has access to.
 * "free" is the baseline included with every Bloomie.
 */
export enum PlanTier {
  FREE = "free",
  LEAD_BOOSTER = "lead_booster",
  LEAD_PRO = "lead_pro",
}

/** Which tools each tier unlocks */
export const TIER_ACCESS: Record<PlanTier, string[]> = {
  [PlanTier.FREE]: [
    "scraper_check_access",
    "scraper_scrape_url",
    "scraper_search_businesses",
    "scraper_search_facebook_groups",
  ],
  [PlanTier.LEAD_BOOSTER]: [
    "scraper_check_access",
    "scraper_scrape_url",
    "scraper_search_businesses",
    "scraper_search_facebook_groups",
    "scraper_search_google_maps",
    "scraper_search_apollo",
  ],
  [PlanTier.LEAD_PRO]: [
    "scraper_check_access",
    "scraper_scrape_url",
    "scraper_search_businesses",
    "scraper_search_facebook_groups",
    "scraper_search_google_maps",
    "scraper_search_apollo",
    "scraper_search_linkedin",
  ],
};

/** Upsell messages keyed by tool name */
export const UPSELL_MESSAGES: Record<string, string> = {
  scraper_search_google_maps: `🔒 **Google Maps Search** requires the **Lead Booster** add-on ($29/month).

Here's what you'd get:
• Real business listings with verified phone numbers, addresses, ratings, and websites from Google Maps
• Way more data than free directories — Google has the most comprehensive local business database
• Verified emails from Apollo.io for every business found

I already pulled what I could from free sources. Want me to show you what Lead Booster would add? You can upgrade anytime at bloomiestaffing.com/upgrade.`,

  scraper_search_apollo: `🔒 **Apollo.io Contact Search** requires the **Lead Booster** add-on ($29/month).

Here's what you'd get:
• Verified business emails (not guesses — actually confirmed deliverable)
• Direct phone numbers and mobile numbers for decision makers
• 210+ million contacts across 30 million companies
• Job titles, company size, industry, and revenue data

I found some businesses from free sources, but Apollo would give you the actual emails and direct lines for the people you need to reach. Upgrade at bloomiestaffing.com/upgrade.`,

  scraper_search_linkedin: `🔒 **LinkedIn Search** requires the **Lead Pro** plan ($99/month).

Here's what you'd get:
• Full LinkedIn profile data — name, title, company, location, experience
• Up to 75 data points per person including education and job history
• Direct email discovery for LinkedIn profiles
• Bulk enrichment — turn a list of names into full professional profiles

This is the gold standard for B2B prospecting. Upgrade at bloomiestaffing.com/upgrade.`,
};

/** Response format enum */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}
