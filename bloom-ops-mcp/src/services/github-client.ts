const GITHUB_API_URL = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return token;
}

function headers(): Record<string, string> {
  return {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${getToken()}`,
    "User-Agent": "bloom-ops-mcp-server/1.0",
  };
}

export async function githubGet(path: string): Promise<unknown> {
  const res = await fetch(`${GITHUB_API_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function githubPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function githubPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}
