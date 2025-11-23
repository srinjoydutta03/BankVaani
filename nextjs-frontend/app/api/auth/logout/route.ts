import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function POST(req: Request) {
  try {
    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const db = await getDb();
    await db.collection('sessions').updateOne(
      { session_id },
      { $set: { active: false, revoked_at: new Date() } }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error logging out', error);
    return NextResponse.json({ error: 'Unable to logout' }, { status: 500 });
  }
}
