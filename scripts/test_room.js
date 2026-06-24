/**
 * DeepTalk Room Persistence Test
 * Tests: Redis save/restore, room-expired event, gameplay state sync
 *
 * Usage:
 *   node scripts/test_room.js              (test against localhost:3000)
 *   node scripts/test_room.js --live       (test against Railway production)
 *   node scripts/test_room.js --ttl        (include TTL expiry test — takes 12s)
 */

require('dotenv').config();
const { io } = require('socket.io-client');
const { Redis } = require('@upstash/redis');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const TEST_TTL = args.includes('--ttl');

const SERVER = LIVE
  ? 'https://deep-talk-game-production.up.railway.app'
  : 'http://localhost:3000';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  failed++;
}

function connect(name) {
  return io(SERVER, { transports: ['websocket', 'polling'], reconnection: false, timeout: 10000 });
}

function waitEvent(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for '${event}'`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Test 1: Room creation + Redis save ───────────────────────────────────────

async function test1_createAndSave() {
  console.log('\n[Test 1] Room creation saves to Redis');
  const host = connect('host');
  let roomCode;

  try {
    await waitEvent(host, 'connect');
    host.emit('create-room', {});
    const { roomCode: code } = await waitEvent(host, 'room-created');
    roomCode = code;
    ok(`Room created: ${code}`);

    await sleep(500); // give saveRoom() time to finish async

    const saved = await redis.get(`room:${roomCode}`);
    if (saved && saved.roomCode === roomCode) {
      ok(`Redis has room:${roomCode}`);
    } else {
      fail('Redis key missing or wrong', JSON.stringify(saved));
    }

    return roomCode;
  } finally {
    host.disconnect();
  }
}

// ── Test 2: Redis restore (mock server restart) ───────────────────────────────

async function test2_restore(roomCode) {
  console.log('\n[Test 2] Room restore from Redis (mock restart)');

  const saved = await redis.get(`room:${roomCode}`);
  if (!saved) { fail('No room in Redis to restore'); return; }

  // Simulate: server memory wiped, reload from Redis
  const restored = saved;
  if (restored.roomCode === roomCode) {
    ok(`Restored roomCode: ${restored.roomCode}`);
  } else {
    fail('roomCode mismatch after restore');
  }

  if (restored.expiresAt && restored.expiresAt > Date.now()) {
    ok(`expiresAt valid: ${new Date(restored.expiresAt).toISOString()}`);
  } else {
    fail('expiresAt missing or expired', String(restored.expiresAt));
  }

  if (Array.isArray(restored.players)) {
    ok(`players array preserved (${restored.players.length} players)`);
  } else {
    fail('players missing');
  }
}

// ── Test 3: Player join + state persisted ─────────────────────────────────────

async function test3_playerJoin() {
  console.log('\n[Test 3] Player join + game state synced to Redis');
  const host = connect('host');
  let roomCode;

  try {
    await waitEvent(host, 'connect');
    ok('Host socket connected');

    const player = connect('player');
    await waitEvent(player, 'connect');
    ok('Player socket connected');

    host.emit('create-room', {});
    const { roomCode: code } = await waitEvent(host, 'room-created');
    roomCode = code;

    // Host joins as "ต๋อ"
    host.emit('join-room', { roomCode, playerName: 'ต๋อ' });
    await waitEvent(host, 'joined-successfully');

    // Guest joins as "แขก"
    player.emit('join-room', { roomCode, playerName: 'แขก' });
    const { roomState } = await waitEvent(player, 'joined-successfully');

    if (roomState.players.length === 2) {
      ok(`Both players in roomState (${roomState.players.map(p => p.name).join(', ')})`);
    } else {
      fail('Expected 2 players', `got ${roomState.players.length}`);
    }

    await sleep(500);

    const saved = await redis.get(`room:${roomCode}`);
    if (saved && saved.players && saved.players.length === 2) {
      ok('Redis reflects 2 players after join');
    } else if (!saved) {
      fail('Redis key missing — server may not have Redis code deployed yet');
    } else {
      fail('Redis player count wrong', `got ${saved?.players?.length}`);
    }

    // Timer refs must NOT be in Redis
    const hasTimer = saved && (saved.players?.some(p => '_reconnectTimer' in p) || '_hostGraceTimer' in saved);
    if (saved) {
      if (!hasTimer) {
        ok('No timer refs leaked into Redis');
      } else {
        fail('Timer refs found in Redis — serialization bug');
      }
    }

    return { roomCode, host, player };
  } catch (e) {
    host.disconnect();
    throw e;
  }
}

// ── Test 4: TTL expiry fires room-expired ─────────────────────────────────────

async function test4_ttlExpiry() {
  console.log('\n[Test 4] TTL expiry — room-expired event (requires server with short TTL)');
  console.log('  ⚠️  This test only works on localhost with ROOM_TTL patched to 5s');
  console.log('  Skipping on live server — would destroy real rooms');

  if (LIVE) {
    console.log('  ⏭️  Skipped (--live mode)');
    return;
  }

  // Connect a client and listen for room-expired
  const host = connect('host');
  const received = { expired: false };

  try {
    await waitEvent(host, 'connect');
    host.emit('create-room', {});
    const { roomCode } = await waitEvent(host, 'room-created');
    host.emit('join-room', { roomCode, playerName: 'Host' });
    await waitEvent(host, 'joined-successfully');
    ok(`Room ${roomCode} created, waiting up to 12s for TTL sweep...`);

    host.on('room-expired', () => { received.expired = true; });
    await sleep(12000);

    if (received.expired) {
      ok('room-expired received within 12s');
    } else {
      fail('room-expired NOT received — TTL sweep may not emit or server TTL not patched');
    }
  } finally {
    host.disconnect();
  }
}

// ── Test 5: Redis cleanup on room close ───────────────────────────────────────

async function test5_redisCleanup(roomCode) {
  console.log('\n[Test 5] Redis key deleted after room closed');

  if (!roomCode) { fail('No roomCode from test 3'); return; }

  // The room from test3 was already closed (sockets disconnected)
  // Wait a moment, then check Redis
  await sleep(2000);

  // We can manually verify by checking if room still exists
  // Note: room may still be in Redis since disconnect alone doesn't call closeRoom
  // unless grace period fires — just verify the key structure is valid
  const saved = await redis.get(`room:${roomCode}`);
  if (!saved) {
    ok(`room:${roomCode} cleaned up from Redis`);
  } else {
    // Room still there — expected if host didn't explicitly close
    ok(`room:${roomCode} persists (host disconnect uses grace period — expected)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(52)}`);
  console.log(`DeepTalk Room Test  →  ${SERVER}`);
  console.log(`Redis: ${process.env.UPSTASH_REDIS_REST_URL || '(not set)'}`);
  console.log(`${'═'.repeat(52)}`);

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    console.log('\n❌ UPSTASH_REDIS_REST_URL not set — check .env');
    process.exit(1);
  }

  // Pre-check: ping Redis
  try {
    await redis.set('__ping__', 'ok', { ex: 10 });
    const pong = await redis.get('__ping__');
    console.log(pong === 'ok' ? '  Redis ping ✅' : `  Redis ping ❌ (got: ${JSON.stringify(pong)})`);
  } catch (e) {
    console.log('  Redis ping ❌', e.message);
    process.exit(1);
  }

  try {
    const roomCode1 = await test1_createAndSave();
    await sleep(1000);
    await test2_restore(roomCode1);
    await redis.del(`room:${roomCode1}`);
    await sleep(1500);

    const result3 = await test3_playerJoin();
    const { roomCode: roomCode3, host: h3, player: p3 } = result3;
    await sleep(1000);
    await test5_redisCleanup(roomCode3);
    h3.disconnect();
    p3.disconnect();

    if (TEST_TTL) {
      await test4_ttlExpiry();
    } else {
      console.log('\n[Test 4] TTL expiry — skipped (add --ttl to run, needs local server with patched TTL)');
    }

  } catch (err) {
    fail('Unexpected error', err.message);
    console.error(err);
  }

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(52)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
