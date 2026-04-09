import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubGet, githubPut, githubPost } from "../services/github-client.js";

export function registerGithubTools(server: McpServer): void {
  // ── github_get_file ───────────────────────────────────────────────────────
  server.registerTool(
    "github_get_file",
    {
      title: "GitHub: Get File Contents",
      description:
        "Read the contents of a file from a GitHub repository. Returns the decoded file content and metadata.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or org)"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path relative to repo root"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA (default: repo default branch)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ owner, repo, path, ref }) => {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const data = (await githubGet(`/repos/${owner}/${repo}/contents/${path}${query}`)) as {
        name: string;
        path: string;
        sha: string;
        size: number;
        content?: string;
        encoding?: string;
      };

      let content: string;
      if (data.content && data.encoding === "base64") {
        content = Buffer.from(data.content, "base64").toString("utf-8");
      } else {
        content = data.content ?? "(binary or empty file)";
      }

      return {
        content: [
          {
            type: "text",
            text: `## ${data.path}\n**SHA:** ${data.sha} | **Size:** ${data.size} bytes\n\n\`\`\`\n${content}\n\`\`\``,
          },
        ],
      };
    }
  );

  // ── github_list_files ─────────────────────────────────────────────────────
  server.registerTool(
    "github_list_files",
    {
      title: "GitHub: List Files in Directory",
      description:
        "List files and directories at a given path in a GitHub repository. Returns names, types, and sizes.",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().default("").describe("Directory path (empty string for repo root)"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ owner, repo, path, ref }) => {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const data = (await githubGet(`/repos/${owner}/${repo}/contents/${path}${query}`)) as Array<{
        name: string;
        path: string;
        type: string;
        size: number;
      }>;

      const listing = data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
      }));
      return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }] };
    }
  );

  // ── github_update_file ────────────────────────────────────────────────────
  server.registerTool(
    "github_update_file",
    {
      title: "GitHub: Create or Update File",
      description:
        "Create a new file or update an existing file in a GitHub repository. Requires the file SHA for updates.",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path relative to repo root"),
        content: z.string().describe("New file content (plain text — will be base64-encoded automatically)"),
        message: z.string().describe("Commit message"),
        sha: z.string().optional().describe("Current file SHA (required for updates, omit for new files)"),
        branch: z.string().optional().describe("Target branch (default: repo default branch)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ owner, repo, path, content, message, sha, branch }) => {
      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
      };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;

      const data = (await githubPut(`/repos/${owner}/${repo}/contents/${path}`, body)) as {
        content: { path: string; sha: string };
        commit: { sha: string; message: string };
      };

      return {
        content: [
          {
            type: "text",
            text: `File ${data.content.path} committed.\nCommit: ${data.commit.sha}\nMessage: ${data.commit.message}`,
          },
        ],
      };
    }
  );

  // ── github_create_branch ──────────────────────────────────────────────────
  server.registerTool(
    "github_create_branch",
    {
      title: "GitHub: Create Branch",
      description:
        "Create a new branch in a GitHub repository from an existing branch or commit SHA.",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        branch: z.string().describe("New branch name"),
        from: z.string().default("main").describe("Source branch or commit SHA (default: main)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ owner, repo, branch, from }) => {
      // Resolve source SHA
      const refData = (await githubGet(`/repos/${owner}/${repo}/git/ref/heads/${from}`)) as {
        object: { sha: string };
      };

      const data = (await githubPost(`/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: refData.object.sha,
      })) as { ref: string; object: { sha: string } };

      return {
        content: [
          { type: "text", text: `Branch created: ${data.ref} at ${data.object.sha}` },
        ],
      };
    }
  );

  // ── github_get_commits ────────────────────────────────────────────────────
  server.registerTool(
    "github_get_commits",
    {
      title: "GitHub: List Recent Commits",
      description:
        "List recent commits on a branch. Returns commit SHA, message, author, and timestamp.",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        branch: z.string().default("main").describe("Branch name (default: main)"),
        limit: z.number().default(10).describe("Max commits to return (default 10)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ owner, repo, branch, limit }) => {
      const data = (await githubGet(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`
      )) as Array<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>;

      const commits = data.map((c) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      }));
      return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
    }
  );
}
