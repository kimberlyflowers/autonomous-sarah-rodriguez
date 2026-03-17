import { ResponseFormat } from "../constants.js";
/**
 * Format a result object as either Markdown or JSON string.
 */
export function formatResponse(data, format) {
    if (format === ResponseFormat.JSON || format === "json") {
        return JSON.stringify(data, null, 2);
    }
    // Default to markdown
    if (typeof data === "string") {
        return data;
    }
    return JSON.stringify(data, null, 2);
}
//# sourceMappingURL=formatter.js.map