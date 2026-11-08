import { NextResponse } from 'next/server';
import { generateCsrfToken } from '../../../lib/security';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = generateCsrfToken();
  return NextResponse.json({
    ok: true,
    csrfToken: token,
  });
}
