const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');
const sharp = require('sharp');

const execFileAsync = promisify(execFile);

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

async function runBinary(binary, args, options = {}) {
  try {
    const result = await execFileAsync(binary, args, {
      timeout: options.timeoutMs || 120000,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 20
    });
    return result.stdout || '';
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(`${binary} failed: ${String(detail).slice(-2000)}`);
  }
}

async function probeVideo(videoPath) {
  const output = await runBinary('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames,duration:format=duration',
    '-of',
    'json',
    videoPath
  ], { timeoutMs: 45000 });
  const data = JSON.parse(output || '{}');
  const stream = data.streams?.[0] || {};
  const duration = Number(stream.duration || data.format?.duration || 0);
  const frameRateParts = String(stream.avg_frame_rate || stream.r_frame_rate || '0/1').split('/').map(Number);
  const fps = frameRateParts[1] ? frameRateParts[0] / frameRateParts[1] : Number(frameRateParts[0] || 0);
  const frameCount = Number(stream.nb_read_frames || 0) || (duration && fps ? Math.round(duration * fps) : 0);
  return {
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    duration: round(duration, 3),
    fps: round(fps, 3),
    frameCount
  };
}

async function materializeVideoSource(source, options = {}) {
  if (!source) throw new Error('A trend source URL or data URL is required.');
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bloom-trend-video-'));
  const target = path.join(tempDir, `source-${crypto.randomUUID()}.mp4`);

  if (/^data:video\/[^;]+;base64,/i.test(source)) {
    const encoded = source.replace(/^data:video\/[^;]+;base64,/i, '');
    await fs.promises.writeFile(target, Buffer.from(encoded, 'base64'));
    return { path: target, tempDir, sourceKind: 'data-url' };
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { 'User-Agent': 'Mozilla/5.0 BloomStudio/1.0' },
      timeout: options.timeoutMs || 90000
    });
    if (!response.ok) throw new Error(`Could not download source video: ${response.status}`);
    const buffer = await response.buffer();
    await fs.promises.writeFile(target, buffer);
    return { path: target, tempDir, sourceKind: 'http' };
  }

  if (fs.existsSync(source)) {
    return { path: source, tempDir: '', sourceKind: 'file' };
  }

  throw new Error('Unsupported trend source. Use an http URL, data video URL, or server file path.');
}

async function extractAllFrames(videoPath, outputDir, options = {}) {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const maxWidth = Number(options.maxAnalysisWidth || 360);
  const filter = `scale='min(${maxWidth},iw)':-2`;
  await runBinary('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vf',
    filter,
    '-vsync',
    '0',
    '-q:v',
    '4',
    path.join(outputDir, 'frame-%06d.jpg')
  ], { timeoutMs: options.timeoutMs || 300000, maxBuffer: 1024 * 1024 * 10 });

  return (await fs.promises.readdir(outputDir))
    .filter(name => /^frame-\d+\.jpg$/i.test(name))
    .sort()
    .map(name => path.join(outputDir, name));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function getSaturation(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === 0) return 0;
  return (max - min) / max;
}

async function analyzeFrame(framePath, index, fps, previous = null) {
  const resized = sharp(framePath)
    .rotate()
    .resize(32, 32, { fit: 'fill' })
    .removeAlpha()
    .raw();
  const { data, info } = await resized.toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumaSum = 0;
  let warmPixels = 0;
  let brightCenter = 0;
  let brightEdges = 0;
  const luma = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const base = i * 3;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const x = i % info.width;
    const row = Math.floor(i / info.width);
    const inCenter = x > info.width * 0.25 && x < info.width * 0.75 && row > info.height * 0.2 && row < info.height * 0.8;
    rSum += r;
    gSum += g;
    bSum += b;
    lumaSum += y;
    luma[i] = y;
    if (r > b * 1.08 && r > g * 0.9) warmPixels += 1;
    if (inCenter) brightCenter += y;
    else brightEdges += y;
  }

  const avgR = rSum / pixels;
  const avgG = gSum / pixels;
  const avgB = bSum / pixels;
  const brightness = lumaSum / pixels;
  let motionDelta = 0;
  if (previous?.luma?.length === luma.length) {
    let total = 0;
    for (let i = 0; i < luma.length; i += 1) total += Math.abs(luma[i] - previous.luma[i]);
    motionDelta = total / luma.length;
  }
  const centerRatio = brightCenter / Math.max(0.001, brightEdges);
  const saturation = getSaturation(avgR, avgG, avgB);
  return {
    raw: { luma },
    json: {
      frame: index + 1,
      time: round(index / Math.max(fps || 1, 1), 3),
      averageColor: rgbToHex(avgR, avgG, avgB),
      brightness: round(brightness, 3),
      saturation: round(saturation, 3),
      warmth: round(warmPixels / pixels, 3),
      motionDelta: round(motionDelta, 3),
      composition: {
        centerWeight: round(centerRatio, 3),
        focusHint: centerRatio > 0.42 ? 'center-weighted subject/product' : 'wide or edge-weighted frame'
      }
    }
  };
}

