#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'package.json',
  'metrics.mjs',
  'transcript.mjs',
  'render.mjs',
  'statusline.mjs',
  'install.mjs',
  'README.md',
];

function quoteArg(value) {
  return /[\s"'\\]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value;
}

function parseArgs(argv) {
  const opts = { language: 'zh-CN', details: false, uninstall: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--uninstall') opts.uninstall = true;
    else if (arg === '--details') opts.details = true;
    else if (arg === '--language') {
      const val = argv[++i];
      if (!['zh-CN', 'zh-TW', 'en'].includes(val)) throw new Error(`Unsupported language: ${val}`);
      opts.language = val;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node install.mjs [--language zh-CN|zh-TW|en] [--details] [--uninstall]\n'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

async function readJson(file, fallback = {}) {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const cliDir = join(homedir(), '.gemini', 'antigravity-cli');
  const targetDir = join(cliDir, 'agy-statusline-pro');
  const settingsPath = join(cliDir, 'settings.json');
  const backupPath = join(cliDir, '.agy-statusline-pro-backup.json');

  await mkdir(cliDir, { recursive: true });
  const settings = await readJson(settingsPath, {});

  if (opts.uninstall) {
    if (existsSync(backupPath)) {
      const backup = await readJson(backupPath, {});
      if (backup.hadStatusLine) {
        settings.statusLine = backup.previousStatusLine;
      } else {
        delete settings.statusLine;
      }
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
      process.stdout.write(`Restored previous statusLine in ${settingsPath}\n`);
    } else {
      delete settings.statusLine;
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
      process.stdout.write(`Removed statusLine from ${settingsPath}\n`);
    }
    return;
  }

  if (resolve(sourceDir) !== resolve(targetDir)) {
    await mkdir(targetDir, { recursive: true });
    for (const file of FILES) {
      const src = join(sourceDir, file);
      if (existsSync(src)) {
        await copyFile(src, join(targetDir, file));
      }
    }
  }

  if (!existsSync(backupPath)) {
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          hadStatusLine: Object.hasOwn(settings, 'statusLine'),
          previousStatusLine: settings.statusLine ?? null,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  }

  const entry = join(targetDir, 'statusline.mjs');
  const flags = [`--language ${opts.language}`, ...(opts.details ? ['--details'] : [])].join(' ');
  settings.statusLine = {
    type: 'command',
    command: `${quoteArg(process.execPath)} ${quoteArg(entry)} ${flags}`,
    enabled: true,
  };

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  process.stdout.write(`Installed agy-statusline-pro into ${targetDir}\n`);
  process.stdout.write(`Updated statusLine in ${settingsPath}\n`);
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
