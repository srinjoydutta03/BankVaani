import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/mongo';

export async function POST(req: Request) {
  const { user_id, name, password, customer_id } = await req.json();
  if (!user_id || !password || !customer_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const db = await getDb();
  const users = db.collection('users');
  const existing = await users.findOne({ user_id });
  if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const { insertedId } = await users.insertOne({
    user_id,
    name,
    customer_id,
    password_hash: passwordHash,
    created_at: new Date(),
  });

  return NextResponse.json({ ok: true, user_id, user_name: name ?? '', id: insertedId.toString() });
}