function chooseShotType(frame, aspectRatio) {
  const motion = frame.motionDelta || 0;
  if (motion > 0.22) return 'fast movement or transition';
  if (frame.composition?.centerWeight > 0.65 && aspectRatio === '9:16') return 'close creator/product framing';
  if (frame.brightness < 0.28) return 'low-key or dark beat';
  if (frame.saturation > 0.42) return 'colorful product/beauty beat';
  return 'steady creator/product shot';
}

function detectSegments(frames, totalDuration, options = {}) {
  const fps = Number(options.fps || 24);
  const minSegmentSeconds = Number(options.minSegmentSeconds || 0.7);
  const minGapFrames = Math.max(1, Math.round(fps * minSegmentSeconds));
  const deltas = frames.map(frame => frame.motionDelta || 0).slice(1);
  const sorted = [...deltas].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const threshold = Math.max(Number(options.cutThreshold || 0.16), p90 * 1.35);
  const cuts = [0];
  let lastCut = 0;

  frames.forEach((frame, index) => {
    if (index === 0) return;
    if ((frame.motionDelta || 0) >= threshold && index - lastCut >= minGapFrames) {
      cuts.push(index);
      lastCut = index;
    }
  });

  const targetSceneSeconds = Number(options.targetSceneSeconds || 2.2);
  const maxGapFrames = Math.max(minGapFrames + 1, Math.round(fps * targetSceneSeconds));
  for (let cursor = maxGapFrames; cursor < frames.length; cursor += maxGapFrames) {
    if (!cuts.some(cut => Math.abs(cut - cursor) < minGapFrames)) cuts.push(cursor);
  }
  cuts.sort((a, b) => a - b);
  const uniqueCuts = cuts.filter((cut, index) => index === 0 || cut - cuts[index - 1] >= minGapFrames);
  if (uniqueCuts[0] !== 0) uniqueCuts.unshift(0);

  return uniqueCuts.map((startFrame, index) => {
    const nextStart = uniqueCuts[index + 1] ?? frames.length;
    const endFrame = Math.max(startFrame, nextStart - 1);
    const slice = frames.slice(startFrame, endFrame + 1);
    const start = frames[startFrame]?.time || 0;
    const end = index === uniqueCuts.length - 1 ? totalDuration : (frames[nextStart]?.time || totalDuration);
    const avgMotion = slice.reduce((sum, frame) => sum + (frame.motionDelta || 0), 0) / Math.max(slice.length, 1);
    const avgBrightness = slice.reduce((sum, frame) => sum + (frame.brightness || 0), 0) / Math.max(slice.length, 1);
    const keyFrame = slice.reduce((best, frame) => (frame.motionDelta || 0) > (best.motionDelta || 0) ? frame : best, slice[Math.floor(slice.length / 2)] || slice[0]);
    return {
      id: `scene-${index + 1}`,
      startFrame: startFrame + 1,
      endFrame: endFrame + 1,
      frameCount: slice.length,
      start: round(start, 2),
      end: round(Math.max(end, start + 0.2), 2),
      duration: round(Math.max(end - start, 0.2), 2),
      averageMotion: round(avgMotion, 3),
      averageBrightness: round(avgBrightness, 3),
      keyFrame: keyFrame?.frame || startFrame + 1,
      shotType: chooseShotType(keyFrame || slice[0] || {}, options.aspectRatio || '9:16')
    };
  });
}

