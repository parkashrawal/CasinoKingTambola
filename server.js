const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const HOST_PASSWORD = 'pgpk3535';

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

function checkWinners(room, code) {
  const calledSet = new Set(room.calledNumbers);

  if (!room.winners.full) {
    const fullWinners = [];
    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];
      const playerNums = player.ticket.flat().filter(n => n !== null);
      if (playerNums.every(n => calledSet.has(n))) {
        fullWinners.push({ name: player.name, ticketNo: i + 1 });
      }
    }

    if (fullWinners.length > 0) {
      const winner = fullWinners[0];
      room.winners.full = winner.name;
      room.winners.fullTicket = winner.ticketNo;
      room.winners.allFullWinners = fullWinners;

      if (
        room.winners.corner === winner.name &&
        room.winners.cornerTicket === winner.ticketNo
      ) {
        room.winners.corner = null;
        room.winners.cornerTicket = null;
        room.winners.allCornerWinners = null;
      }

      io.to(code).emit('winner', {
        type: 'फुल हाउस (विजेता)',
        name: winner.name,
        ticketNo: winner.ticketNo,
        allWinners: fullWinners
      });
      console.log(`✅ फुल हाउस: ${winner.name} (टिकट ${winner.ticketNo})`);
      checkGameOver(room, code);
      return;
    }
  }

  if (!room.winners.corner) {
    const cornerWinners = [];
    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];
      if (
        room.winners.full === player.name &&
        room.winners.fullTicket === (i + 1)
      ) continue;

      const corners = getCorners(player.ticket);
      if (corners.length === 0) continue;

      if (corners.every(n => calledSet.has(n))) {
        cornerWinners.push({ name: player.name, ticketNo: i + 1 });
      }
    }

    if (cornerWinners.length > 0) {
      const winner = cornerWinners[0];
      room.winners.corner = winner.name;
      room.winners.cornerTicket = winner.ticketNo;
      room.winners.allCornerWinners = cornerWinners;

      io.to(code).emit('winner', {
        type: 'कर्नर (दोस्रो)',
        name: winner.name,
        ticketNo: winner.ticketNo,
        allWinners: cornerWinners
      });
      console.log(`✅ कर्नर: ${winner.name} (टिकट ${winner.ticketNo})`);
      checkGameOver(room, code);
      return;
    }
  }
}

function checkGameOver(room, code) {
  if (
    room.winners.full &&
    room.winners.corner &&
    !(room.winners.full === room.winners.corner &&
      room.winners.fullTicket === room.winners.cornerTicket)
  ) {
    room.gameOver = true;
    const fullText = room.winners.allFullWinners
      ? room.winners.allFullWinners.map(w => `${w.name} (टिकट ${w.ticketNo})`).join(', ')
      : `${room.winners.full} (टिकट ${room.winners.fullTicket})`;
    const cornerText = room.winners.allCornerWinners
      ? room.winners.allCornerWinners.map(w => `${w.name} (टिकट ${w.ticketNo})`).join(', ')
      : `${room.winners.corner} (टिकट ${room.winners.cornerTicket})`;

    io.to(code).emit('gameOver', {
      message: `🏁 खेल समाप्त!\n\n🏆 विजेता (फुल हाउस): ${fullText}\n🥈 दोस्रो (कर्नर): ${cornerText}`
    });
  }
}

io.on('connection', (socket) => {
  console.log('जोडियो:', socket.id);

  socket.on('hostLogin', ({ password }, callback) => {
    if (password === HOST_PASSWORD) callback({ success: true });
    else callback({ success: false, message: '❌ गलत पासवर्ड!' });
  });

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
      customNumber: null,
      winners: {
        corner: null, full: null,
        cornerTicket: null, fullTicket: null,
        allFullWinners: null, allCornerWinners: null
      }
    };
    latestRoomCode = code;
    socket.join(code);
    callback({ success: true, code });
    io.to(code).emit('playerList', players.map(p => ({ name: p.name, ticket: p.ticket })));
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
    if (!room || room.hostId !== socket.id) return;
    if (room.gameOver) return;
    if (room.allNumbers.length === 0) {
      io.to(code).emit('gameOver', { message: 'सबै नम्बर निकालिए' });
      return;
    }

    let num;
    if (room.customNumber && !room.calledNumbers.includes(room.customNumber)) {
      num = room.customNumber;
      room.customNumber = null;
      const idx = room.allNumbers.indexOf(num);
      if (idx !== -1) room.allNumbers.splice(idx, 1);
    } else {
      const idx = Math.floor(Math.random() * room.allNumbers.length);
      num = room.allNumbers.splice(idx, 1)[0];
    }

    room.calledNumbers.push(num);
    io.to(code).emit('numberCalled', { number: num, allCalled: room.calledNumbers });
    checkWinners(room, code);
  });

  socket.on('autoCallNumber', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.gameOver) return;
    if (room.allNumbers.length === 0) {
      io.to(code).emit('gameOver', { message: 'सबै नम्बर निकालिए' });
      return;
    }

    let num;
    if (room.customNumber && !room.calledNumbers.includes(room.customNumber)) {
      num = room.customNumber;
      room.customNumber = null;
      const idx = room.allNumbers.indexOf(num);
      if (idx !== -1) room.allNumbers.splice(idx, 1);
    } else {
      const idx = Math.floor(Math.random() * room.allNumbers.length);
      num = room.allNumbers.splice(idx, 1)[0];
    }

    room.calledNumbers.push(num);
    io.to(code).emit('numberCalled', { number: num, allCalled: room.calledNumbers });
    checkWinners(room, code);
  });

  socket.on('setCustomNumber', ({ code, number }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    const num = parseInt(number);
    if (isNaN(num) || num < 1 || num > 99) {
      room.customNumber = null;
      return;
    }
    room.customNumber = num;
    console.log(`🏁 खेल रोक्नुहोस् — नम्बर सेभ: ${num}`);
  });

  socket.on('disconnect', () => {
    console.log('डिस्कनेक्ट:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`सर्भर चल्दैछ पोर्ट ${PORT} मा`);
});
