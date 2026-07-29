import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const router = express.Router();
const logger = createLogger('projects-api');
const LEGACY_PROJECT_USER_ID = '00000000-0000-0000-0000-000000000001';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

// Projects are tenant-private. Resolve the signed-in Supabase user only.
async function getUserId(req) {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (payload.sub) return payload.sub;
    }
  } catch {}
  return null;
}

router.use(async (req, res, next) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
  req.projectUserId = userId;
  next();
});

async function adoptLegacyProjects(userId) {
  if (!userId || userId === LEGACY_PROJECT_USER_ID) return;
  const { error } = await supabase
    .from('projects')
    .update({ user_id: userId })
    .eq('user_id', LEGACY_PROJECT_USER_ID);
  if (error) logger.warn('Failed to adopt legacy placeholder projects', { error: error.message });
}

/**
 * GET /api/projects
 * List all projects for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    await adoptLegacyProjects(userId);
    
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        repository_owner,
        repository_name,
        repository_default_branch,
        vercel_project_id,
        workspace_instructions,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) {
      logger.error('Supabase error fetching projects:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch projects' 
      });
    }
    
    // For each project, count its sessions
    const projectsWithCounts = await Promise.all(
      data.map(async (project) => {
        const [{ count }, { count: workCount }] = await Promise.all([
          supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('user_id', userId),
          supabase
            .from('website_builds')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id),
        ]);
        
        return {
          ...project,
          conversation_count: Math.max(0, (count || 0) - (workCount || 0)),
          work_session_count: workCount || 0
        };
      })
    );
    
    res.json({ 
      success: true, 
      projects: projectsWithCounts 
    });
  } catch (error) {
    logger.error('Error fetching projects:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch projects' 
    });
  }
});

/**
 * GET /api/projects/:id/workspace
 * Unified Project workspace: conversations, Work sessions, execution receipts,
 * artifacts, branches, checks, and deployment links.
 */
router.get('/:id/workspace', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (projectError || !project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [{ data: conversations }, { data: workSessions }] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, title, status, created_at, updated_at')
        .eq('project_id', id)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('website_builds')
        .select('id, title, brief, status, type, output_url, created_at, updated_at')
        .eq('project_id', id)
        .order('updated_at', { ascending: false }),
    ]);

    const workIds = (workSessions || []).map(row => row.id);
    let checkpoints = [];
    let artifacts = [];
    if (workIds.length) {
      const [{ data: checkpointRows }, { data: artifactRows }] = await Promise.all([
        supabase
          .from('agent_execution_checkpoints')
          .select('session_id, status, current_step, todos, tools_used, tool_receipts, pending_jobs, last_error, updated_at, completed_at')
          .in('session_id', workIds),
        supabase
          .from('artifacts')
          .select('id, session_id, name, description, file_type, mime_type, file_size, storage_path, published, slug, created_at')
          .eq('organization_id', project.organization_id)
          .in('session_id', workIds)
          .order('created_at', { ascending: false }),
      ]);
      checkpoints = checkpointRows || [];
      artifacts = artifactRows || [];
    }

    const checkpointBySession = new Map(checkpoints.map(row => [row.session_id, row]));
    const workIdSet = new Set(workIds);
    const chatConversations = (conversations || []).filter(row => !workIdSet.has(row.id));
    const enrichedWork = (workSessions || []).map(work => {
      const checkpoint = checkpointBySession.get(work.id) || null;
      const tools = checkpoint?.tools_used || [];
      const receipts = checkpoint?.tool_receipts || [];
      const prepareTool = tools.find(tool => tool.name === 'coding_workspace_prepare');
      const commitReceipt = [...receipts].reverse().find(receipt => receipt.commit || receipt.sha);
      const deploymentReceipt = [...receipts].reverse().find(receipt => receipt.deployment);
      return {
        ...work,
        checkpoint,
        repository: prepareTool?.input
          ? { owner: prepareTool.input.owner, name: prepareTool.input.repo, baseBranch: prepareTool.input.ref || project.repository_default_branch || null }
          : project.repository_owner && project.repository_name
            ? { owner: project.repository_owner, name: project.repository_name, baseBranch: project.repository_default_branch || null }
            : null,
        branch: commitReceipt?.branch || null,
        commit: commitReceipt?.commit || commitReceipt?.sha || null,
        deployment: deploymentReceipt?.deployment || (work.output_url ? { url: work.output_url, state: work.status === 'complete' ? 'READY' : work.status } : null),
        artifacts: artifacts.filter(artifact => artifact.session_id === work.id),
      };
    });

    res.json({
      success: true,
      project,
      conversations: chatConversations,
      workSessions: enrichedWork,
      artifacts,
      summary: {
        conversations: chatConversations.length,
        workSessions: enrichedWork.length,
        running: enrichedWork.filter(work => ['queued', 'building', 'clarifying'].includes(work.status)).length,
        artifacts: artifacts.length,
        deployments: enrichedWork.filter(work => work.deployment).length,
      },
    });
  } catch (error) {
    logger.error('Error fetching project workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to load project workspace' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const {
      name, description, repositoryOwner, repositoryName,
      repositoryDefaultBranch, vercelProjectId, workspaceInstructions
    } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project name is required' 
      });
    }
    
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
        name: name.trim(),
        description: description?.trim() || null,
        repository_owner: repositoryOwner?.trim() || null,
        repository_name: repositoryName?.trim() || null,
        repository_default_branch: repositoryDefaultBranch?.trim() || null,
        vercel_project_id: vercelProjectId?.trim() || null,
        workspace_instructions: workspaceInstructions?.trim() || null
      })
      .select()
      .single();
    
    if (error) {
      logger.error('Supabase error creating project:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create project' 
      });
    }
    
    logger.info(`Created project: ${name}`);
    
    res.json({ 
      success: true, 
      project: data 
    });
  } catch (error) {
    logger.error('Error creating project:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create project' 
    });
  }
});

