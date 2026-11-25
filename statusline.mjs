#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { normalize } from './metrics.mjs';
import { render } from './render.mjs';
import { findLatestTranscript, formatTranscriptHistory, readTranscriptSummary } from './transcript.mjs';

const MAX_INPUT = 256 * 1024;
const help = `AGY Statusline Pro (Node.js 20+)
Enhanced Antigravity CLI statusLine with live actual model tracking & token counts.
  --preview              Render synthetic single-model payload
  --preview-orchestrator Render synthetic Orchestrator (Neon -> Hydrogen) payload with alerts
  --history [path]       Show per-step actual model and token table for a transcript
  --language en|zh-CN|zh-TW  Override display language (default: zh-CN)
  --width 1..500         Override terminal columns
  --details              Show extra cumulative totals & subagent list line
  --no-transcript        Skip reading transcript_path
  --no-color             Disable ANSI colors (honors NO_COLOR and TERM=dumb)
  --json                 Print normalized JSON metrics
  --help                 Show this help
`;

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--preview', '--preview-orchestrator', '--details', '--json', '--help', '--no-color', '--no-transcript'].includes(arg)) {
      result[arg.slice(2)] = true;
    } else if (arg === '--language') {
      const value = args[++i];
      if (!['en', 'zh-CN', 'zh-TW'].includes(value)) throw new Error('Invalid language');
      result.language = value;
    } else if (arg === '--width') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error('Invalid width');
      result.width = value;
    } else if (arg === '--history') {
      result.history = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.historyPath = args[++i];
      }
    } else {
      throw new Error('Invalid option');
    }
  }
  return result;
}

async function readStdinJson() {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) throw new Error('Oversized input');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
}

async function readCliConfiguredModel() {
  try {
    const file = join(homedir(), '.gemini', 'antigravity-cli', 'settings.json');
    const parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    return typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : null;
  } catch {
    return null;
  }
}

async function readSavedLanguage() {
  try {
    const home = homedir();
    const prefFile =
      process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'AntigravityPulse', 'preferences.json')
        : process.platform === 'win32'
          ? join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'AntigravityPulse', 'preferences.json')
          : join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'AntigravityPulse', 'preferences.json');
    const parsed = JSON.parse((await readFile(prefFile, 'utf8')).replace(/^\uFEFF/, ''));
    if (['en', 'zh-CN', 'zh-TW'].includes(parsed.language)) return parsed.language;
  } catch {
    // Ignore missing preference file
  }
  return 'zh-CN';
}

function previewPayload(orchestrator = false) {
  if (!orchestrator) {
    return {
      version: '1.5.16',
      model: { id: 'gemini-4-neon-high', display_name: 'Gemini 4 Neon (High)', effort: 'high' },
      agent_state: 'idle',
      terminal_width: 110,
      context_window: {
        total_input_tokens: 48210,
        total_output_tokens: 6420,
        used_percentage: 14.2,
        context_window_size: 1048576,
        current_usage: {
          input_tokens: 5210,
          output_tokens: 1140,
          cache_read_input_tokens: 143700,
          cache_creation_input_tokens: 0,
        },
      },
      quota: {
        'gemini-5h': { remaining_fraction: 0.615, reset_in_seconds: 9960 },
        'gemini-weekly': { remaining_fraction: 0.855, reset_in_seconds: 529200 },
        '3p-5h': { remaining_fraction: 1.0, reset_in_seconds: 30 },
        '3p-weekly': { remaining_fraction: 1.0, reset_in_seconds: 30 },
      },
    };
  }
  return {
    version: '1.5.16',
    model: { id: 'gemini-pro-orchestrator-neon', display_name: 'Orchestrator (Neon)' },
    agent_state: 'working',
    cycle_mode: 'plan',
    sandbox: { enabled: true },
    tool_confirmation_pending: true,
    pending_input_count: 1,
    task_count: 1,
    artifact_count: 2,
    terminal_width: 120,
    exceeds_200k_tokens: true,
    subagents: [{ name: 'research', role: 'Codebase Researcher', model: 'gemini-4-neon-high', status: 'running' }],
    cost: { total_usd: 0.421, subagent_usd: 0.05, estimated: true },
    context_window: {
      total_input_tokens: 342100,
      total_output_tokens: 18420,
      used_percentage: 23.8,
      context_window_size: 1048576,
      current_usage: {
        input_tokens: 54127,
        output_tokens: 1184,
        cache_read_input_tokens: 195400,
        cache_creation_input_tokens: 0,
      },
    },
    quota: {
      'gemini-5h': { remaining_fraction: 0.615, reset_in_seconds: 9960 },
      'gemini-weekly': { remaining_fraction: 0.855, reset_in_seconds: 529200 },
      '3p-5h': { remaining_fraction: 1.0, reset_in_seconds: 30 },
      '3p-weekly': { remaining_fraction: 1.0, reset_in_seconds: 30 },
    },
    _syntheticTranscript: {
      latestModel: {
        raw: 'gemini-4-hydrogen-high',
        display: 'Gemini 4 Hydrogen (High)',
        short: 'Hydrogen (High)',
        tier: 'Hydrogen',
        key: 'gemini-4-hydrogen',
        quotaGroup: 'gemini',
      },
      latestStep: { stepIndex: 30, status: 'DONE', inputTokens: 54127, cacheReadTokens: 0, outputTokens: 1184 },
      runs: [
        { tier: 'Neon', count: 7 },
        { tier: 'Hydrogen', count: 4 },
      ],
      hasSwitch: true,
      cacheCold: false,
      stepCount: 11,
    },
  };
}

try {
  const opts = options(process.argv.slice(2));
  const useColor = !opts['no-color'] && !Object.hasOwn(process.env, 'NO_COLOR') && process.env.TERM !== 'dumb';
  const language = opts.language || (await readSavedLanguage());

  if (opts.help) {
    process.stdout.write(help);
  } else if (opts.history) {
    const targetPath = opts.historyPath || (await findLatestTranscript());
    if (!targetPath) {
      process.stdout.write(language === 'en' ? 'No transcript found.\n' : '未找到本地会话 transcript.jsonl 文件。\n');
    } else {
      const table = await formatTranscriptHistory(targetPath, { language, color: useColor });
      process.stdout.write(table + '\n');
    }
  } else {
    const rawPayload = opts.preview || opts['preview-orchestrator']
      ? previewPayload(Boolean(opts['preview-orchestrator']))
      : await readStdinJson();
    const configuredFallback = rawPayload?.model ? null : await readCliConfiguredModel();
    const metrics = normalize(rawPayload, configuredFallback);

    if (rawPayload._syntheticTranscript) {
      metrics.transcript = rawPayload._syntheticTranscript;
      metrics.actualModel = rawPayload._syntheticTranscript.latestModel;
    } else if (!opts['no-transcript'] && metrics.transcriptPath) {
      const summary = await readTranscriptSummary(metrics.transcriptPath);
      if (summary) {
        metrics.transcript = summary;
        metrics.actualModel = summary.latestModel;
        if (summary.cacheCold && (metrics.cacheReadTokens === null || metrics.cacheReadTokens === 0)) {
          metrics.cacheRebuilding = true;
        }
      }
    }

    const out = opts.json
      ? JSON.stringify(metrics)
      : render(metrics, {
          language,
          width: opts.width || metrics.width,
          details: Boolean(opts.details),
          color: useColor,
        });
    process.stdout.write(out + '\n');
  }
} catch {
  process.stdout.write('AGY Statusline: --\n');
  process.exitCode = 1;
}
