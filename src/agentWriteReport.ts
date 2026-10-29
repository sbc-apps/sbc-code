/** Evidence of actual source writes, never inferred from model text. */
export interface AppliedFileChange {
  created: string[];
  modified: string[];
}

export interface AgentWriteReport extends AppliedFileChange {
  appliedBatches: number;
  writeToolsAttempted: number;
}

export function initialWriteReport(): AgentWriteReport {
  return { created: [], modified: [], appliedBatches: 0, writeToolsAttempted: 0 };
}

/**
 * Only a successful WorkspaceEdit tool response can change the report.
 * Model output claiming a file exists/was created is NOT execution evidence.
 */
export function recordWriteToolResult(
  report: AgentWriteReport,
  toolName: string,
  output: string,
): AgentWriteReport {
  if (toolName !== 'propose_edits' && toolName !== 'propose_patch') {
    return report;
  }
  const next: AgentWriteReport = {
    ...report,
    created: [...report.created],
    modified: [...report.modified],
    writeToolsAttempted: report.writeToolsAttempted + 1,
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return next;
  }
  if (!parsed || typeof parsed !== 'object') {
    return next;
  }
  const result = parsed as { applied?: unknown; created?: unknown; modified?: unknown };
  if (result.applied !== true || !Array.isArray(result.created) || !Array.isArray(result.modified)) {
    return next;
  }

  const valid = (items: unknown[]): string[] => items
    .filter((item): item is string =>
      typeof item === 'string' && item.length > 0 && item.length <= 400
    );
  const created = valid(result.created);
  const modified = valid(result.modified);
  next.appliedBatches++;
  next.created = [...new Set([...next.created, ...created])];
  next.modified = [...new Set([...next.modified, ...modified])]
    .filter((name) => !next.created.includes(name));
  return next;
}
