/** Max characters in any single tool response */
export declare const CHARACTER_LIMIT = 25000;
/** Default number of results per scrape */
export declare const DEFAULT_LIMIT = 30;
/** HTTP request timeout in milliseconds */
export declare const REQUEST_TIMEOUT = 15000;
/** User-Agent to use for direct scraping requests */
export declare const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
/**
 * Plan tiers — controls what tools a Bloomie owner has access to.
 * "free" is the baseline included with every Bloomie.
 */
export declare enum PlanTier {
    FREE = "free",
    LEAD_BOOSTER = "lead_booster",
    LEAD_PRO = "lead_pro"
}
/** Which tools each tier unlocks */
export declare const TIER_ACCESS: Record<PlanTier, string[]>;
/** Upsell messages keyed by tool name */
export declare const UPSELL_MESSAGES: Record<string, string>;
/** Response format enum */
export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
}
//# sourceMappingURL=constants.d.ts.map