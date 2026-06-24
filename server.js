const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const { Redis } = require('@upstash/redis');

// Load environment variables
dotenv.config();

// Redis client (Upstash REST)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
if (redis) console.log('Redis connected (Upstash)');
else console.log('Redis not configured — rooms are in-memory only');

// Save room to Redis (fire-and-forget, excludes non-serializable timer refs)
function saveRoom(code) {
  if (!redis || !rooms[code]) return;
  const { _hostGraceTimer, ...room } = rooms[code];
  const clean = {
    ...room,
    players: room.players.map(({ _reconnectTimer, ...p }) => p)
  };
  redis.set(`room:${code}`, clean, { ex: 4 * 60 * 60 }).catch(e => console.error('Redis save error:', e.message));
}

// Delete room from Redis
function deleteRoom(code) {
  if (!redis) return;
  redis.del(`room:${code}`).catch(e => console.error('Redis delete error:', e.message));
}

// Load all rooms from Redis on startup
async function loadRoomsFromRedis() {
  if (!redis) return;
  try {
    const keys = await redis.keys('room:*');
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const code = key.replace('room:', '');
        rooms[code] = data;
        console.log(`Restored room: ${code}`);
      }
    }
    console.log(`Loaded ${keys.length} rooms from Redis`);
  } catch (e) {
    console.error('Redis load error:', e.message);
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global Rooms State
const rooms = {};

// Question ratings: { questionId: { up, down, questionTh } }
const ratings = {};

// Closed room reason cache (10 min) — gives player specific error message
const closedRooms = {};
const CLOSED_ROOM_MESSAGES = {
  host_disconnect: 'โฮสต์ไม่กลับมาภายใน 120 นาที — ขอให้โฮสต์สร้างห้องใหม่แล้วส่ง link ใหม่',
  player_left:     'ผู้เล่นออกระหว่างเกม เกมถูกปิด — ขอให้โฮสต์สร้างห้องใหม่',
  ttl:             'ห้องหมดอายุ (ไม่มีการใช้งาน 2 ชั่วโมง) — ขอให้โฮสต์สร้างห้องใหม่',
  unknown:         'ไม่พบห้องรหัสนี้ อาจพิมพ์ผิด หรือเซิร์ฟเวอร์รีสตาร์ท — ขอ link ใหม่จากโฮสต์',
};

function closeRoom(code, reason) {
  delete rooms[code];
  deleteRoom(code);
  if (closedRooms[code]?._timer) clearTimeout(closedRooms[code]._timer);
  closedRooms[code] = {
    reason,
    _timer: setTimeout(() => { delete closedRooms[code]; }, 10 * 60 * 1000),
  };
}

// Auto-cleanup stale rooms (4h TTL) every 10 minutes
const ROOM_TTL = 4 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach(code => {
    if (now - (rooms[code].lastActivity || 0) > ROOM_TTL) {
      console.log(`Room expired: ${code}`);
      io.to(code).emit('room-expired');
      closeRoom(code, 'ttl');
    }
  });
}, 10 * 60 * 1000);

// Helper: Generate a unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

// REST API for AI Custom Prompt Generation
app.post('/api/generate-prompts', async (req, res) => {
  const { theme, intensity, apiKey } = req.body;
  const key = apiKey || GEMINI_API_KEY;

  if (!theme) {
    return res.status(400).json({ error: 'Theme is required' });
  }

  const selectedIntensity = intensity || 1;

  // Setup prompt description for Gemini
  const promptMessage = `
    You are a professional psychologist, conversation facilitator, and game designer.
    Generate a JSON array of 5 unique conversation starter cards/prompts in Thai and English for a party game.
    The custom theme requested by the user is: "${theme}".
    The target intensity level is Level ${selectedIntensity} (where Level 1 is Fun, low-stakes icebreakers, Level 2 is Deeper personal attitudes, Level 3 is Deep emotional vulnerabilities and core values).

    Each card must have:
    - id: A unique string/number.
    - level: ${selectedIntensity}.
    - questionTh: The question or prompt written in natural, engaging Thai, suitable for Thai cultural context (helps them open up while being emotionally safe).
    - questionEn: The question or prompt in natural, engaging English.
    - category: A short category name (e.g., "Relationships", "Career", "Mindset", "Fun", "Reflection").

    Strict instructions:
    1. Do not copy cards from "We're Not Really Strangers" or "Storationship".
    2. Write original, high-quality prompts.
    3. Return ONLY valid JSON format as a raw array. No markdown blocks, no \`\`\`json wrappers, no extra explanation text.
  `;

  if (!key) {
    console.log("No Gemini API key provided. Falling back to rule-based offline generation.");
    return res.json({ prompts: getOfflineThemePrompts(theme, selectedIntensity) });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptMessage
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textContent) {
      throw new Error("Empty response from Gemini");
    }

    // Parse prompt items from the Gemini JSON response
    const prompts = JSON.parse(textContent);
    return res.json({ prompts });
  } catch (err) {
    console.error("Gemini Generation Error:", err.message);
    // Fallback to offline generation
    return res.json({ prompts: getOfflineThemePrompts(theme, selectedIntensity) });
  }
});

