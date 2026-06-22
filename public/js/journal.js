/**
 * Solo Reflection Journal Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const moodButtons = document.querySelectorAll('.mood-btn');
  const promptTh = document.getElementById('prompt-th');
  const promptEn = document.getElementById('prompt-en');
  const promptCategory = document.getElementById('prompt-category');
  const newPromptBtn = document.getElementById('new-prompt-btn');
  const journalInput = document.getElementById('journal-input');
  const saveEntryBtn = document.getElementById('save-entry-btn');
  const sentimentFeedback = document.getElementById('sentiment-feedback');
  const sentimentText = document.getElementById('sentiment-text');
  const sentimentDesc = document.getElementById('sentiment-desc');
  const logsList = document.getElementById('logs-list');

  // State
  let selectedMood = 'neutral';
  let activePrompt = null;
  let sentimentTimeout = null;

  // Initialize
  selectMood('neutral');
  loadNewPrompt();
  renderLogs();

  // Mood Button Event Handlers
  moodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.getAttribute('data-mood');
      selectMood(mood);
    });
  });

  // Select Mood state helper
  function selectMood(mood) {
    selectedMood = mood;
    moodButtons.forEach(btn => {
      btn.classList.remove('selected');
      if (btn.getAttribute('data-mood') === mood) {
        btn.classList.add('selected');
      }
    });
  }

  // Load random deep reflection prompt
  function loadNewPrompt() {
    // Reflection journal utilizes deeper levels (Level 2 & 3)
    const db = window.DEEP_TALK_DB;
    const pool = [...db[2], ...db[3]];
    
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      activePrompt = pool[randomIndex];
      
      promptTh.innerText = activePrompt.questionTh;
      promptEn.innerText = activePrompt.questionEn;
      promptCategory.innerText = `LEVEL ${activePrompt.level} • ${activePrompt.category}`;
    }
  }

  newPromptBtn.addEventListener('click', loadNewPrompt);

  // Debounced Sentiment Analysis during typing
  journalInput.addEventListener('input', () => {
    clearTimeout(sentimentTimeout);
    sentimentTimeout = setTimeout(() => {
      const text = journalInput.value;
      if (text.trim().length > 10) {
        const sentiment = window.DeepTalkUtils.analyzeSentiment(text);
        
        sentimentFeedback.className = `sentiment-panel visible`;
        sentimentFeedback.style.borderLeftColor = getSentimentColor(sentiment.label);
        
        sentimentText.innerText = sentiment.label.toUpperCase();
        sentimentText.style.color = getSentimentColor(sentiment.label);
        sentimentDesc.innerText = sentiment.descTh + ' / ' + sentiment.descEn;
      } else {
        sentimentFeedback.className = 'sentiment-panel';
      }
    }, 600);
  });

  // Get color code matching sentiment type
  function getSentimentColor(label) {
    switch (label) {
      case 'positive': return '#10b981'; // Green
      case 'anxious': return '#f43f5e';  // Red
      case 'reflective': return '#a855f7'; // Purple
      default: return '#3b82f6'; // Blue / Neutral
    }
  }

  // Save journal entries
  saveEntryBtn.addEventListener('click', () => {
    const text = journalInput.value.trim();
    if (!text) {
      alert("Please write down some reflection before saving.");
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

    logs.unshift(newEntry); // Prepend
    localStorage.setItem('deeptalk_journal_logs', JSON.stringify(logs));

    // Reset Form
    journalInput.value = '';
    sentimentFeedback.className = 'sentiment-panel';
    selectMood('neutral');
    loadNewPrompt();
    
    // Re-render
    renderLogs();
    alert("✓ Reflection saved successfully.");
  });

  // Render logs list
  function renderLogs() {
    logsList.innerHTML = '';
    
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
      logsList.innerHTML = `
        <div class="glass-panel" style="padding: 20px; text-align: center; color: var(--text-muted);">
          No reflection entries yet. Take a moment to write your first entry today.
        </div>
      `;
      return;
    }

    // Mood Emojis Map
    const moodEmojis = {
      great: '😊',
      good: '🙂',
      neutral: '😐',
      sad: '😔',
      anxious: '😰'
    };

    logs.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'glass-panel log-entry';
      
      const moodEmoji = moodEmojis[entry.mood] || '😐';

      card.innerHTML = `
        <div class="log-meta">
          <div class="log-date-mood">
            <span>${entry.date}</span>
            <span>•</span>
            <span>Mood: ${moodEmoji} ${entry.mood.toUpperCase()}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 15px;">
            <span class="log-sentiment-tag ${entry.sentiment}">${entry.sentiment}</span>
            <button class="log-delete-btn" data-id="${entry.id}">Delete</button>
          </div>
        </div>
        ${entry.prompt ? `
          <div class="log-prompt">
            Q: ${entry.prompt.questionTh} / ${entry.prompt.questionEn}
          </div>
        ` : ''}
        <div class="log-content">${escapeHTML(entry.content)}</div>
      `;

      logsList.appendChild(card);
    });

    // Attach delete listeners
    document.querySelectorAll('.log-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm("Are you sure you want to delete this entry?")) {
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
