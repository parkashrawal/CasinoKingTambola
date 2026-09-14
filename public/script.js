const socket = io();
let myTicket = null;
let myName = '';
let roomCode = '';
let isHost = false;
let autoInterval = null;
let autoRunning = false;
let calledNumbers = [];
let allPlayers = [];

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

// ===== जितको सेलिब्रेसन सङ्गीत =====
function playCelebration() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
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
    message = `Congratulations ${name}! You are the winner!`;
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

function show(id) {
  ['lobby','waiting','game'].forEach(x => {
    document.getElementById(x).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
}

function createRoom() {
  myName = document.getElementById('playerName').value.trim();
  if (!myName) return alert('नाम लेख्नुहोस्');
  socket.emit('createRoom', { playerName: myName }, (res) => {
    if (res.success) {
      roomCode = res.code;
      myTicket = res.ticket;
      isHost = true;
      document.getElementById('roomCodeDisplay').textContent = roomCode;
      document.getElementById('startBtn').style.display = 'block';
      show('waiting');
    } else document.getElementById('lobbyMsg').textContent = res.message;
  });
}

function joinRoom() {
  myName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!myName || !code) return alert('नाम र कोड लेख्नुहोस्');
  socket.emit('joinRoom', { code, playerName: myName }, (res) => {
    if (res.success) {
      roomCode = res.code;
      myTicket = res.ticket;
      document.getElementById('roomCodeDisplay').textContent = roomCode;
      show('waiting');
    } else document.getElementById('lobbyMsg').textContent = res.message;
  });
}

socket.on('playerList', (list) => {
  allPlayers = list;
  document.getElementById('playerCount').textContent = list.length;
  document.getElementById('playerList').innerHTML = list.map(p => `<li>${p.name}</li>`).join('');
  if (document.getElementById('game').style.display === 'block') {
    renderAllTickets();
  }
});

socket.on('newPlayerJoined', ({ name, total }) => {
  document.getElementById('waitMsg').textContent = `✅ ${name} जोडियो (${total} जना)`;
});

socket.on('playerLeft', ({ name }) => {
  document.getElementById('waitMsg').textContent = `${name} बाहिरियो`;
});

function startGame() {
  socket.emit('startGame', { code: roomCode });
}

socket.on('gameStarted', ({ players }) => {
  allPlayers = players;
  document.getElementById('gameRoomCode').textContent = roomCode;
  if (isHost) document.getElementById('hostPanel').style.display = 'block';
  renderMyTicket();
  renderAllTickets();
  show('game');
});

function renderMyTicket() {
  const div = document.getElementById('myTicket');
  div.innerHTML = '';
  myTicket.forEach(row => {
    row.forEach(num => {
      const c = document.createElement('div');
      c.className = 'cell' + (num === null ? ' empty' : '');
      if (num !== null) {
        c.textContent = num;
        c.dataset.num = num;
        c.onclick = () => toggleMark(c, num);
      }
      div.appendChild(c);
    });
  });
}

function renderAllTickets() {
  const container = document.getElementById('allTickets');
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

function toggleMark(cell, num) {
  if (!calledNumbers.includes(num)) return;
  cell.classList.toggle('marked');
}

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

socket.on('numberCalled', ({ number, allCalled }) => {
  calledNumbers = allCalled;
  document.getElementById('currentNumber').textContent = number;

  speakNumber(number);

  document.querySelectorAll('#myTicket .cell').forEach(c => {
    if (c.dataset.num == number) c.classList.add('called');
  });
  document.querySelectorAll('#allTickets .cell').forEach(c => {
    if (c.dataset.num == number) c.classList.add('called');
  });
  const list = document.getElementById('calledList');
  const s = document.createElement('span');
  s.textContent = number;
  list.prepend(s);
});

function claim(type) {
  const marked = [];
  document.querySelectorAll('#myTicket .cell.marked').forEach(c => marked.push(parseInt(c.dataset.num)));
  socket.emit('claimWin', { code: roomCode, type, markedNumbers: marked });
}

socket.on('winner', ({ type, name }) => {
  const msg = document.getElementById('gameMsg');
  msg.textContent = `🎉 ${type} जित्नुभयो: ${name}`;
  msg.style.color = '#38ef7d';
  msg.style.fontSize = '1.2rem';

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

socket.on('claimResult', ({ success, message }) => {
  if (!success) {
    const msg = document.getElementById('gameMsg');
    msg.textContent = '❌ ' + message;
    msg.style.color = '#ff6b6b';
  }
});

function showBigAnnouncement(text) {
  const div = document.createElement('div');
  div.className = 'big-announcement';
  div.textContent = text;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
