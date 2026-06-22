/**
 * Shared Client Utilities for Deep Talk Platform
 */

window.DeepTalkUtils = {
  // Generate QR Code URL using standard qrserver API
  generateQRCodeUrl: function(data) {
    const encoded = encodeURIComponent(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encoded}&color=0f0a20&bgcolor=ffffff`;
  },

  // Custom Canvas Word Cloud Generator (Self-contained, offline)
  drawWordCloud: function(canvasElement, textList) {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    const width = canvasElement.width = canvasElement.offsetWidth;
    const height = canvasElement.height = canvasElement.offsetHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Stop words to filter out (Thai & English)
    const stopWords = new Set([
      'และ', 'หรือ', 'แต่', 'ของ', 'ใน', 'ที่', 'มี', 'เป็น', 'จะ', 'ให้', 'กับ', 'ไป', 'มา', 'นี้', 'นั้น', 'การ', 'ความ',
      'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'is', 'am', 'are', 'was', 'were'
    ]);

    // Tokenize and count words
    const wordCounts = {};
    textList.forEach(text => {
      if (!text) return;
      // Split by whitespace and common punctuation, lowercase English words
      const tokens = text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
        .split(/\s+/);
        
      tokens.forEach(token => {
        if (token.length > 1 && !stopWords.has(token)) {
          wordCounts[token] = (wordCounts[token] || 0) + 1;
        }
      });
    });

    const words = Object.keys(wordCounts).map(word => ({
      text: word,
      size: wordCounts[word]
    }));

    if (words.length === 0) {
      // Draw centered placeholder text if no words
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for answers to build word cloud...', width / 2, height / 2);
      return;
    }

    // Sort words by count descending
    words.sort((a, b) => b.size - a.size);

    // Max count for scaling
    const maxCount = words[0].size;
    const colors = ['#06b6d4', '#ec4899', '#eab308', '#a855f7', '#10b981', '#3b82f6'];

    // Draw words
    words.forEach((word, index) => {
      // Scale font size: between 14px and 48px
      const minFont = 14;
      const maxFont = 48;
      const fontSize = words.length === 1 
        ? 36 
        : minFont + ((word.size - 1) / (maxCount - 1 || 1)) * (maxFont - minFont);

      ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
      ctx.fillStyle = colors[index % colors.length];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Simple placement strategy: spiral or random-walk around center
      let placed = false;
      let radius = 0;
      let angle = 0;
      let x = width / 2;
      let y = height / 2;

      // Try placing the word, checking bounds
      const padding = 15;
      const wordWidth = ctx.measureText(word.text).width;
      const wordHeight = fontSize;

      let attempts = 0;
      while (!placed && attempts < 100) {
        // Spiral outward
        radius = attempts * 2.5;
        angle = attempts * 0.4;
        x = (width / 2) + radius * Math.cos(angle);
        y = (height / 2) + radius * Math.sin(angle);

        // Keep inside canvas boundary
        if (
          x - wordWidth/2 > padding && 
          x + wordWidth/2 < width - padding && 
          y - wordHeight/2 > padding && 
          y + wordHeight/2 < height - padding
        ) {
          placed = true;
        }
        attempts++;
      }

      ctx.save();
      ctx.translate(x, y);
      // Slightly rotate some words for a dynamic aesthetic
      if (index % 4 === 1) {
        ctx.rotate(Math.PI / 12);
      } else if (index % 4 === 3) {
        ctx.rotate(-Math.PI / 12);
      }
      ctx.fillText(word.text, 0, 0);
      ctx.restore();
    });
  },

  // Perform client-side sentiment analysis on reflective writing
  analyzeSentiment: function(text) {
    if (!text || text.trim().length === 0) {
      return { score: 0, label: "neutral", desc: "No entry details available." };
    }

    const val = text.toLowerCase();
    
    // Thai & English sentiment indicator keywords
    const reflectiveKeywords = ['สะท้อน', 'คิดว่า', 'รู้สึก', 'เรียนรู้', 'เข้าใจ', 'อดีต', 'วัยเด็ก', 'ความสัมพันธ์', 'feel', 'think', 'reflect', 'realize', 'understand', 'past', 'memory', 'childhood'];
    const anxiousKeywords = ['เครียด', 'กลัว', 'กังวล', 'เศร้า', 'ผิดหวัง', 'ร้องไห้', 'กดดัน', 'เหนื่อย', 'anxious', 'sad', 'stress', 'fear', 'worry', 'scared', 'tired', 'lonely', 'depressed', 'hurt'];
    const positiveKeywords = ['ดีขึ้น', 'มีความสุข', 'ยินดี', 'ขอบคุณ', 'รัก', 'ผ่อนคลาย', 'เติบโต', 'สำเร็จ', 'happy', 'grateful', 'love', 'grow', 'calm', 'proud', 'good', 'joy', 'smile'];

    let reflectiveCount = 0;
    let anxiousCount = 0;
    let positiveCount = 0;

    reflectiveKeywords.forEach(kw => { if (val.includes(kw)) reflectiveCount++; });
    anxiousKeywords.forEach(kw => { if (val.includes(kw)) anxiousCount++; });
    positiveKeywords.forEach(kw => { if (val.includes(kw)) positiveCount++; });

    // Determine dominate category
    if (anxiousCount > positiveCount && anxiousCount > reflectiveCount) {
      return {
        score: -0.6,
        label: "anxious",
        descTh: "พบความรู้สึกกังวลหรือเหนื่อยล้าทางอารมณ์ การเขียนระบายช่วยบรรเทาจิตใจได้นะ",
        descEn: "Detected indicators of stress or anxiety. Expressing it here is a great step to letting it go."
      };
    } else if (positiveCount > anxiousCount && positiveCount > reflectiveCount) {
      return {
        score: 0.7,
        label: "positive",
        descTh: "พบความรู้สึกบวกและการเติบโต ขอให้รักษาพลังงานที่ดีนี้ไว้นะ!",
        descEn: "Detected positive outlook or growth! Keep nurturing this healthy, happy mindset."
      };
    } else if (reflectiveCount > 0 || (reflectiveCount === 0 && anxiousCount === 0 && positiveCount === 0)) {
      return {
        score: 0.3,
        label: "reflective",
        descTh: "พบความรู้สึกสะท้อนคิด ลึกซึ้ง และทบทวนอดีต เป็นช่วงเวลาทำความเข้าใจตัวเองที่ดีมาก",
        descEn: "Detected a reflective, self-aware mood. Excellent session for understanding your inner world."
      };
    }

    return {
      score: 0,
      label: "neutral",
      descTh: "สถิติอารมณ์มีความเป็นกลาง จิตใจสงบและมั่นคง",
      descEn: "Neutral emotional state. Mind is steady and calm."
    };
  }
};
