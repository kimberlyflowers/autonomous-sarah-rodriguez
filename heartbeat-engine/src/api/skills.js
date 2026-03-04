// Skills API — CRUD for company-specific skills + list BLOOM built-in skills
import express from 'express';
import { createLogger } from '../logging/logger.js';
import { getAllSkills } from '../skills/skill-loader.js';

const router = express.Router();
const logger = createLogger('skills-api');

// In-memory store (will persist to Postgres later)
let companySkills = [];

// GET /api/skills — list all skills (bloom + company)
router.get('/', (req, res) => {
  const bloomSkills = getAllSkills().map((s, i) => ({
    id: `bloom-${i+1}`,
    name: s.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    description: s.description,
    enabled: true,
    builtin: true,
  }));

  res.json({
    bloomSkills,
    companySkills,
  });
});

// POST /api/skills — create company skill
router.post('/', (req, res) => {
  const { name, trigger, instructions } = req.body;
  if (!name || !instructions) return res.status(400).json({ error: 'Name and instructions required' });

  const skill = {
    id: 'company-' + Date.now(),
    name,
    trigger: trigger || '',
    instructions,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  companySkills.push(skill);
  logger.info('Company skill created', { name });
  res.json({ success: true, skill });
});

// PUT /api/skills/:id — update company skill
router.put('/:id', (req, res) => {
  const idx = companySkills.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Skill not found' });

  const { name, trigger, instructions } = req.body;
  companySkills[idx] = { ...companySkills[idx], name, trigger, instructions };
  logger.info('Company skill updated', { name });
  res.json({ success: true, skill: companySkills[idx] });
});

// DELETE /api/skills/:id — delete company skill
router.delete('/:id', (req, res) => {
  companySkills = companySkills.filter(s => s.id !== req.params.id);
  res.json({ success: true });
});

// POST /api/skills/:id/toggle — toggle bloom skill on/off
router.post('/:id/toggle', (req, res) => {
  // For now just acknowledge — bloom skill toggling will be tracked in settings
  res.json({ success: true });
});

export default router;
