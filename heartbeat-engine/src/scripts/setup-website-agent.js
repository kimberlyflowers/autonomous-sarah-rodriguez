#!/usr/bin/env node
// BLOOM Website Agent — One-Time Setup Script
// Run this ONCE from the heartbeat-engine directory:
//   node src/scripts/setup-website-agent.js
//
// What it does:
//   1. Creates the BLOOM Website Builder agent on Anthropic's platform
//   2. Creates a cloud environment (container with unrestricted networking)
//   3. Prints the IDs — set these as Railway env vars to activate the agent

import 'dotenv/config';
import { setupWebsiteAgent } from '../agents/managed-website-agent.js';

async function main() {
  console.log('\n🌐 BLOOM Website Agent Setup\n');
  console.log('Connecting to Anthropic Managed Agents API...');
  console.log('BLOOM_APP_URL:', process.env.BLOOM_APP_URL || '(not set — using production default)');
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ set' : '❌ MISSING\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is required. Add it to your .env file.');
    process.exit(1);
  }

  try {
    const result = await setupWebsiteAgent();

    console.log('\n✅ Setup complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Set these environment variables in Railway:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`BLOOM_WEBSITE_AGENT_ID=${result.agentId}`);
    console.log(`BLOOM_WEBSITE_ENVIRONMENT_ID=${result.environmentId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('MCP server URL (already configured in agent):');
    console.log(`  ${result.mcpUrl}\n`);
    console.log('After setting the env vars, redeploy the service and the website agent will be live.');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    if (err.message.includes('managed-agents-2026-04-01')) {
      console.error('\nMake sure your API account has Managed Agents beta access enabled.');
      console.error('Check: https://platform.claude.com/docs/en/managed-agents/overview');
    }
    process.exit(1);
  }
}

main();
