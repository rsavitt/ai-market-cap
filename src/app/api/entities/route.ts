import { NextRequest, NextResponse } from 'next/server';
import { getLatestScores } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'total_score';
    const order = searchParams.get('order') || 'desc';

    let entities = await getLatestScores();

    if (category) {
      entities = entities.filter(e => e.category === category);
    }

    const sortKey = sort as keyof typeof entities[0];
    entities.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      }
      return order === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });

    return NextResponse.json({
      entities,
      categories: ['coding', 'image', 'video', 'general_llm'],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
