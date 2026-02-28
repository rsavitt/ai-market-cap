import { getScoreHistory } from './db';

export interface AnomalyResult {
  isAnomaly: boolean;
  reason?: string;
  dailyChange: number;
  meanDelta: number;
  stdDevDelta: number;
}

/**
 * Flag if daily score change > 3 standard deviations from 90-day mean of daily deltas.
 */
export function detectVelocityAnomaly(
  entityId: string,
  newScore: number,
): AnomalyResult {
  const history = getScoreHistory(entityId, 90);

  if (history.length < 7) {
    return { isAnomaly: false, dailyChange: 0, meanDelta: 0, stdDevDelta: 0 };
  }

  // history is newest-first, compute daily deltas (older to newer)
  const reversed = [...history].reverse();
  const deltas: number[] = [];
  for (let i = 1; i < reversed.length; i++) {
    deltas.push(reversed[i] - reversed[i - 1]);
  }

  if (deltas.length < 2) {
    return { isAnomaly: false, dailyChange: 0, meanDelta: 0, stdDevDelta: 0 };
  }

  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((sum, d) => sum + (d - meanDelta) ** 2, 0) / (deltas.length - 1);
  const stdDevDelta = Math.sqrt(variance);

  const dailyChange = newScore - history[0]; // history[0] is most recent

  const isAnomaly = stdDevDelta > 0 && Math.abs(dailyChange - meanDelta) > 3 * stdDevDelta;

  return {
    isAnomaly,
    reason: isAnomaly ? `Daily change ${dailyChange.toFixed(2)} exceeds 3σ (mean=${meanDelta.toFixed(2)}, σ=${stdDevDelta.toFixed(2)})` : undefined,
    dailyChange,
    meanDelta,
    stdDevDelta,
  };
}

/**
 * For >5pt total score changes, require corroboration from 2+ independent signal sources.
 * Returns true if the change is confirmed by multiple sources, false if suspicious.
 */
export function requireMultiSourceConfirmation(
  signals: Map<string, number>,
  previousSignals: Map<string, number>,
  threshold: number = 5,
): { confirmed: boolean; changedSources: string[]; totalChange: number } {
  const changedSources: string[] = [];
  let totalChange = 0;

  signals.forEach((value, name) => {
    const prev = previousSignals.get(name) ?? 0;
    const delta = Math.abs(value - prev);
    if (delta > 0) {
      changedSources.push(name);
      totalChange += delta;
    }
  });

  if (totalChange <= threshold) {
    return { confirmed: true, changedSources, totalChange };
  }

  return {
    confirmed: changedSources.length >= 2,
    changedSources,
    totalChange,
  };
}
