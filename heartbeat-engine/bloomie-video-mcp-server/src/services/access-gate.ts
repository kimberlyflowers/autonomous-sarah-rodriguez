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
  planTier: PlanTier | string,
  toolName: string
): AccessResult {
  const allowed = TIER_ACCESS[planTier as PlanTier]?.includes(toolName) ?? false;
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
export function getPlanSummary(currentTier: PlanTier | string): string {
  const lines: string[] = [
    `## Your Current Plan: **${formatTierName(currentTier)}**`,
    "",
  ];

  const tiers: { tier: PlanTier; price: string; tools: string[] }[] = [
    {
      tier: PlanTier.FREE,
      price: "Included",
      tools: [
        "Check video access and plan details",
        "Browse available AI avatars",
      ],
    },
    {
      tier: PlanTier.VIDEO_CREATOR,
      price: "$49/month",
      tools: [
        "Everything in Free, plus:",
        "Generate AI videos with lip-synced avatars (1080p)",
        "Track video generation job status",
        "~$0.03 per video (150x cheaper than HeyGen)",
      ],
    },
    {
      tier: PlanTier.VIDEO_PRO,
      price: "$149/month",
      tools: [
        "Everything in Video Creator, plus:",
        "Custom avatar creation from your own face/voice",
        "Batch video generation (up to 50 at once)",
        "Priority GPU queue — videos render 3x faster",
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

function formatTierName(tier: PlanTier | string): string {
  switch (tier) {
    case PlanTier.FREE:
      return "Free";
    case PlanTier.VIDEO_CREATOR:
      return "Video Creator";
    case PlanTier.VIDEO_PRO:
      return "Video Pro";
    default:
      return String(tier);
  }
}
