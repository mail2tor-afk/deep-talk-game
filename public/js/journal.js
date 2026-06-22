/**
 * Solo Reflection Journal Controller - Redesigned
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const moodItems = document.querySelectorAll('.mood-item');
  const moodButtons = document.querySelectorAll('.mood-btn');
  const promptTh = document.getElementById('prompt-text-th');
  const promptEn = document.getElementById('prompt-text-en');
  const refreshPromptBtn = document.getElementById('refresh-prompt-btn');
  const journalInput = document.getElementById('journal-input');
  const saveJournalBtn = document.getElementById('save-journal-btn');
  
  const sentimentBanner = document.getElementById('sentiment-banner');
  const sentimentText = document.getElementById('sentiment-text');

  const journalToggleView = document.getElementById('journal-toggle-view');
  const journalViewTitle = document.getElementById('journal-view-title');
  const viewWrite = document.getElementById('view-write');
  const viewHistory = document.getElementById('view-history');
  const logsListContainer = document.getElementById('logs-list-container');

  // State
  let selectedMood = 'good';
  let activePrompt = null;
  let sentimentTimeout = null;
  let currentView = 'write'; // 'write' or 'history'

  // Initialize
  selectMood('good');
  loadNewPrompt();
  renderLogs();

  // Mood Button Event Handlers
  moodItems.forEach(item => {
    const btn = item.querySelector('.mood-btn');
    btn.addEventListener('click', () => {
      const mood = item.getAttribute('data-mood');
      selectMood(mood);
    });
  });

  // Select Mood state helper
  function selectMood(mood) {
    selectedMood = mood;
    
    // Clear all inline shadows and selected classes
    moodItems.forEach(item => {
      item.classList.remove('selected');
      const btn = item.querySelector('.mood-btn');
      btn.style.borderColor = 'rgba(122, 200, 188, 0.25)';
      btn.style.boxShadow = 'none';
      
      if (item.getAttribute('data-mood') === mood) {
        item.classList.add('selected');
        
        // Apply matching color glow
        const color = getMoodColor(mood);
        btn.style.borderColor = color;
        btn.style.boxShadow = `0 0 16px ${color}`;
      }
    });
  }

  function getMoodColor(mood) {
    switch (mood) {
      case 'great': return '#8bd3a0'; // Positive
      case 'good': return '#4db6a4';  // Primary
      case 'sad': return '#e6b86b';   // Caution
      case 'anxious': return '#ff9c9c'; // Danger
      default: return '#eef7f4'; // Ink
    }
  }

  // Load random deep reflection prompt
  function loadNewPrompt() {
    const db = window.DEEP_TALK_DB;
    // reflection journal uses Level 2 & 3 questions
    const pool = [...db[2], ...db[3]];
    
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      activePrompt = pool[randomIndex];
      
      promptTh.innerText = activePrompt.questionTh;
      promptEn.innerText = activePrompt.questionEn;
      
      const categoryBadge = document.querySelector('.card-prompt-label');
      if (categoryBadge) {
        categoryBadge.innerText = `คำถามชวนคิด · ระดับ ${activePrompt.level} (หมวด: ${activePrompt.category})`;
      }
    }
  }

  refreshPromptBtn.addEventListener('click', loadNewPrompt);

  // Debounced Sentiment Analysis during typing
  journalInput.addEventListener('input', () => {
    clearTimeout(sentimentTimeout);
    sentimentTimeout = setTimeout(() => {
      const text = journalInput.value;
      if (text.trim().length > 10) {
        const sentiment = window.DeepTalkUtils.analyzeSentiment(text);
        
        sentimentBanner.style.display = 'flex';
        const color = getSentimentColor(sentiment.label);
        
        const dot = sentimentBanner.querySelector('span');
        if (dot) {
          dot.style.backgroundColor = color;
          dot.style.boxShadow = `0 0 8px ${color}`;
        }
        
        sentimentText.innerText = getSentimentLabelTh(sentiment.label);
        sentimentText.style.color = color;
      } else {
        sentimentBanner.style.display = 'none';
      }
    }, 600);
  });

  // Get color code matching sentiment type
  function getSentimentColor(label) {
    switch (label) {
      case 'positive': return '#8bd3a0';
      case 'anxious': return '#e6b86b';
      case 'reflective': return '#7ac8bc';
      default: return '#4db6a4';
    }
  }

  function getSentimentLabelTh(label) {
    switch (label) {
      case 'positive': return 'เชิงบวก / ผ่อนคลาย';
      case 'anxious': return 'กังวล / เหนื่อยล้า';
      case 'reflective': return 'ทบทวนใคร่ครวญตนเอง';
      default: return 'จิตใจสงบมั่นคง';
    }
  }

  // Save journal entries
  saveJournalBtn.addEventListener('click', () => {
    const text = journalInput.value.trim();
    if (!text) {
      alert("กรุณาบันทึกข้อความความรู้สึกของคุณก่อนบันทึก");
      return;
    }

    const sentimentResult = window.DeepTalkUtils.analyzeSentiment(text);
    
    const newEntry = {
      id: `entry-${Date.now()}`,
      date: new Date().toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      mood: selectedMood,
      prompt: activePrompt ? {
        questionTh: activePrompt.questionTh,
        questionEn: activePrompt.questionEn
      } : null,
      content: text,
      sentiment: sentimentResult.label
    };

    // Save to local storage list
    let logs = [];
    try {
      const savedLogs = localStorage.getItem('deeptalk_journal_logs');
      if (savedLogs) {
        logs = JSON.parse(savedLogs);
      }
    } catch (e) {
      console.error("Error reading logs:", e);
    }

    logs.unshift(newEntry);
    localStorage.setItem('deeptalk_journal_logs', JSON.stringify(logs));

    // Reset Form
    journalInput.value = '';
    sentimentBanner.style.display = 'none';
    selectMood('good');
    loadNewPrompt();
    
    // Re-render
    renderLogs();
    alert("✓ บันทึกความรู้สึกสำเร็จ");
  });

  // Toggle write and history view
  journalToggleView.addEventListener('click', () => {
    if (currentView === 'write') {
      currentView = 'history';
      viewWrite.style.display = 'none';
      viewHistory.style.display = 'flex';
      journalViewTitle.innerText = 'บันทึกย้อนหลัง 📚';
      journalToggleView.innerText = '✍️';
      journalToggleView.title = 'เขียนบันทึกใหม่';
    } else {
      currentView = 'write';
      viewWrite.style.display = 'flex';
      viewHistory.style.display = 'none';
      journalViewTitle.innerText = 'สมุดทบทวน 🌙';
      journalToggleView.innerText = '📚';
      journalToggleView.title = 'ดูบันทึกย้อนหลัง';
    }
  });

  // Render logs list
  function renderLogs() {
    logsListContainer.innerHTML = '';
    
    let logs = [];
    try {
      const savedLogs = localStorage.getItem('deeptalk_journal_logs');
      if (savedLogs) {
        logs = JSON.parse(savedLogs);
      }
    } catch (e) {
      console.error("Error reading logs:", e);
    }

    if (logs.length === 0) {
      logsListContainer.innerHTML = `
        <div class="log-item-card" style="text-align: center; color: #8fb3aa; padding: 24px;">
          ยังไม่มีบันทึกทบทวนในขณะนี้ เริ่มบันทึกความรู้สึกของคุณวันนี้ได้เลย ✍️
        </div>
      `;
      return;
    }

    const moodEmojis = {
      great: '😄',
      good: '🙂',
      neutral: '😐',
      sad: '😔',
      anxious: '😰'
    };

    logs.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'log-item-card';
      
      const moodEmoji = moodEmojis[entry.mood] || '😐';
      const color = getSentimentColor(entry.sentiment);

      card.innerHTML = `
        <div class="log-item-header">
          <div class="log-item-meta">
            <span class="log-item-emoji">${moodEmoji}</span>
            <span class="log-item-date">${entry.date}</span>
          </div>
          <button class="log-item-delete" data-id="${entry.id}" title="ลบบันทึก">🗑️</button>
        </div>
        ${entry.prompt ? `
          <div class="log-item-question">
            คำถาม: ${entry.prompt.questionTh}
          </div>
        ` : ''}
        <div class="log-item-content">${escapeHTML(entry.content)}</div>
        <span class="log-item-tag" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40;">
          ${getSentimentLabelTh(entry.sentiment)}
        </span>
      `;

      logsListContainer.appendChild(card);
    });

    // Attach delete listeners
    document.querySelectorAll('.log-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบบันทึกความรู้สึกรายการนี้?")) {
          deleteEntry(id);
        }
      });
    });
  }

  // Delete specific entry
  function deleteEntry(id) {
    try {
      const savedLogs = localStorage.getItem('deeptalk_journal_logs');
      if (savedLogs) {
        let logs = JSON.parse(savedLogs);
        logs = logs.filter(entry => entry.id !== id);
        localStorage.setItem('deeptalk_journal_logs', JSON.stringify(logs));
        renderLogs();
      }
    } catch (e) {
      console.error("Error deleting entry:", e);
    }
  }

  // Escape HTML helper to prevent XSS
  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
