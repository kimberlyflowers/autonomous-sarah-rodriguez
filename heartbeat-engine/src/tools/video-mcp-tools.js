// ─────────────────────────────────────────────────────────────────────────────
// Bloomie Video MCP Tools — Bridge Module
// Routes video_* tool calls from the chat system to the MCP video functions.
// Wraps the Sarah Pipeline running on RunPod Serverless.
// Video generation gated by plan tier (Free browse / Video Creator $49/mo / Video Pro $149/mo).
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from '../logging/logger.js';

const logger = createLogger('video-mcp-tools');

// ── Plan tier access control ────────────────────────────────────────────────

const TIER_ACCESS = {
  free: [
    'video_check_access',
    'video_list_avatars',
  ],
  video_creator: [
    'video_check_access',
    'video_list_avatars',
    'video_generate',
    'video_job_status',
  ],
  video_pro: [
    'video_check_access',
    'video_list_avatars',
    'video_generate',
    'video_job_status',
  ],
};

const UPSELL = {
  video_generate: {
    plan: 'Video Creator',
    price: '$49/month',
    pitch: `Custom AI-generated videos with Sarah — your personal video spokesperson.
Lip-synced, full 1080p video from any script or text.
~$0.03 per video vs $4.50 on HeyGen (150x cheaper!).
Videos ready in under 2 minutes.
Perfect for personalized outreach, welcome videos, social media content, and more.`,
  },
  video_job_status: {
    plan: 'Video Creator',
    price: '$49/month',
    pitch: 'You need Video Creator to generate and track video jobs.',
  },
};

function checkTierAccess(toolName, planTier = 'free') {
  const tier = planTier || 'free';
  const allowed = TIER_ACCESS[tier] || TIER_ACCESS.free;
  if (allowed.includes(toolName)) return { allowed: true };

  const upsell = UPSELL[toolName];
  return {
    allowed: false,
    message: upsell
      ? `🔒 **AI Video Generation** requires the **${upsell.plan}** add-on (${upsell.price}).\n\n${upsell.pitch}\n\nUpgrade anytime at bloomiestaffing.com/upgrade.`
      : `🔒 This video feature requires an upgraded plan. Visit bloomiestaffing.com/upgrade.`,
  };
}

// ── Plan summary for check_access ──────────────────────────────────────────

function getPlanSummary(planTier = 'free') {
  const tiers = [
    { name: 'Free', tier: 'free', price: 'Included', tools: [
      'Check plan access and available features',
      'Browse available AI avatars (Sarah Rodriguez)',
    ]},
    { name: 'Video Creator', tier: 'video_creator', price: '$49/month', tools: [
      'Everything in Free, plus:',
      'Generate AI lip-synced videos with Sarah (~$0.03/video)',
      'Full 1080p resolution with natural lip sync',
      'Track video job progress and download finished videos',
      'Up to 50 videos per month',
    ]},
    { name: 'Video Pro', tier: 'video_pro', price: '$149/month', tools: [
      'Everything in Video Creator, plus:',
      'Priority GPU queue (faster render times)',
      'Custom avatar creation (coming soon)',
      'Batch video generation',
      'Unlimited videos per month',
    ]},
  ];

  const lines = [`## Your Current Video Plan: **${tiers.find(t => t.tier === planTier)?.name || 'Free'}**\n`];
  for (const t of tiers) {
    const isCurrent = t.tier === planTier;
    lines.push(`### ${t.name} (${t.price})${isCurrent ? ' ← You are here' : ''}`);
    t.tools.forEach(tool => lines.push(`• ${tool}`));
    lines.push('');
  }
  lines.push('Upgrade anytime at **bloomiestaffing.com/upgrade**.');
  return lines.join('\n');
}

// ── Lazy imports of the compiled MCP video functions ────────────────────────

async function loadVideoModule(moduleName) {
  const modUrl = new URL(`../../bloomie-video-mcp-server/dist/tools/${moduleName}.js`, import.meta.url);
  return await import(modUrl.href);
}

// ── RunPod client loader ────────────────────────────────────────────────────

let _runpodClient = null;
async function getRunPodClient() {
  if (_runpodClient) return _runpodClient;
  const modUrl = new URL('../../bloomie-video-mcp-server/dist/services/runpod-client.js', import.meta.url);
  const mod = await import(modUrl.href);
  _runpodClient = new mod.RunPodClient();
  return _runpodClient;
}

// ── Main executor ──────────────────────────────────────────────────────────

export async function executeVideoMCPTool(toolName, toolInput) {
  const startTime = Date.now();
  const planTier = toolInput.plan_tier || 'free';

  logger.info(`Executing video tool: ${toolName}`, { planTier, org: toolInput.org_id });

  try {
    // ── Check access first ──
    if (toolName !== 'video_check_access') {
      const access = checkTierAccess(toolName, planTier);
      if (!access.allowed) {
        logger.info(`Access denied for ${toolName} on ${planTier} tier — returning upsell`);
        return { success: false, upsell: true, message: access.message };
      }
    }

    // ── Route to the appropriate tool ──
    let result;

    switch (toolName) {
      case 'video_check_access': {
        const summary = getPlanSummary(planTier);
        return { success: true, message: summary };
      }

      case 'video_list_avatars': {
        const { listAvatars } = await loadVideoModule('list-avatars');
        result = await listAvatars({
          org_id: toolInput.org_id,
          plan_tier: planTier,
          response_format: toolInput.response_format || 'markdown',
        });
        break;
      }

      case 'video_generate': {
        const { generateVideo } = await loadVideoModule('generate-video');
        result = await generateVideo({
          avatar_id: toolInput.avatar_id,
          script: toolInput.script,
          voice_style: toolInput.voice_style || 'warm',
          org_id: toolInput.org_id,
          plan_tier: planTier,
          response_format: toolInput.response_format || 'markdown',
        });
        break;
      }

      case 'video_job_status': {
        const { getJobStatus } = await loadVideoModule('job-status');
        result = await getJobStatus({
          job_id: toolInput.job_id,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          response_format: toolInput.response_format || 'markdown',
        });
        break;
      }

      default:
        return { success: false, error: `Unknown video tool: ${toolName}` };
    }

    const duration = Date.now() - startTime;
    logger.info(`Video tool done: ${toolName} (${duration}ms)`);

    // Format result for the chat system
    return {
      success: true,
      ...result,
      message: typeof result === 'string' ? result : (result.message || JSON.stringify(result)),
      executionTime: duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Video tool failed: ${toolName} (${duration}ms)`, { error: error.message });
    return {
      success: false,
      error: error.message,
      message: `❌ Video tool failed: ${error.message}. The video pipeline may need attention.`,
      executionTime: duration,
    };
  }
}

export default { executeVideoMCPTool };
