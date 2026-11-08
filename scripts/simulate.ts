// 데모 시뮬레이터: x-demo-secret 헤더로 POST /api/heat를 대신 보낸다
//   npx tsx scripts/simulate.ts --mode ambient [--base-url URL] [--minutes 30]
//   npx tsx scripts/simulate.ts --mode burst --place "서문시장 야시장" [--devices 25] [--base-url URL]
//   npx tsx scripts/simulate.ts --mode reset
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CATEGORY_BASELINE, WINDOW_MIN, type Category } from '../lib/constants';

config({ path: '.env.local' });

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const mode = arg('mode');
const baseUrl = (arg('base-url', 'http://localhost:3000') as string).replace(/\/$/, '');
const secret = process.env.DEMO_SECRET;

type Place = { id: string; name: string; category: string; temp: number };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 가짜 반응: 연타 20~40회, 흔들기 0.3~0.9 */
async function sendHeat(placeId: string, deviceId: string) {
  const res = await fetch(`${baseUrl}/api/heat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-secret': secret as string },
    body: JSON.stringify({
      placeId,
      deviceId,
      taps: Math.round(rand(20, 40)),
      shake: Math.round(rand(0.3, 0.9) * 100) / 100,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body as { tempBefore: number; tempAfter: number; delta: number; peers: number };
}

async function getPlaces(): Promise<Place[]> {
  const res = await fetch(`${baseUrl}/api/places`);
  if (!res.ok) throw new Error(`GET /api/places 실패 ${res.status}`);
  return res.json();
}

/** 모든 장소에 드문드문 반응 → 지도 전체를 미지근~따뜻하게 */
async function ambient() {
  const minutes = Number(arg('minutes', '30'));
  const places = await getPlaces();
  const devices = Array.from({ length: 60 }, () => `demo-${randomUUID()}`);
  const TICK_MS = 2000;
  const ticksPerWindow = (WINDOW_MIN * 60_000) / TICK_MS;
  // 장소마다 목표 비율(평소 대비 0.6~1.8배)을 정해, 정상 상태에서 R ≈ 목표 × B 가 되도록 확률을 잡는다.
  // 1회 점수 평균 ≈ 0.7, 감쇠 평균 ≈ 0.5 → 30분 동안 필요한 반응 수 N = 목표 × B / 0.35
  const plan = places.map(p => {
    const ratio = rand(0.6, 1.8);
    const n = (ratio * CATEGORY_BASELINE[p.category as Category]) / 0.35;
    return { ...p, ratio, prob: n / ticksPerWindow };
  });
  console.log(`ambient: ${places.length}곳, ${minutes}분 동안 실행 (Ctrl+C로 중단)`);

  const endAt = Date.now() + minutes * 60_000;
  let sent = 0;
  let lastLog = 0;
  while (Date.now() < endAt) {
    const jobs = plan
      .filter(p => Math.random() < p.prob)
      .map(p =>
        sendHeat(p.id, devices[Math.floor(Math.random() * devices.length)])
          .then(() => sent++)
          .catch(e => console.warn(`✗ ${p.name}: ${e.message}`))
      );
    await Promise.all(jobs);
    if (Date.now() - lastLog > 60_000) {
      lastLog = Date.now();
      console.log(`[${new Date().toLocaleTimeString('ko-KR')}] 보낸 반응 ${sent}건`);
    }
    await sleep(TICK_MS);
  }
  console.log(`ambient 종료: 총 ${sent}건`);
}

/** 지정 장소에 가짜 기기 N대가 30초 안에 몰아서 반응 → 동시성 보너스로 급상승 */
async function burst() {
  const name = arg('place');
  if (!name) throw new Error('--place "장소명" 이 필요합니다');
  // B=10(시장) 장소를 행사 보너스 없이 50°C로 올리려면 R ≥ 30 → 동시성 2배 기준 약 22대 필요
  const n = Number(arg('devices', '25'));
  const places = await getPlaces();
  const place = places.find(p => p.name === name) ?? places.find(p => p.name.includes(name));
  if (!place) throw new Error(`장소를 찾지 못했습니다: ${name}`);
  console.log(`burst: ${place.name} (지금 ${place.temp}°C) ← 가짜 기기 ${n}대, 30초`);

  let last = { tempAfter: place.temp, peers: 0 };
  await Promise.all(
    Array.from({ length: n }, async () => {
      await sleep(rand(0, 30_000));
      try {
        const r = await sendHeat(place.id, `demo-${randomUUID()}`);
        last = r;
        console.log(`  ${r.tempBefore}°C → ${r.tempAfter}°C (+${r.delta}) · 동시 ${r.peers}대`);
      } catch (e) {
        console.warn(`  ✗ ${(e as Error).message}`);
      }
    })
  );
  console.log(`burst 종료: ${place.name} ${last.tempAfter}°C`);
}

/** is_demo = true 기록 전부 삭제 */
async function reset() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { count, error } = await db.from('heat_events').delete({ count: 'exact' }).eq('is_demo', true);
  if (error) throw error;
  console.log(`reset: 데모 기록 ${count ?? 0}건 삭제`);
}

async function main() {
  if (mode !== 'reset' && !secret) throw new Error('.env.local 에 DEMO_SECRET 이 필요합니다');
  if (mode === 'ambient') await ambient();
  else if (mode === 'burst') await burst();
  else if (mode === 'reset') await reset();
  else throw new Error('--mode ambient | burst | reset');
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});
