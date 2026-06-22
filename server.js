const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

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
// Keys: roomCode (4-digit uppercase string)
// Values: Room object
const rooms = {};

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
    
    socket.join(code);
    socket.emit('room-created', { roomCode: code, roomState: rooms[code] });
    console.log(`Room created: ${code} by host ${socket.id}`);
  });

  // Event: Player Joins Room
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      return socket.emit('join-error', 'Room not found.');
    }

    // Check if player name already exists
    const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase());
    if (nameExists) {
      return socket.emit('join-error', 'Name already taken in this room.');
    }

    const newPlayer = {
      socketId: socket.id,
      name: playerName.trim(),
      score: 0,
      safeZoneUsed: 0,
      twistCards: ['fake-it', 'nominate', 'fast-forward', 'hot-seat'] // Initial twist cards inventory
    };

    room.players.push(newPlayer);
    socket.join(code);
    
    socket.emit('joined-successfully', { roomCode: code, player: newPlayer, roomState: room });
    
    // Notify host and other players
    io.to(code).emit('player-joined', { players: room.players, roomState: room });
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
  });

  // Event: Host displays next card
  socket.on('next-card', ({ roomCode, card }) => {
    const room = rooms[roomCode];
    if (!room) return;

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
  });

  // Event: Toggle Incognito Mode manually
  socket.on('toggle-incognito', ({ roomCode, incognito }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState.incognito = incognito;
    io.to(roomCode).emit('incognito-toggled', room);
  });

  // Event: Submit Vote (for guessing who wrote what or corporate polling)
  socket.on('submit-vote', ({ roomCode, voterName, targetName, optionValue }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState.votes[voterName] = { targetName, optionValue };

    const allVoted = room.players.every(p => room.gameState.votes[p.name] !== undefined);
    io.to(roomCode).emit('vote-submitted', {
      votes: room.gameState.votes,
      allVoted,
      roomState: room
    });
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
  });

  // Event: Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Find room the socket belonged to
    for (const code in rooms) {
      const room = rooms[code];
      
      // If host disconnected, close the room
      if (room.hostSocketId === socket.id) {
        io.to(code).emit('room-closed', 'เกมถูกกดยกเลิกเนื่องจากโฮสต์ยกเลิกการเชื่อมต่อหรือปิดห้อง');
        delete rooms[code];
        console.log(`Room closed: ${code} due to host disconnect.`);
        break;
      }

      // If player disconnected, remove them from list
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex > -1) {
        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);
        
        if (room.gameState.status === 'playing') {
          io.to(code).emit('room-closed', `เกมถูกกดยกเลิกเนื่องจากผู้เล่น ${playerName} ออกจากเกม`);
          delete rooms[code];
          console.log(`Room closed: ${code} due to player ${playerName} leaving during active game.`);
        } else {
          io.to(code).emit('player-left', { playerName, players: room.players, roomState: room });
          console.log(`Player ${playerName} left lobby of room ${code}`);
        }
        break;
      }
    }
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
