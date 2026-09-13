const socket = io();
let myTicket = null;
let myName = '';
let roomCode = '';
let isHost = false;
let autoInterval = null;
let autoRunning = false;
let calledNumbers = [];
let allPlayers = [];

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
    autoInterval = setInterval(callNumber, 2000);
  }
}

socket.on('numberCalled', ({ number, allCalled }) => {
  calledNumbers = allCalled;
  document.getElementById('currentNumber').textContent = number;
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
  showBigAnnouncement(`🎉 ${type} जित्यो: ${name}`);
});

socket.on('gameOver', ({ message }) => {
  if (autoRunning) autoToggle();
  const msg = document.getElementById('gameMsg');
  msg.textContent = message;
  msg.style.color = '#ffd700';
  msg.style.whiteSpace = 'pre-line';
  msg.style.fontSize = '1.1rem';
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
  setTimeout(() => div.remove(), 4000);
}
