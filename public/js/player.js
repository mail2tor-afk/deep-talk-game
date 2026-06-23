/**
 * Mobile Player Controller Logic - Mobile Only Refactored
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io('https://deep-talk-game-production.up.railway.app');

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
  let selectedCategory = 'all';

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

  // Guest-only status + tips area
  const guestStatusArea = document.getElementById('guest-status-area');
  const guestStatusText = document.getElementById('guest-status-text');
  const guestConnectionStatus = document.getElementById('guest-connection-status');
  const guestTipText = document.getElementById('guest-tip-text');
  const tipRefreshBtn = document.getElementById('tip-refresh-btn');
  const shareLinkArea = document.getElementById('share-link-area');
  const hostPlayersListArea = document.getElementById('host-players-list-area');

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
      // === HOST ===
      isHost = true;
      playerRoleBadge.innerText = 'โฮสต์ (Host) 👑';
      hostControls.style.display = 'block';
      guestWaitingArea.querySelector('.waiting-spinner').style.display = 'none';
      lobbyStatusTitle.innerText = 'รอผู้เล่น...';
      lobbyStatusDesc.innerText = 'กำลังรอให้มีผู้เล่นเข้าร่วมวงสนทนา...';

      // Show share link + player list for host only
      if (shareLinkArea) shareLinkArea.style.display = 'block';
      if (hostPlayersListArea) hostPlayersListArea.style.display = 'block';
      if (guestStatusArea) guestStatusArea.style.display = 'none';

      // Generate share link
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
              .then(() => { alert('คัดลอกลิงก์ชวนเพื่อนสำเร็จ!'); })
              .catch(err => { console.error('Failed to copy: ', err); });
          }
        };
      }
    } else {
      // === GUEST PLAYER ===
      isHost = false;
      playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
      hostControls.style.display = 'none';

      // Hide share link + player list for guests
      if (shareLinkArea) shareLinkArea.style.display = 'none';
      if (hostPlayersListArea) hostPlayersListArea.style.display = 'none';

      // Show guest-only status + tips area
      if (guestStatusArea) guestStatusArea.style.display = 'block';
      if (guestStatusText) guestStatusText.textContent = 'เชื่อมต่อแล้ว — รอโฮสต์เริ่มเกม...';
      if (guestConnectionStatus) guestConnectionStatus.textContent = '🟢 เชื่อมต่อแล้ว — ห้อง ' + roomCode;

      // Show random tip
      showRandomTip();
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
    const levelNames = { 1: 'สนุก', 2: 'กล้าๆกลัว', 3: 'แตกหัก' };
    playerCardHint.innerText = `คำถามชวนคิด · ${levelNames[currentCard.level] || 'ระดับ ' + currentCard.level} (หมวด: ${currentCard.category || 'เปิดใจ'})`;
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
    alert(`🛡️ มีผู้ใช้สิทธิ์ Safe-Zone Skip (โดย ${skippedBy}) ข้ามคำถามรอบนี้แล้ว! ระบบกำลังสุ่มคำถามใหม่...`);
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

  // Random tips for guest players while waiting
  const GUEST_TIPS = [
    '🔒 คำตอบของคุณจะถูกซ่อนชื่อเสมอ — พิมพ์อย่างจริงใจได้เลย ไม่มีใครรู้ว่าเป็นคุณจนกว่าจะเฉลย',
    '🛡️ ถ้าเจอคำถามที่ไม่สบายใจ กดปุ่ม Safe Skip ที่มุมบนขวาได้ทันที — ไม่เสียคะแนน ไม่มีโทษ',
    '🤖 มีบอทนิรนามช่วยสวมรอยในห้อง — ทำให้โฮสต์เดาคำตอบของคุณได้ยากขึ้น',
    '💬 เกมนี้มี 3 ระดับ: สนุก → กล้าๆกลัว → แตกหัก — โฮสต์เป็นคนเลือกระดับก่อนเริ่มเกม',
    '🎭 ในโหมดนิรนาม คุณจะต้องทายว่าคำตอบที่แสดงบนจอเป็นของใคร — สนุกและคาดเดายาก!',
    '✕ ปุ่มยกเลิกเกมมุมบนขวา — กดแล้วออกจากห้องทันที (ถ้าเป็นโฮสต์ ห้องจะปิด)',
    '🃏 Twist Cards คือการ์ดพิเศษที่ใช้เปลี่ยนกติกาได้ เช่น Fake It (ส่งคำตอบหลอก), Nominate (จี้ถามเพื่อน)',
    '💡 คำตอบยิ่งจริงใจ เกมยิ่งสนุก — ไม่ต้องกลัวถูกตัดสิน เพราะทุกคนตอบแบบนิรนามเหมือนกันหมด',
    '📱 ใช้สมาร์ทโฟนเป็นคอนโทรลเลอร์ — ไม่ต้องโหลดแอป เล่นผ่านเบราว์เซอร์ได้เลย',
    '👥 ยิ่งคนเยอะ เกมยิ่งสนุก — เพราะมีคำตอบให้ทายมากขึ้นและเดายากขึ้น',
    '⏳ เกมจะดำเนินการตามลำดับ: โฮสต์แสดงคำถาม → ทุกคนพิมพ์ตอบ → ระบบสุ่มเฉลย → ทายเจ้าของคำตอบ → เฉลยจริง',
    '🔮 คำถามมี 3 หมวด: ทั่วไป, ความรัก, เพื่อนสนิท — โฮสต์เป็นคนเลือกธีม'
  ];
  let currentTipIndex = -1;

  function showRandomTip() {
    if (!guestTipText) return;
    let idx;
    do { idx = Math.floor(Math.random() * GUEST_TIPS.length); } while (idx === currentTipIndex && GUEST_TIPS.length > 1);
    currentTipIndex = idx;
    guestTipText.textContent = GUEST_TIPS[idx];
  }

  if (tipRefreshBtn) {
    tipRefreshBtn.addEventListener('click', showRandomTip);
  }

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

  // Category selector handlers (host only)
  const categoryButtons = document.querySelectorAll('.category-btn');
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-category');
      if (selectedCategory === cat) return; // guard: re-click same category would reset usedCardIds
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = cat;
      usedCardIds.clear();
    });
  });

  // Intensity buttons handlers
  const level3Warning = document.getElementById('level3-warning');
  intensityButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      intensityButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedIntensity = Number(btn.getAttribute('data-level'));

      // Show/hide level 3 warning
      if (level3Warning) {
        level3Warning.style.display = selectedIntensity === 3 ? 'block' : 'none';
      }
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
      } else {
        socket.emit('return-to-lobby', { roomCode });
      }
      return;
    }
    socket.emit('next-card', { roomCode, card });
  });

  function pickNextCard(level) {
    let deck;
    if (selectedCategory === 'all') {
      deck = window.DEEP_TALK_DB[level];
    } else {
      const key = `${selectedCategory}_${level}`;
      deck = window.DEEP_TALK_DB[key];
    }
    if (!deck || deck.length === 0) return null;

    const pool = deck.filter(c => !usedCardIds.has(c.id));
    if (pool.length === 0) return null;

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

  const twistNames = {
    'fake-it': 'ตอบหลอก',
    'nominate': 'จี้ถาม',
    'fast-forward': 'วัย 80',
    'hot-seat': 'เก้าอี้ร้อน'
  };

  const twistDescriptions = {
    'fake-it': "เขียนคำตอบที่แต่งขึ้น — ผู้เล่นคนอื่นต้องทายว่าคุณกำลังโกหกอยู่หรือไม่",
    'nominate': "โยนคำถามใบนี้ให้ผู้เล่นคนใดคนหนึ่งเป็นคนตอบแทนคุณ",
    'fast-forward': "ตอบคำถามนี้โดยสมมติว่าเป็นตัวคุณในวัย 80 ปี มุมมองชีวิตจะเปลี่ยนไปอย่างไร",
    'hot-seat': "บังคับเปลี่ยนความสนใจ — คุณต้องเป็นคนตอบคำถามนี้แบบลึกซึ้งที่สุด"
  };

  function openTwistModal(type) {
    activeTwistType = type;
    twistModalTitle.innerText = twistNames[type] || type.toUpperCase();
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
    const thaiName = twistNames[twist.type] || twist.type;
    alert(`✨ การ์ดขัดจังหวะ "${thaiName}" ถูกเปิดใช้งานโดย ${twist.playedBy}`);
    if (player.name === playerName) {
      updateTwistCardsHUD(player.twistCards);
    }
  });
});
