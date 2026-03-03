import { NextRequest, NextResponse } from 'next/server';
import { getLatestScores } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    let allScored = await getLatestScores();

    if (category) {
      allScored = allScored.filter(e => e.category === category);
    }

    const total_count = allScored.length;
    const rankings = allScored.slice(offset, offset + limit).map(e => ({
      id: e.id,
      name: e.name,
      category: e.category,
      company: e.company,
      open_source: e.open_source,
      scores: {
        total: e.total_score,
        usage: e.usage_score,
        attention: e.attention_score,
        capability: e.capability_score,
        expert: e.expert_score,
      },
      rank: {
        overall: e.overall_rank,
        category: e.category_rank,
      },
      momentum_7d: e.momentum_7d,
      volatility: e.volatility,
    }));

    return NextResponse.json(
      {
        meta: {
          generated_at: new Date().toISOString(),
          total_count,
          limit,
          offset,
        },
        rankings,
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
