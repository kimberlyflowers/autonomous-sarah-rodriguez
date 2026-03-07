// ─────────────────────────────────────────────────────────────────────────────
// BLOOM Lead Scraper Tools
// Autonomous lead list building from public web directories
// Uses browser-service directly (bypasses browser-use sidecar for speed)
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from '../logging/logger.js';

const logger = createLogger('scrape-tools');

// ── Known Directory Configs ───────────────────────────────────────────────────
// Pre-configured scrapers for the most common lead sources.
// Sarah uses these when the source_url matches a known directory.

const DIRECTORY_CONFIGS = {
  'napfa.org': {
    name: 'NAPFA',
    searchUrl: 'https://www.napfa.org/find-an-advisor',
    paginationType: 'button', // 'button' | 'url' | 'scroll'
    nextButtonSelector: 'a.next, button.next, [aria-label="Next page"]',
    resultSelector: '.advisor-card, .member-card, .result-item',
    fields: {
      name: '.advisor-name, h3, .name',
      firm: '.firm-name, .company',
      city: '.city',
      state: '.state',
      phone: '.phone, a[href^="tel:"]',
      website: 'a[href^="http"]:not([href*="napfa"])',
      email: 'a[href^="mailto:"]',
    },
    politeDelayMs: 2500,
  },
  'cfp.net': {
    name: 'CFP Board',
    searchUrl: 'https://www.cfp.net/find-a-cfp-professional',
    paginationType: 'button',
    nextButtonSelector: 'button[aria-label="Next"], .pagination-next',
    resultSelector: '.professional-card, .result-row, .advisor-result',
    fields: {
      name: '.professional-name, h3',
      firm: '.company-name, .employer',
      city: '.city, .location',
      state: '.state',
      phone: 'a[href^="tel:"]',
      website: '.website a, a.website',
      email: 'a[href^="mailto:"]',
    },
    politeDelayMs: 2500,
  },
  'brokercheck.finra.org': {
    name: 'FINRA BrokerCheck',
    searchUrl: 'https://brokercheck.finra.org',
    paginationType: 'button',
    nextButtonSelector: '[aria-label="next page"], .bc-pagination-next',
    resultSelector: '.bc-result-card, .individual-result',
    fields: {
      name: '.bc-individual-name, h2',
      firm: '.bc-firm-name, .employer-name',
      city: '.bc-location-city',
      state: '.bc-location-state',
    },
    politeDelayMs: 3000, // FINRA is slower — be more polite
  },
  'xyplanningnetwork.com': {
    name: 'XY Planning Network',
    searchUrl: 'https://www.xyplanningnetwork.com/members',
    paginationType: 'url', // appends ?page=2, ?page=3 etc
    pageParam: 'page',
    resultSelector: '.member-card, .advisor-card',
    fields: {
      name: 'h3, .member-name',
      firm: '.firm, .company',
      city: '.city',
      state: '.state',
      website: 'a.website, .member-website a',
      email: 'a[href^="mailto:"]',
    },
    politeDelayMs: 2000,
  },
};

// ── Tool Definitions ──────────────────────────────────────────────────────────

