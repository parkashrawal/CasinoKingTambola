const socket = io();
let roomCode = '';
let isHost = false;
let autoInterval = null;
let autoRunning = false;
let calledNumbers = [];
let allPlayers = [];

// ⚠️ होस्ट पासवर्ड — यहाँ आफ्नो पासवर्ड राख्नुहोस्
const HOST_PASSWORD = 'pgpk3535';

// ===== पेज ह्यान्डलिङ =====
function showPage(id) {
  ['landing','hostLoginBox','ticketSetup','playerJoin','game'].forEach(x => {
    document.getElementById(x).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
}

function backToLanding() {
  showPage('landing');
}

function showHostLogin() {
  showPage('hostLoginBox');
}

function hostLogin() {
  const pass = document.getElementById('hostPassword').value;
  if (pass !== HOST_PASSWORD) {
    document.getElementById('hostLoginMsg').textContent = '❌ गलत पासवर्ड!';
    return;
  }
  document.getElementById('hostLoginMsg').textContent = '';
  showTicketSetup();
}

// ===== टिकट बनाउने फारम =====
function showTicketSetup() {
  const container = document.getElementById('nameInputs');
  container.innerHTML = '';
  for (let i = 1; i <= 15; i++) {
    const div = document.createElement('div');
    div.className = 'name-input-row';
    div.innerHTML = `
      <label>टिकट ${i}:</label>
      <input id="name${i}" placeholder="खेलाडीको नाम (खाली छोड्नुहोस्)" maxlength="15">
    `;
    container.appendChild(div);
  }
  showPage('ticketSetup');
}

// ===== गेम सुरु गर्ने (नाम सहित) =====
function startGameWithNames() {
  const names = [];
  for (let i = 1; i <= 15; i++) {
    const val = document.getElementById('name' + i).value.trim();
    if (val) names.push(val);
  }
  if (names.length < 2) {
    document.getElementById('setupMsg').textContent = 'कम्तीमा २ जनाको नाम लेख्नुहोस्!';
    return;
  }
  socket.emit('createRoomWithNames', { names }, (res) => {
    if (res.success) {
      roomCode = res.code;
      isHost = true;
      document.getElementById('gameRoomCode').textContent = roomCode;
      document.getElementById('hostPanel').style.display = 'block';
      showPage('game');
      showBigAnnouncement('रुम कोड: ' + roomCode + '\nयो कोड साथीहरूलाई पठाउनुहोस्');
    } else {
      document.getElementById('setupMsg').textContent = res.message;
    }
  });
}

// ===== खेल हेर्ने (साथीहरूको लागि) =====
function viewGame() {
  const code = document.getElementById('viewRoomCode').value.trim().toUpperCase();
  if (!code) {
    document.getElementById('landingMsg').textContent = 'रुम कोड लेख्नुहोस्!';
    return;
  }
  socket.emit('viewRoom', { code }, (res) => {
    if (res.success) {
      roomCode = code;
      isHost = false;
      document.getElementById('gameRoomCode').textContent = roomCode;
      document.getElementById('hostPanel').style.display = 'none';
      allPlayers = res.players;
      calledNumbers = res.calledNumbers || [];
      renderNumberBoard();
      renderAllTickets();
      // विजेता पहिले नै छन् भने देखाउने
      if (res.winners) {
        if (res.winners.full) {
          document.getElementById('fullWinnerName').textContent = res.winners.full;
          document.getElementById('fullWinnerName').style.color = '#38ef7d';
        }
        if (res.winners.corner) {
          document.getElementById('cornerWinnerName').textContent = res.winners.corner;
          document.getElementById('cornerWinnerName').style.color = '#38ef7d';
        }
      }
      showPage('game');
    } else {
      document.getElementById('landingMsg').textContent = res.message;
    }
  });
}

function joinAsViewer() {
  viewGame();
}

// ===== सर्भरबाट आउने इभेन्ट =====
socket.on('playerList', (list) => {
  allPlayers = list;
  if (document.getElementById('game').style.display === 'block') {
    renderAllTickets();
  }
});

// ===== नम्बर बोर्ड =====
function renderNumberBoard() {
  const board = document.getElementById('numberBoard');
  if (!board) return;
  board.innerHTML = '';
  for (let i = 1; i <= 99; i++) {
    const cell = document.createElement('div');
    cell.className = 'num-cell';
    cell.textContent = i;
    cell.id = 'num-' + i;
    if (calledNumbers.includes(i)) cell.classList.add('called');
    board.appendChild(cell);
  }
}

// ===== सबै टिकट =====
function renderAllTickets() {
  const container = document.getElementById('allTickets');
  if (!container) return;
  container.innerHTML = '';
  allPlayers.forEach(player => {
    const wrapper = document.createElement('div');
    wrapper.className = 'player-ticket-wrapper';
    const nameEl = document.createElement('div');
    nameEl.className = 'player-ticket-name';
    nameEl.textContent = '👤 ' + player.name;
    wrapper.appendChild(nameEl);
    const ticketDiv = document.createElement('div');
    ticketDiv.className = 'ticket small';
    player.ticket.forEach(row => {
      row.forEach(num => {
        const c = document.createElement('div');
        c.className = 'cell' + (num === null ? ' empty' : '');
        if (num !== null) {
          c.textContent = num;
          c.dataset.num = num;
          if (calledNumbers.includes(num)) c.classList.add('called');
        }
        ticketDiv.appendChild(c);
      });
    });
    wrapper.appendChild(ticketDiv);
    container.appendChild(wrapper);
  });
}

// ===== नम्बर कल =====
function callNumber() {
  socket.emit('callNumber', { code: roomCode });
}

function autoToggle() {
  if (autoRunning) {
    clearInterval(autoInterval);
    autoRunning = false;
    document.getElementById('autoBtn').textContent = 'अटो: बन्द';
  } else {
    autoRunning = true;
    document.getElementById('autoBtn').textContent = 'अटो: चालु';
    autoInterval = setInterval(callNumber, 3000);
  }
}

// ===== नम्बर आउँदा =====
socket.on('numberCalled', ({ number, allCalled }) => {
  calledNumbers = allCalled;
  document.getElementById('currentNumber').textContent = number;

  speakNumber(number);

  const boardCell = document.getElementById('num-' + number);
  if (boardCell) boardCell.classList.add('called');

  document.querySelectorAll('#allTickets .cell').forEach(c => {
    if (c.dataset.num == number) c.classList.add('called');
  });
  const list = document.getElementById('calledList');
  const s = document.createElement('span');
  s.textContent = number;
  list.prepend(s);
});

// ===== नम्बर उच्चारण =====
function speakNumber(num) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(num.toString());
  utter.lang = 'en-IN';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  window.speechSynthesis.speak(utter);
}

// ===== सेलिब्रेसन सङ्गीत =====
function playCelebration() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = audioCtx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (e) {
    console.log('आवाज बजाउन सकिएन');
  }
}

