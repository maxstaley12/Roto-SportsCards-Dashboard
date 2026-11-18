import { NextResponse } from 'next/server';
import data from '../../../lib/data';
import params from '../../../lib/params';
const { fetchRaw, shapeData } = data;
const { resolveParams } = params;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL = 6 * 60 * 60 * 1000; // refresh from Google at most every 6 hours per date range
const MAX_ENTRIES = 20;
const cache = new Map(); // "start|end" -> { at, raw }. One fetch serves every brand view of that range.

export async function GET(req) {
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';
  try {
    const p = resolveParams(url.searchParams);
    const key = p.current.start + '|' + p.current.end;
    const hit = cache.get(key);
    let raw;
    if (!force && hit && Date.now() - hit.at <= TTL) {
      raw = hit.raw;
    } else {
      raw = await fetchRaw(p);
      cache.delete(key);
      cache.set(key, { at: Date.now(), raw });
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    }
    return NextResponse.json(shapeData(raw, p), { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    const status = e && e.status === 400 ? 400 : 500;
    return NextResponse.json({ error: String(e && e.message ? e.message : e) }, { status });
  }
}
