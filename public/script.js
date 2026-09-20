const socket = io();
let roomCode = '';
let isHost = false;
let autoInterval = null;
let autoRunning = false;
let calledNumbers = [];
let allPlayers = [];

function showPage(id) {
  ['landing','hostLoginBox','ticketSetup','game'].forEach(x => {
    document.getElementById(x).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
}

function backToLanding() { showPage('landing'); }
function showHostLogin() { showPage('hostLoginBox'); }

function hostLogin() {
  const pass = document.getElementById('hostPassword').value;
  if (!pass) {
    document.getElementById('hostLoginMsg').textContent = 'पासवर्ड लेख्नुहोस्';
    return;
  }
  socket.emit('hostLogin', { password: pass }, (res) => {
    if (res.success) {
      document.getElementById('hostLoginMsg').textContent = '';
      showTicketSetup();
    } else {
      document.getElementById('hostLoginMsg').textContent = res.message;
    }
  });
}

// ⚠️ ३० जना नाम इनपुट
function showTicketSetup() {
  const container = document.getElementById('nameInputs');
  container.innerHTML = '';
  for (let i = 1; i <= 30; i++) {
    const div = document.createElement('div');
    div.className = 'name-input-row';
    div.innerHTML = `<label>टिकट ${i}:</label>
      <input id="name${i}" placeholder="खेलाडीको नाम (खाली छोड्नुहोस्)" maxlength="15">`;
    container.appendChild(div);
  }
  showPage('ticketSetup');
}

function startGameWithNames() {
  const names = [];
  for (let i = 1; i <= 30; i++) {
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
      document.getElementById('hostPanel').style.display = 'block';
      showPage('game');
      showBigAnnouncement('गेम सुरु भयो!');
    } else {
      document.getElementById('setupMsg').textContent = res.message;
    }
  });
}

function viewGame() {
  socket.emit('viewLatestRoom', {}, (res) => {
    if (res.success) {
      roomCode = res.code;
      isHost = false;
      document.getElementById('hostPanel').style.display = 'none';
      allPlayers = res.players;
      calledNumbers = res.calledNumbers || [];
      renderNumberBoard();
      renderAllTickets();

      if (res.winners) {
        if (res.winners.fullList && res.winners.fullList.length > 0) {
          const f = res.winners.fullList[0];
          document.getElementById('firstWinnerName').textContent = `${f.name} (टिकट ${f.ticketNo})`;
          document.getElementById('firstWinnerName').style.color = '#38ef7d';

          if (res.winners.fullList.length > 1) {
            const s = res.winners.fullList[1];
            document.getElementById('secondWinnerName').textContent = `${s.name} (टिकट ${s.ticketNo})`;
            document.getElementById('secondWinnerName').style.color = '#38ef7d';
          }
        }
        if (res.winners.cornerList && res.winners.cornerList.length > 0) {
          const t = res.winners.cornerList[0];
          document.getElementById('thirdWinnerName').textContent = `${t.name} (टिकट ${t.ticketNo})`;
          document.getElementById('thirdWinnerName').style.color = '#38ef7d';
        }
      }
      showPage('game');
    } else {
      document.getElementById('landingMsg').textContent = res.message;
    }
  });
}

socket.on('playerList', (list) => {
  allPlayers = list;
  if (document.getElementById('game').style.display === 'block') renderAllTickets();
});

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

function renderAllTickets() {
  const container = document.getElementById('allTickets');
  if (!container) return;
  container.innerHTML = '';
  allPlayers.forEach((player, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'player-ticket-wrapper';
    const nameEl = document.createElement('div');
    nameEl.className = 'player-ticket-name';
    nameEl.textContent = '🎫 टिकट ' + (index + 1) + ' • 👤 ' + player.name;
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

function callNumber() {
  if (!isHost) return alert('तपाईं होस्ट होइन!');
  socket.emit('callNumber', { code: roomCode });
}

function callAutoNumber() {
  if (!isHost) return;
  socket.emit('autoCallNumber', { code: roomCode });
}

function autoToggle() {
  if (autoRunning) {
    clearInterval(autoInterval);
    autoRunning = false;
    document.getElementById('autoBtn').textContent = 'अटो: बन्द';
  } else {
    autoRunning = true;
    document.getElementById('autoBtn').textContent = 'अटो: चालु';
    autoInterval = setInterval(callAutoNumber, 4000);
  }
}

function saveCustomNumber() {
  if (!isHost) return;
  const input = document.getElementById('customNumber');
  const num = parseInt(input.value);
  if (isNaN(num) || num < 1 || num > 99) {
    socket.emit('setCustomNumber', { code: roomCode, number: null });
    return;
  }
  socket.emit('setCustomNumber', { code: roomCode, number: num });
}

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

function speakNumber(num) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(num.toString());
  utter.lang = 'en-IN';
  utter.rate = 1.0;
  window.speechSynthesis.speak(utter);
}

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
  } catch (e) {}
}

function announceWinner(type, name, ticketNo) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  let message = '';
  if (type.includes('फस्ट')) {
    message = `Congratulations ${name}! Your ticket number ${ticketNo} is the first winner for full house!`;
  } else if (type.includes('सेकेन्ड')) {
    message = `Congratulations ${name}! Your ticket number ${ticketNo} is the second winner for full house!`;
  } else if (type.includes('थर्ड')) {
    message = `Congratulations ${name}! Your ticket number ${ticketNo} is the third winner for corner!`;
  } else if (type.includes('फुल हाउस')) {
    message = `Congratulations ${name}! Your ticket number ${ticketNo} is the winner for full house!`;
  } else if (type.includes('कर्नर')) {
    message = `Congratulations ${name}! Your ticket number ${ticketNo} got the corner!`;
  }
  const utter = new SpeechSynthesisUtterance(message);
  utter.lang = 'en-IN';
  utter.rate = 0.9;
  utter.pitch = 1.2;
  window.speechSynthesis.speak(utter);
}

socket.on('winner', ({ type, name, ticketNo, place }) => {
  const msg = document.getElementById('gameMsg');
  msg.textContent = `🎉 ${type}: ${name} (टिकट ${ticketNo})`;
  msg.style.color = '#38ef7d';
  msg.style.fontSize = '1.1rem';

  // विजेता पट्टीमा देखाउने
  if (place === 1) {
    const el = document.getElementById('firstWinnerName');
    if (el) {
      el.textContent = `${name} (टिकट ${ticketNo})`;
      el.style.color = '#38ef7d';
    }
  } else if (place === 2) {
    const el = document.getElementById('secondWinnerName');
    if (el) {
      el.textContent = `${name} (टिकट ${ticketNo})`;
      el.style.color = '#38ef7d';
    }
  } else if (place === 3) {
    const el = document.getElementById('thirdWinnerName');
    if (el) {
      el.textContent = `${name} (टिकट ${ticketNo})`;
      el.style.color = '#38ef7d';
    }
  }

  playCelebration();
  setTimeout(() => announceWinner(type, name, ticketNo), 1200);
  showBigAnnouncement(`🎉 ${type}: ${name} (टिकट ${ticketNo})`);
});

socket.on('gameOver', ({ message }) => {
  if (autoRunning) autoToggle();
  const msg = document.getElementById('gameMsg');
  msg.textContent = message;
  msg.style.color = '#ffd700';
  msg.style.whiteSpace = 'pre-line';
  msg.style.fontSize = '1.1rem';
  playCelebration();
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
