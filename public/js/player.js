/**
 * Mobile Player Controller Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Establish Socket.io connection
  const socket = io();

  // State Management
  let roomCode = '';
  let playerName = '';
  let playersList = [];
  let currentCard = null;
  let activeTwistType = null;
  let selectedVoteIndex = null;
  let selectedVoteTarget = '';
  let webrtcClient = null;

  // DOM Elements
  const playerNameBadge = document.getElementById('player-name-badge');
  const playerRoomBadge = document.getElementById('player-room-badge');
  const safezoneBtn = document.getElementById('safezone-btn');

  // Workspaces / Views
  const pstateJoin = document.getElementById('pstate-join');
  const pstateLobby = document.getElementById('pstate-lobby');
  const pstateWrite = document.getElementById('pstate-write');
  const pstateSubmitted = document.getElementById('pstate-submitted');
  const pstateVote = document.getElementById('pstate-vote');
  const pstateRoundover = document.getElementById('pstate-roundover');

  // Forms & Inputs
  const directRoomCode = document.getElementById('direct-room-code');
  const directPlayerName = document.getElementById('direct-player-name');
  const directJoinBtn = document.getElementById('direct-join-btn');

  const playerCardHint = document.getElementById('player-card-hint');
  const playerAnswerInput = document.getElementById('player-answer-input');
  const charCount = document.getElementById('char-count');
  const playerSubmitAnswerBtn = document.getElementById('player-submit-answer-btn');

  const votingAnswerHighlight = document.getElementById('voting-answer-highlight');
  const votingPlayersList = document.getElementById('voting-players-list');
  const playerSubmitVoteBtn = document.getElementById('player-submit-vote-btn');
  const playerQuestionTextTh = document.getElementById('player-question-text-th');
  const playerQuestionTextEn = document.getElementById('player-question-text-en');
  const playerRevealedAnswersList = document.getElementById('player-revealed-answers-list');

  // Hybrid Streaming Elements
  const mobileStreamOptions = document.getElementById('mobile-stream-options');
  const cameraStreamToggle = document.getElementById('camera-stream-toggle');
  const playerLocalVideo = document.getElementById('player-local-video');

  // Twist Cards Elements
  const twistDock = document.getElementById('twist-dock');
  const twistCount = document.getElementById('twist-count');
  const twistModal = document.getElementById('twist-modal');
  const twistModalTitle = document.getElementById('twist-modal-title');
  const twistModalDesc = document.getElementById('twist-modal-desc');
  const twistTargetGroup = document.getElementById('twist-target-group');
  const twistTargetSelect = document.getElementById('twist-target-select');
  const twistCloseBtn = document.getElementById('twist-close-btn');
  const twistPlayConfirmBtn = document.getElementById('twist-play-confirm-btn');
  const playerCancelBtn = document.getElementById('player-cancel-btn');
  const playerBotToggle = document.getElementById('player-bot-toggle');

  const twistButtons = {
    'fake-it': document.getElementById('twist-btn-fake-it'),
    'nominate': document.getElementById('twist-btn-nominate'),
    'fast-forward': document.getElementById('twist-btn-fast-forward'),
    'hot-seat': document.getElementById('twist-btn-hot-seat')
  };

  // ==========================================================================
  // ROOM JOIN / INITIALIZATION
  // ==========================================================================

  // Attempt auto-join if sessionStorage contains data
  const sessionCode = sessionStorage.getItem('join_room_code');
  const sessionName = sessionStorage.getItem('join_player_name');

  if (sessionCode && sessionName) {
    roomCode = sessionCode.toUpperCase();
    playerName = sessionName.trim();
    joinRoom(roomCode, playerName);
  } else {
    // Check if query params exist (e.g. from QR scan: player.html?room=ABCD)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    transitionView('join');
    if (roomParam) {
      directRoomCode.value = roomParam.toUpperCase();
      // Disable changing the room code since it's already defined
      directRoomCode.setAttribute('disabled', 'true');
      setTimeout(() => {
        directPlayerName.focus();
      }, 200);
    }
  }

  // Direct Form joining click
  directJoinBtn.addEventListener('click', () => {
    roomCode = directRoomCode.value.toUpperCase().trim();
    playerName = directPlayerName.value.trim();
    
    if (roomCode.length !== 4) {
      alert("Room Code must be 4 characters.");
      return;
    }
    if (!playerName) {
      alert("Please enter a nickname.");
      return;
    }

    joinRoom(roomCode, playerName);
  });

  // Emit join command to WebSocket server
  function joinRoom(code, name) {
    socket.emit('join-room', { roomCode: code, playerName: name });
  }

  // ==========================================================================
  // SOCKET LISTENERS
  // ==========================================================================

  socket.on('joined-successfully', ({ roomCode: code, player, roomState: state }) => {
    roomCode = code;
    playerName = player.name;
    
    playerNameBadge.innerText = playerName;
    playerRoomBadge.innerText = `ROOM: ${roomCode}`;
    
    transitionView('lobby');
    updateTwistCardsHUD(player.twistCards);

    // If hybrid mode is active on joining, show WebRTC options
    if (state.gameState.activeMode === 'hybrid') {
      mobileStreamOptions.style.display = 'block';
    }
  });

  socket.on('join-error', (msg) => {
    alert(msg);
    // Clear storage and reset back to join inputs
    sessionStorage.clear();
    transitionView('join');
  });

  socket.on('player-joined', ({ players, roomState: state }) => {
    playersList = players;
  });

  socket.on('player-left', ({ playerName: leftName, players, roomState: state }) => {
    playersList = players;
  });

  socket.on('mode-changed', (state) => {
    if (state.gameState.activeMode === 'hybrid') {
      mobileStreamOptions.style.display = 'block';
    } else {
      mobileStreamOptions.style.display = 'none';
      stopStreaming();
    }
    transitionView('lobby');
  });

  socket.on('card-updated', (state) => {
    currentCard = state.gameState.currentCard;
    
    // Clear textarea
    playerAnswerInput.value = '';
    charCount.innerText = '0';
    playerSubmitAnswerBtn.removeAttribute('disabled');

    // Prompt context description
    playerCardHint.innerText = `[ระดับ ${currentCard.level}] หมวดหมู่: ${currentCard.category || 'เปิดใจ'}`;

    // Fill questions
    playerQuestionTextTh.innerText = currentCard.questionTh;
    playerQuestionTextEn.innerText = currentCard.questionEn;

    // Transition to typing area
    transitionView('write');
  });

  socket.on('answer-submitted', ({ playerName: subName, allSubmitted, responsesCount, roomState: state }) => {
    // If all submitted and we are in incognito with more than 2 players, show voting/guessing list
    if (allSubmitted) {
      if (state.gameState.incognito && state.players.length > 2) {
        setupVotingDisplay(state.gameState.responses, state.players);
      } else {
        // Direct reveal (e.g. 2 players or normal mode)
        showRevealedAnswers(state.gameState.responses);
      }
    }
  });

  socket.on('vote-submitted', ({ votes, allVoted, roomState: state }) => {
    if (allVoted) {
      showRevealedAnswers(state.gameState.responses);
    }
  });

  // Helper to show everyone's answers on mobile screens
  function showRevealedAnswers(responses) {
    playerRevealedAnswersList.innerHTML = '';
    Object.keys(responses).forEach(name => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.padding = '12px 15px';
      card.style.background = 'rgba(255, 255, 255, 0.02)';
      card.style.border = '1px solid var(--surface-border)';
      card.innerHTML = `
        <div style="font-size: 0.75rem; color: var(--primary); font-weight: bold; margin-bottom: 4px;">${name}</div>
        <div style="font-size: 0.95rem; color: #fff; line-height: 1.4;">"${responses[name]}"</div>
      `;
      playerRevealedAnswersList.appendChild(card);
    });
    transitionView('roundover');
  }

  socket.on('safe-zone-activated', ({ skippedBy }) => {
    alert(`🛡️ Safe-Zone Activated by ${skippedBy}! Question skipped.`);
    transitionView('lobby');
  });

  socket.on('twist-played', ({ player, twist }) => {
    // Toast notification
    alert(`✨ Twist card played by ${twist.playedBy}: ${twist.type.toUpperCase()}`);
  });

  socket.on('returned-to-lobby', () => {
    transitionView('lobby');
  });

  socket.on('settings-updated', (state) => {
    if (playerBotToggle) {
      playerBotToggle.checked = state.settings.botEnabled;
    }
  });

  socket.on('room-closed', (msg) => {
    alert(msg);
    window.location.href = 'index.html';
  });

  // ==========================================================================
  // INPUT HANDLERS & NAVIGATION
  // ==========================================================================

  function transitionView(view) {
    pstateJoin.style.display = 'none';
    pstateLobby.style.display = 'none';
    pstateWrite.style.display = 'none';
    pstateSubmitted.style.display = 'none';
    pstateVote.style.display = 'none';
    pstateRoundover.style.display = 'none';
    twistDock.style.display = 'none';

    if (view === 'join') {
      pstateJoin.style.display = 'block';
    } else if (view === 'lobby') {
      pstateLobby.style.display = 'block';
    } else if (view === 'write') {
      pstateWrite.style.display = 'block';
      twistDock.style.display = 'block';
    } else if (view === 'submitted') {
      pstateSubmitted.style.display = 'block';
    } else if (view === 'vote') {
      pstateVote.style.display = 'block';
    } else if (view === 'roundover') {
      pstateRoundover.style.display = 'block';
    }
  }

  // Answer Textarea validation & submission
  playerAnswerInput.addEventListener('input', () => {
    const len = playerAnswerInput.value.length;
    charCount.innerText = len;
    
    // Character guard: Max 150 characters
    if (len > 150) {
      playerAnswerInput.value = playerAnswerInput.value.substring(0, 150);
      charCount.innerText = '150';
    }
  });

  playerSubmitAnswerBtn.addEventListener('click', () => {
    const text = playerAnswerInput.value.trim();
    if (!text) {
      alert("Please type a response first.");
      return;
    }

    playerSubmitAnswerBtn.setAttribute('disabled', 'true');
    socket.emit('submit-answer', { roomCode, answer: text });
    transitionView('submitted');
  });

  // Persistent Safe-Zone skip trigger (Instant skipping)
  safezoneBtn.addEventListener('click', () => {
    socket.emit('safe-zone-skip', { roomCode });
  });

  // Cancel Room and exit
  if (playerCancelBtn) {
    playerCancelBtn.addEventListener('click', () => {
      if (confirm("คุณต้องการออกจากห้องเล่นเกมนี้ใช่หรือไม่?")) {
        window.location.href = "index.html";
      }
    });
  }

  // Player Bot Toggle Checkbox listener
  if (playerBotToggle) {
    playerBotToggle.addEventListener('change', () => {
      socket.emit('update-settings', {
        roomCode: roomCode,
        settings: { botEnabled: playerBotToggle.checked }
      });
    });
  }

  // ==========================================================================
  // INCOGNITO VOTING / GUESSING LOGIC
  // ==========================================================================

  function setupVotingDisplay(responses, players) {
    votingPlayersList.innerHTML = '';
    selectedVoteIndex = null;
    selectedVoteTarget = '';
    playerSubmitVoteBtn.setAttribute('disabled', 'true');

    // Display the list of player names as candidate guesses
    // In standard incognito, we guess who wrote which card.
    // The host display highlights "Anonymous Answer #1"
    // So the controller prompts: "Who wrote Answer #1?" and lists other players.
    
    // Get all candidates who answered, excluding the voter themselves
    const candidateNames = Object.keys(responses).filter(name => name !== playerName);
    
    if (candidateNames.length === 0) {
      // If no other candidates, skip guessing
      socket.emit('submit-vote', { roomCode, voterName: playerName, targetName: playerName, optionValue: 0 });
      return;
    }

    votingAnswerHighlight.innerText = "ดูคำตอบบนหน้าจอทีวีหลัก และเดาว่าข้อความที่โชว์เป็นคำตอบของใคร?";

    candidateNames.forEach((name) => {
      const btn = document.createElement('button');
      btn.className = 'vote-item';
      btn.innerText = name;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.vote-item').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        selectedVoteTarget = name;
        selectedVoteIndex = 0; // Guessing the first anonymous card highlight
        playerSubmitVoteBtn.removeAttribute('disabled');
      });
      votingPlayersList.appendChild(btn);
    });

    transitionView('vote');
  }

  playerSubmitVoteBtn.addEventListener('click', () => {
    if (selectedVoteIndex !== null && selectedVoteTarget) {
      socket.emit('submit-vote', {
        roomCode,
        voterName: playerName,
        targetName: selectedVoteTarget,
        optionValue: selectedVoteIndex
      });
      transitionView('roundover');
    }
  });

  // ==========================================================================
  // TWIST CARDS CONTROLLER
  // ==========================================================================

  // Populate active Twist cards dock
  function updateTwistCardsHUD(cards) {
    twistCount.innerText = `${cards.length} Available`;
    
    // Disable cards not in the player inventory
    Object.keys(twistButtons).forEach(type => {
      const btn = twistButtons[type];
      if (cards.includes(type)) {
        btn.classList.remove('disabled');
      } else {
        btn.classList.add('disabled');
      }
    });
  }

  // Bind click handlers for Twist buttons
  Object.keys(twistButtons).forEach(type => {
    const btn = twistButtons[type];
    btn.addEventListener('click', () => {
      openTwistModal(type);
    });
  });

  const twistDescriptions = {
    'fake-it': "Submit a fabricated answer. The group must guess if you are lying.",
    'nominate': "Pass a hard question directly to another player of your choice.",
    'fast-forward': "Answer the question acting as your future 80-year-old self.",
    'hot-seat': "Force the host to transition the question to a Hot Seat targeting you."
  };

  // Open description modal for Twist cards
  function openTwistModal(type) {
    activeTwistType = type;
    twistModalTitle.innerText = type.toUpperCase().replace('-', ' ');
    twistModalDesc.innerText = twistDescriptions[type] || 'Modifier Card.';
    
    twistTargetGroup.style.display = 'none';
    twistTargetSelect.innerHTML = '';

    // If card is nominate or hot-seat, require picking a target player
    if (type === 'nominate' || type === 'hot-seat') {
      const targets = playersList.filter(p => p.name !== playerName);
      if (targets.length > 0) {
        targets.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.name;
          opt.innerText = t.name;
          twistTargetSelect.appendChild(opt);
        });
        twistTargetGroup.style.display = 'block';
      }
    }

    twistModal.classList.add('active');
  }

  twistCloseBtn.addEventListener('click', () => {
    twistModal.classList.remove('active');
  });

  // Confirm playing the card
  twistPlayConfirmBtn.addEventListener('click', () => {
    const targetName = twistTargetSelect.value || null;
    
    socket.emit('play-twist', {
      roomCode,
      twistType: activeTwistType,
      targetPlayerName: targetName
    });

    // Disable locally in inventory
    const index = activeTwistType;
    // Hide modal
    twistModal.classList.remove('active');
    
    // Server will broadcast inventory update on event response
    // So we just wait for sync-state
  });

  // Sync player inventory updates
  socket.on('twist-played', ({ player }) => {
    if (player.name === playerName) {
      updateTwistCardsHUD(player.twistCards);
    }
  });

  // ==========================================================================
  // WEBRTC INTEGRATION (LDR STREAMING)
  // ==========================================================================

  cameraStreamToggle.addEventListener('change', async () => {
    if (cameraStreamToggle.checked) {
      playerLocalVideo.style.display = 'block';
      
      webrtcClient = new WebRTCSignalingClient(socket, roomCode, playerLocalVideo, null, null);
      
      // Request camera permissions
      await webrtcClient.startLocalStream(true, true);
      
      // Connect to other sockets
      const ids = playersList.map(p => p.socketId);
      webrtcClient.connectToPeers(ids);
    } else {
      stopStreaming();
    }
  });

  function stopStreaming() {
    cameraStreamToggle.checked = false;
    playerLocalVideo.style.display = 'none';
    if (webrtcClient) {
      webrtcClient.stopLocalStream();
      webrtcClient = null;
    }
  }
});