// Fallback logic to generate theme-based prompts offline
function getOfflineThemePrompts(theme, level) {
  const categories = ["Reflection", "Mindset", "Relationships", "Work-Life", "Fun"];
  const levelNames = ["Icebreaker", "Deep Thoughts", "Vulnerability"];
  
  // Custom mock generation based on keywords
  const promptList = [];
  for (let i = 1; i <= 5; i++) {
    promptList.push({
      id: `fallback-${level}-${Date.now()}-${i}`,
      level: Number(level),
      questionTh: `[ธีม: ${theme}] นี่คือคำถามจำลองระดับ ${level} ข้อที่ ${i}: ถ้าคุณสามารถแชร์มุมมองเกี่ยวกับเรื่องนี้ในชีวิต คุณจะแชร์ว่าอย่างไร?`,
      questionEn: `[Theme: ${theme}] This is a level ${level} fallback prompt #${i}: If you could share one perspective about this in your life, what would it be?`,
      category: categories[i % categories.length]
    });
  }
  return promptList;
}

// Version check — confirms which features are deployed
app.get('/api/version', (req, res) => {
  res.json({
    version: 'c0196f5',
    redis: !!redis,
    rooms: Object.keys(rooms).length,
    env_url_set: !!process.env.UPSTASH_REDIS_REST_URL,
    env_token_set: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    env_url_len: (process.env.UPSTASH_REDIS_REST_URL || '').length,
  });
});

// Admin: view question ratings sorted by score
app.get('/api/ratings', (req, res) => {
  const sorted = Object.entries(ratings)
    .map(([id, r]) => ({ id, up: r.up, down: r.down, score: r.up - r.down }))
    .sort((a, b) => a.score - b.score);
  res.json(sorted);
});

// Serve deck config
app.get('/api/decks', (req, res) => {
  // Let clients fetch offline configs or other properties
  res.json({ status: "success" });
});