function buildScenesFromFrameAnalysis(trend, analysis, options = {}) {
  const product = options.productName || 'the selected product';
  const character = options.characterName || 'the selected creator';
  const environment = options.environment || 'the selected environment';
  const cta = options.cta || 'take the next step';
  const scriptBase = options.prompt || trend?.hook || 'Recreate the trend structure for this brand.';
  const segments = analysis.segments || [];
  return segments.map((segment, index) => {
    const first = index === 0;
    const last = index === segments.length - 1;
    const label = first ? 'Hook frame' : last ? 'Payoff and CTA' : `Trend beat ${index + 1}`;
    const keyFrame = analysis.frames.find(frame => frame.frame === segment.keyFrame) || {};
    return {
      id: segment.id,
      title: label,
      start: segment.start,
      end: segment.end,
      duration: segment.duration,
      sourceStartFrame: segment.startFrame,
      sourceEndFrame: segment.endFrame,
      sourceFrameCount: segment.frameCount,
      sourceKeyFrame: segment.keyFrame,
      engine: 'seedance2-fast',
      pacing: [
        `mirror frames ${segment.startFrame}-${segment.endFrame}`,
        `${segment.frameCount} source frames`,
        segment.shotType,
        segment.averageMotion > 0.12 ? 'high motion' : 'steady motion'
      ].join(' · '),
      script: first
        ? scriptBase
        : last
          ? `Land the payoff and CTA for ${product}: ${cta}.`
          : `Continue the trend beat using ${character} and ${product}.`,
      visualPrompt: [
        `Recreate source frames ${segment.startFrame}-${segment.endFrame} from ${round(segment.start, 2)}s to ${round(segment.end, 2)}s as a new branded Seedance scene.`,
        `Replace the original creator with ${character}. Replace the original object/product with ${product}. Use ${environment}.`,
        `Match shot type: ${segment.shotType}. Match pacing and camera rhythm from the frame timeline, including motion intensity ${segment.averageMotion}.`,
        `Keyframe style: dominant color ${keyFrame.averageColor || 'source palette'}, brightness ${keyFrame.brightness ?? 'source'}, composition ${keyFrame.composition?.focusHint || 'source composition'}.`,
        last ? `End with a confident call to action: ${cta}.` : ''
      ].filter(Boolean).join('\n'),
      negativePrompt: 'cropped bottom, cropped face, wrong aspect ratio, distorted eyes, extra fingers, duplicate person, unreadable product, watermark, captions, text overlays',
      sourceTrendId: trend?.id || '',
      sourceTrendUrl: trend?.url || options.sourceTrendUrl || '',
      referenceVideoUrl: trend?.url || options.sourceTrendUrl || '',
      frameAnalysis: {
        startFrame: segment.startFrame,
        endFrame: segment.endFrame,
        keyFrame: segment.keyFrame,
        frameCount: segment.frameCount,
        averageMotion: segment.averageMotion,
        averageBrightness: segment.averageBrightness
      }
    };
  });
}

