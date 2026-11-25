import { compact, compactCapacity, countdown, formatCwd, percentage, quotaGroupForModel, shortModelName } from './metrics.mjs';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const clusters = text => [...segmenter.segment(text)].map(item => item.segment);

function cellWidth(cluster) {
  if (/^\p{Mark}+$/u.test(cluster)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(cluster)) return 2;
  const code = cluster.codePointAt(0);
  return code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd))
    ? 2
    : 1;
}

export const displayWidth = text => clusters(text).reduce((sum, item) => sum + cellWidth(item), 0);

const labels = {
  en: {
    context: 'Context',
    shortContext: 'Ctx',
    cache: 'Cache',
    read: 'read',
    writeShort: '+write',
    rebuilding: 'cache rebuild',
    compactHint: 'suggest /compact',
    model: 'Model',
    actual: 'actual',
    trail: 'Trail',
    inShort: 'In',
    outShort: 'Out',
    totalIn: 'Total in',
    totalOut: 'Total out',
    created: 'Cache write',
    artifacts: 'Artifacts',
    capacity: 'Cap',
    left: 'left',
    quota: 'Quota',
    week: 'week',
    disabled: 'Unavailable',
    unknown: 'Unknown',
    idle: 'Ready',
    thinking: 'Thinking',
    working: 'Working',
    tool_use: 'Tool',
    initializing: 'Starting',
    reviewing: 'Review',
    authenticating: 'Auth',
    error: 'Error',
    confirmPending: '[! Confirm]',
    sandbox: '[Sandbox]',
    subagents: 'Subagents',
    bgTasks: 'Tasks',
    queued: 'Queued',
    dir: 'Dir',
  },
  'zh-CN': {
    context: '上下文',
    shortContext: '上下文',
    cache: '缓存',
    read: '读取',
    writeShort: '+写入',
    rebuilding: '缓存重建',
    compactHint: '建议/compact',
    model: '模型',
    actual: '实际',
    trail: '轨迹',
    inShort: '入',
    outShort: '出',
    totalIn: '累计入',
    totalOut: '累计出',
    created: '缓存写入',
    artifacts: '产物',
    capacity: '容量',
    left: '剩余',
    quota: '额度',
    week: '周',
    disabled: '不可用',
    unknown: '未知',
    idle: '就绪',
    thinking: '思考中',
    working: '生成中',
    tool_use: '工具',
    initializing: '启动中',
    reviewing: '审查中',
    authenticating: '认证中',
    error: '异常',
    confirmPending: '[! 待确认]',
    sandbox: '[沙箱]',
    subagents: '子代理',
    bgTasks: '后台',
    queued: '排队',
    dir: '目录',
  },
  'zh-TW': {
    context: '上下文',
    shortContext: '上下文',
    cache: '快取',
    read: '讀取',
    writeShort: '+寫入',
    rebuilding: '快取重建',
    compactHint: '建議/compact',
    model: '模型',
    actual: '實際',
    trail: '軌跡',
    inShort: '入',
    outShort: '出',
    totalIn: '累計入',
    totalOut: '累計出',
    created: '快取寫入',
    artifacts: '產物',
    capacity: '容量',
    left: '剩餘',
    quota: '配額',
    week: '週',
    disabled: '無法使用',
    unknown: '未知',
    idle: '就緒',
    thinking: '思考中',
    working: '生成中',
    tool_use: '工具',
    initializing: '啟動中',
    reviewing: '審查中',
    authenticating: '認證中',
    error: '異常',
    confirmPending: '[! 待確認]',
    sandbox: '[沙盒]',
    subagents: '子代理',
    bgTasks: '背景',
    queued: '排隊',
    dir: '目錄',
  },
};

function modelColor(display) {
  if (!display) return 36;
  if (/\bneon\b/i.test(display)) return 35;
  if (/\bhydrogen\b/i.test(display)) return 32;
  if (/\bargon\b/i.test(display)) return 34;
  if (/\bcarbon\b/i.test(display)) return 36;
  if (/\bclaude\b|\bsonnet\b|\bopus\b|\bhaiku\b/i.test(display)) return '38;2;218;119;86';
  return 36;
}

function stateColor(state) {
  if (state === 'idle') return 32;
  if (state === 'error') return 31;
  if (state === 'reviewing') return 35;
  return 33;
}

