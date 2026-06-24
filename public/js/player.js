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
  let selectedChoice = '';
  let matchScores = {};
  let questionCount = 0;
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
  const pstateConnecting = document.getElementById('pstate-connecting');
  const pstateLobby = document.getElementById('pstate-lobby');
  const pstateWrite = document.getElementById('pstate-write');
  const pstateSubmitted = document.getElementById('pstate-submitted');
  const pstateRoundover = document.getElementById('pstate-roundover');
  const pstateGameover = document.getElementById('pstate-gameover');

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

  // Host Summary / Gameover
  const hostSummaryBtn = document.getElementById('host-summary-btn');
  const gameoverPlayAgainBtn = document.getElementById('gameover-play-again-btn');

  // Multiple Choice
  const pstateChoice = document.getElementById('pstate-choice');
  const pstateVote = document.getElementById('pstate-vote');
  const pstateScores = document.getElementById('pstate-scores');
  const choiceCardHint = document.getElementById('choice-card-hint');
  const choiceQuestionTextTh = document.getElementById('choice-question-text-th');
  const choiceOptionsList = document.getElementById('choice-options-list');
  const playerSubmitChoiceBtn = document.getElementById('player-submit-choice-btn');

  // Revealed / Roundover
  const playerRevealedAnswersList = document.getElementById('player-revealed-answers-list');
  const hostNextCardArea = document.getElementById('host-next-card-area');
  const hostNextCardBtn = document.getElementById('host-next-card-btn');
  const guestNextCardWaiting = document.getElementById('guest-next-card-waiting');


  // ==========================================================================
  // ROOM JOIN / INITIALIZATION
  // ==========================================================================

  // Connecting timeout with progressive messages (Railway cold-start can take 15-25s)
  function startConnectingTimeout(stillConnecting) {
    const title = document.getElementById('connecting-title');
    const t1 = setTimeout(() => {
      if (stillConnecting() && title) title.innerText = 'ยังเชื่อมต่ออยู่... (อาจใช้เวลา 15–30 วิ)';
    }, 8000);
    const t2 = setTimeout(() => {
      if (stillConnecting()) { sessionStorage.clear(); window.location.href = 'index.html'; }
    }, 30000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }

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
    transitionView('connecting');
    socket.emit('create-room');
    startConnectingTimeout(() => !roomCode);
  } else if (sessionCode && sessionName) {
    // We are a Guest joining a room
    isHost = false;
    playerRoleBadge.innerText = 'ผู้ร่วมวง 👥';
    roomCode = sessionCode.toUpperCase();
    playerName = sessionName.trim();
    const connectingTitle = document.getElementById('connecting-title');
    if (connectingTitle) connectingTitle.innerText = 'กำลังเข้าร่วมห้อง...';
    transitionView('connecting');
    joinRoom(roomCode, playerName);
    startConnectingTimeout(() => pstateConnecting.style.display !== 'none');
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
    questionCount = 0;
    transitionView('lobby');
  });

  socket.on('card-updated', (state) => {
    questionCount++;
    currentCard = state.gameState.currentCard;
    const levelNames = { 1: 'ระดับ 1', 2: 'ระดับ 2', 3: 'ระดับ 3' };
    const hint = `คำถามชวนคิด · ${levelNames[currentCard.level] || 'ระดับ ' + currentCard.level} (หมวด: ${currentCard.category || 'เปิดใจ'})`;

    if (currentCard.choices && currentCard.level < 3) {
      // L1 / L2 — multiple choice
      populateChoices(currentCard, hint);
      transitionView('choice');
    } else {
      // L3 — open-ended typing
      playerAnswerInput.value = '';
      charCount.innerText = '0';
      playerSubmitAnswerBtn.removeAttribute('disabled');
      playerCardHint.innerText = hint;
      playerQuestionTextTh.innerText = currentCard.questionTh;
      transitionView('write');
    }
  });

  socket.on('answer-submitted', ({ playerName: subName, allSubmitted, responsesCount, roomState: state }) => {
    if (allSubmitted) {
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
    sessionStorage.clear();
    alert(msg || 'ห้องสนทนาถูกปิดเนื่องจากโฮสต์ออกจากเกม');
    window.location.href = 'index.html';
  });

  socket.on('join-error', (msg) => {
    sessionStorage.clear();
    alert(msg || 'ไม่สามารถเข้าร่วมห้องได้');
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
    '💬 เกมนี้มี 3 ระดับ: ระดับ 1 → ระดับ 2 → ระดับ 3 — โฮสต์เป็นคนเลือกระดับก่อนเริ่มเกม',
    '🎭 ในโหมดนิรนาม คุณจะต้องทายว่าคำตอบที่แสดงบนจอเป็นของใคร — สนุกและคาดเดายาก!',
    '✕ ปุ่มยกเลิกเกมมุมบนขวา — กดแล้วออกจากห้องทันที (ถ้าเป็นโฮสต์ ห้องจะปิด)',
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

  // ==========================================================================
  // MULTIPLE CHOICE LOGIC
  // ==========================================================================

  function populateChoices(card, hint) {
    choiceCardHint.innerText = hint;
    choiceQuestionTextTh.innerText = card.questionTh;
    choiceOptionsList.innerHTML = '';
    selectedChoice = '';
    playerSubmitChoiceBtn.setAttribute('disabled', 'true');

    card.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-option';
      btn.textContent = choice;
      btn.addEventListener('click', () => {
        choiceOptionsList.querySelectorAll('.choice-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedChoice = choice;
        playerSubmitChoiceBtn.removeAttribute('disabled');
      });
      choiceOptionsList.appendChild(btn);
    });
  }

  playerSubmitChoiceBtn.addEventListener('click', () => {
    if (!selectedChoice) return;
    playerSubmitChoiceBtn.setAttribute('disabled', 'true');
    socket.emit('submit-answer', { roomCode, answer: selectedChoice });
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
  // REVEALED RESULTS UI
  // ==========================================================================

  function showRevealedAnswers(responses) {
    playerRevealedAnswersList.innerHTML = '';

    if (currentCard) {
      const roQuestionTh = document.getElementById('roundover-question-th');
      if (roQuestionTh) roQuestionTh.innerText = currentCard.questionTh;
    }

    if (currentCard && currentCard.choices && currentCard.level < 3) {
      showChoiceMatchResults(responses);
    } else {
      Object.keys(responses).forEach(name => {
        const row = document.createElement('div');
        row.className = 'answer-row';
        row.innerHTML = `<span class="answer-name">${name}</span><span class="answer-text">"${responses[name]}"</span>`;
        playerRevealedAnswersList.appendChild(row);
      });
    }

    if (isHost) {
      hostNextCardArea.style.display = 'block';
      guestNextCardWaiting.style.display = 'none';
      if (questionCount >= 5) {
        hostNextCardBtn.style.display = 'none';
        if (hostSummaryBtn) hostSummaryBtn.style.display = 'block';
      } else {
        hostNextCardBtn.style.display = 'block';
        if (hostSummaryBtn) hostSummaryBtn.style.display = 'none';
      }
    } else {
      hostNextCardArea.style.display = 'none';
      guestNextCardWaiting.style.display = 'block';
      guestNextCardWaiting.textContent = questionCount >= 5
        ? 'รอโฮสต์สรุปคะแนนและเริ่มรอบใหม่...'
        : 'กำลังรอให้โฮสต์จั่วการ์ดคำถามใหม่...';
    }

    transitionView('roundover');
  }

  function showChoiceMatchResults(responses) {
    const BOT = 'ผู้เล่นนิรนาม';
    const groups = {};
    Object.keys(responses).forEach(name => {
      const c = responses[name];
      if (!groups[c]) groups[c] = [];
      groups[c].push(name);
    });

    // Update cumulative match scores (human players only)
    const humans = Object.keys(responses).filter(n => n !== BOT);
    humans.forEach(name => {
      if (!matchScores[name]) matchScores[name] = { matched: 0, total: 0 };
      matchScores[name].total++;
      if (groups[responses[name]].filter(n => n !== BOT).length >= 2) {
        matchScores[name].matched++;
      }
    });

    // Render grouped choice results
    Object.keys(groups).forEach(choice => {
      const names = groups[choice];
      const humanPicked = names.filter(n => n !== BOT);
      const isMatch = humanPicked.length >= 2;
      const div = document.createElement('div');
      div.className = `match-group${isMatch ? ' matched' : ''}`;
      div.innerHTML = `
        <div class="match-choice-text">"${choice}"${isMatch ? '<span class="match-badge">ตรงกัน! 🎉</span>' : ''}</div>
        <div class="match-players">👤 ${names.join(', ')}</div>
      `;
      playerRevealedAnswersList.appendChild(div);
    });

  }

  // ==========================================================================
  // GAME OVER — auto after 5 questions
  // ==========================================================================

  if (hostSummaryBtn) {
    hostSummaryBtn.addEventListener('click', () => {
      socket.emit('end-game', { roomCode });
    });
  }

  socket.on('game-ended', () => {
    renderGameOverScreen();
    transitionView('gameover');
  });

  function renderGameOverScreen() {
    const list = document.getElementById('gameover-scores-list');
    if (!list) return;
    list.innerHTML = '';

    const entries = Object.entries(matchScores)
      .sort((a, b) => (b[1].matched / Math.max(b[1].total, 1)) - (a[1].matched / Math.max(a[1].total, 1)));

    if (entries.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#8fb3aa;font-size:13px;padding:12px 0;">ยังไม่มีคะแนน (ไม่มีรอบระดับ 1 หรือ 2)</p>';
    } else {
      entries.forEach(([name, data], idx) => {
        const pct = data.total > 0 ? Math.round((data.matched / data.total) * 100) : 0;
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '▪️';
        const div = document.createElement('div');
        div.className = 'score-bar-wrap';
        div.innerHTML = `
          <div class="score-bar-label">
            <span>${medal} ${name}</span>
            <span style="color:var(--primary);font-family:Kanit">${data.matched}/${data.total} ตรง (${pct}%)</span>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill" style="width:${pct}%"></div>
          </div>
        `;
        list.appendChild(div);
      });
    }

    const hostCtrl = document.getElementById('gameover-host-controls');
    const guestWait = document.getElementById('gameover-guest-waiting');
    if (isHost) {
      if (hostCtrl) hostCtrl.style.display = 'block';
      if (guestWait) guestWait.style.display = 'none';
    } else {
      if (hostCtrl) hostCtrl.style.display = 'none';
      if (guestWait) guestWait.style.display = 'block';
    }
  }

  const gameoverCategoryBtns = document.querySelectorAll('.gameover-category-btn');
  const gameoverIntensityBtns = document.querySelectorAll('.gameover-intensity-btn');
  let gameoverCategory = 'all';
  let gameoverIntensity = 1;

  gameoverCategoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      gameoverCategoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameoverCategory = btn.getAttribute('data-category');
    });
  });

  gameoverIntensityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      gameoverIntensityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameoverIntensity = Number(btn.getAttribute('data-level'));
    });
  });

  if (gameoverPlayAgainBtn) {
    gameoverPlayAgainBtn.addEventListener('click', () => {
      if (!isHost) return;
      matchScores = {};
      questionCount = 0;
      usedCardIds.clear();
      selectedCategory = gameoverCategory;
      selectedIntensity = gameoverIntensity;
      const card = pickNextCard(selectedIntensity);
      if (!card) {
        alert('ไม่พบคำถามในหมวดและระดับที่เลือก ลองเปลี่ยนการตั้งค่า');
        return;
      }
      socket.emit('change-mode', { roomCode, mode: 'corporate' });
      socket.emit('next-card', { roomCode, card });
    });
  }

  // ==========================================================================
  // TRANSITION VIEW UTILITY
  // ==========================================================================

  function transitionView(view) {
    // Null-safe hide: element might not exist if HTML/JS cache is mismatched
    const hide = el => { if (el) el.style.display = 'none'; };
    const show = (el, d) => { if (el) el.style.display = d || 'block'; };

    hide(pstateJoin);
    hide(pstateConnecting);
    hide(pstateLobby);
    hide(pstateChoice);
    hide(pstateWrite);
    hide(pstateSubmitted);
    hide(pstateVote);
    hide(pstateRoundover);
    hide(pstateScores);

    if (view === 'join' || view === 'lobby' || view === 'connecting') {
      hide(playerCancelBtn);
      hide(safezoneBtn);
    } else {
      show(playerCancelBtn, 'inline-flex');
      show(safezoneBtn, 'inline-flex');
    }

    if (view === 'connecting') {
      show(pstateConnecting);
    } else if (view === 'join') {
      show(pstateJoin);
    } else if (view === 'lobby') {
      show(pstateLobby);
    } else if (view === 'choice') {
      show(pstateChoice);
    } else if (view === 'write') {
      show(pstateWrite);
    } else if (view === 'submitted') {
      show(pstateSubmitted);
    } else if (view === 'vote') {
      show(pstateVote);
    } else if (view === 'roundover') {
      show(pstateRoundover);
    } else if (view === 'scores' || view === 'gameover') {
      show(pstateScores || pstateGameover);
      hide(safezoneBtn);
    }
  }

  // ==========================================================================
  // PULL-TO-REFRESH
  // ==========================================================================

  const ptrIndicator = document.getElementById('ptr-indicator');
  const ptrText = document.getElementById('ptr-text');
  const ptrSpinner = document.getElementById('ptr-spinner');
  let ptrStartY = 0;
  const PTR_THRESHOLD = 70;
  const outerWrap = document.querySelector('.player-outer-wrap');

  document.addEventListener('touchstart', e => {
    ptrStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!ptrIndicator) return;
    const delta = e.touches[0].clientY - ptrStartY;
    const atTop = (outerWrap?.scrollTop || 0) === 0;
    if (delta > 0 && atTop) {
      const progress = Math.min(delta / PTR_THRESHOLD, 1);
      ptrIndicator.classList.add('visible');
      ptrIndicator.style.transform = `translateX(-50%) translateY(${Math.min(delta * 0.4, 24)}px)`;
      ptrText.textContent = progress >= 1 ? 'ปล่อยเพื่อรีเฟรช' : 'ดึงลงเพื่อรีเฟรช';
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!ptrIndicator) return;
    const delta = e.changedTouches[0].clientY - ptrStartY;
    if (delta >= PTR_THRESHOLD) {
      ptrText.textContent = 'กำลังรีเฟรช...';
      ptrSpinner.classList.add('spin');
      ptrIndicator.classList.add('releasing');
      setTimeout(() => window.location.reload(), 600);
    } else {
      ptrIndicator.classList.remove('visible', 'releasing');
      ptrIndicator.style.transform = '';
    }
  }, { passive: true });

});
