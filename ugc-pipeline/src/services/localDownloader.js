const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function downloadWithYtDlp(sourceUrl, options = {}) {
  if (!sourceUrl) throw new Error('A source URL is required.');

  const audioOnly = !!options.audioOnly;
  const maxDuration = Number(options.maxDuration || 180);
  const timeoutMs = Number(options.timeoutMs || 900000);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bloom-source-'));

  try {
    const outputTemplate = path.join(tempDir, 'source.%(ext)s');
    const args = [
      '--no-playlist',
      '--socket-timeout',
      String(options.socketTimeout || 20),
      '--retries',
      String(options.retries || 2),
      '--fragment-retries',
      String(options.fragmentRetries || 2),
      '--max-filesize',
      String(options.maxFilesize || '500M'),
      '--download-sections',
      `*0-${maxDuration}`,
      '-o',
      outputTemplate
    ];

    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      args.push('-f', 'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', '--merge-output-format', 'mp4');
    }
    args.push(sourceUrl);

    await execFileAsync('yt-dlp', args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 5
    });

    const files = (await fs.promises.readdir(tempDir))
      .map(name => path.join(tempDir, name))
      .filter(filePath => fs.existsSync(filePath) && fs.statSync(filePath).isFile());

    if (!files.length) throw new Error('yt-dlp completed but did not produce an output file.');
    const filePath = files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    const buffer = await fs.promises.readFile(filePath);
    const mimeType = audioOnly ? 'audio/mpeg' : 'video/mp4';
    const extension = audioOnly ? 'mp3' : 'mp4';

    return {
      url: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      fileName: `source.${extension}`,
      sizeBytes: buffer.length,
      raw: {
        provider: 'local-yt-dlp',
        fileName: path.basename(filePath),
        sizeBytes: buffer.length
      }
    };
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(`Local downloader failed: ${String(detail).slice(-2000)}`);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  downloadWithYtDlp
};