/**
 * PATCH /api/projects/:id
 * Update an existing project
 */
router.patch('/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const {
      name, description, repositoryOwner, repositoryName,
      repositoryDefaultBranch, vercelProjectId, workspaceInstructions
    } = req.body;
    
    const updates = {};
    
    if (name !== undefined) {
      updates.name = name.trim();
    }
    
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }
    if (repositoryOwner !== undefined) updates.repository_owner = repositoryOwner?.trim() || null;
    if (repositoryName !== undefined) updates.repository_name = repositoryName?.trim() || null;
    if (repositoryDefaultBranch !== undefined) updates.repository_default_branch = repositoryDefaultBranch?.trim() || null;
    if (vercelProjectId !== undefined) updates.vercel_project_id = vercelProjectId?.trim() || null;
    if (workspaceInstructions !== undefined) updates.workspace_instructions = workspaceInstructions?.trim() || null;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No fields to update' 
      });
    }
    
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
      }
      logger.error('Supabase error updating project:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update project' 
      });
    }
    
    logger.info(`Updated project ${id}`);
    
    res.json({ 
      success: true, 
      project: data 
    });
  } catch (error) {
    logger.error('Error updating project:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update project' 
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project (conversations will have project_id set to NULL)
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
      }
      logger.error('Supabase error deleting project:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete project' 
      });
    }
    
    logger.info(`Deleted project ${id}`);
    
    res.json({ 
      success: true, 
      message: 'Project deleted successfully' 
    });
  } catch (error) {
    logger.error('Error deleting project:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete project' 
    });
  }
});

/**
 * PATCH /api/projects/:id/conversations
 * Add or remove conversations from a project
 */
router.patch('/:id/conversations', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { sessionIds, action } = req.body; // action: 'add' or 'remove'
    
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session IDs array is required' 
      });
    }
    
    // Verify project exists and belongs to user
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (projectError || !project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    const projectIdValue = action === 'add' ? id : null;
    
    const { data, error } = await supabase
      .from('sessions')
      .update({ project_id: projectIdValue })
      .in('id', sessionIds)
      .eq('user_id', userId)
      .select('id');
    
    if (error) {
      logger.error('Supabase error updating sessions:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update conversations' 
      });
    }
    
    logger.info(`${action === 'add' ? 'Added' : 'Removed'} ${data.length} conversations ${action === 'add' ? 'to' : 'from'} project ${id}`);
    
    res.json({ 
      success: true, 
      updated: data.length 
    });
  } catch (error) {
    logger.error('Error updating project conversations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update conversations' 
    });
  }
});

/**
 * PATCH /api/projects/:id/work-sessions
 * Add or remove Work sessions from a project.
 */
router.patch('/:id/work-sessions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { workSessionIds, action } = req.body;

    if (!Array.isArray(workSessionIds) || workSessionIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Work session IDs array is required' });
    }
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Action must be add or remove' });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (projectError || !project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    let query = supabase
      .from('website_builds')
      .update({ project_id: action === 'add' ? id : null })
      .in('id', workSessionIds)
      .eq('created_by', userId);
    if (action === 'remove') query = query.eq('project_id', id);
    const { data, error } = await query.select('id, project_id');

    if (error) {
      logger.error('Supabase error updating Work sessions:', error);
      return res.status(500).json({ success: false, error: 'Failed to update Work sessions' });
    }

    res.json({ success: true, updated: data?.length || 0, workSessions: data || [] });
  } catch (error) {
    logger.error('Error updating project Work sessions:', error);
    res.status(500).json({ success: false, error: 'Failed to update Work sessions' });
  }
});

export default router;