async function analyzeTrendVideoFile(videoPath, options = {}) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bloom-trend-frames-'));
  const frameDir = path.join(tempDir, 'frames');
  try {
    const probe = await probeVideo(videoPath);
    const hardLimit = Number(options.maxFrames || process.env.TREND_FRAME_ANALYSIS_MAX_FRAMES || 900);
    if (probe.frameCount && probe.frameCount > hardLimit) {
      throw new Error(`Trend has ${probe.frameCount} frames. The current safety limit is ${hardLimit}; trim the source or raise TREND_FRAME_ANALYSIS_MAX_FRAMES.`);
    }
    const framePaths = await extractAllFrames(videoPath, frameDir, options);
    if (framePaths.length > hardLimit) {
      throw new Error(`Trend extracted ${framePaths.length} frames. The current safety limit is ${hardLimit}; trim the source or raise TREND_FRAME_ANALYSIS_MAX_FRAMES.`);
    }
    const fps = probe.fps || (framePaths.length && probe.duration ? framePaths.length / probe.duration : 24);
    const frames = [];
    let previous = null;
    for (let index = 0; index < framePaths.length; index += 1) {
      const metric = await analyzeFrame(framePaths[index], index, fps, previous);
      previous = metric.raw;
      frames.push(metric.json);
    }
    const actualDuration = probe.duration || (frames.length / Math.max(fps, 1));
    const segments = detectSegments(frames, actualDuration, { ...options, fps });
    const motionValues = frames.map(frame => frame.motionDelta || 0);
    const brightnessValues = frames.map(frame => frame.brightness || 0);
    return {
      probe: {
        ...probe,
        fps: round(fps, 3),
        decodedFrameCount: framePaths.length,
        exactFrameTimeline: framePaths.length === probe.frameCount || !probe.frameCount
      },
      summary: {
        totalFrames: frames.length,
        duration: round(actualDuration, 3),
        averageMotion: round(motionValues.reduce((sum, value) => sum + value, 0) / Math.max(motionValues.length, 1), 3),
        peakMotion: round(Math.max(...motionValues, 0), 3),
        averageBrightness: round(brightnessValues.reduce((sum, value) => sum + value, 0) / Math.max(brightnessValues.length, 1), 3),
        detectedScenes: segments.length
      },
      frames,
      segments
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function buildFrameWorkflow(trend, analysis, options = {}) {
  const scenes = buildScenesFromFrameAnalysis(trend, analysis, options);
  const nodes = [
    {
      id: 'source-trend',
      type: 'source.video',
      label: 'Source trend video',
      data: {
        url: trend?.url || options.sourceTrendUrl || '',
        totalFrames: analysis.summary.totalFrames,
        duration: analysis.summary.duration,
        fps: analysis.probe.fps
      }
    },
    {
      id: 'frame-analysis',
      type: 'analysis.frame-timeline',
      label: 'Exact frame timeline',
      data: {
        frames: analysis.frames,
        segments: analysis.segments
      }
    },
    {
      id: 'replace-character',
      type: 'replacement.character',
      label: 'Replace character',
      data: { value: options.characterName || '', accepts: ['image', 'character_asset', 'clothing_style'] }
    },
    {
      id: 'replace-product',
      type: 'replacement.product',
      label: 'Replace product',
      data: { value: options.productName || '', accepts: ['image', 'product_asset'] }
    },
    {
      id: 'replace-environment',
      type: 'replacement.environment',
      label: 'Replace environment',
      data: { value: options.environment || '', accepts: ['text', 'image', 'environment_asset'] }
    },
    {
      id: 'replace-script',
      type: 'replacement.script',
      label: 'Replace script / CTA',
      data: { prompt: options.prompt || trend?.hook || '', cta: options.cta || '' }
    },
    ...scenes.map((scene, index) => ({
      id: scene.id,
      type: 'render.seedance.scene',
      label: scene.title || `Scene ${index + 1}`,
      data: scene
    })),
    {
      id: 'assemble-final',
      type: 'assembly.concat',
      label: 'Reassemble final video',
      data: {
        method: 'concat_in_source_timing_order',
        sourceSceneOrder: scenes.map(scene => scene.id),
        preserveSourceTiming: true,
        output: 'single_final_campaign_video'
      }
    }
  ];
  const edges = [
    { from: 'source-trend', to: 'frame-analysis', label: 'decode every frame' },
    ...scenes.map(scene => ({ from: 'frame-analysis', to: scene.id, label: 'source frames and timing' })),
    ...scenes.flatMap(scene => [
      { from: 'replace-character', to: scene.id, label: 'character identity' },
      { from: 'replace-product', to: scene.id, label: 'product identity' },
      { from: 'replace-environment', to: scene.id, label: 'location/background' },
      { from: 'replace-script', to: scene.id, label: 'spoken/script intent' },
      { from: scene.id, to: 'assemble-final', label: 'rendered clip' }
    ])
  ];
  return {
    schema: 'bloom.trend.frame_workflow.v1',
    source: {
      trendId: trend?.id || '',
      url: trend?.url || options.sourceTrendUrl || '',
      hook: trend?.hook || '',
      platform: trend?.platform || ''
    },
    frameAnalysis: analysis,
    scenes,
    nodeGraph: {
      schema: 'bloom.canvas.graph.v1',
      nodes,
      edges
    },
    assembly: {
      method: 'render_scene_clips_then_concat',
      order: scenes.map(scene => scene.id),
      preserveSourceTiming: true,
      audio: 'source_transcript_or_brand_voiceover',
      output: 'single_final_campaign_video'
    },
    replacements: {
      characterName: options.characterName || '',
      productName: options.productName || '',
      environment: options.environment || '',
      cta: options.cta || ''
    }
  };
}

module.exports = {
  analyzeTrendVideoFile,
  buildFrameWorkflow,
  materializeVideoSource
};
