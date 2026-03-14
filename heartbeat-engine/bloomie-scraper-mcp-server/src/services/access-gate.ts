import {
  PlanTier,
  TIER_ACCESS,
  UPSELL_MESSAGES,
} from "../constants.js";

export interface AccessResult {
  allowed: boolean;
  upsellMessage?: string;
}

/**
 * Check whether a plan tier has access to a given tool.
 * If not, returns the upsell message for that tool.
 */
export function checkAccess(
  planTier: PlanTier,
  toolName: string
): AccessResult {
  const allowed = TIER_ACCESS[planTier]?.includes(toolName) ?? false;
  if (allowed) {
    return { allowed: true };
  }
  return {
    allowed: false,
    upsellMessage:
      UPSELL_MESSAGES[toolName] ??
      `🔒 This feature requires an upgraded plan. Visit bloomiestaffing.com/upgrade for details.`,
  };
}

/** Return a summary of what each tier includes, for the check_access tool. */
export function getPlanSummary(currentTier: PlanTier): string {
  const lines: string[] = [
    `## Your Current Plan: **${formatTierName(currentTier)}**`,
    "",
  ];

  const tiers: { tier: PlanTier; price: string; tools: string[] }[] = [
    {
      tier: PlanTier.FREE,
      price: "Included",
      tools: [
        "Universal URL scraper — extract data from any webpage",
        "Yellowpages & Yelp business search",
        "Facebook Groups member extraction",
      ],
    },
    {
      tier: PlanTier.LEAD_BOOSTER,
      price: "$29/month",
      tools: [
        "Everything in Free, plus:",
        "Google Maps business search (verified data, reviews, hours)",
        "Apollo.io contact search (verified emails & phone numbers for 210M+ contacts)",
      ],
    },
    {
      tier: PlanTier.LEAD_PRO,
      price: "$99/month",
      tools: [
        "Everything in Lead Booster, plus:",
        "LinkedIn profile search (75 data points per person, email discovery)",
        "Priority scraping with higher rate limits",
      ],
    },
  ];

  for (const t of tiers) {
    const isCurrent = t.tier === currentTier;
    const label = isCurrent ? " ← You are here" : "";
    lines.push(`### ${formatTierName(t.tier)} (${t.price})${label}`);
    for (const tool of t.tools) {
      lines.push(`• ${tool}`);
    }
    lines.push("");
  }

  lines.push("Upgrade anytime at **bloomiestaffing.com/upgrade**.");
  return lines.join("\n");
}

function formatTierName(tier: PlanTier): string {
  switch (tier) {
    case PlanTier.FREE:
      return "Free";
    case PlanTier.LEAD_BOOSTER:
      return "Lead Booster";
    case PlanTier.LEAD_PRO:
      return "Lead Pro";
  }
}
