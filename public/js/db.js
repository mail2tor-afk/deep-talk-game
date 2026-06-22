// Pre-configured Prompt Database for "No-App" Deep Talk & Icebreaker Game
// Structured in 3 progressive levels of intimacy, including mock bot answers

window.DEEP_TALK_DB = {
  // LEVEL 1: CLOSER (Low-stakes, fun, daily-life icebreakers)
  1: [
    {
      id: "l1-c1",
      level: 1,
      category: "Fun",
      questionTh: "เมนูอาหารอะไรที่สามารถอธิบายความเป็นตัวคุณในวันนี้ได้ดีที่สุด เพราะอะไร?",
      questionEn: "What food menu best describes you today, and why?",
      botAnswersTh: [
        "ข้าวไข่เจียวร้อน ๆ ครับ ง่าย ๆ สบาย ๆ แต่กินแล้วอบอุ่นใจดี",
        "น่าจะเป็นต้มยำกุ้งรสแซ่บค่ะ วันนี้ตื่นตัวสุด ๆ พร้อมลุยทุกเรื่อง",
        "กาแฟดำไม่ใส่น้ำตาลครับ เข้มข้นและง่วงนอนตลอดเวลาเลยวันนี้"
      ]
    },
    {
      id: "l1-c2",
      level: 1,
      category: "Nostalgia",
      questionTh: "การ์ตูนหรือของเล่นในวัยเด็กชิ้นไหนที่คุณเห็นแล้วรู้สึกอยากกลับไปเป็นเด็กอีกครั้ง?",
      questionEn: "Which childhood cartoon or toy makes you wish you could be a kid again?",
      botAnswersTh: [
        "เซเลอร์มูนเลยค่ะ ตอนเด็ก ๆ แย่งน้องเล่นเป็นสีชมพูประจำเลย",
        "รถบังคับตราก้างปลาครับ เล่นทีไรชนตู้กับข้าวบ้านพังตลอด",
        "ของเล่นแถมขนมกล่องละ 5 บาทในเซเว่นสมัยก่อน เห็นแล้วคิดถึงเพื่อน"
      ]
    },
    {
      id: "l1-c3",
      level: 1,
      category: "Habits",
      questionTh: "อะไรคือนิสัยประหลาด ๆ ตอนอยู่คนเดียวที่คุณไม่ค่อยกล้าบอกใครบ้าง?",
      questionEn: "What is a weird habit of yours when you are alone that you don't usually share?",
      botAnswersTh: [
        "ชอบเดินจงกรมคุยคนเดียวในห้องเวลาคิดไอเดียไม่ออกค่ะ",
        "ชอบเต้นแร้งเต้นกาหน้ากระจกเวลาอาบน้ำเสร็จ ปลดปล่อยอารมณ์สุด ๆ",
        "ชอบนั่งมองแมวแล้วพยายามทำเสียงเลียนแบบแมวขู่ใส่กัน"
      ]
    },
    {
      id: "l1-c4",
      level: 1,
      category: "Preferences",
      questionTh: "ระหว่าง 'นอนเฉย ๆ ริมหาด' กับ 'ไปปีนเขาผจญภัย' ทริปไหนผ่อนคลายสมองคุณมากกว่า?",
      questionEn: "Between 'relaxing on the beach' and 'climbing a mountain', which trip recharges you more?",
      botAnswersTh: [
        "นอนเฉย ๆ ฟังเสียงคลื่นริมหาดแน่นอนค่ะ ปีนเขามันเหนื่อยร่างพังไป",
        "ไปปีนเขาผจญภัยครับ ได้เหนื่อยแบบสะใจแล้วสมองมันจะโล่งมาก",
        "นอนริมทะเลแหละ ดีสุด นอนตากลมอ่านหนังสือเงียบ ๆ"
      ]
    },
    {
      id: "l1-c5",
      level: 1,
      category: "First Impressions",
      questionTh: "ความประทับใจแรกสุดที่คุณมีต่อคนรอบข้างในวันนี้คืออะไร?",
      questionEn: "What was your absolute first impression of the people around you today?",
      botAnswersTh: [
        "คิดว่าดูเงียบ ๆ เกร็ง ๆ กันนิดหน่อยในช่วงแรก แต่พอคุยก็เป็นกันเองดี",
        "ดูน่ารักและน่าจะคุยเก่งทุกคนเลยค่ะ บรรยากาศดูอบอุ่นมาก",
        "รู้สึกว่าทุกคนดูตั้งใจและเปิดรับฟังกันดีมากเลยครับ"
      ]
    }
  ],

  // LEVEL 2: DEEPER (Attitudes, perspectives, relationships, and mindset)
  2: [
    {
      id: "l2-d1",
      level: 2,
      category: "Mindset",
      questionTh: "คำว่า 'ประสบความสำเร็จ' สำหรับคุณ ณ ช่วงอายุนี้ คืออะไร? และมันเปลี่ยนไปจากตอนอายุ 18 ไหม?",
      questionEn: "What does 'success' mean to you at this age? Has it changed since you were 18?"
      , botAnswersTh: [
        "ตอนนี้คือการนอนหลับสนิทไม่มีเรื่องกังวลค่ะ ตอน 18 คิดแค่ว่าต้องรวยและเด่น",
        "ความสำเร็จคือมีเงินใช้ไม่ขัดสนและครอบครัวสุขภาพแข็งแรง ไม่เหมือนตอนวัยรุ่นที่อยากดัง",
        "แค่มีเวลาว่างกินข้าวเย็นกับคนที่รักก็สำเร็จแล้วครับ มันเรียบง่ายขึ้นเยอะ"
      ]
    },
    {
      id: "l2-d2",
      level: 2,
      category: "Relationships",
      questionTh: "ในความสัมพันธ์ คุณคิดว่า 'การมีเวลาส่วนตัว' หรือ 'การแชร์ทุกอย่างร่วมกัน' อะไรสำคัญกว่ากัน?",
      questionEn: "In a relationship, which is more important: 'having private time' or 'sharing everything'?",
      botAnswersTh: [
        "เวลาส่วนตัวสำคัญที่สุดค่ะ รักกันแค่ไหนก็ต้องมีพื้นที่ให้หายใจและคิดทบทวนตัวเอง",
        "การแชร์ร่วมกันในเรื่องสำคัญดีกว่า แต่เรื่องส่วนตัวเล็ก ๆ น้อย ๆ ก็ควรปล่อยอิสระ",
        "ต้องมีพื้นที่ส่วนตัวบ้างแหละ ถ้ายืนชิดกันเกินไปมันจะมองไม่เห็นความสุขของกันและกัน"
      ]
    },
    {
      id: "l2-d3",
      level: 2,
      category: "Reflection",
      questionTh: "อะไรคือบทเรียนที่เจ็บปวดที่สุดจากการพยายามเอาใจคนอื่น (People Pleasing) ในชีวิตของคุณ?",
      questionEn: "What is the most painful lesson you've learned from trying to please everyone?",
      botAnswersTh: [
        "เราเหนื่อยแทบตายเพื่อทำให้ทุกคนพอใจ แต่สุดท้ายเขาก็มองข้ามความรู้สึกเราอยู่ดี",
        "เสียเวลาชีวิตไปกับการตามใจคนอื่นจนลืมถามตัวเองว่าเราต้องการอะไรกันแน่",
        "สูญเสียตัวตนไปชั่วขณะนึงจนรู้สึกเกลียดตัวเองที่ปฏิเสธใครไม่เป็น"
      ]
    },
    {
      id: "l2-d4",
      level: 2,
      category: "Values",
      questionTh: "หากต้องเลือกนิสัยหนึ่งอย่างที่จะทำให้คุณเลิกคบกับเพื่อนสนิททันที นิสัยนั้นคืออะไร?",
      questionEn: "If you had to choose one personality trait that is an absolute dealbreaker in friendship, what is it?",
      botAnswersTh: [
        "การนินทาลับหลังและเอาเรื่องเปราะบางที่เราแชร์ไปล้อเลียนหัวเราะกับคนอื่น",
        "นิสัยเอาดีใส่ตัวเอาชั่วใส่คนอื่น ไม่เคยขอโทษเวลาทำผิดแต่ชอบโยงดราม่า",
        "คนที่ไม่ยินดีกับความสำเร็จของเราและชอบพูดจาเหน็บแนมดับฝันเพื่อน"
      ]
    }
  ],

  // LEVEL 3: WITHIN (Deep emotional vulnerability, fears, and core values)
  3: [
    {
      id: "l3-w1",
      level: 3,
      category: "Vulnerability",
      questionTh: "ความกลัวที่ลึกที่สุดเกี่ยวกับอนาคตที่คุณมักจะเก็บงำไว้คนเดียว ไม่ค่อยกล้าบอกใครคืออะไร?",
      questionEn: "What is your deepest fear about the future that you secretly keep to yourself?",
      botAnswersTh: [
        "กลัวว่าจะกลายเป็นคนที่ไม่มีใครต้องการและต้องแก่ตัวไปอย่างโดดเดี่ยวไร้ค่า",
        "กลัวหาเงินดูแลพ่อแม่ได้ไม่ดีพอในวันที่เขาป่วยหนักและเรายังไม่พร้อม",
        "กลัวตัวเองจะล้มเหลวแล้วลุกกลับมาไม่ได้อีกจนทำให้คนรอบข้างผิดหวัง"
      ]
    },
    {
      id: "l3-w2",
      level: 3,
      category: "Family & Past",
      questionTh: "คำพูดหรือการกระทำจากครอบครัวในวัยเด็กแบบไหนที่สร้างรอยแผลใจและยังคงส่งผลต่อพฤติกรรมคุณในวันนี้?",
      questionEn: "What word or action from your family in childhood left a scar that still affects your behavior today?",
      botAnswersTh: [
        "การโดนเปรียบเทียบกับลูกบ้านอื่นตลอดเวลา ทำให้กลายเป็นคนบ้างานและกลัวความไม่เพอร์เฟค",
        "คำดุด่าแรง ๆ ตอนเด็กเวลาทำของพัง ทำให้ทุกวันนี้กลัวการก้าวพลาดและชอบระแวงตลอดเวลา",
        "การถูกเพิกเฉยความรู้สึกตอนที่ร้องไห้ ทำให้โตมากลายเป็นคนเก็บความรู้สึกและอึดอัดที่จะเล่าเรื่องเศร้า"
      ]
    },
    {
      id: "l3-w3",
      level: 3,
      category: "Regrets",
      questionTh: "ถ้าสามารถย้อนกลับไปแก้ไขความสัมพันธ์ที่จบลงไปแล้วได้หนึ่งครั้ง คุณอยากกลับไปบอกอะไรกับเขา/เธอ?",
      questionEn: "If you could go back and repair one past broken relationship, what would you say to them?",
      botAnswersTh: [
        "ขอโทษที่ตอนนั้นเราใช้อารมณ์ตัดสินและเด็กเกินกว่าจะเข้าใจความปรารถนาดีของเธอ",
        "ขอบคุณสำหรับวันเวลาดี ๆ ทั้งหมดนะ และขอโทษที่เราละเลยความรู้สึกเธอไปบ่อยมาก",
        "อยากบอกว่าไม่ได้โกรธเคืองอะไรแล้วนะ ขอให้เธอเจอคนที่ดีและมีความสุขมาก ๆ"
      ]
    }
  ]
};
