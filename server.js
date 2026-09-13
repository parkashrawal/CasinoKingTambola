const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateTicket() {
  const colRanges = [
    [1,9],[10,19],[20,29],[30,39],[40,49],
    [50,59],[60,69],[70,79],[80,99]
  ];
  const ticket = Array(3).fill().map(() => Array(9).fill(null));
  let colCounts = Array(9).fill(1);
  let extra = 6;
  while (extra > 0) {
    const i = Math.floor(Math.random() * 9);
    if (colCounts[i] < 3) { colCounts[i]++; extra--; }
  }
  for (let c = 0; c < 9; c++) {
    const [min, max] = colRanges[c];
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, colCounts[c]);
    const rows = [0,1,2].sort(() => Math.random() - 0.5).slice(0, colCounts[c]);
    rows.forEach((r, i) => { ticket[r][c] = chosen[i]; });
  }
  for (let r = 0; r < 3; r++) {
    let count = ticket[r].filter(x => x !== null).length;
    while (count > 5) {
      const cols = ticket[r].map((v,i) => v !== null ? i : -1).filter(i => i >= 0);
      const rc = cols[Math.floor(Math.random() * cols.length)];
      for (let rr = 0; rr < 3; rr++) {
        if (rr !== r && ticket[rr][rc] === null) {
          ticket[rr][rc] = ticket[r][rc];
          ticket[r][rc] = null;
          break;
        }
      }
      count = ticket[r].filter(x => x !== null).length;
    }
  }
  return ticket;
}

io.on('connection', (socket) => {
  console.log('जोडियो:', socket.id);

  socket.on('createRoom', ({ playerName }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, ticket: generateTicket(), isHost: true }],
      calledNumbers: [],
      allNumbers: Array.from({ length: 99 }, (_, i) => i + 1),
      started: false,
      winners: { top: null, middle: null, bottom: null, full: null }
    };
    socket.join(code);
    callback({ success: true, code, ticket: rooms[code].players[0].ticket });
    console.log('रुम बन्यो:', code);
  });

  socket.on('joinRoom', ({ code, playerName }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, message: 'रुम भेटिएन' });
    if (room.started) return callback({ success: false, message: 'गेम सुरु भइसक्यो' });
    if (room.players.length >= 15) return callback({ success: false, message: 'रुम भरियो' });
    const ticket = generateTicket();
    room.players.push({ id: socket.id, name: playerName, ticket, isHost: false });
    socket.join(code);
    callback({ success: true, code, ticket });
    io.to(code).emit('playerList', room.players.map(p => p.name));
  });

  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.started = true;
    io.to(code).emit('gameStarted', { totalPlayers: room.players.length });
  });

  socket.on('callNumber', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.allNumbers.length === 0) {
      io.to(code).emit('gameOver', { message: 'सबै नम्बर निकालिए' });
      return;
    }
    const idx = Math.floor(Math.random() * room.allNumbers.length);
    const num = room.allNumbers.splice(idx, 1)[0];
    room.calledNumbers.push(num);
    io.to(code).emit('numberCalled', { number: num, allCalled: room.calledNumbers });
  });

  socket.on('claimWin', ({ code, type, markedNumbers }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const playerNums = player.ticket.flat().filter(n => n !== null);
    const calledSet = new Set(room.calledNumbers);
    const valid = markedNumbers.every(n => calledSet.has(n) && playerNums.includes(n));
    if (!valid) return socket.emit('claimResult', { success: false, message: 'अवैध दाबी' });

    if (type === 'full') {
      if (room.winners.full) return socket.emit('claimResult', { success: false, message: 'फुल हाउस जितियो' });
      if (playerNums.every(n => markedNumbers.includes(n))) {
        room.winners.full = player.name;
        io.to(code).emit('winner', { type: 'फुल हाउस', name: player.name });
      } else socket.emit('claimResult', { success: false, message: 'सबै नम्बर मिलेनन्' });
    } else {
      const rowIndex = { top: 0, middle: 1, bottom: 2 }[type];
      const rowNums = player.ticket[rowIndex].filter(n => n !== null);
      if (rowNums.every(n => markedNumbers.includes(n))) {
        if (room.winners[type]) return socket.emit('claimResult', { success: false, message: 'यो लाइन जितियो' });
        room.winners[type] = player.name;
        const lineNames = { top: 'टप लाइन', middle: 'मिडल लाइन', bottom: 'बोटम लाइन' };
        io.to(code).emit('winner', { type: lineNames[type], name: player.name });
      } else socket.emit('claimResult', { success: false, message: 'लाइन मिलेन' });
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const name = room.players[idx].name;
        room.players.splice(idx, 1);
        if (room.players.length === 0) delete rooms[code];
        else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
          }
          io.to(code).emit('playerList', room.players.map(p => p.name));
          io.to(code).emit('playerLeft', { name });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`सर्भर चल्दैछ पोर्ट ${PORT} मा`);
});