// WebSockets Real-time connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Event: Host Creates Room
  socket.on('create-room', (customSettings) => {
    const code = generateRoomCode();
    rooms[code] = {
      roomCode: code,
      hostSocketId: socket.id,
      players: [],
      gameState: {
        status: 'lobby', // lobby, mode-selection, playing, results
        activeMode: 'local', // local, hybrid, corporate
        intensity: 1,
        currentCard: null,
        activePlayerIndex: 0,
        responses: {},
        votes: {},
        incognito: false,
        twistPlayed: null,
        timerDuration: 60,
        timerCurrent: 60
      },
      settings: {
        theme: customSettings?.theme || { primary: '#4db6a4', secondary: '#7ac8bc', darkBg: '#16292f' },
        customQuestions: customSettings?.customQuestions || [],
        botEnabled: false,
        botName: 'ผู้เล่นนิรนาม'
      }
    };
    
    rooms[code].createdAt = Date.now();
    rooms[code].expiresAt = Date.now() + ROOM_TTL;
    rooms[code].lastActivity = Date.now();
    socket.join(code);
    socket.emit('room-created', { roomCode: code, roomState: rooms[code] });
    saveRoom(code);
    console.log(`Room created: ${code} by host ${socket.id}`);
  });

  // Event: Player Joins Room
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      const closed = closedRooms[code];
      const msg = CLOSED_ROOM_MESSAGES[closed?.reason] || CLOSED_ROOM_MESSAGES.unknown;
      return socket.emit('join-error', msg);
    }

    // Host reconnecting during grace period
    if (room.hostDisconnected && room.hostName === playerName.trim()) {
      room.hostSocketId = socket.id;
      room.hostDisconnected = false;
      if (room._hostGraceTimer) { clearTimeout(room._hostGraceTimer); delete room._hostGraceTimer; }
      socket.join(code);
      const hostPlayer = room.players.find(p => p.name === playerName.trim());
      if (hostPlayer) hostPlayer.socketId = socket.id;
      room.lastActivity = Date.now();
      socket.emit('joined-successfully', { roomCode: code, player: hostPlayer || { name: playerName.trim(), score: 0 }, roomState: room });
      io.to(code).emit('host-reconnected', room);
      saveRoom(code);
      console.log(`Host ${playerName} reconnected to room ${code}`);
      return;
    }

    // Check if player name already exists
    const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase());
    if (nameExists) {
      return socket.emit('join-error', 'ชื่อนี้มีคนใช้แล้วในห้องนี้');
    }

    const newPlayer = {
      socketId: socket.id,
      name: playerName.trim(),
      score: 0,
      safeZoneUsed: 0,
      twistCards: []
    };

    // Track host name for reconnect matching
    if (socket.id === room.hostSocketId) room.hostName = playerName.trim();

    room.players.push(newPlayer);
    room.lastActivity = Date.now();
    socket.join(code);

    socket.emit('joined-successfully', { roomCode: code, player: newPlayer, roomState: room });
    io.to(code).emit('player-joined', { players: room.players, roomState: room });
    saveRoom(code);
    console.log(`Player ${playerName} joined room ${code}`);
  });

  // Event: Update settings (B2B styles, Intensity slider, etc.)
  socket.on('update-settings', ({ roomCode, settings, intensity }) => {
    const room = rooms[roomCode];
    if (!room) return;

    if (settings) {
      room.settings = { ...room.settings, ...settings };
    }
    if (intensity !== undefined) {
      room.gameState.intensity = intensity;
    }

    io.to(roomCode).emit('settings-updated', room);
    saveRoom(roomCode);
  });

  // Event: Start Mode Selection or Change Mode
  socket.on('change-mode', ({ roomCode, mode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState.status = 'playing';
    room.gameState.activeMode = mode;
    room.gameState.responses = {};
    room.gameState.votes = {};
    room.gameState.twistPlayed = null;
    room.gameState.currentCard = null;

    io.to(roomCode).emit('mode-changed', room);
    saveRoom(roomCode);
  });

  // Event: Host displays next card
  socket.on('next-card', ({ roomCode, card }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.lastActivity = Date.now();
    room.gameState.currentCard = card;
    room.gameState.responses = {};
    room.gameState.votes = {};
    room.gameState.twistPlayed = null;
    
    // In Corporate Mode, we set anonymous mode by default (incognito)
    room.gameState.incognito = room.gameState.activeMode === 'corporate';

    // Inject bot answer if enabled
    if (room.settings.botEnabled && card.botAnswersTh && card.botAnswersTh.length > 0) {
      const answers = card.botAnswersTh;
      const botAnswer = answers[Math.floor(Math.random() * answers.length)];
      const name = room.settings.botName || 'ผู้เล่นนิรนาม';
      room.gameState.responses[name] = botAnswer;
    }

    // Route turns dynamically
    if (room.gameState.activeMode === 'local' && room.players.length > 0) {
      room.gameState.activePlayerIndex = (room.gameState.activePlayerIndex + 1) % room.players.length;
    }

    io.to(roomCode).emit('card-updated', room);
    saveRoom(roomCode);
  });

  // Event: Player submits answer (could be anonymous or public)
  socket.on('submit-answer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    room.gameState.responses[player.name] = answer;

    // Check if everyone has submitted
    const allSubmitted = room.players.every(p => room.gameState.responses[p.name] !== undefined);

    io.to(roomCode).emit('answer-submitted', {
      playerName: player.name,
      allSubmitted,
      responsesCount: Object.keys(room.gameState.responses).length,
      roomState: room
    });
    saveRoom(roomCode);
  });

  // Event: Toggle Incognito Mode manually
  socket.on('toggle-incognito', ({ roomCode, incognito }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState.incognito = incognito;
    io.to(roomCode).emit('incognito-toggled', room);
  });


  // Event: Safe-Zone Pass Skip (instant skip with zero penalty)
  socket.on('safe-zone-skip', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.safeZoneUsed++;
    }

    // Scrub answers and reset card state immediately
    room.gameState.responses = {};
    room.gameState.votes = {};
    room.gameState.twistPlayed = null;
    room.gameState.currentCard = null;

    io.to(roomCode).emit('safe-zone-activated', {
      skippedBy: player ? player.name : 'A Player',
      roomState: room
    });
    saveRoom(roomCode);
  });

  // Event: Play Twist Card
  socket.on('play-twist', ({ roomCode, twistType, targetPlayerName }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // Verify player has the twist card
    const cardIndex = player.twistCards.indexOf(twistType);
    if (cardIndex > -1) {
      player.twistCards.splice(cardIndex, 1); // Consume card
    }

    room.gameState.twistPlayed = {
      type: twistType,
      playedBy: player.name,
      targetPlayerName: targetPlayerName || null
    };

    io.to(roomCode).emit('twist-played', {
      player: player,
      twist: room.gameState.twistPlayed,
      roomState: room
    });
  });

  // Event: Update player score (HR or host rewarding answers)
  socket.on('reward-points', ({ roomCode, playerName, points }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.score += points;
    }

    io.to(roomCode).emit('score-updated', room);
  });

  // Event: WebRTC Signaling (for LDR Video/Audio streams)
  socket.on('webrtc-signal', ({ roomCode, targetSocketId, signal }) => {
    // Send signal directly to targeted player/host
    io.to(targetSocketId).emit('webrtc-signal', {
      senderSocketId: socket.id,
      signal
    });
  });

  // Event: Anonymous question rating (fire-and-forget, no reply)
  socket.on('rate-question', ({ questionId, vote }) => {
    if (!questionId || !['up', 'down'].includes(vote)) return;
    if (!ratings[questionId]) ratings[questionId] = { up: 0, down: 0 };
    ratings[questionId][vote]++;
  });

  // Event: Verify room still exists after socket reconnect
  socket.on('verify-room', ({ roomCode, playerName, isHost: asHost }) => {
    const code = roomCode?.toUpperCase();
    const room = rooms[code];
    if (!room) {
      socket.emit('room-expired');
      return;
    }
    socket.join(code);
    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.socketId = socket.id;
      if (player.disconnected) {
        player.disconnected = false;
        if (player._reconnectTimer) { clearTimeout(player._reconnectTimer); delete player._reconnectTimer; }
        io.to(code).emit('player-reconnected', { playerName, roomState: room });
      }
    }
    if (asHost && room.hostName === playerName) {
      room.hostSocketId = socket.id;
      room.hostDisconnected = false;
      if (room._hostGraceTimer) { clearTimeout(room._hostGraceTimer); delete room._hostGraceTimer; }
      io.to(code).emit('host-reconnected', room);
    }
    room.lastActivity = Date.now();
    console.log(`Room verified: ${code} for ${playerName}`);
  });

  // Event: End Game — broadcast scores screen to all players
  socket.on('end-game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameState.status = 'ended';
    io.to(roomCode).emit('game-ended', {});
  });

  // Event: Return to Lobby
  socket.on('return-to-lobby', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState.status = 'lobby';
    room.gameState.currentCard = null;
    room.gameState.responses = {};
    room.gameState.votes = {};
    room.gameState.twistPlayed = null;

    io.to(roomCode).emit('returned-to-lobby', room);
    saveRoom(roomCode);
  });

  // Event: Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Find room the socket belonged to
    for (const code in rooms) {
      const room = rooms[code];
      
      // If host disconnected, start 60s grace period before closing room
      if (room.hostSocketId === socket.id) {
        room.hostDisconnected = true;
        room.hostSocketId = null;
        io.to(code).emit('host-disconnected', { waitMinutes: 120 });
        console.log(`Host disconnected from room ${code}, starting 60s grace period`);
        room._hostGraceTimer = setTimeout(() => {
          if (rooms[code] && rooms[code].hostDisconnected) {
            io.to(code).emit('room-closed', 'โฮสต์ไม่กลับมาภายใน 120 นาที ห้องถูกปิดแล้ว');
            closeRoom(code, 'host_disconnect');
            console.log(`Room ${code} closed after host grace period expired`);
          }
        }, 120 * 60 * 1000);
        break;
      }

      // If player disconnected, remove them from list
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex > -1) {
        const player = room.players[playerIndex];
        const playerName = player.name;

        if (room.gameState.status === 'playing') {
          // Grace period — don't close immediately, wait for reconnect
          player.disconnected = true;
          io.to(code).emit('player-disconnected', { playerName, waitSeconds: 60 });
          console.log(`Player ${playerName} disconnected from room ${code}, starting 60s grace period`);
          player._reconnectTimer = setTimeout(() => {
            if (rooms[code] && player.disconnected) {
              io.to(code).emit('room-closed', `ผู้เล่น ${playerName} ไม่กลับมาภายใน 60 วินาที ห้องถูกปิดแล้ว`);
              closeRoom(code, 'player_left');
              console.log(`Room ${code} closed after player ${playerName} grace period expired`);
            }
          }, 60 * 1000);
        } else {
          room.players.splice(playerIndex, 1);
          io.to(code).emit('player-left', { playerName, players: room.players, roomState: room });
          console.log(`Player ${playerName} left lobby of room ${code}`);
        }
        break;
      }
    }
  });
});

// Start Server — load persisted rooms first then begin listening
loadRoomsFromRedis().then(() => {
  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
});
