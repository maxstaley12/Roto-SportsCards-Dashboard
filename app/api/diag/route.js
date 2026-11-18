import { NextResponse } from 'next/server';
import google from '../../../lib/google';
const { diagnose } = google;

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Signed-in users only (the password gate covers /api/*). Returns pass/fail for each step of the Google connection.
export async function GET() {
  return NextResponse.json(await diagnose(), { headers: { 'Cache-Control': 'no-store' } });
}