export const scrapeToolDefinitions = {
  scrape_leads: {
    name: 'scrape_leads',
    description: `Build a targeted lead list by scraping a public web directory or website. 
    Navigates pages automatically, extracts contact information, deduplicates, and imports into BLOOM CRM with tags.
    Use this for lead generation from NAPFA, CFP Board, FINRA BrokerCheck, XY Planning Network, chamber of commerce directories, or any public business directory.
    Returns a summary of leads found, added to CRM, and any errors.`,
    parameters: {
      type: 'object',
      properties: {
        source_url: {
          type: 'string',
          description: 'URL of the directory or page to scrape (e.g. https://www.napfa.org/find-an-advisor)',
        },
        target_description: {
          type: 'string',
          description: 'Human-readable description of who we are targeting (e.g. "fee-only financial advisors in Texas")',
        },
        search_params: {
          type: 'object',
          description: 'Optional search/filter parameters to apply on the directory (e.g. { state: "TX", city: "San Antonio" })',
        },
        max_leads: {
          type: 'integer',
          description: 'Maximum number of leads to collect (default 100, max 500 per run)',
          default: 100,
        },
        fields_to_extract: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to extract: name, firm, city, state, phone, email, website, title',
          default: ['name', 'firm', 'city', 'state', 'phone', 'email', 'website'],
        },
        crm_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to apply in GHL CRM (e.g. ["lead:financial-advisor", "source:napfa", "state:tx"])',
          default: [],
        },
        campaign: {
          type: 'string',
          description: 'Campaign name to associate leads with in CRM (optional)',
        },
        import_to_crm: {
          type: 'boolean',
          description: 'Whether to import leads into GHL CRM automatically (default true)',
          default: true,
        },
      },
      required: ['source_url', 'target_description'],
    },
    category: 'scraping',
    operation: 'read',
  },

  scrape_page_content: {
    name: 'scrape_page_content',
    description: `Extract structured data from a single web page. 
    Navigates to the URL and returns all text content, links, emails, and phone numbers found on the page.
    Use this for one-off extractions or when exploring a new directory before running a full scrape.`,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the page to extract content from',
        },
        extract_contacts: {
          type: 'boolean',
          description: 'Whether to extract emails and phone numbers specifically (default true)',
          default: true,
        },
        extract_links: {
          type: 'boolean',
          description: 'Whether to return all links on the page (default false)',
          default: false,
        },
      },
      required: ['url'],
    },
    category: 'scraping',
    operation: 'read',
  },
};

// ── Tool Executors ────────────────────────────────────────────────────────────

