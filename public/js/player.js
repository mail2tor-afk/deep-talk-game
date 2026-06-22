/**
 * Mobile Player Controller Logic - Mobile Only Refactored
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State Management
  let roomCode = '';
  let playerName = '';
  let playersList = [];
  let currentCard = null;
  let isHost = false;
  let activeTwistType = null;
  let selectedVoteTarget = '';
  let selectedIntensity = 1;
  let usedCardIds = new Set();
  
  // DOM Elements
  const playerRoleBadge = document.getElementById('player-role-badge');
  const playerRoomBadge = document.getElementById('player-room-badge');
  const safezoneBtn = document.getElementById('safezone-btn');
  const playerCancelBtn = document.getElementById('player-cancel-btn');

  // Views
  const pstateJoin = document.getElementById('pstate-join');
  const pstateLobby = document.getElementById('pstate-lobby');
  const pstateWrite = document.getElementById('pstate-write');
  const pstateSubmitted = document.getElementById('pstate-submitted');
  const pstateVote = document.getElementById('pstate-vote');
  const pstateRoundover = document.getElementById('pstate-roundover');

  // Direct Join Fallback
  const directRoomCode = document.getElementById('direct-room-code');
  const directPlayerName = document.getElementById('direct-player-name');
  const directJoinBtn = document.getElementById('direct-join-btn');

  // Host Controls
  const hostControls = document.getElementById('host-controls');
  const hostStartBtn = document.getElementById('host-start-btn');
  const intensityButtons = document.querySelectorAll('.intensity-btn');

  // Guest Waiting Area
  const guestWaitingArea = document.getElementById('guest-waiting-area');
  const lobbyStatusTitle = document.getElementById('lobby-status-title');
  const lobbyStatusDesc = document.getElementById('lobby-status-desc');
  const lobbyPlayersList = document.getElementById('lobby-players-list');

  // Typing Answer
  const playerCardHint = document.getElementById('player-card-hint');
  const playerQuestionTextTh = document.getElementById('player-question-text-th');
  const playerAnswerInput = document.getElementById('player-answer-input');
  const charCount = document.getElementById('char-count');
  const playerSubmitAnswerBtn = document.getElementById('player-submit-answer-btn');

  // Voting / Guessing
  const votingAnswerHighlight = document.getElementById('voting-answer-highlight');
  const votingDesc = document.getElementById('voting-desc');
  const votingPlayersList = document.getElementById('voting-players-list');
  const playerSubmitVoteBtn = document.getElementById('player-submit-vote-btn');

  // Revealed / Roundover
  const playerRevealedAnswersList = document.getElementById('player-revealed-answers-list');
  const hostNextCardArea = document.getElementById('host-next-card-area');
  const hostNextCardBtn = document.getElementById('host-next-card-btn');
  const guestNextCardWaiting = document.getElementById('guest-next-card-waiting');

  // Twist Dock
  const twistDock = document.getElementById('twist-dock');
  const twistCount = document.getElementById('twist-count');
  const twistModal = document.getElementById('twist-modal');
  const twistModalTitle = document.getElementById('twist-modal-title');
  const twistModalDesc = document.getElementById('twist-modal-desc');
  const twistTargetGroup = document.getElementById('twist-target-group');
  const twistTargetSelect = document.getElementById('twist-target-select');
  const twistCloseBtn = document.getElementById('twist-close-btn');
  const twistPlayConfirmBtn = document.getElementById('twist-play-confirm-btn');

  const twistButtons = {
    'fake-it': document.getElementById('twist-btn-fake-it'),
    'nominate': document.getElementById('twist-btn-nominate'),
    'fast-forward': document.getElementById('twist-btn-fast-forward'),
    'hot-seat': document.getElementById('twist-btn-hot-seat')
  };

  // ==========================================================================
  // ROOM JOIN / INITIALIZATION
  // ==========================================================================

  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomCode = urlParams.get('room');

  const sessionCreate = sessionStorage.getItem('create_room') === 'true';
  const sessionName = sessionStorage.getItem('join_player_name');
  const sessionCode = sessionStorage.getItem('join_room_code');

  if (urlRoomCode) {
    // Guest joining via invite link
    sessionStorage.clear();
    isHost = false;
    playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
    roomCode = urlRoomCode.toUpperCase();
    if (directRoomCode) directRoomCode.value = roomCode;
    const joinRoomTitle = document.getElementById('join-room-title');
    if (joinRoomTitle) joinRoomTitle.innerText = `เข้าร่วมวงสนทนา (ห้อง ${roomCode})`;
    transitionView('join');
  } else if (sessionCreate && sessionName) {
    // We are the Host creating a room
    isHost = true;
    playerRoleBadge.innerText = 'โฮสต์ (Host) 👑';
    socket.emit('create-room');
  } else if (sessionCode && sessionName) {
    // We are a Guest joining a room
    isHost = false;
    playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
    roomCode = sessionCode.toUpperCase();
    playerName = sessionName.trim();
    joinRoom(roomCode, playerName);
  } else {
    // No session data and no room param, redirect to index.html
    window.location.href = 'index.html';
  }

  // Socket: Room Created (Host only)
  socket.on('room-created', ({ roomCode: code }) => {
    roomCode = code;
    playerName = sessionStorage.getItem('join_player_name') || 'โฮสต์';
    playerRoomBadge.innerText = roomCode;
    
    // Automatically join the newly created room as the first player
    joinRoom(roomCode, playerName);
  });

  function joinRoom(code, name) {
    socket.emit('join-room', { roomCode: code, playerName: name });
  }

  // Direct Join Fallback Form handler
  directJoinBtn.addEventListener('click', () => {
    const code = directRoomCode.value.toUpperCase().trim();
    const name = directPlayerName.value.trim();
    
    if (code.length !== 4) {
      alert("กรุณากรอกรหัสห้องให้ครบ 4 หลัก");
      return;
    }
    if (!name) {
      alert("กรุณากรอกชื่อเล่น");
      return;
    }

    roomCode = code;
    playerName = name;
    isHost = false;
    playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
    joinRoom(roomCode, playerName);
  });

  // ==========================================================================
  // SOCKET STATE LISTENERS
  // ==========================================================================

  socket.on('joined-successfully', ({ roomCode: code, player, roomState: state }) => {
    roomCode = code;
    playerName = player.name;
    playerRoomBadge.innerText = roomCode;
    
    transitionView('lobby');
    updateTwistCardsHUD(player.twistCards);

    // If guest joined, read the bot choice and update settings
    if (state.hostSocketId !== socket.id) {
      const botChoiceInput = document.querySelector('input[name="prejoin-bot-choice"]:checked');
      if (botChoiceInput) {
        const botEnabled = botChoiceInput.value === 'true';
        socket.emit('update-settings', {
          roomCode: code,
          settings: { botEnabled }
        });
      }
    }

    // Render Host Dashboard or Guest waiting area
    if (state.hostSocketId === socket.id) {
      isHost = true;
      playerRoleBadge.innerText = 'โฮสต์ (Host) 👑';
      hostControls.style.display = 'block';
      guestWaitingArea.querySelector('.waiting-spinner').style.display = 'none';
      lobbyStatusTitle.innerText = 'รอผู้เล่น...';
      lobbyStatusDesc.innerText = 'กำลังรอให้มีผู้เล่นเข้าร่วมวงสนทนา...';
    } else {
      isHost = false;
      playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
      hostControls.style.display = 'none';
      guestWaitingArea.querySelector('.waiting-spinner').style.display = 'block';
      lobbyStatusTitle.innerText = 'เชื่อมต่อห้องสำเร็จแล้ว';
      lobbyStatusDesc.innerText = 'กำลังรอเพื่อน ๆ และรอโฮสต์กดเริ่มเกม...';
    }

    // Generate and show invite link for copying
    const shareUrl = window.location.origin + '/player.html?room=' + roomCode;
    const shareInput = document.getElementById('share-link-input');
    if (shareInput) shareInput.value = shareUrl;

    const copyBtn = document.getElementById('copy-share-link-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        if (shareInput) {
          shareInput.select();
          shareInput.setSelectionRange(0, 99999);
          navigator.clipboard.writeText(shareInput.value)
            .then(() => {
              alert('คัดลอกลิงก์ชวนเพื่อนสำเร็จ!');
            })
            .catch(err => {
              console.error('Failed to copy: ', err);
            });
        }
      };
    }

    updateLobbyPlayersUI(state.players, state.hostSocketId, state.settings.botEnabled);
  });

  socket.on('join-error', (msg) => {
    alert(msg);
    sessionStorage.clear();
    transitionView('join');
  });

  socket.on('player-joined', ({ players, roomState: state }) => {
    playersList = players;
    updateLobbyPlayersUI(players, state.hostSocketId, state.settings.botEnabled);
  });

  socket.on('player-left', ({ playerName: leftName, players, roomState: state }) => {
    playersList = players;
    updateLobbyPlayersUI(players, state.hostSocketId, state.settings.botEnabled);
  });

  socket.on('settings-updated', (state) => {
    // Settings updated on server
    updateLobbyPlayersUI(state.players, state.hostSocketId, state.settings.botEnabled);
  });

  socket.on('mode-changed', (state) => {
    transitionView('lobby');
  });

  socket.on('card-updated', (state) => {
    currentCard = state.gameState.currentCard;
    
    // Reset typing UI
    playerAnswerInput.value = '';
    charCount.innerText = '0';
    playerSubmitAnswerBtn.removeAttribute('disabled');

    // Questions bindings
    playerCardHint.innerText = `คำถามชวนคิด · ระดับ ${currentCard.level} (หมวด: ${currentCard.category || 'เปิดใจ'})`;
    playerQuestionTextTh.innerText = currentCard.questionTh;

    transitionView('write');
  });

  socket.on('answer-submitted', ({ playerName: subName, allSubmitted, responsesCount, roomState: state }) => {
    if (allSubmitted) {
      // Transition to Guessing phase if > 2 players (human + bot included) and incognito mode is on
      // Wait! In 2-player local or standard mode, we show answers directly to keep it simple.
      const hasMultiplePlayers = (state.players.length > 2) || (state.players.length === 2 && state.settings.botEnabled);
      if (state.gameState.incognito && hasMultiplePlayers) {
        setupVotingDisplay(state.gameState.responses, state.players, state.settings.botEnabled);
      } else {
        showRevealedAnswers(state.gameState.responses);
      }
    }
  });

  socket.on('vote-submitted', ({ votes, allVoted, roomState: state }) => {
    if (allVoted) {
      showRevealedAnswers(state.gameState.responses);
    }
  });

  socket.on('safe-zone-activated', ({ skippedBy }) => {
    alert(`🛡️ มีผู้ใช้สิทธิ์ Safe-Zone Skip (โดยคุณ ${skippedBy}) ข้ามคำถามรอบนี้แล้ว! ระบบกำลังสุ่มคำถามใหม่...`);
    if (isHost) {
      const card = pickNextCard(selectedIntensity);
      if (card) {
        socket.emit('next-card', { roomCode, card });
      } else {
        alert('คำถามในการ์ดระดับนี้หมดแล้ว! ระบบจะกลับไปยังล็อบบี้');
        socket.emit('return-to-lobby', { roomCode });
      }
    }
  });

  socket.on('returned-to-lobby', () => {
    transitionView('lobby');
  });

  socket.on('room-closed', (msg) => {
    alert(msg || 'ห้องสนทนาถูกปิดเนื่องจากโฮสต์ออกจากเกม');
    window.location.href = 'index.html';
  });

  // ==========================================================================
  // LOBBY UI RENDERER & INTERACTION
  // ==========================================================================

  function updateLobbyPlayersUI(players, hostSocketId, botEnabled) {
    lobbyPlayersList.innerHTML = '';
    
    // Update host start button based on guest player count
    if (isHost) {
      const guestPlayers = players.filter(p => p.socketId !== hostSocketId);
      if (guestPlayers.length > 0) {
        hostStartBtn.removeAttribute('disabled');
        const x = players.length + (botEnabled ? 1 : 0);
        lobbyStatusTitle.innerText = `ผู้เล่นเข้ามาแล้ว ${x} คน`;
        lobbyStatusDesc.innerText = 'กดเริ่มเกมด้านล่างเมื่อผู้เล่นเข้าร่วมครบแล้ว...';
      } else {
        hostStartBtn.setAttribute('disabled', 'true');
        lobbyStatusTitle.innerText = 'รอผู้เล่น...';
        lobbyStatusDesc.innerText = 'กำลังรอให้มีผู้เล่นเข้าร่วมวงสนทนา...';
      }
    }

    players.forEach(p => {
      const isPlayerHost = p.socketId === hostSocketId;
      const tag = document.createElement('div');
      tag.className = `player-tag${isPlayerHost ? ' host' : ''}`;
      tag.innerHTML = `
        <span>${isPlayerHost ? '👑' : '👤'} ${p.name}</span>
        <span style="font-size: 12px; color: ${isPlayerHost ? 'var(--primary)' : '#8fb3aa'}">${isPlayerHost ? 'โฮสต์' : 'พร้อมเล่น'}</span>
      `;
      lobbyPlayersList.appendChild(tag);
    });

    // Render bot player tag at the bottom of the lobby players list if enabled
    if (botEnabled) {
      const tag = document.createElement('div');
      tag.className = 'player-tag';
      tag.style.borderColor = 'rgba(77, 182, 164, 0.4)';
      tag.style.background = 'rgba(77, 182, 164, 0.05)';
      tag.innerHTML = `
        <span>🤖 ผู้เล่นนิรนาม (บอท)</span>
        <span style="font-size: 12px; color: var(--primary);">บอทสวมรอย</span>
      `;
      lobbyPlayersList.appendChild(tag);
    }
  }

  // Intensity buttons handlers
  intensityButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      intensityButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedIntensity = Number(btn.getAttribute('data-level'));
    });
  });

  // Host Start Game handler
  hostStartBtn.addEventListener('click', () => {
    // 1. Pick card
    const card = pickNextCard(selectedIntensity);
    if (!card) {
      alert('ไม่พบคำถามในการ์ดระดับนี้');
      return;
    }

    // 2. Start game mode (default to corporate for incognito mode)
    socket.emit('change-mode', { roomCode, mode: 'corporate' });

    // 3. Emit card
    socket.emit('next-card', { roomCode, card });
  });

  // Host Next Card handler
  hostNextCardBtn.addEventListener('click', () => {
    const card = pickNextCard(selectedIntensity);
    if (!card) {
      alert('คำถามในการ์ดระดับนี้หมดแล้ว! ระบบจะเริ่มวนกลับมาถามซ้ำใหม่');
      usedCardIds.clear();
      const retryCard = pickNextCard(selectedIntensity);
      if (retryCard) {
        socket.emit('next-card', { roomCode, card: retryCard });
      }
      return;
    }
    socket.emit('next-card', { roomCode, card });
  });

  function pickNextCard(level) {
    const deck = window.DEEP_TALK_DB[level];
    if (!deck || deck.length === 0) return null;

    // Filter cards not yet used
    const pool = deck.filter(c => !usedCardIds.has(c.id));
    if (pool.length === 0) return null;

    // Pick random card
    const card = pool[Math.floor(Math.random() * pool.length)];
    usedCardIds.add(card.id);
    return card;
  }

  // ==========================================================================
  // TYPING & SUBMISSION LOGIC
  // ==========================================================================

  playerAnswerInput.addEventListener('input', () => {
    let len = playerAnswerInput.value.length;
    charCount.innerText = len;
    
    if (len > 150) {
      playerAnswerInput.value = playerAnswerInput.value.substring(0, 150);
      charCount.innerText = '150';
    }
  });

  playerSubmitAnswerBtn.addEventListener('click', () => {
    const text = playerAnswerInput.value.trim();
    if (!text) {
      alert("กรุณากรอกคำตอบก่อนกดส่ง");
      return;
    }

    playerSubmitAnswerBtn.setAttribute('disabled', 'true');
    socket.emit('submit-answer', { roomCode, answer: text });
    transitionView('submitted');
  });

  // Persistent Safe skip
  safezoneBtn.addEventListener('click', () => {
    if (confirm("คุณต้องการใช้สิทธิ์ Safe Skip เพื่อข้ามคำถามรอบนี้ใช่หรือไม่?")) {
      socket.emit('safe-zone-skip', { roomCode });
    }
  });

  // Cancel game room
  playerCancelBtn.addEventListener('click', () => {
    if (confirm("คุณต้องการยกเลิกและออกจากห้องเล่นเกมใช่หรือไม่? (หากเป็นโฮสต์ ห้องจะปิดตัวลงทันที)")) {
      window.location.href = 'index.html';
    }
  });

  // ==========================================================================
  // VOTING / GUESSING UI
  // ==========================================================================

  function setupVotingDisplay(responses, players, botEnabled) {
    votingPlayersList.innerHTML = '';
    selectedVoteTarget = '';
    playerSubmitVoteBtn.setAttribute('disabled', 'true');

    const otherNames = Object.keys(responses).filter(name => name !== playerName);
    if (otherNames.length === 0) {
      // If no other candidates, auto skip voting
      socket.emit('submit-vote', { roomCode, voterName: playerName, targetName: playerName, optionValue: 0 });
      return;
    }

    const targetAuthor = otherNames[Math.floor(Math.random() * otherNames.length)];

    const targetAnswer = responses[targetAuthor];
    votingAnswerHighlight.innerText = `"${targetAnswer}"`;
    votingDesc.innerText = `คุณคิดว่าคำตอบด้านบนนี้เป็นความในใจของใคร?`;

    // Filter choices: all other player names + bot (if enabled)
    const choices = players.map(p => p.name).filter(name => name !== playerName);
    if (botEnabled) {
      choices.push('ผู้เล่นนิรนาม');
    }

    choices.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'guess-btn';
      btn.innerText = name;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.guess-btn').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        selectedVoteTarget = name;
        playerSubmitVoteBtn.removeAttribute('disabled');
      });
      votingPlayersList.appendChild(btn);
    });

    transitionView('vote');
  }

  playerSubmitVoteBtn.addEventListener('click', () => {
    if (selectedVoteTarget) {
      socket.emit('submit-vote', {
        roomCode,
        voterName: playerName,
        targetName: selectedVoteTarget,
        optionValue: 0
      });
      transitionView('submitted');
    }
  });

  // ==========================================================================
  // REVEALED RESULTS UI
  // ==========================================================================

  function showRevealedAnswers(responses) {
    playerRevealedAnswersList.innerHTML = '';
    
    // Display current card question in roundover view
    if (currentCard) {
      const roQuestionTh = document.getElementById('roundover-question-th');
      if (roQuestionTh) roQuestionTh.innerText = currentCard.questionTh;
    }
    
    Object.keys(responses).forEach(name => {
      const isMe = name === playerName;
      const bubble = document.createElement('div');
      bubble.className = `bubble ${isMe ? 'me' : 'other'}`;
      bubble.innerHTML = `
        <div class="bubble-author">${name}</div>
        <div>"${responses[name]}"</div>
      `;
      playerRevealedAnswersList.appendChild(bubble);
    });

    // Display host card controls or waiting message
    if (isHost) {
      hostNextCardArea.style.display = 'block';
      guestNextCardWaiting.style.display = 'none';
    } else {
      hostNextCardArea.style.display = 'none';
      guestNextCardWaiting.style.display = 'block';
    }

    transitionView('roundover');
  }

  // ==========================================================================
  // TRANSITION VIEW UTILITY
  // ==========================================================================

  function transitionView(view) {
    pstateJoin.style.display = 'none';
    pstateLobby.style.display = 'none';
    pstateWrite.style.display = 'none';
    pstateSubmitted.style.display = 'none';
    pstateVote.style.display = 'none';
    pstateRoundover.style.display = 'none';
    twistDock.style.display = 'none';

    // หน้าจอตอนจัดตั้งห้อง (join และ lobby) ไม่ต้องมี safe skip กับยกเลิกเกม
    if (view === 'join' || view === 'lobby') {
      playerCancelBtn.style.display = 'none';
      safezoneBtn.style.display = 'none';
    } else {
      playerCancelBtn.style.display = 'inline-flex';
      safezoneBtn.style.display = 'inline-flex';
    }

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

  // ==========================================================================
  // TWIST CARDS INVENTORY
  // ==========================================================================

  function updateTwistCardsHUD(cards) {
    twistCount.innerText = `${cards.length} ใบพร้อมใช้`;
    Object.keys(twistButtons).forEach(type => {
      const btn = twistButtons[type];
      if (cards.includes(type)) {
        btn.classList.remove('disabled');
      } else {
        btn.classList.add('disabled');
      }
    });
  }

  Object.keys(twistButtons).forEach(type => {
    const btn = twistButtons[type];
    btn.addEventListener('click', () => {
      openTwistModal(type);
    });
  });

  const twistDescriptions = {
    'fake-it': "คำตอบหลอก: เขียนคำตอบที่แต่งขึ้น เพื่อดูว่าเพื่อนร่วมวงจะจับโกหกคุณได้ไหม",
    'nominate': "จี้ถาม: โยนคำถามการ์ดใบนี้ให้เพื่อนร่วมวงระบุคนใดคนหนึ่งเป็นคนตอบ",
    'fast-forward': "จินตนาการอนาคต: ตอบคำถามนี้โดยสมมติมุมมองของตัวคุณในอายุ 80 ปี",
    'hot-seat': "เก้าอี้ร้อน: บังคับเปลี่ยนความสนใจให้คุณเป็นคนตอบแบบลึกซึ้งแทน"
  };

  function openTwistModal(type) {
    activeTwistType = type;
    twistModalTitle.innerText = type.toUpperCase().replace('-', ' ');
    twistModalDesc.innerText = twistDescriptions[type] || 'การ์ดขัดจังหวะรอบสนทนา';
    
    twistTargetGroup.style.display = 'none';
    twistTargetSelect.innerHTML = '';

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

  twistPlayConfirmBtn.addEventListener('click', () => {
    const targetName = twistTargetSelect.value || null;
    socket.emit('play-twist', {
      roomCode,
      twistType: activeTwistType,
      targetPlayerName: targetName
    });
    twistModal.classList.remove('active');
  });

  socket.on('twist-played', ({ player, twist }) => {
    alert(`✨ การ์ดขัดจังหวะ ${twist.type.toUpperCase()} ถูกเปิดใช้งานโดยคุณ ${twist.playedBy}`);
    if (player.name === playerName) {
      updateTwistCardsHUD(player.twistCards);
    }
  });
});
