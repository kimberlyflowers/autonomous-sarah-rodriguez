import express from 'express';
import { logger } from '../logging/logger.js';

const router = express.Router();

// Get database pool
let getPool;
try {
  const { getSharedPool } = await import('../database/pool.js');
  getPool = getSharedPool;
} catch (err) {
  logger.error('Failed to load database pool:', err);
}

/**
 * GET /api/projects
 * List all projects for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = 1; // TODO: Get from auth session when implemented
    
    const pool = await getPool();
    const result = await pool.query(
      `SELECT 
        id,
        name,
        description,
        created_at,
        updated_at,
        (SELECT COUNT(*) FROM sessions WHERE project_id = projects.id) as conversation_count
       FROM projects 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ 
      success: true, 
      projects: result.rows 
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
    const userId = 1; // TODO: Get from auth session when implemented
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project name is required' 
      });
    }
    
    const pool = await getPool();
    const result = await pool.query(
      `INSERT INTO projects (user_id, name, description, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, name, description, created_at, updated_at`,
      [userId, name.trim(), description?.trim() || null]
    );
    
    logger.info(`Created project: ${name}`);
    
    res.json({ 
      success: true, 
      project: result.rows[0] 
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
    const userId = 1; // TODO: Get from auth session when implemented
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description?.trim() || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No fields to update' 
      });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id, userId);
    
    const pool = await getPool();
    const result = await pool.query(
      `UPDATE projects 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1} 
       RETURNING id, name, description, created_at, updated_at`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    logger.info(`Updated project ${id}`);
    
    res.json({ 
      success: true, 
      project: result.rows[0] 
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
    const userId = 1; // TODO: Get from auth session when implemented
    const { id } = req.params;
    
    const pool = await getPool();
    const result = await pool.query(
      `DELETE FROM projects 
       WHERE id = $1 AND user_id = $2 
       RETURNING id`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
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
    const userId = 1; // TODO: Get from auth session when implemented
    const { id } = req.params;
    const { sessionIds, action } = req.body; // action: 'add' or 'remove'
    
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session IDs array is required' 
      });
    }
    
    const pool = await getPool();
    
    // Verify project exists and belongs to user
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    const projectIdValue = action === 'add' ? id : null;
    
    const result = await pool.query(
      `UPDATE sessions 
       SET project_id = $1, updated_at = NOW() 
       WHERE id = ANY($2::int[]) 
       RETURNING id`,
      [projectIdValue, sessionIds]
    );
    
    logger.info(`${action === 'add' ? 'Added' : 'Removed'} ${result.rows.length} conversations ${action === 'add' ? 'to' : 'from'} project ${id}`);
    
    res.json({ 
      success: true, 
      updated: result.rows.length 
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
