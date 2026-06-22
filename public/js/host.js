/**
 * Host Screen Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Establish Socket.io connection
  const socket = io();

  // State Management
  let roomCode = '';
  let roomState = null;
  let activeMode = 'local';
  let activeQuestionsPool = [];
  let askedQuestions = new Set();
  let timerInterval = null;
  let webrtcClient = null;

  // DOM Elements
  const hostUrlDisplay = document.getElementById('host-url-display');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const qrcodeContainer = document.getElementById('qrcode-container');
  const hostCancelBtn = document.getElementById('host-cancel-btn');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const playersCount = document.getElementById('players-count');
  const lobbyStartBtn = document.getElementById('lobby-start-btn');
  const roomStatusDesc = document.getElementById('room-status-desc');

  // Mode Selection panels
  const stateLobby = document.getElementById('state-lobby');
  const stateSetup = document.getElementById('state-setup');
  const statePlay = document.getElementById('state-play');
  const stateScoreboard = document.getElementById('state-scoreboard');
  const modeCards = document.querySelectorAll('.mode-card');
  const intensitySlider = document.getElementById('intensity-slider');
  const aiThemeInput = document.getElementById('ai-theme-input');
  const aiGenerateBtn = document.getElementById('ai-generate-btn');
  const setupBackBtn = document.getElementById('setup-back-btn');
  const setupStartGameBtn = document.getElementById('setup-start-game-btn');
  const botToggleCheckbox = document.getElementById('bot-toggle-checkbox');

  // Play Arena panels
  const activeCardBody = document.getElementById('active-card-body');
  const activeCardCategory = document.getElementById('active-card-category');
  const activeCardQuestionTh = document.getElementById('active-card-question-th');
  const activeCardQuestionEn = document.getElementById('active-card-question-en');
  const playTurnIndicator = document.getElementById('play-turn-indicator');
  const playIntensityIndicator = document.getElementById('play-intensity-indicator');
  const timerBarFill = document.getElementById('timer-bar-fill');
  const skipNotification = document.getElementById('skip-notification');
  const twistNotification = document.getElementById('twist-notification');
  const submissionsCount = document.getElementById('submissions-count');
  const incognitoBadge = document.getElementById('incognito-badge');
  const answersGrid = document.getElementById('answers-grid');
  const corporateCloudView = document.getElementById('corporate-cloud-view');
  const wordCloudCanvas = document.getElementById('word-cloud-canvas');

  // Footer Buttons
  const footerScoresBtn = document.getElementById('footer-scores-btn');
  const footerIncognitoToggle = document.getElementById('footer-incognito-toggle');
  const footerNextBtn = document.getElementById('footer-next-btn');

  // Scoreboard panels
  const scoreboardList = document.getElementById('scoreboard-list');
  const scoresBackBtn = document.getElementById('scores-back-btn');
  const scoresLobbyBtn = document.getElementById('scores-lobby-btn');
  const hostCopyInviteBtn = document.getElementById('host-copy-invite-btn');

  // Set default host display join URL matching host address
  const currentHostUrl = `${window.location.protocol}//${window.location.host}`;
  hostUrlDisplay.innerText = currentHostUrl;

  // Click handler to copy invite URL
  hostCopyInviteBtn.addEventListener('click', () => {
    if (!roomCode) {
      alert("กรุณารอระบบกำลังสร้างห้องสักครู่...");
      return;
    }
    const inviteUrl = `${currentHostUrl}/player.html?room=${roomCode}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      hostCopyInviteBtn.innerText = "✓ คัดลอกแล้ว!";
      setTimeout(() => {
        hostCopyInviteBtn.innerText = "📋 คัดลอกลิงก์เชิญ";
      }, 2000);
    }).catch(err => {
      console.error("Could not copy invite link: ", err);
    });
  });

  // Cancel Room and exit
  if (hostCancelBtn) {
    hostCancelBtn.addEventListener('click', () => {
      if (confirm("คุณต้องการยกเลิกและปิดห้องเล่นเกมนี้ใช่หรือไม่? (ผู้เล่นทุกคนจะหลุดออกจากเกม)")) {
        window.location.href = "index.html";
      }
    });
  }

  // On Load: Join Server as Host
  const savedBranding = localStorage.getItem('b2b_branding');
  let initSettings = {};
  if (savedBranding) {
    try {
      initSettings = JSON.parse(savedBranding);
      applyB2BTheme(initSettings.theme);
    } catch (e) {
      console.error("Error applying saved branding:", e);
    }
  }

  // Create Room
  socket.emit('create-room', initSettings);

  // ==========================================================================
  // SOCKET LISTENERS
  // ==========================================================================

  socket.on('room-created', ({ roomCode: code, roomState: state }) => {
    roomCode = code;
    roomState = state;
    window.roomCode = roomCode; // Expose roomCode to window for parent frame sync
    roomCodeDisplay.innerText = `ห้อง: ${roomCode}`;
    roomStatusDesc.innerText = `เปิดห้องแล้ว รหัส: ${roomCode} กำลังรอผู้เล่นเข้าร่วม...`;
    
    // Generate QR Code
    const joinUrl = `${currentHostUrl}/player.html?room=${roomCode}`;
    const qrUrl = window.DeepTalkUtils.generateQRCodeUrl(joinUrl);
    qrcodeContainer.innerHTML = `<img src="${qrUrl}" alt="Join QR Code" />`;
  });

  socket.on('player-joined', ({ players, roomState: state }) => {
    roomState = state;
    updatePlayersLobby(players);
    roomStatusDesc.innerText = `Players are joining. Room: ${roomCode}.`;
    
    // Enable start button if at least 1 player is connected (supports solo testing/hybrid play)
    if (players.length >= 1) {
      lobbyStartBtn.removeAttribute('disabled');
    }
  });

  socket.on('player-left', ({ playerName, players, roomState: state }) => {
    roomState = state;
    updatePlayersLobby(players);
    if (players.length === 0) {
      lobbyStartBtn.setAttribute('disabled', 'true');
      roomStatusDesc.innerText = `Waiting for players to connect...`;
    }
  });

  socket.on('settings-updated', (state) => {
    roomState = state;
    // Apply theme
    applyB2BTheme(state.settings.theme);
    // Sync checkbox status
    if (botToggleCheckbox) {
      botToggleCheckbox.checked = state.settings.botEnabled;
    }
  });

  socket.on('mode-changed', (state) => {
    roomState = state;
    activeMode = state.gameState.activeMode;
    transitionView('play');
    
    // Start WebRTC if LDR Hybrid Mode
    if (activeMode === 'hybrid') {
      document.getElementById('local-video-wrapper').style.display = 'block';
      initializeWebRTC();
    } else {
      document.getElementById('local-video-wrapper').style.display = 'none';
      if (webrtcClient) {
        webrtcClient.stopLocalStream();
        webrtcClient = null;
      }
    }

    // Trigger first card
    loadNextCard();
  });

  socket.on('card-updated', (state) => {
    roomState = state;
    renderActiveCard(state.gameState.currentCard);
    resetTimer(state.gameState.timerDuration);
    
    // Clear notifications
    skipNotification.style.display = 'none';
    twistNotification.style.display = 'none';

    // Clear grid
    answersGrid.innerHTML = '';
    
    // Update submissions HUD
    updateSubmissionsHUD();
  });

  socket.on('answer-submitted', ({ playerName, allSubmitted, responsesCount, roomState: state }) => {
    roomState = state;
    updateSubmissionsHUD();

    // If incognito is off, render answers live. If on, we shuffle and render when all submit.
    if (!state.gameState.incognito) {
      renderResponses(state.gameState.responses, false);
    } else if (allSubmitted) {
      // Shuffle answers and render anonymously
      renderResponses(state.gameState.responses, true);
    }
  });

  socket.on('incognito-toggled', (state) => {
    roomState = state;
    incognitoBadge.innerText = `Incognito: ${state.gameState.incognito ? 'On' : 'Off'}`;
    incognitoBadge.className = state.gameState.incognito ? 'btn btn-secondary' : 'btn btn-outline';
    
    // Refresh display
    renderResponses(state.gameState.responses, state.gameState.incognito);
  });

  socket.on('vote-submitted', ({ votes, allVoted, roomState: state }) => {
    roomState = state;
    // If everyone has voted, reveal voting counts/winners
    if (allVoted) {
      revealVotes(votes, state.gameState.responses);
    }
  });

  socket.on('safe-zone-activated', ({ skippedBy, roomState: state }) => {
    roomState = state;
    clearInterval(timerInterval);
    
    skipNotification.innerText = `⚠️ Safe-Zone Activated! Question skipped by ${skippedBy}.`;
    skipNotification.style.display = 'block';
    answersGrid.innerHTML = '';

    // Auto-advance to next card after a brief emotional recovery pause
    setTimeout(() => {
      loadNextCard();
    }, 3000);
  });

  socket.on('twist-played', ({ player, twist, roomState: state }) => {
    roomState = state;
    twistNotification.innerText = `✨ TWIST CARD played by ${twist.playedBy}: ${twist.type.toUpperCase()}` + 
      (twist.targetPlayerName ? ` targeted at ${twist.targetPlayerName}` : '');
    twistNotification.style.display = 'block';

    // Apply modifiers to layout/timer
    if (twist.type === 'hot-seat') {
      playTurnIndicator.innerText = `🔥 HOT SEAT: ${twist.targetPlayerName || twist.playedBy}`;
    }
  });

  socket.on('returned-to-lobby', (state) => {
    roomState = state;
    transitionView('lobby');
    // Clear WebRTC streaming
    if (webrtcClient) {
      webrtcClient.stopLocalStream();
      webrtcClient = null;
    }
  });

  // ==========================================================================
  // INTERACTION HANDLERS & LOBBY LOGIC
  // ==========================================================================

  function updatePlayersLobby(players) {
    playersCount.innerText = players.length;
    lobbyPlayersList.innerHTML = '';
    
    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card glass-panel';
      card.innerHTML = `
        <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="name">${p.name}</div>
        <div style="font-size: 0.75rem; color: var(--accent); margin-top: 5px;">Pts: ${p.score}</div>
      `;
      lobbyPlayersList.appendChild(card);
    });
  }

  // View States Transitioner
  function transitionView(view) {
    stateLobby.style.display = 'none';
    stateSetup.style.display = 'none';
    statePlay.style.display = 'none';
    stateScoreboard.style.display = 'none';

    // Footer actions visibility
    footerScoresBtn.style.display = 'none';
    footerIncognitoToggle.style.display = 'none';
    footerNextBtn.style.display = 'none';

    if (view === 'lobby') {
      stateLobby.style.display = 'grid';
      roomStatusDesc.innerText = `Lobby is open. Waiting for players...`;
    } else if (view === 'setup') {
      stateSetup.style.display = 'block';
      roomStatusDesc.innerText = `Setting up game options.`;
    } else if (view === 'play') {
      statePlay.style.display = 'grid';
      footerScoresBtn.style.display = 'block';
      footerIncognitoToggle.style.display = 'block';
      footerNextBtn.style.display = 'block';
      roomStatusDesc.innerText = `Round in progress.`;
    } else if (view === 'scoreboard') {
      stateScoreboard.style.display = 'block';
      roomStatusDesc.innerText = `Viewing scores.`;
    }
  }

  // Lobby start button clicked -> transition to Setup/Modes
  lobbyStartBtn.addEventListener('click', () => {
    transitionView('setup');
  });

  setupBackBtn.addEventListener('click', () => {
    transitionView('lobby');
  });

  // Mode Cards Selecting logic
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      activeMode = card.getAttribute('data-mode');
    });
  });

  // Intensity slider update
  intensitySlider.addEventListener('input', () => {
    const level = parseInt(intensitySlider.value);
    
    // Dim inactive slider labels
    for (let i = 1; i <= 3; i++) {
      const lbl = document.getElementById(`intensity-lbl-${i}`);
      if (i === level) {
        lbl.style.color = 'var(--primary)';
      } else {
        lbl.style.color = 'var(--text-muted)';
      }
    }

    // Sync settings to server
    socket.emit('update-settings', { roomCode, intensity: level });
  });

  // Bot Toggle Checkbox listener
  if (botToggleCheckbox) {
    botToggleCheckbox.addEventListener('change', () => {
      const enabled = botToggleCheckbox.checked;
      socket.emit('update-settings', {
        roomCode: roomCode,
        settings: { botEnabled: enabled }
      });
    });
  }

  // AI custom prompt generation API Caller
  aiGenerateBtn.addEventListener('click', async () => {
    const theme = aiThemeInput.value.trim();
    if (!theme) {
      alert("Please write down a custom theme topic first.");
      return;
    }

    aiGenerateBtn.innerText = "Generating...";
    aiGenerateBtn.setAttribute('disabled', 'true');

    try {
      const res = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: theme,
          intensity: parseInt(intensitySlider.value)
        })
      });
      const data = await res.json();
      
      if (data.prompts && data.prompts.length > 0) {
        // Sync custom questions to server settings
        socket.emit('update-settings', {
          roomCode: roomCode,
          settings: { customQuestions: data.prompts }
        });
        alert(`✓ AI successfully generated ${data.prompts.length} custom cards for theme: "${theme}"!`);
      } else {
        throw new Error("No cards generated");
      }
    } catch (e) {
      alert("AI Generation failed. Fallback offline cards generated instead.");
    } finally {
      aiGenerateBtn.innerText = "Generate";
      aiGenerateBtn.removeAttribute('disabled');
    }
  });

  // Start Game Button click
  setupStartGameBtn.addEventListener('click', () => {
    socket.emit('change-mode', { roomCode, mode: activeMode });
  });

  // ==========================================================================
  // GAME ARENA LOGIC
  // ==========================================================================

  // Next Card puller
  function loadNextCard() {
    let nextCard = null;

    // Check if HR custom questions exist
    const customPool = roomState.settings.customQuestions || [];
    const intensity = roomState.gameState.intensity;

    if (customPool.length > 0) {
      // Pick custom card first, filter out asked cards
      const availableCustom = customPool.filter(q => !askedQuestions.has(q.id));
      if (availableCustom.length > 0) {
        nextCard = availableCustom[Math.floor(Math.random() * availableCustom.length)];
      }
    }

    // Fallback to local database if no custom cards or all are used
    if (!nextCard) {
      const db = window.DEEP_TALK_DB;
      const dbPool = db[intensity] || [];
      const availableDb = dbPool.filter(q => !askedQuestions.has(q.id));
      
      if (availableDb.length > 0) {
        nextCard = availableDb[Math.floor(Math.random() * availableDb.length)];
      } else {
        // Recycle list if exhausted
        askedQuestions.clear();
        nextCard = dbPool[Math.floor(Math.random() * dbPool.length)];
      }
    }

    if (nextCard) {
      askedQuestions.add(nextCard.id);
      socket.emit('next-card', { roomCode, card: nextCard });
    }
  }

  // Render prompt card with flip animation
  function renderActiveCard(card) {
    if (!card) return;

    activeCardCategory.innerText = card.category ? `${card.category.toUpperCase()}` : 'REFLECTION';
    activeCardQuestionTh.innerText = card.questionTh;
    activeCardQuestionEn.innerText = card.questionEn;
    playIntensityIndicator.innerText = `LEVEL ${card.level}`;

    // Manage turn indicator based on mode
    if (activeMode === 'local' && roomState.players.length > 0) {
      const activePlayer = roomState.players[roomState.gameState.activePlayerIndex];
      playTurnIndicator.innerText = `Turn: ${activePlayer.name}`;
    } else if (activeMode === 'corporate') {
      playTurnIndicator.innerText = `Corporate Mode (All submit)`;
    } else {
      playTurnIndicator.innerText = `Hybrid Mode`;
    }

    // Toggle Incognito badge display
    incognitoBadge.innerText = `Incognito: ${roomState.gameState.incognito ? 'On' : 'Off'}`;
    incognitoBadge.className = roomState.gameState.incognito ? 'btn btn-secondary' : 'btn btn-outline';
  }

  function updateSubmissionsHUD() {
    const total = roomState.players.length;
    const submittedCount = Object.keys(roomState.gameState.responses).length;
    submissionsCount.innerText = `${submittedCount}/${total}`;
  }

  // Renders answers in grid
  function renderResponses(responses, isAnonymous) {
    answersGrid.innerHTML = '';
    corporateCloudView.style.display = 'none';

    const names = Object.keys(responses);
    if (names.length === 0) {
      answersGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">
          Waiting for players to submit responses on their phones...
        </div>
      `;
      return;
    }

    let answersList = names.map(name => ({
      author: name,
      text: responses[name]
    }));

    if (isAnonymous) {
      // Seed randomizer to shuffle consistently for the round or use standard shuffle
      answersList = shuffleArray(answersList);
    }

    answersList.forEach((ans, index) => {
      const card = document.createElement('div');
      card.className = 'glass-panel answer-card';
      
      // If we are shuffling, authors are obscured.
      const authorText = isAnonymous ? `Anonymous #${index + 1}` : ans.author;
      
      card.innerHTML = `
        <div class="answer-header">
          <span>${authorText}</span>
          <span style="display: none;" id="votes-tally-${index}">0 Votes</span>
        </div>
        <div class="answer-text">"${ans.text}"</div>
      `;
      answersGrid.appendChild(card);
    });

    // In corporate mode, also draw Word Cloud live
    if (activeMode === 'corporate') {
      corporateCloudView.style.display = 'block';
      const textList = answersList.map(a => a.text);
      window.DeepTalkUtils.drawWordCloud(wordCloudCanvas, textList);
    }
  }

  // Voting tallies reveal
  function revealVotes(votes, responses) {
    const gridCards = answersGrid.children;
    const voterNames = Object.keys(votes);
    
    // Count votes for each anonymous index
    const counts = {};
    voterNames.forEach(voter => {
      const voteData = votes[voter];
      const selectedIndex = parseInt(voteData.optionValue); // Index of anonymous card voted on
      counts[selectedIndex] = (counts[selectedIndex] || 0) + 1;
    });

    // Display counts
    for (let i = 0; i < gridCards.length; i++) {
      const card = gridCards[i];
      const tallyEl = card.querySelector(`#votes-tally-${i}`);
      if (tallyEl) {
        const count = counts[i] || 0;
        tallyEl.innerText = `👍 ${count} Guess(es)`;
        tallyEl.style.display = 'block';
        tallyEl.style.color = 'var(--accent)';
      }
    }
  }

  // Shuffle Helper
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Round Timer Countdown
  function resetTimer(seconds) {
    clearInterval(timerInterval);
    let current = seconds;
    timerBarFill.style.width = '100%';

    timerInterval = setInterval(() => {
      current--;
      const percent = (current / seconds) * 100;
      timerBarFill.style.width = `${percent}%`;

      if (current <= 0) {
        clearInterval(timerInterval);
        // Force submission if timer expires
        roomStatusDesc.innerText = "Time's Up! Shuffling submissions.";
      }
    }, 1000);
  }

  // Footer / Control button listeners
  footerNextBtn.addEventListener('click', () => {
    loadNextCard();
  });

  footerIncognitoToggle.addEventListener('click', () => {
    socket.emit('toggle-incognito', {
      roomCode: roomCode,
      incognito: !roomState.gameState.incognito
    });
  });

  // Scores Dashboard Renders
  footerScoresBtn.addEventListener('click', () => {
    renderScoreboard();
    transitionView('scoreboard');
  });

  scoresBackBtn.addEventListener('click', () => {
    transitionView('play');
  });

  scoresLobbyBtn.addEventListener('click', () => {
    socket.emit('return-to-lobby', { roomCode });
  });

  function renderScoreboard() {
    scoreboardList.innerHTML = '';
    if (!roomState || roomState.players.length === 0) return;

    // Sort players by score
    const sorted = [...roomState.players].sort((a, b) => b.score - a.score);
    sorted.forEach((p, idx) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid var(--surface-border)';
      
      const rankSymbol = idx === 0 ? '👑 ' : `${idx + 1}. `;
      row.innerHTML = `
        <span style="font-weight: bold;">${rankSymbol}${p.name}</span>
        <div style="display: flex; gap: 20px;">
          <span style="color: var(--text-muted);">Safe-Zone Skips: ${p.safeZoneUsed}</span>
          <span style="color: var(--primary); font-weight: bold;">${p.score} Points</span>
        </div>
      `;
      scoreboardList.appendChild(row);
    });
  }

  // ==========================================================================
  // WEBRTC INTEGRATION FOR LDR HYBRID MODE
  // ==========================================================================

  async function initializeWebRTC() {
    const localVideo = document.getElementById('host-local-video');
    const remoteContainer = document.getElementById('host-remote-video-container');

    webrtcClient = new WebRTCSignalingClient(socket, roomCode, localVideo, remoteContainer, () => {
      console.log("WebRTC Streams container changed.");
    });

    // Start streaming video and audio
    await webrtcClient.startLocalStream(true, true);

    // Connect to already joined players
    const targetSocketIds = roomState.players.map(p => p.socketId);
    webrtcClient.connectToPeers(targetSocketIds);
  }

  // B2B custom coloring applier
  function applyB2BTheme(theme) {
    if (!theme) return;
    document.documentElement.style.setProperty('--primary', theme.primary);
    document.documentElement.style.setProperty('--secondary', theme.secondary);
  }
});
