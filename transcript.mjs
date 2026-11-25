import { open, readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { compact, identifyModel, percentage, shortModelName, shortTierName } from './metrics.mjs';
import { displayWidth } from './render.mjs';

function buildRunSegments(steps) {
  const runs = [];
  for (const step of steps) {
    const tier = step.tier;
    if (!tier) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.tier === tier) {
      prev.count += 1;
    } else {
      runs.push({ tier, count: 1 });
    }
  }
  return runs;
}

function parsePlannerEntries(text, skipFirstLine = false) {
  const lines = text.split('\n');
  const startIdx = skipFirstLine ? 1 : 0;
  const steps = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'PLANNER_RESPONSE' || typeof entry.model !== 'string' || !entry.model.trim()) {
      continue;
    }
    const identified = identifyModel(entry.model);
    const display = identified?.display || entry.model.trim();
    steps.push({
      rawModel: entry.model.trim(),
      display,
      short: shortModelName(display) || display,
      tier: shortTierName(display) || display,
      key: identified?.key ?? null,
      quotaGroup: identified?.quotaGroup ?? null,
      stepIndex: Number.isSafeInteger(entry.step_index) ? entry.step_index : null,
      status: typeof entry.status === 'string' ? entry.status : null,
      inputTokens: Number.isSafeInteger(entry.input_tokens) ? entry.input_tokens : null,
      cacheReadTokens: Number.isSafeInteger(entry.cache_read_tokens) ? entry.cache_read_tokens : null,
      outputTokens: Number.isSafeInteger(entry.output_tokens) ? entry.output_tokens : null,
      createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      tools: Array.isArray(entry.tool_calls)
        ? entry.tool_calls.map(call => call?.name).filter(Boolean)
        : [],
    });
  }
  return steps;
}

/**
 * Safely read the tail of a transcript.jsonl file (< 5ms) to inspect the latest
 * actual model and recent model transitions. Never throws.
 */
export async function readTranscriptSummary(transcriptPath, { maxBytes = 262144 } = {}) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.trim()) return null;
  let handle;
  try {
    handle = await open(transcriptPath.trim(), 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0) return null;
    const offset = Math.max(0, info.size - maxBytes);
    const length = info.size - offset;
    const buffer = Buffer.allocUnsafe(length);
    let bytesRead = 0;
    while (bytesRead < length) {
      const chunk = await handle.read(buffer, bytesRead, length - bytesRead, offset + bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const steps = parsePlannerEntries(text, offset > 0);
    if (!steps.length) return null;

    const latest = steps[steps.length - 1];
    const allRuns = buildRunSegments(steps);
    const runs = allRuns.slice(-4);
    const hasSwitch = allRuns.length >= 2;
    const cacheCold = latest.cacheReadTokens === 0 && (latest.inputTokens ?? 0) >= 10000;

    return {
      latestModel: {
        raw: latest.rawModel,
        display: latest.display,
        short: latest.short,
        tier: latest.tier,
        key: latest.key,
        quotaGroup: latest.quotaGroup,
      },
      latestStep: {
        stepIndex: latest.stepIndex,
        status: latest.status,
        inputTokens: latest.inputTokens,
        cacheReadTokens: latest.cacheReadTokens,
        outputTokens: latest.outputTokens,
        createdAt: latest.createdAt,
      },
      runs,
      hasSwitch,
      cacheCold,
      stepCount: steps.length,
    };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Locate the most recently updated transcript.jsonl under ~/.gemini/antigravity-cli/brain/. */
export async function findLatestTranscript(baseDir = join(homedir(), '.gemini', 'antigravity-cli', 'brain')) {
  try {
    const dirs = await readdir(baseDir, { withFileTypes: true });
    let best = null;
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const candidate = join(baseDir, dir.name, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        const info = await stat(candidate);
        if (info.isFile() && (!best || info.mtimeMs > best.mtimeMs)) {
          best = { path: candidate, mtimeMs: info.mtimeMs };
        }
      } catch {
        // Ignore missing transcripts
      }
    }
    return best?.path || null;
  } catch {
    return null;
  }
}

function padRight(text, len) {
  const w = displayWidth(text);
  return w >= len ? text : text + ' '.repeat(len - w);
}

function padLeft(text, len) {
  const w = displayWidth(text);
  return w >= len ? text : ' '.repeat(len - w) + text;
}

/** Format a full per-step model + token breakdown table for --history inspection. */
export async function formatTranscriptHistory(transcriptPath, { language = 'zh-CN', color = true } = {}) {
  const isZh = language !== 'en';
  const raw = await readFile(transcriptPath, 'utf8');
  const steps = parsePlannerEntries(raw, false);
  if (!steps.length) {
    return isZh ? `未在 ${transcriptPath} 中找到模型调用记录。` : `No PLANNER_RESPONSE steps found in ${transcriptPath}.`;
  }

  const paint = (text, code) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const header = isZh
    ? `会话明细: ${transcriptPath}\n`
    : `Transcript history: ${transcriptPath}\n`;

  const cols = isZh
    ? ['步序', '时间(UTC)', '实际模型', '输入', '缓存读取', '命中率', '输出', '工具']
    : ['Step', 'Time(UTC)', 'Actual Model', 'Input', 'Cache', 'Hit%', 'Output', 'Tools'];

  const lines = [
    header,
    [
      padLeft(cols[0], 4),
      padRight(cols[1], 10),
      padRight(cols[2], 24),
      padLeft(cols[3], 7),
      padLeft(cols[4], 8),
      padLeft(cols[5], 7),
      padLeft(cols[6], 7),
      cols[7],
    ].join('  '),
    '-'.repeat(92),
  ];

  const summary = new Map();
  for (const step of steps) {
    const time = step.createdAt ? step.createdAt.slice(11, 19) : '--:--:--';
    const inp = step.inputTokens ?? 0;
    const cache = step.cacheReadTokens ?? 0;
    const denom = inp + cache;
    const hitRate = denom > 0 ? percentage((cache / denom) * 100) : '--';
    const toolsText = step.tools.length ? step.tools.slice(0, 3).join(',') + (step.tools.length > 3 ? `+${step.tools.length - 3}` : '') : '-';

    const row = [
      padLeft(String(step.stepIndex ?? '-'), 4),
      padRight(time, 10),
      padRight(step.display.slice(0, 24), 24),
      padLeft(compact(step.inputTokens), 7),
      padLeft(compact(step.cacheReadTokens), 8),
      padLeft(hitRate, 7),
      padLeft(compact(step.outputTokens), 7),
      toolsText,
    ].join('  ');
    lines.push(row);

    const acc = summary.get(step.display) || { steps: 0, input: 0, cache: 0, output: 0 };
    acc.steps += 1;
    acc.input += inp;
    acc.cache += cache;
    acc.output += step.outputTokens ?? 0;
    summary.set(step.display, acc);
  }

  lines.push('-'.repeat(92));
  lines.push(paint(isZh ? '按实际模型汇总:' : 'Summary by actual model:', '1;36'));
  for (const [modelName, acc] of summary.entries()) {
    const line = isZh
      ? `  ${padRight(modelName, 26)} ${acc.steps} 步  ·  输入 ${compact(acc.input)}  ·  缓存 ${compact(acc.cache)}  ·  输出 ${compact(acc.output)}`
      : `  ${padRight(modelName, 26)} ${acc.steps} steps  ·  in ${compact(acc.input)}  ·  cache ${compact(acc.cache)}  ·  out ${compact(acc.output)}`;
    lines.push(line);
  }
  return lines.join('\n');
}
