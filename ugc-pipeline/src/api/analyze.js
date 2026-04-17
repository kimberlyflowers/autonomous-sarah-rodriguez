const express = require('express');
const path = require('path');
const fs = require('fs');
const { logger } = require('../services/logger');

const router = express.Router();
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

// Analyze all assets and save AI context
// In production this would use Claude API for image analysis.
// For now it catalogs assets and creates context stubs.
router.post('/assets', (req, res) => {
  const results = { products: [], subjects: [], audio: [] };

  ['products', 'subjects', 'audio'].forEach(type => {
    const dir = path.join(ASSETS_DIR, type);
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(folder => {
      const folderPath = path.join(dir, folder);
      if (!fs.statSync(folderPath).isDirectory()) return;

      const files = fs.readdirSync(folderPath).filter(f => !f.endsWith('.json'));
      if (files.length === 0) return;

      const file = files[0];
      const ext = path.extname(file).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext);
      const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);

      const context = {
        assetName: folder,
        type,
        fileName: file,
        fileType: isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'other',
        fileSize: fs.statSync(path.join(folderPath, file)).size,
        analyzedAt: new Date().toISOString(),
        description: `${type.slice(0, -1)} asset: ${folder}`,
        visualElements: isImage ? ['Pending AI analysis - upload to Claude for detailed description'] : [],
        adNotes: `Use as ${type.slice(0, -1)} reference in video generations`
      };

      // Save context
      fs.writeFileSync(
        path.join(folderPath, 'ai-context.json'),
        JSON.stringify(context, null, 2)
      );

      results[type].push(context);
    });
  });

  const total = results.products.length + results.subjects.length + results.audio.length;
  logger.info(`Analyzed ${total} assets`);

  res.json({
    totalAnalyzed: total,
    results,
    message: 'Asset contexts saved. For detailed AI image analysis, use Claude Vision API.'
  });
});

module.exports = router;
