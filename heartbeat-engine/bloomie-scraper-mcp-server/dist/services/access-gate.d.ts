import { PlanTier } from "../constants.js";
export interface AccessResult {
    allowed: boolean;
    upsellMessage?: string;
}
/**
 * Check whether a plan tier has access to a given tool.
 * If not, returns the upsell message for that tool.
 */
export declare function checkAccess(planTier: PlanTier, toolName: string): AccessResult;
/** Return a summary of what each tier includes, for the check_access tool. */
export declare function getPlanSummary(currentTier: PlanTier): string;
//# sourceMappingURL=access-gate.d.ts.map