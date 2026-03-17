import { AVATARS, ResponseFormat } from "../constants.js";
/**
 * List available AI avatars for video generation.
 */
export async function listAvatars(params) {
    const avatarList = AVATARS.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
    }));
    if (params.response_format === ResponseFormat.JSON) {
        return { avatars: avatarList, total: avatarList.length };
    }
    // Markdown format
    const lines = [
        `## Available AI Avatars (${avatarList.length})`,
        "",
    ];
    for (const avatar of avatarList) {
        lines.push(`### ${avatar.name}`);
        lines.push(`**ID:** \`${avatar.id}\``);
        lines.push(`**Description:** ${avatar.description}`);
        lines.push("");
    }
    lines.push("---");
    lines.push('Use `video_generate` with the avatar ID to create a video. Example: `avatar_id: "sarah"`');
    return lines.join("\n");
}
//# sourceMappingURL=list-avatars.js.map