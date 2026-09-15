const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
let latestRoomCode = null;

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

function getCorners(ticket) {
  const corners = [];
  for (let c = 0; c < 9; c++) if (ticket[0][c] !== null) { corners.push(ticket[0][c]); break; }
  for (let c = 8; c >= 0; c--) if (ticket[0][c] !== null) { corners.push(ticket[0][c]); break; }
  for (let c = 0; c < 9; c++) if (ticket[2][c] !== null) { corners.push(ticket[2][c]); break; }
  for (let c = 8; c >= 0; c--) if (ticket[2][c] !== null) { corners.push(ticket[2][c]); break; }
  return corners;
}

// ===== विजेता जाँच =====
function checkWinners(room, code) {
  const calledSet = new Set(room.calledNumbers);

  // ===== १. फुल हाउस जाँच =====
  if (!room.winners.full) {
    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];
      const playerNums = player.ticket.flat().filter(n => n !== null);

      if (playerNums.every(n => calledSet.has(n))) {
        // यदि यही व्यक्तिले कर्नर पनि जितेको छ भने, कर्नर खाली गर्ने
        if (room.winners.corner === player.name) {
          room.winners.corner = null;
          console.log(`🔄 कर्नर खाली (${player.name} विजेता भए)`);
        }

        room.winners.full = player.name;
        io.to(code).emit('winner', { type: 'फुल हाउस (विजेता)', name: player.name });
        console.log(`✅ फुल हाउस विजेता: ${player.name}`);

        // खेल समाप्त भयो कि जाँच
        checkGameOver(room, code);
        return;
      }
    }
  }

  // ===== २. कर्नर जाँच =====
  if (!room.winners.corner) {
    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];

      // फुल हाउस जितेको व्यक्तिलाई छोड्ने
      if (room.winners.full === player.name) continue;

      const corners = getCorners(player.ticket);
      if (corners.length === 0) continue;

      if (corners.every(n => calledSet.has(n))) {
        room.winners.corner = player.name;
        io.to(code).emit('winner', { type: 'कर्नर (दोस्रो)', name: player.name });
        console.log(`✅ कर्नर विजेता: ${player.name}`);

        checkGameOver(room, code);
        return;
      }
    }
  }
}

// ===== खेल समाप्त जाँच =====
function checkGameOver(room, code) {
  // खेल समाप्त हुन्छ जब:
  // १. फुल हाउस विजेता छ, र
  // २. कर्नर विजेता छ, र
  // ३. ती दुई फरक व्यक्ति हुन्
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

  socket.on('createRoomWithNames', ({ names }, callback) => {
    const code = generateRoomCode();
    const players = names.map((name, i) => ({
      id: 'player-' + i,
      name: name,
      ticket: generateTicket(),
      isHost: false
    }));
    rooms[code] = {
      hostId: socket.id,
      players: players,
      calledNumbers: [],
      allNumbers: Array.from({ length: 99 }, (_, i) => i + 1),
      started: true,
      gameOver: false,
      winners: { corner: null, full: null }
    };
    latestRoomCode = code;
    socket.join(code);
    callback({ success: true, code });
    io.to(code).emit('playerList', players.map(p => ({ name: p.name, ticket: p.ticket })));
    console.log('रुम बन्यो:', code);
  });

  socket.on('viewLatestRoom', ({}, callback) => {
    if (!latestRoomCode || !rooms[latestRoomCode]) {
      return callback({ success: false, message: 'कुनै खेल भेटिएन' });
    }
    const code = latestRoomCode;
    const room = rooms[code];
    socket.join(code);
    callback({
      success: true,
      code: code,
      players: room.players.map(p => ({ name: p.name, ticket: p.ticket })),
      calledNumbers: room.calledNumbers,
      winners: room.winners
    });
  });

  socket.on('callNumber', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.gameOver) return;
    if (room.allNumbers.length === 0) {
      io.to(code).emit('gameOver', { message: 'सबै नम्बर निकालिए' });
      return;
    }
    const idx = Math.floor(Math.random() * room.allNumbers.length);
    const num = room.allNumbers.splice(idx, 1)[0];
    room.calledNumbers.push(num);
    io.to(code).emit('numberCalled', { number: num, allCalled: room.calledNumbers });
    console.log(`🎲 नम्बर कल: ${num} (रुम ${code})`);

    checkWinners(room, code);
  });

  socket.on('disconnect', () => {
    console.log('डिस्कनेक्ट:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`सर्भर चल्दैछ पोर्ट ${PORT} मा`);
});
