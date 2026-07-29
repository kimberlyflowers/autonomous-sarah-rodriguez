---
name: existing-site-engineering
description: Inspect, edit, test, and deploy an existing tenant-owned GitHub or Vercel codebase autonomously. Use for repository changes, existing websites, bug fixes, and deployments.
version: 2.0.0
workflow_type: coding_workspace
required_tools: [coding_workspace_prepare, coding_workspace_list_files, coding_workspace_read_file, coding_workspace_replace_text, coding_workspace_write_file, coding_workspace_run_checks, coding_workspace_run_command, coding_workspace_diff, coding_workspace_commit, vercel_list_deployments, vercel_wait_for_deployment]
---

# Existing Site Engineering

Use this workflow when the requested site or application already exists in GitHub or Vercel.

## Operating contract

1. Restate the concrete outcome in one short progress update, then begin.
2. Call `coding_workspace_prepare` to clone or refresh the tenant's repository and determine its default branch.
3. Inspect the repository before asking the user for paths:
   - list root files;
   - read `package.json` and framework configuration when present;
   - locate likely entry files using the workspace file listing;
   - inspect the Vercel project metadata when deployment context is needed.
4. Infer the framework and source layout from evidence. Do not assume `index.html`, `main`, or a root-level homepage.
5. Make the smallest scoped edit. Use `coding_workspace_replace_text` for exact edits or `coding_workspace_write_file` for new/fully replaced files. Preserve unrelated user changes.
6. Run the repository's relevant test, lint, typecheck, and build commands with `coding_workspace_run_checks`. Use `coding_workspace_run_command` for a repository-specific non-shell check when needed.
7. Inspect `coding_workspace_diff`. Repair failures and rerun checks without asking the user to choose an approach when a safe path remains.
8. Commit and push only after checks pass. Use a task-specific branch unless the user explicitly requested the default branch.
9. Verify deployment with `vercel_wait_for_deployment`. A timeout means still pending: continue polling within the allowed execution window or report the exact pending state. It is not a failure.
10. Finish with evidence: repository, branch, changed paths, checks, deployment state, and URL.

## Clarification policy

Ask only when missing information cannot be discovered through the connected tools, or when the choice would materially change scope. Never ask the user for a homepage path or branch until repository inspection has failed and the exact evidence is reported.

## Progress narration

Send concise milestone updates at meaningful transitions: inspecting, editing, testing, deploying, verifying. Do not narrate private chain-of-thought or list every tool call.

## Safety

Tenant OAuth grants are the only authority for GitHub and Vercel. Never expose tokens, embed credentials in URLs, run checks with production secrets, or deploy code whose checks failed.
