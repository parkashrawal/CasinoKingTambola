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

// ===== टिकट जेनेरेटर (३×९, प्रत्येक लाइनमा ५ नम्बर) =====
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

// ===== कर्नर नम्बरहरू (टिकटको ४ कुना) =====
function getCorners(ticket) {
  const corners = [];
  for (let c = 0; c < 9; c++) if (ticket[0][c] !== null) { corners.push(ticket[0][c]); break; }
  for (let c = 8; c >= 0; c--) if (ticket[0][c] !== null) { corners.push(ticket[0][c]); break; }
  for (let c = 0; c < 9; c++) if (ticket[2][c] !== null) { corners.push(ticket[2][c]); break; }
  for (let c = 8; c >= 0; c--) if (ticket[2][c] !== null) { corners.push(ticket[2][c]); break; }
  return corners;
}

// ===== खेल समाप्त जाँच =====
function checkGameOver(room, code) {
  if (
    room.winners.full &&
    room.winners.corner &&
    room.winners.full !== room.winners.corner
  ) {
    room.gameOver = true;
    io.to(code).emit('gameOver', {
      message: `🏁 खेल समाप्त!\n\n🏆 विजेता (फुल हाउस): ${room.winners.full}\n🥈 दोस्रो (कर्नर): ${room.winners.corner}`
    });
  }
}

io.on('connection', (socket) => {
  console.log('जोडियो:', socket.id);

  // ===== रुम बनाउने =====
  socket.on('createRoom', ({ playerName }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, ticket: generateTicket(), isHost: true }],
      calledNumbers: [],
      allNumbers: Array.from({ length: 99 }, (_, i) => i + 1),
      started: false,
      gameOver: false,
      winners: { corner: null, full: null }
    };
    socket.join(code);
    callback({ success: true, code, ticket: rooms[code].players[0].ticket });
    console.log('रुम बन्यो:', code);
  });

  // ===== रुम जोडिने =====
  socket.on('joinRoom', ({ code, playerName }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, message: 'रुम भेटिएन' });
    if (room.started) return callback({ success: false, message: 'गेम सुरु भइसक्यो' });
    if (room.players.length >= 15) return callback({ success: false, message: 'रुम भरियो (१५ जना)' });

    const ticket = generateTicket();
    room.players.push({ id: socket.id, name: playerName, ticket, isHost: false });
    socket.join(code);
    callback({ success: true, code, ticket });

    io.to(code).emit('playerList', room.players.map(p => ({ name: p.name, ticket: p.ticket })));
    io.to(code).emit('newPlayerJoined', { name: playerName, total: room.players.length });
    console.log(`${playerName} जोडियो रुम ${code} मा`);
  });

  // ===== गेम सुरु =====
  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.started = true;
    io.to(code).emit('gameStarted', {
      players: room.players.map(p => ({ name: p.name, ticket: p.ticket }))
    });
    console.log('गेम सुरु:', code);
  });

  // ===== नम्बर कल (होस्टले) =====
  socket.on('callNumber', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.gameOver) return;
    if (room.allNumbers.length === 0) {
      io.to(code).emit('gameOver', { message: 'सबै नम्बर निकालिए' });
      return;
    }
    const idx = Math.floor(Math.random() * room.allNumbers.length);
    const num = room.allNumbers.splice(idx, 1)[0];
    room.calledNumbers.push(num);
    io.to(code).emit('numberCalled', { number: num, allCalled: room.calledNumbers });
  });

  // ===== जित दाबी =====
  socket.on('claimWin', ({ code, type, markedNumbers }) => {
    const room = rooms[code];
    if (!room || room.gameOver) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const playerNums = player.ticket.flat().filter(n => n !== null);
    const calledSet = new Set(room.calledNumbers);
    const valid = markedNumbers.every(n => calledSet.has(n) && playerNums.includes(n));
    if (!valid) return socket.emit('claimResult', { success: false, message: 'अवैध दाबी' });

    // ===== फुल हाउस =====
    if (type === 'full') {
      if (room.winners.full) {
        return socket.emit('claimResult', { success: false, message: 'फुल हाउस पहिले नै जितियो' });
      }
      if (playerNums.every(n => markedNumbers.includes(n))) {
        room.winners.full = player.name;
        io.to(code).emit('winner', { type: 'फुल हाउस (विजेता)', name: player.name });
        console.log(`फुल हाउस विजेता: ${player.name} (रुम ${code})`);
        checkGameOver(room, code);
      } else {
        socket.emit('claimResult', { success: false, message: 'सबै नम्बर मिलेनन्' });
      }
    }

    // ===== कर्नर =====
    else if (type === 'corner') {
      if (room.winners.corner) {
        return socket.emit('claimResult', { success: false, message: 'कर्नर पहिले नै जितियो' });
      }
      if (room.winners.full === player.name) {
        return socket.emit('claimResult', {
          success: false,
          message: 'तपाईं विजेता भइसक्नुभयो — अर्को व्यक्तिले कर्नर जित्नुपर्छ'
        });
      }
      const corners = getCorners(player.ticket);
      if (corners.every(n => markedNumbers.includes(n))) {
        room.winners.corner = player.name;
        io.to(code).emit('winner', { type: 'कर्नर (दोस्रो)', name: player.name });
        console.log(`कर्नर विजेता: ${player.name} (रुम ${code})`);
        checkGameOver(room, code);
      } else {
        socket.emit('claimResult', { success: false, message: 'कर्नरका ४ नम्बर मिलेनन्' });
      }
    }
  });

  // ===== डिस्कनेक्ट =====
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const name = room.players[idx].name;
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
          }
          io.to(code).emit('playerList', room.players.map(p => ({ name: p.name, ticket: p.ticket })));
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
