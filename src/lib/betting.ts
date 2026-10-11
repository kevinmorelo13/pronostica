export const BOOKMAKER_MARGIN = 0.06;
export const SCORE_SETTLEABLE_MARKETS = new Set([
  '1X2',
  'Doble oportunidad',
  'Goles',
  'Resultado',
]);

export function estimatedOdds(probability: number | null | undefined): number {
  const raw = Number(probability ?? 0);
  const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
  if (percent <= 0) return 0;
  const fairOdds = 100 / percent;
  const adjusted = fairOdds / (1 + BOOKMAKER_MARGIN);
  return Math.max(1.01, Number(adjusted.toFixed(2)));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type BetEvaluation = {
  verifiable: boolean;
  correct: boolean;
  actual: string;
};

export function evaluateBetFromScore(
  label: string | null | undefined,
  homeScore: number,
  awayScore: number,
  homeName: string,
  awayName: string,
): BetEvaluation {
  const totalGoals = homeScore + awayScore;
  const actualResult = homeScore > awayScore
    ? `Victoria ${homeName}`
    : awayScore > homeScore
      ? `Victoria ${awayName}`
      : 'Empate';

  if (!label) return { verifiable: false, correct: false, actual: actualResult };

  const n = normalizeText(label);
  if (
    n.includes('corner')
    || n.includes('tarjeta')
    || n.includes('disparo')
  ) {
    return { verifiable: false, correct: false, actual: 'No verificable con el marcador' };
  }

  const home = normalizeText(homeName);
  const away = normalizeText(awayName);

  if (n === 'empate') {
    return { verifiable: true, correct: homeScore === awayScore, actual: actualResult };
  }
  if (n === `victoria ${home}` || n === 'victoria local') {
    return { verifiable: true, correct: homeScore > awayScore, actual: actualResult };
  }
  if (n === `victoria ${away}` || n === 'victoria visitante') {
    return { verifiable: true, correct: awayScore > homeScore, actual: actualResult };
  }

  const isDoubleChance = n.includes('doble oportunidad') || n.startsWith('1x') || n.startsWith('x2') || n.startsWith('12');
  if (isDoubleChance) {
    if (n.includes('12') || (n.includes(home) && n.includes(away))) {
      return { verifiable: true, correct: homeScore !== awayScore, actual: actualResult };
    }
    if (n.startsWith('1x') || (n.includes(home) && n.includes('empate'))) {
      return { verifiable: true, correct: homeScore >= awayScore, actual: actualResult };
    }
    if (n.startsWith('x2') || (n.includes(away) && n.includes('empate'))) {
      return { verifiable: true, correct: awayScore >= homeScore, actual: actualResult };
    }
  }

  if (n.includes('ambos') && (n.includes('marcan') || n.includes('marca'))) {
    const bothScore = homeScore > 0 && awayScore > 0;
    const wantsBoth = !n.includes('no marcan') && !n.includes('no marca');
    return {
      verifiable: true,
      correct: wantsBoth ? bothScore : !bothScore,
      actual: `${homeScore}-${awayScore}`,
    };
  }

  const exactScore = n.match(/resultado exacto (\d+)\s*-\s*(\d+)/);
  if (exactScore) {
    return {
      verifiable: true,
      correct: homeScore === Number(exactScore[1]) && awayScore === Number(exactScore[2]),
      actual: `${homeScore}-${awayScore}`,
    };
  }

  const over = n.match(/mas de (\d+(?:\.\d+)?)/);
  const under = n.match(/menos de (\d+(?:\.\d+)?)/);
  if (over) {
    const line = Number(over[1]);
    return { verifiable: true, correct: totalGoals > line, actual: `${totalGoals} goles` };
  }
  if (under) {
    const line = Number(under[1]);
    return { verifiable: true, correct: totalGoals < line, actual: `${totalGoals} goles` };
  }

  return { verifiable: false, correct: false, actual: actualResult };
}
