const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const messages = [];
const MAX_MESSAGES = 100;
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.emit('load_messages', messages);

  socket.on('send_message', (data) => {
    const message = {
      id: Date.now(),
      username: data.username || 'Anonymous',
      text: data.text,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.shift();
    io.emit('receive_message', message);
  });

  socket.on('user_join', (username) => {
    users.set(socket.id, username);
    io.emit('users_update', Array.from(users.values()));
    io.emit('receive_message', {
      id: Date.now(),
      username: 'System',
      text: username + ' joined the chat! 👋',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('typing', (username) => {
    socket.broadcast.emit('user_typing', username);
  });

  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stop_typing');
  });

  // ===== VIDEO CALL SIGNALING =====
  
  // Join a call room
  socket.on('join_call', (data) => {
    const rooms = io.sockets.adapter.rooms;
    const callRoom = rooms.get('video_call');
    const othersInCall = callRoom ? [...callRoom] : [];
    
    socket.join('video_call');
    users.set(socket.id, data.username);
    
    // Tell the new user about existing participants
    socket.emit('call_participants', othersInCall);
    
    // Tell others someone joined
    socket.to('video_call').emit('call_peer_joined', {
      peerId: socket.id,
      username: data.username
    });
    
    io.emit('receive_message', {
      id: Date.now(),
      username: 'System',
      text: '📞 ' + data.username + ' joined the video call!',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // WebRTC: Send offer to specific peer
  socket.on('offer', (data) => {
    io.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // WebRTC: Send answer to specific peer
  socket.on('answer', (data) => {
    io.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // WebRTC: Send ICE candidate to specific peer
  socket.on('ice_candidate', (data) => {
    io.to(data.to).emit('ice_candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  // Leave call
  socket.on('leave_call', () => {
    socket.leave('video_call');
    socket.to('video_call').emit('call_peer_left', {
      peerId: socket.id,
      username: users.get(socket.id) || 'Unknown'
    });
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    users.delete(socket.id);
    io.emit('users_update', Array.from(users.values()));
    
    // Notify call participants
    socket.to('video_call').emit('call_peer_left', {
      peerId: socket.id,
      username: username || 'Unknown'
    });
    
    if (username) {
      io.emit('receive_message', {
        id: Date.now(),
        username: 'System',
        text: username + ' left the chat 👋',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      });
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