// ===== विजेता घोषणा (आवाजमा) =====
function announceWinner(type, name) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  let message = '';
  if (type.includes('फुल हाउस')) {
    message = `Congratulations ${name}! You are the winner for full house!`;
  } else if (type.includes('कर्नर')) {
    message = `Congratulations ${name}! You got the corner!`;
  } else {
    message = `Congratulations ${name}!`;
  }
  const utter = new SpeechSynthesisUtterance(message);
  utter.lang = 'en-IN';
  utter.rate = 0.9;
  utter.pitch = 1.2;
  utter.volume = 1.0;
  window.speechSynthesis.speak(utter);
}

// ===== विजेता घोषणा =====
socket.on('winner', ({ type, name }) => {
  console.log('विजेता आयो:', type, name);

  const msg = document.getElementById('gameMsg');
  msg.textContent = `🎉 ${type} जित्यो: ${name}`;
  msg.style.color = '#38ef7d';
  msg.style.fontSize = '1.2rem';

  if (type.includes('फुल हाउस')) {
    const el = document.getElementById('fullWinnerName');
    if (el) {
      el.textContent = name;
      el.style.color = '#38ef7d';
    }
  } else if (type.includes('कर्नर')) {
    const el = document.getElementById('cornerWinnerName');
    if (el) {
      el.textContent = name;
      el.style.color = '#38ef7d';
    }
  }

  playCelebration();

  setTimeout(() => {
    announceWinner(type, name);
  }, 1200);

  showBigAnnouncement(`🎉 ${type} जित्यो: ${name}`);
});

socket.on('gameOver', ({ message }) => {
  if (autoRunning) autoToggle();
  const msg = document.getElementById('gameMsg');
  msg.textContent = message;
  msg.style.color = '#ffd700';
  msg.style.whiteSpace = 'pre-line';
  msg.style.fontSize = '1.1rem';

  playCelebration();

  setTimeout(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Game Over!');
      utter.lang = 'en-IN';
      utter.rate = 0.9;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  }, 1000);

  showBigAnnouncement('🏁 खेल समाप्त!');
});

function showBigAnnouncement(text) {
  const div = document.createElement('div');
  div.className = 'big-announcement';
  div.textContent = text;
  div.style.whiteSpace = 'pre-line';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
