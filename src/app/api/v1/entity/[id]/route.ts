import { NextRequest, NextResponse } from 'next/server';
import { getEntityById, getDailyScores, getLatestScores } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entity = await getEntityById(params.id);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const historyDays = Math.min(Math.max(parseInt(searchParams.get('history_days') || '30', 10) || 30, 1), 90);

    const [history, allScored] = await Promise.all([
      getDailyScores(params.id, historyDays),
      getLatestScores(),
    ]);

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

    return NextResponse.json(
      {
        meta: {
          generated_at: new Date().toISOString(),
          history_days: historyDays,
        },
        entity: {
          ...entity,
          usage_score: scored?.usage_score ?? 0,
          attention_score: scored?.attention_score ?? 0,
          capability_score: scored?.capability_score ?? 0,
          expert_score: scored?.expert_score ?? 0,
          total_score: scored?.total_score ?? 0,
          confidence_lower: scored?.confidence_lower ?? null,
          confidence_upper: scored?.confidence_upper ?? null,
          overall_rank: scored?.overall_rank ?? 0,
          category_rank: scored?.category_rank ?? 0,
          momentum_7d: scored?.momentum_7d ?? 0,
          volatility: scored?.volatility ?? 0,
        },
        scores: scored
          ? {
              total: scored.total_score,
              usage: scored.usage_score,
              attention: scored.attention_score,
              capability: scored.capability_score,
              expert: scored.expert_score,
            }
          : null,
        rank: scored
          ? { overall: scored.overall_rank, category: scored.category_rank }
          : null,
        momentum_7d: scored?.momentum_7d ?? 0,
        volatility: scored?.volatility ?? 0,
        history: history.reverse(),
        competitors,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
