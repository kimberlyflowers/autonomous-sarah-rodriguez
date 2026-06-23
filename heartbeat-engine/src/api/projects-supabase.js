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

// Match chat session ownership: resolve from Supabase JWT, then owner env fallback.
async function getUserId(req) {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (payload.sub) return payload.sub;
    }
  } catch {}
  return process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
}

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
        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id)
          .eq('user_id', userId);
        
        return {
          ...project,
          conversation_count: count || 0
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
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { name, description } = req.body;
    
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
        description: description?.trim() || null
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
    const { name, description } = req.body;
    
    const updates = {};
    
    if (name !== undefined) {
      updates.name = name.trim();
    }
    
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }
    
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

export default router;
