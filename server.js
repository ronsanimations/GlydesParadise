const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));

let players = {}; 

// Define the global boundaries of our large scrolling world
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

        // Listen for customizer login choices with painted texture data
        socket.on('joinGame', (customData) => {
        const spawnX = Math.floor(Math.random() * (1820 - 1380)) + 1380;
        const spawnY = Math.floor(Math.random() * (1420 - 980)) + 980;

        players[socket.id] = {
            id: socket.id,
            x: spawnX,
            y: spawnY,
            username: customData.username.substring(0, 32) || "Glyder",
            // Synchronize chosen base geometric styles
            styles: {
                body: customData.bodyStyle || 1,
                hair: customData.hairStyle || 1,
                shirt: customData.shirtStyle || 1
            },
            // Stores separate texture matrix color loops per asset element
            textures: {
                body: customData.bodyTexture,
                hair: customData.hairTexture,
                shirt: customData.shirtTexture
            }
        };

        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });




    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            // Server enforces boundaries to make sure client requests are legal
            players[socket.id].x = Math.max(0, Math.min(WORLD_WIDTH - 32, movementData.x));
            players[socket.id].y = Math.max(0, Math.min(WORLD_HEIGHT - 32, movementData.y));
            
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('sendMessage', (messageText) => {
        if (players[socket.id]) {
            const cleanMessage = messageText.trim().substring(0, 60);
            io.emit('incomingMessage', { 
                id: socket.id, 
                text: cleanMessage 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('disconnected', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Game engine actively running on http://localhost:${PORT}`));
