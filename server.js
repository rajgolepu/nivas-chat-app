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

// Store messages in memory (last 100)
const messages = [];
const MAX_MESSAGES = 100;

// Track connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send existing messages to new user
  socket.emit('load_messages', messages);

  // Handle new message
  socket.on('send_message', (data) => {
    const message = {
      id: Date.now(),
      username: data.username || 'Anonymous',
      text: data.text,
      timestamp: new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
    
    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.shift();
    
    // Broadcast to all users
    io.emit('receive_message', message);
  });

  // Track user join
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

  // Typing indicator
  socket.on('typing', (username) => {
    socket.broadcast.emit('user_typing', username);
  });

  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stop_typing');
  });

  // ===== VIDEO CALL SIGNALING =====
  
  // When a user wants to start a call
  socket.on('call_initiate', (data) => {
    // Broadcast to all other users that a call is starting
    socket.broadcast.emit('call_incoming', {
      from: socket.id,
      username: data.username
    });
  });

  // When a user joins an existing call
  socket.on('call_join', (data) => {
    socket.broadcast.emit('call_user_joined', {
      from: socket.id,
      username: data.username
    });
  });

  // WebRTC signaling: offer
  socket.on('call_offer', (data) => {
    io.to(data.to).emit('call_offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // WebRTC signaling: answer
  socket.on('call_answer', (data) => {
    io.to(data.to).emit('call_answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // WebRTC signaling: ICE candidate
  socket.on('call_ice_candidate', (data) => {
    io.to(data.to).emit('call_ice_candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  // End call
  socket.on('call_end', () => {
    socket.broadcast.emit('call_ended', { from: socket.id });
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    users.delete(socket.id);
    io.emit('users_update', Array.from(users.values()));
    if (username) {
      io.emit('receive_message', {
        id: Date.now(),
        username: 'System',
        text: username + ' left the chat 👋',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      });
    }
    io.emit('call_ended', { from: socket.id });
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
