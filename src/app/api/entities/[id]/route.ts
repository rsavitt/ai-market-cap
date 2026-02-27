import { NextRequest, NextResponse } from 'next/server';
import { getEntityById, getDailyScores, getLatestScores } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entity = getEntityById(params.id);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const history = getDailyScores(params.id, 30);
    const allScored = getLatestScores();
    const scored = allScored.find(e => e.id === params.id);

    const competitors = allScored
      .filter(e => e.category === entity.category && e.id !== entity.id)
      .map(e => ({
        id: e.id,
        name: e.name,
        company: e.company,
        total_score: e.total_score,
        category: e.category,
        category_rank: e.category_rank,
      }));

    return NextResponse.json({
      entity: {
        ...entity,
        usage_score: scored?.usage_score ?? 0,
        attention_score: scored?.attention_score ?? 0,
        capability_score: scored?.capability_score ?? 0,
        expert_score: scored?.expert_score ?? 0,
        total_score: scored?.total_score ?? 0,
        overall_rank: scored?.overall_rank ?? 0,
        category_rank: scored?.category_rank ?? 0,
        momentum_7d: scored?.momentum_7d ?? 0,
        volatility: scored?.volatility ?? 0,
      },
      history: history.reverse(),
      competitors,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
