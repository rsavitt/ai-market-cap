import { NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/seed';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    seedDatabase();
    return NextResponse.json({ success: true, message: 'Database seeded' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