function cycleBadge(mode) {
  if (!mode) return null;
  if (mode === 'auto') return { text: '[AUTO]', code: 31, bold: true };
  if (mode === 'plan') return { text: '[PLAN]', code: 36, bold: true };
  if (mode === 'accept-edits') return { text: '[ACCEPT-EDITS]', code: 33, bold: true };
  return { text: `[${mode.toUpperCase()}]`, code: 33, bold: false };
}

export function render(
  metrics,
  { language = 'en', width = metrics.width, color = true, details = false, now = Date.now() } = {}
) {
  const l = labels[language] || labels.en;
  width = Math.max(1, Math.min(500, width));

  const part = (text, code = 39, bold = false, dim = false) => ({ text, code, bold, dim });
  const subtle = text => part(text, 39, false, true);
  const plain = parts => parts.map(item => item.text).join('');

  const fit = parts => {
    if (displayWidth(plain(parts)) <= width) return parts;
    const result = [];
    let left = width - 1;
    for (const item of parts) {
      let text = '';
      for (const cluster of clusters(item.text)) {
        const size = cellWidth(cluster);
        if (size > left) break;
        text += cluster;
        left -= size;
      }
      if (text) result.push({ ...item, text });
      if (text !== item.text) break;
    }
    return [...result, subtle('…')];
  };

  const paint = parts =>
    fit(parts)
      .map(item =>
        color ? `\x1b[${item.bold ? '1;' : item.dim ? '2;' : ''}${item.code}m${item.text}\x1b[0m` : item.text
      )
      .join('');

  const bar = (value, code, size) => {
    if (value === null) return [];
    const filled = Math.min(size, Math.max(0, Math.round((value / 100) * size)));
    return [part('█'.repeat(filled), code), subtle('░'.repeat(size - filled))];
  };

  // --- Line 1: Context + Token Count + Hints + Cache + State + Urgent Confirm Alert ---
  const used = metrics.context.usedPercentage;
  const level = used !== null && used >= 90 ? 31 : used !== null && used >= 60 ? 33 : 36;
  const rate = metrics.cacheRate?.percentage ?? null;

  const tokenSpan = () => {
    if (metrics.context.usedTokens === null && metrics.context.capacity === null) return '';
    return ` (${compact(metrics.context.usedTokens)}/${compactCapacity(metrics.context.capacity)})`;
  };

  const buildMainRow = ({ showTokens, showBars, showCacheReads, showContextHints, showCacheHints, dirMode, short }) => {
    const sep = short ? ' │ ' : '  │  ';
    const row = [
      part(`${short ? l.shortContext : l.context} `),
      part(percentage(used), used === null ? 39 : level, true),
    ];
    if (showTokens) {
      const span = tokenSpan();
      if (span) row.push(subtle(span));
    }
    if (used !== null && used >= 90) row.push(part(' !', 31, true));
    if (showContextHints) {
      if (metrics.context.exceeds200k) row.push(part(' >200K', 33, true));
      if (used !== null && used >= 75) row.push(part(` ${l.compactHint}`, used >= 90 ? 31 : 33, true));
    }
    if (showBars && used !== null) row.push(subtle(' '), ...bar(used, level, 8));

    row.push(subtle(sep), part(`${l.cache} `), part(percentage(rate), rate === null ? 39 : 35, true));
    if (showCacheReads && metrics.cacheRate?.reason !== 'awaiting-stable-usage') {
      row.push(subtle(` · ${compact(metrics.cacheReadTokens)} ${l.read}`));
    }
    if (showCacheHints) {
      if (metrics.cacheCreationTokens > 0) {
        row.push(part(` · ${l.writeShort} ${compact(metrics.cacheCreationTokens)}`, 33));
      } else if (metrics.cacheRebuilding) {
        row.push(part(` · ${l.rebuilding}`, 33));
      }
    }

    row.push(subtle(sep), part(l[metrics.state] || l.unknown, stateColor(metrics.state)));
    if (metrics.toolConfirmationPending) {
      row.push(subtle('  '), part(l.confirmPending, 31, true));
    }
    if (metrics.cwd && dirMode !== 'none') {
      const dirText = formatCwd(metrics.cwd, { basenameOnly: dirMode === 'base' });
      if (dirText) {
        row.push(subtle(sep), part(`${l.dir} `), part(dirText, 34, true));
      }
    }
    return row;
  };

  const mainVariants = [
    { showTokens: true, showBars: width >= 72, showCacheReads: true, showContextHints: true, showCacheHints: true, dirMode: 'full', short: false },
    { showTokens: true, showBars: false, showCacheReads: true, showContextHints: true, showCacheHints: true, dirMode: 'full', short: false },
    { showTokens: true, showBars: false, showCacheReads: true, showContextHints: true, showCacheHints: false, dirMode: 'base', short: true },
    { showTokens: true, showBars: false, showCacheReads: false, showContextHints: false, showCacheHints: false, dirMode: 'base', short: true },
    { showTokens: true, showBars: false, showCacheReads: false, showContextHints: false, showCacheHints: false, dirMode: 'none', short: true },
    { showTokens: false, showBars: false, showCacheReads: false, showContextHints: false, showCacheHints: false, dirMode: 'none', short: true },
  ];
  let main = buildMainRow(mainVariants[0]);
  for (const variant of mainVariants) {
    const candidate = buildMainRow(variant);
    main = candidate;
    if (displayWidth(plain(candidate)) <= width) break;
  }

  // --- Line 2: Configured Model -> Actual Model + Mode/Alerts + Tokens + Trail + Cost ---
  const configured = metrics.model;
  const actual = metrics.actualModel?.display || null;
  const hasActualDiff = Boolean(configured && actual && configured.toLowerCase() !== actual.toLowerCase());

  const buildModelBase = (compactModel = false) => {
    const row = [part(`${l.model} `)];
    if (hasActualDiff) {
      const left = compactModel ? shortModelName(configured) : configured;
      const right = shortModelName(actual) || actual;
      row.push(part(left, 39, true), subtle(' → '), part(`${l.actual} `, 39, false, true), part(right, modelColor(actual), true));
    } else if (configured || actual) {
      const label = configured || actual;
      row.push(part(compactModel ? shortModelName(label) || label : label, modelColor(actual || configured), true));
    } else {
      row.push(subtle('--'));
    }
    return row;
  };

  // Optional segments in priority order (first = highest priority to keep)
  const optionalSegments = [];
  const badge = cycleBadge(metrics.cycleMode);
  if (badge) optionalSegments.push([part(badge.text, badge.code, badge.bold)]);
  if (metrics.vimMode) optionalSegments.push([part(`[${metrics.vimMode}]`, 36, true)]);

  const activeItems = [];
  if (metrics.runningSubagents > 0) activeItems.push(`${l.subagents} ${metrics.runningSubagents}`);
  if (metrics.taskCount > 0) activeItems.push(`${l.bgTasks} ${metrics.taskCount}`);
  if (metrics.pendingInputCount > 0) activeItems.push(`${l.queued} ${metrics.pendingInputCount}`);
  if (activeItems.length) optionalSegments.push([part(activeItems.join(' · '), 33, true)]);

  if (metrics.inputTokens !== null || metrics.outputTokens !== null) {
    optionalSegments.push([subtle(`${l.inShort} ${compact(metrics.inputTokens)} · ${l.outShort} ${compact(metrics.outputTokens)}`)]);
  }

  if (metrics.transcript?.hasSwitch && metrics.transcript.runs?.length >= 2) {
    const trailText = metrics.transcript.runs
      .slice(-3)
      .map(run => (run.count > 1 ? `${run.tier}×${run.count}` : run.tier))
      .join('→');
    optionalSegments.push([subtle(`${l.trail} ${trailText}`)]);
  }

  if (metrics.sandboxEnabled) optionalSegments.push([part(l.sandbox, 32)]);

  if (metrics.cost && metrics.cost.totalUsd > 0) {
    optionalSegments.push([subtle(`$${metrics.cost.totalUsd.toFixed(2)}`)]);
  }

  let modelRow = buildModelBase(false);
  if (displayWidth(plain(modelRow)) > width) {
    modelRow = buildModelBase(true);
  }
  for (const segment of optionalSegments) {
    const candidate = [...modelRow, subtle(' │ '), ...segment];
    if (displayWidth(plain(candidate)) <= width) {
      modelRow = candidate;
    }
  }

  // --- Lines 3..N: Quota Bars ---
  const known = {
    'gemini-5h': ['gemini', 'Gemini', '5h', 36],
    'gemini-weekly': ['gemini', 'Gemini', l.week, 36],
    'gemini-argon-wtu-weekly': ['gemini-argon', 'Argon', l.week, 34],
    '3p-5h': ['3p', 'Claude', '5h', '38;2;218;119;86'],
    '3p-weekly': ['3p', 'Claude', l.week, '38;2;218;119;86'],
  };
  const groups = new Map();
  for (const quota of metrics.quotas) {
    const mapping = known[quota.bucketId];
    const [id, name, window, code] = mapping || [quota.id, quota.id, null, 36];
    const key = (mapping ? 'family:' : 'bucket:') + id;
    if (!groups.has(key)) groups.set(key, { id, name, code, known: !!mapping, windows: [] });
    groups.get(key).windows.push({ ...quota, window });
  }
  const targetGroup =
    metrics.actualModel?.quotaGroup || quotaGroupForModel(metrics.modelId || metrics.model);
  const active =
    targetGroup && groups.has('family:' + targetGroup)
      ? targetGroup
      : targetGroup === 'gemini-argon' && groups.has('family:gemini')
        ? 'gemini'
        : null;
  const order = { gemini: 0, 'gemini-argon': 1, '3p': 2 };
  const sorted = [...groups.values()].sort(
    (a, b) =>
      (b.known && b.id === active ? 1 : 0) - (a.known && a.id === active ? 1 : 0) ||
      (b.known ? 1 : 0) - (a.known ? 1 : 0) ||
      (order[a.id] ?? 99) - (order[b.id] ?? 99) ||
      a.name.localeCompare(b.name)
  );

  const quotaRow = (group, bars, resets) => {
    const label = group.known ? group.name.padEnd(11) : `${group.name} `;
    const row = [part(label, group.code, true), subtle(`${l.left}  `)];
    const windows = [...group.windows].sort((a, b) => (a.window === '5h' ? -1 : 1) - (b.window === '5h' ? -1 : 1));
    for (const [index, quota] of windows.entries()) {
      if (index) row.push(subtle('   │   '));
      if (quota.window) row.push(part(`${quota.window} `));
      const alert = quota.remaining !== null && quota.remaining < 30;
      const code = quota.remaining === null ? 39 : quota.remaining >= 70 ? 32 : quota.remaining >= 30 ? 33 : 31;
      row.push(part(quota.disabled ? l.disabled : percentage(quota.remaining), code, true));
      if (alert) row.push(part(' !', code, true));
      if (bars && quota.remaining !== null) row.push(subtle(' '), ...bar(quota.remaining, code, 5));
      const reset = quota.disabled ? null : countdown(quota, now);
      if (resets && reset !== null) row.push(subtle(`  ↻ ${reset}`));
    }
    return row;
  };

  const lines = [paint(main), paint(modelRow)];
  if (!sorted.length) {
    lines.push(paint([subtle(`${l.quota} --`)]));
  } else {
    const knownCount = sorted.filter(group => group.known).length;
    const visible = sorted.slice(0, Math.min(3, Math.max(2, knownCount)));
    for (const group of visible) {
      let row = quotaRow(group, width >= 100, width >= 80);
      if (displayWidth(plain(row)) > width) row = quotaRow(group, false, width >= 80);
      if (displayWidth(plain(row)) > width) row = quotaRow(group, false, false);
      if (sorted.length > visible.length && group === visible[visible.length - 1]) {
        row.push(subtle(`  … +${sorted.length - visible.length}`));
      }
      lines.push(paint(row));
    }
  }

  if (details) {
    const detailParts = [
      `${l.capacity} ${compactCapacity(metrics.context.capacity)}`,
      `${l.totalIn} ${compact(metrics.totalInputTokens)}`,
      `${l.totalOut} ${compact(metrics.totalOutputTokens)}`,
      `${l.created} ${compact(metrics.cacheCreationTokens)}`,
    ];
    if (metrics.artifactCount > 0) detailParts.push(`${l.artifacts} ${metrics.artifactCount}`);
    if (metrics.subagents?.length) {
      const summary = metrics.subagents
        .map(item => [item.name || item.role || 'subagent', item.model ? `(${item.model})` : null, item.status].filter(Boolean).join(' '))
        .join(', ');
      detailParts.push(`${l.subagents} ${metrics.subagents.length}: ${summary}`);
    }
    lines.push(paint([subtle(detailParts.join(' · '))]));
  }

  return lines.join('\n');
}
