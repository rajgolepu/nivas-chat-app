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

  // Handle typing indicator
  socket.on('typing', (username) => {
    socket.broadcast.emit('user_typing', username);
  });

  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stop_typing');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
