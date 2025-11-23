import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/mongo';

export async function POST(req: Request) {
  const { user_id, password } = await req.json();
  if (!user_id || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  }

  const db = await getDb();
  const users = db.collection('users');
  const sessions = db.collection('sessions');

  const user = await users.findOne<{ user_id: string; password_hash: string; name?: string }>({
    user_id,
  });
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const session_id = randomUUID();
  const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  await sessions.insertOne({
    session_id,
    user_id,
    created_at: new Date(),
    expires_at,
    active: true,
  });

  return NextResponse.json({
    ok: true,
    session_id,
    user_id,
    user_name: user.name ?? '',
    expires_at,
  });
}