export const scrapeToolExecutors = {

  /**
   * scrape_leads — main lead generation tool
   * Handles navigation, pagination, extraction, dedup, CRM import
   */
  scrape_leads: async (params) => {
    const startTime = Date.now();
    const {
      source_url,
      target_description,
      search_params = {},
      max_leads = 100,
      crm_tags = [],
      campaign,
      import_to_crm = true,
    } = params;

    logger.info('Starting lead scrape', { source_url, target_description, max_leads });

    // Determine if this is a known directory
    const hostname = new URL(source_url).hostname.replace('www.', '');
    const config = DIRECTORY_CONFIGS[hostname];

    const leads = [];
    const errors = [];
    let pagesScraped = 0;

    try {
      const { getBrowserService } = await import('../browser/browser-service.js');
      const browser = getBrowserService();

      // ── Enable resource blocking for speed during scraping ──
      await browser.launch();

      let currentUrl = source_url;
      let hasNextPage = true;
      let pageNum = 1;

      while (hasNextPage && leads.length < max_leads) {
        try {
          logger.info(`Scraping page ${pageNum}: ${currentUrl}`);
          await browser.navigateFast(currentUrl);
          pagesScraped++;

          // Give the page a moment for any lazy-loaded content
          await new Promise(r => setTimeout(r, 500));

          // Extract contacts from current page using page.evaluate
          const pageLeads = await browser.page.evaluate((cfg) => {
            const results = [];

            // Generic extraction — works on most directories
            // Try to find cards/rows that represent individual advisors
            const selectors = cfg?.resultSelector?.split(', ') || [
              '.result', '.card', '.advisor', '.member', '.listing',
              '[class*="result"]', '[class*="advisor"]', '[class*="member"]',
              'li.item', 'tr.row',
            ];

            let cards = [];
            for (const sel of selectors) {
              const found = document.querySelectorAll(sel);
              if (found.length > 2) { // Need at least 3 to be a real list
                cards = Array.from(found);
                break;
              }
            }

            // If no cards found, fall back to email/phone extraction from full page
            if (cards.length === 0) {
              const emails = [...document.querySelectorAll('a[href^="mailto:"]')]
                .map(a => a.href.replace('mailto:', '').trim())
                .filter(e => e.includes('@'));
              const phones = [...document.querySelectorAll('a[href^="tel:"]')]
                .map(a => a.href.replace('tel:', '').trim());

              if (emails.length > 0) {
                emails.forEach((email, i) => {
                  results.push({ email, phone: phones[i] || null, source: 'page-fallback' });
                });
              }
              return results;
            }

            // Extract from each card
            for (const card of cards) {
              const lead = { source: 'card-extraction' };

              // Name — look for heading or strong text
              const nameEl = card.querySelector('h2, h3, h4, .name, [class*="name"], strong');
              if (nameEl) lead.name = nameEl.textContent.trim();

              // Company/firm
              const firmEl = card.querySelector('.firm, .company, [class*="firm"], [class*="company"]');
              if (firmEl) lead.firm = firmEl.textContent.trim();

              // Location
              const locEl = card.querySelector('.location, .city, [class*="location"], [class*="city"]');
              if (locEl) lead.location = locEl.textContent.trim();

              // Email
              const emailLink = card.querySelector('a[href^="mailto:"]');
              if (emailLink) lead.email = emailLink.href.replace('mailto:', '').trim();

              // Phone
              const phoneLink = card.querySelector('a[href^="tel:"]');
              if (phoneLink) lead.phone = phoneLink.href.replace('tel:', '').trim();

              // Website
              const websiteLink = card.querySelector('a[href^="http"]:not([href*="napfa"]):not([href*="cfp.net"])');
              if (websiteLink) lead.website = websiteLink.href;

              // Only add if we got at least a name or email
              if (lead.name || lead.email) {
                results.push(lead);
              }
            }

            return results;
          }, config || null);

          logger.info(`Page ${pageNum}: found ${pageLeads.length} leads`);
          leads.push(...pageLeads.slice(0, max_leads - leads.length));

          // ── Pagination ──
          if (config?.paginationType === 'url' && config.pageParam) {
            // URL-based pagination: append ?page=N
            const url = new URL(currentUrl);
            url.searchParams.set(config.pageParam, pageNum + 1);
            currentUrl = url.toString();
            pageNum++;
            hasNextPage = pageLeads.length > 0; // Stop if page was empty
          } else if (config?.paginationType === 'button') {
            // Check for next button
            const hasNext = await browser.page.evaluate((sel) => {
              const btn = document.querySelector(sel);
              return btn && !btn.disabled && !btn.closest('[aria-disabled="true"]');
            }, config.nextButtonSelector || 'a.next, button.next');

            if (hasNext) {
              await browser.page.click(config.nextButtonSelector || 'a.next, button.next');
              pageNum++;
            } else {
              hasNextPage = false;
            }
          } else {
            // Unknown pagination — just do one page
            hasNextPage = false;
          }

          // Polite delay between pages
          const delay = config?.politeDelayMs || 2500;
          await new Promise(r => setTimeout(r, delay));

        } catch (pageError) {
          logger.warn(`Error on page ${pageNum}: ${pageError.message}`);
          errors.push(`Page ${pageNum}: ${pageError.message}`);
          hasNextPage = false; // Stop on error
        }
      }

      // ── CRM Import ──
      let imported = 0;
      let skipped = 0;
      let importErrors = 0;

      if (import_to_crm && leads.length > 0) {
        logger.info(`Importing ${leads.length} leads to CRM...`);

        // Import via GHL tools (lazy import to avoid circular deps)
        try {
          const { executeGHLTool } = await import('./ghl-tools.js');

          for (const lead of leads) {
            try {
              // Build contact object
              const contact = {
                firstName: lead.name?.split(' ')[0] || '',
                lastName: lead.name?.split(' ').slice(1).join(' ') || '',
                companyName: lead.firm || '',
                email: lead.email || '',
                phone: lead.phone || '',
                website: lead.website || '',
                tags: [
                  ...crm_tags,
                  `source:${config?.name?.toLowerCase() || hostname}`,
                  ...(campaign ? [`campaign:${campaign}`] : []),
                ],
                customField: {
                  lead_source: config?.name || hostname,
                  location: lead.location || '',
                },
              };

              // Skip if no identifiable info
              if (!contact.email && !contact.phone && !contact.firstName) {
                skipped++;
                continue;
              }

              // Search for existing contact first (dedup by email)
              if (contact.email) {
                const existing = await executeGHLTool('ghl_search_contacts', { query: contact.email });
                if (existing?.contacts?.length > 0) {
                  skipped++;
                  continue;
                }
              }

              await executeGHLTool('ghl_create_contact', contact);
              imported++;

            } catch (contactError) {
              importErrors++;
              logger.warn(`Failed to import lead: ${contactError.message}`);
            }
          }
        } catch (ghlError) {
          logger.error('GHL import failed:', ghlError.message);
          errors.push(`CRM import failed: ${ghlError.message}`);
        }
      }

      const duration = Date.now() - startTime;

      const summary = [
        `✅ Lead Scrape Complete`,
        `Source: ${config?.name || hostname} (${target_description})`,
        `Pages scraped: ${pagesScraped}`,
        `Leads extracted: ${leads.length}`,
        ...(import_to_crm ? [
          `New contacts added to CRM: ${imported}`,
          `Skipped (duplicates or incomplete): ${skipped}`,
          `Import errors: ${importErrors}`,
        ] : ['CRM import: skipped (import_to_crm=false)']),
        ...(crm_tags.length ? [`CRM tags applied: ${crm_tags.join(', ')}`] : []),
        ...(errors.length ? [`Warnings: ${errors.join('; ')}`] : []),
        `Duration: ${Math.round(duration / 1000)}s`,
      ].join('\n');

      logger.info('Lead scrape complete', { leads: leads.length, imported, skipped, duration });

      return {
        success: true,
        leads_extracted: leads.length,
        leads_imported: imported,
        leads_skipped: skipped,
        pages_scraped: pagesScraped,
        errors,
        leads_preview: leads.slice(0, 5), // First 5 for verification
        summary,
        message: summary,
      };

    } catch (error) {
      logger.error('Lead scrape failed:', error.message);
      return {
        success: false,
        error: error.message,
        leads_extracted: leads.length,
        pages_scraped: pagesScraped,
        message: `❌ Lead scrape failed: ${error.message}. Extracted ${leads.length} leads before failure.`,
      };
    }
  },

  /**
   * scrape_page_content — single page extraction
   */
  scrape_page_content: async (params) => {
    const { url, extract_contacts = true, extract_links = false } = params;

    try {
      const { getBrowserService } = await import('../browser/browser-service.js');
      const browser = getBrowserService();
      await browser.navigate(url);

      const result = await browser.page.evaluate((opts) => {
        const data = {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText.slice(0, 5000),
        };

        if (opts.extract_contacts) {
          data.emails = [...new Set(
            [...document.querySelectorAll('a[href^="mailto:"]')]
              .map(a => a.href.replace('mailto:', '').trim())
              .filter(e => e.includes('@'))
          )];
          data.phones = [...new Set(
            [...document.querySelectorAll('a[href^="tel:"]')]
              .map(a => a.textContent.trim())
              .filter(Boolean)
          )];
        }

        if (opts.extract_links) {
          data.links = [...document.querySelectorAll('a[href^="http"]')]
            .map(a => ({ text: a.textContent.trim(), href: a.href }))
            .filter(l => l.text)
            .slice(0, 50);
        }

        return data;
      }, { extract_contacts, extract_links });

      return {
        success: true,
        ...result,
        message: `Scraped ${url}: found ${result.emails?.length || 0} emails, ${result.phones?.length || 0} phones`,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to scrape ${url}: ${error.message}`,
      };
    }
  },
};

/**
 * Execute scrape tool by name
 */
export async function executeScrapeTools(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing scrape tool: ${toolName}`);

  if (!scrapeToolExecutors[toolName]) {
    throw new Error(`Unknown scrape tool: ${toolName}`);
  }

  try {
    const result = await scrapeToolExecutors[toolName](parameters);
    const duration = Date.now() - startTime;
    logger.info(`Scrape tool completed: ${toolName} (${duration}ms)`);
    return { ...result, executionTime: duration, tool: toolName };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Scrape tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration, tool: toolName };
  }
}

export default { scrapeToolDefinitions, scrapeToolExecutors, executeScrapeTools };
