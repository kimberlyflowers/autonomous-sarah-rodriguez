import { AgentExecutor } from '../src/agent/executor.js';

const agentId = 'd4000000-0000-0000-0000-000000000004';
const organizationId = 'b2000000-0000-0000-0000-000000000002';
const stamp = new Date().toISOString();

const task = `
Controlled tenant website editing test. Work autonomously and do not ask the user
for a repository name, branch, file path, or Vercel project until you have inspected
the connected GitHub and Vercel accounts.

For the Youth Empowerment School tenant:
1. Inspect the connected GitHub repositories and Vercel projects.
2. Identify the Youth Empowerment School website repository, its real default
   branch, and the matching Vercel project from tool evidence.
3. Create or update the harmless non-UI file
   bloomie-verification/jonathan-vercel-edit-test.txt on the real default branch.
   Its exact content must be:
   JONATHAN_VERCEL_EDIT_OK
   ${stamp}
4. Commit with message "test: verify Jonathan tenant website editing".
5. Create a PREVIEW deployment only, never a production deployment.
6. Poll the deployment until READY or terminal failure. Do not promise to poll later.
7. Return a concise final evidence summary with repository, branch, file path,
   commit SHA or URL, deployment id, deployment state, and preview URL.

Do not alter visible website content. Do not deploy to production.
`;

const executor = new AgentExecutor(agentId);
const result = await executor.executeTask(task, {
  trigger: 'manual-audit',
  taskName: 'Jonathan tenant GitHub/Vercel editing test',
  taskType: 'developer',
  orgId: organizationId,
  maxTurns: 30,
});

console.log(JSON.stringify({
  status: result.status,
  result: result.result,
  executionTime: result.executionTime,
  turns: result.turns,
  toolsUsed: result.toolsUsed,
  verification: result.verification,
  toolTrace: (result.toolHistory || []).map((entry) => ({
    tool: entry.tool,
    input: entry.input,
    success: entry.result?.success,
    error: entry.result?.error,
    repository: entry.result?.repository,
    branch: entry.result?.branch,
    commitSha: entry.result?.commitSha || entry.result?.sha,
    deploymentId: entry.result?.deploymentId || entry.result?.id,
    deploymentState: entry.result?.state,
    url: entry.result?.url,
  })),
}, null, 2));
