const socket = io();
let myTicket = null;
let myName = '';
let roomCode = '';
let isHost = false;
let autoInterval = null;
let autoRunning = false;
let calledNumbers = [];

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
  document.getElementById('playerCount').textContent = list.length;
  document.getElementById('playerList').innerHTML = list.map(n => `<li>${n}</li>`).join('');
});

socket.on('playerLeft', ({ name }) => {
  document.getElementById('waitMsg').textContent = `${name} बाहिरियो`;
});

function startGame() {
  socket.emit('startGame', { code: roomCode });
}

socket.on('gameStarted', () => {
  document.getElementById('gameRoomCode').textContent = roomCode;
  if (isHost) document.getElementById('hostPanel').style.display = 'block';
  renderTicket();
  show('game');
});

function renderTicket() {
  const div = document.getElementById('ticket');
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
    autoInterval = setInterval(callNumber, 2000);
  }
}

socket.on('numberCalled', ({ number, allCalled }) => {
  calledNumbers = allCalled;
  document.getElementById('currentNumber').textContent = number;
  document.querySelectorAll('.cell').forEach(c => {
    if (c.dataset.num == number) c.classList.add('called');
  });
  const list = document.getElementById('calledList');
  const s = document.createElement('span');
  s.textContent = number;
  list.prepend(s);
});

function claim(type) {
  const marked = [];
  document.querySelectorAll('.cell.marked').forEach(c => marked.push(parseInt(c.dataset.num)));
  socket.emit('claimWin', { code: roomCode, type, markedNumbers: marked });
}

socket.on('winner', ({ type, name }) => {
  document.getElementById('gameMsg').textContent = `🎉 ${type} जित्नुभयो: ${name}`;
  document.getElementById('gameMsg').style.color = '#38ef7d';
  if (type === 'फुल हाउस' && autoRunning) autoToggle();
});

socket.on('claimResult', ({ success, message }) => {
  if (!success) {
    document.getElementById('gameMsg').textContent = '❌ ' + message;
    document.getElementById('gameMsg').style.color = '#ff6b6b';
  }
});

socket.on('gameOver', ({ message }) => {
  document.getElementById('gameMsg').textContent = message;
});
