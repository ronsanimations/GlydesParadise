const socket = io({
    transports: ['websocket', 'polling']
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const customizerScreen = document.getElementById('customizer-screen');
const uiWrapper = document.getElementById('ui-wrapper');
const joinGameBtn = document.getElementById('joinGameBtn');
const chatInput = document.getElementById('chatInput');
const chatLog = document.getElementById('chatLog');

let localPlayer = null;
let otherPlayers = {};

// Unified control layout trackers supporting Arrow keys and WASD
const keys = { 
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    w: false, s: false, a: false, d: false,
    W: false, S: false, A: false, D: false
};

// Core synchronization status variables
let isTyping = false;
let gameActive = false;

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
const camera = { x: 0, y: 0 };
const TILE_SIZE = 64;

// Mobile responsive UI sidebar drawer toggle helper
window.toggleMobileChat = function() {
    const box = document.getElementById('chat-log-box');
    if (!box) return;
    box.style.display = (box.style.display === 'block') ? 'none' : 'block';
};

// Properties managing geometric selection slider limits
let currentCustomStyles = { bodyStyle: 1, hairStyle: 1, shirtStyle: 1 };
const MAX_STYLES = { bodyStyle: 3, hairStyle: 4, shirtStyle: 3 };

window.changeStyle = function(category, direction) {
    let nextVal = currentCustomStyles[category] + direction;
    if (nextVal < 1) nextVal = MAX_STYLES[category];
    if (nextVal > MAX_STYLES[category]) nextVal = 1;
    currentCustomStyles[category] = nextVal;
    
    const displayEl = document.getElementById(`${category}Display`);
    if (displayEl) displayEl.innerText = nextVal;
    if (typeof redrawPaintCanvasPreview === 'function') {
        redrawPaintCanvasPreview();
    }
};

// Form submission to start game and cache character locally
joinGameBtn.addEventListener('click', () => {
    const usernameField = document.getElementById('usernameInput').value.trim() || "Glyder";

    const customData = {
        username: usernameField,
        bodyStyle: currentCustomStyles.bodyStyle,
        hairStyle: currentCustomStyles.hairStyle,
        shirtStyle: currentCustomStyles.shirtStyle,
        bodyTexture: multiLayerTextures.body,
        hairTexture: multiLayerTextures.hair,
        shirtTexture: multiLayerTextures.shirt
    };

    const savePackage = {
        username: usernameField,
        styles: currentCustomStyles,
        textures: multiLayerTextures
    };
    localStorage.setItem('glydesParadiseCharacter', JSON.stringify(savePackage));

    customizerScreen.style.display = 'none';
    uiWrapper.style.display = 'flex';
    gameActive = true;
    socket.emit('joinGame', customData);
});

// Fixed Chat Message Dispatcher for both Desktop and Mobile
function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (msg.length > 0) {
        socket.emit('sendMessage', msg);
    }
    chatInput.value = '';
    chatInput.blur();
    isTyping = false;
}

// Keyboard input listeners
window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    
    if (e.key === 'Enter') {
        // STOP THE BROWSER FROM REFRESHING THE PAGE!
        e.preventDefault(); 
        
        if (isTyping) {
            sendChatMessage();
        } else {
            chatInput.focus();
            isTyping = true;
            Object.keys(keys).forEach(k => keys[k] = false);
        }
        return;
    }
    
    if (!isTyping && e.key in keys) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key in keys) keys[e.key] = false;
});

// Chat input focus tracking to prevent movement interference
chatInput.addEventListener('focus', () => { isTyping = true; });
chatInput.addEventListener('blur', () => { isTyping = false; });

// Multiplayer socket event syncing
socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id === socket.id) {
            localPlayer = players[id];
        } else {
            otherPlayers[id] = players[id];
        }
    });
    requestAnimationFrame(gameLoop);
});

socket.on('newPlayer', (playerInfo) => {
    otherPlayers[playerInfo.id] = playerInfo;
});

socket.on('playerMoved', (playerInfo) => {
    if (otherPlayers[playerInfo.id]) {
        otherPlayers[playerInfo.id].x = playerInfo.x;
        otherPlayers[playerInfo.id].y = playerInfo.y;
    }
});

socket.on('disconnected', (id) => {
    delete otherPlayers[id];
});

socket.on('incomingMessage', (data) => {
    const targetPlayer = (data.id === socket.id) ? localPlayer : otherPlayers[data.id];
    if (targetPlayer) {
        const msgElement = document.createElement('div');
        msgElement.className = 'chat-msg';
        msgElement.innerHTML = `<span style="color:#55ff55; font-weight:bold;">${targetPlayer.username}:</span> ${data.text}`;
        chatLog.appendChild(msgElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        
        targetPlayer.activeChat = { 
            text: data.text, 
            expiresAt: Date.now() + 5000 
        };
    }
});

function gameLoop() {
    updateMovement();
    updateCamera();
    renderGame();
    
    if (localPlayer) {
        const debugEl = document.getElementById('debug-coords');
        if (debugEl) {
            debugEl.innerText = `Position - X: ${Math.floor(localPlayer.x)}, Y: ${Math.floor(localPlayer.y)}`;
        }
    }
    
    requestAnimationFrame(gameLoop);
}

function updateMovement() {
    if (!localPlayer || isTyping) return;
    let moved = false;
    const speed = 5;

    if ((keys.ArrowLeft || keys.a || keys.A) && localPlayer.x > 0) { localPlayer.x -= speed; moved = true; }
    if ((keys.ArrowRight || keys.d || keys.D) && localPlayer.x < WORLD_WIDTH - 32) { localPlayer.x += speed; moved = true; }
    if ((keys.ArrowUp || keys.w || keys.W) && localPlayer.y > 0) { localPlayer.y -= speed; moved = true; }
    if ((keys.ArrowDown || keys.s || keys.S) && localPlayer.y < WORLD_HEIGHT - 32) { localPlayer.y += speed; moved = true; }

    if (moved) {
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y });
    }
}

function updateCamera() {
    if (!localPlayer) return;
    camera.x = localPlayer.x + 16 - canvas.width / 2;
    camera.y = localPlayer.y + 16 - canvas.height / 2;
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));
}

function renderGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawLargeGrid();

    Object.keys(otherPlayers).forEach((id) => {
        drawCustomCharacter(otherPlayers[id]);
    });

    if (localPlayer) {
        drawCustomCharacter(localPlayer);
    }

    ctx.restore();
    drawRadarMinimap();
}

function drawLargeGrid() {
    const gridSize = 64;
    ctx.fillStyle = '#55aa55';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.strokeStyle = '#4ea44e';
    ctx.lineWidth = 1;

    for (let x = 0; x < WORLD_WIDTH; x += gridSize) {
        for (let y = 0; y < WORLD_HEIGHT; y += gridSize) {
            if (x + gridSize >= camera.x && x <= camera.x + canvas.width &&
                y + gridSize >= camera.y && y <= camera.y + canvas.height) {

                if (y >= WORLD_HEIGHT - 400) {
                    ctx.fillStyle = '#4444ff'; 
                    ctx.fillRect(x, y, gridSize, gridSize);

                    if (x >= 1800 && x <= 2400) {
                        ctx.fillStyle = '#cdaa7d'; 
                        ctx.fillRect(x, y, gridSize, gridSize);
                        ctx.strokeStyle = '#8b7355';
                        ctx.strokeRect(x, y, gridSize, gridSize);
                    }
                }
                else if (x >= 1312 && x < 1888 && y >= 912 && y < 1488) {
                    ctx.fillStyle = '#8b5a2b';
                    ctx.fillRect(x, y, gridSize, gridSize);
                    ctx.strokeStyle = '#5c3a1a';
                    ctx.strokeRect(x, y, gridSize, gridSize);
                }
                else {
                    if ((x * 3 + y * 7) % 13 === 0) {
                        ctx.fillStyle = '#888888'; ctx.fillRect(x + 16, y + 24, 6, 4);
                    }
                    if ((x * 5 + y * 2) % 17 === 0) {
                        ctx.fillStyle = '#aaaaaa'; ctx.fillRect(x + 40, y + 12, 8, 5);
                    }
                }
            }
        }
    }
}

function drawCustomCharacter(playerObj) {
    const { x, y, username, styles, textures } = playerObj;
    const bStyle = styles ? styles.body : 1;
    const hStyle = styles ? styles.hair : 1;
    const sStyle = styles ? styles.shirt : 1;
    const renderPixelSize = 32 / 8;

    function drawTextureLayer(grid, clipCondition) {
        if (!grid) return;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (clipCondition && !clipCondition(r, c)) continue;
                ctx.fillStyle = grid[r][c];
                ctx.fillRect(x + (c * renderPixelSize), y + (r * renderPixelSize), renderPixelSize, renderPixelSize);
            }
        }
    }

    if (textures && textures.body) {
        drawTextureLayer(textures.body, (r, c) => bStyle === 2 ? (c >= 1 && c <= 6) : true);
    }
    if (textures && textures.shirt) {
        drawTextureLayer(textures.shirt, (r, c) => {
            const isSlimX = bStyle === 2 ? (c >= 1 && c <= 6) : true;
            if (sStyle === 2) return isSlimX && (r >= 3);
            if (sStyle === 3) return isSlimX && (r >= 5 || (r === 4 && (c === 1 || c === 2 || c === 5 || c === 6)));
            return isSlimX && (r >= 4);
        });
    }
    if (textures && textures.hair) {
        drawTextureLayer(textures.hair, (r, c) => {
            if (hStyle === 2) return (r < 2 || c === 0 || c === 7);
            if (hStyle === 3) return (r < 1 || (r === 1 && (c === 1 || c === 3 || c === 5 || c === 6)));
            return (r < 2);
        });
        if (hStyle === 4) { ctx.fillStyle = '#ffdf00'; ctx.fillRect(x, y + 4, 32, 2); }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(username, x + 16, y - 8);

    if (playerObj.activeChat && Date.now() < playerObj.activeChat.expiresAt) {
        drawBubble(playerObj);
    }
}

function drawBubble(playerObj) {
    ctx.font = '14px sans-serif';
    const textWidth = ctx.measureText(playerObj.activeChat.text).width;
    const bubbleWidth = textWidth + 16;
    const bubbleHeight = 26;
    const bubbleX = playerObj.x + 16 - (bubbleWidth / 2);
    const bubbleY = playerObj.y - 45;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(playerObj.activeChat.text, bubbleX + 8, bubbleY + 18);
}

const MINI_WIDTH = 120;
const MINI_HEIGHT = 90;
const MINI_PADDING = 15;

function drawRadarMinimap() {
    if (!localPlayer) return;
    const miniX = canvas.width - MINI_WIDTH - MINI_PADDING;
    const miniY = MINI_PADDING;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath(); ctx.roundRect(miniX, miniY, MINI_WIDTH, MINI_HEIGHT, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1; ctx.strokeRect(miniX, miniY, MINI_WIDTH, MINI_HEIGHT);

    function getRadarCoords(worldX, worldY) {
        return { x: miniX + (worldX / WORLD_WIDTH) * MINI_WIDTH, y: miniY + (worldY / WORLD_HEIGHT) * MINI_HEIGHT };
    }

    Object.keys(otherPlayers).forEach((id) => {
        const dotPos = getRadarCoords(otherPlayers[id].x, otherPlayers[id].y);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(dotPos.x, dotPos.y, 2, 0, Math.PI * 2); ctx.fill();
    });

    const localDotPos = getRadarCoords(localPlayer.x, localPlayer.y);
    ctx.fillStyle = '#55ff55'; ctx.beginPath(); ctx.arc(localDotPos.x, localDotPos.y, 3, 0, Math.PI * 2); ctx.fill();
}

// Multi-layer Texture Painting Studio Setup
const PAINT_GRID_SIZE = 8;
let multiLayerTextures = { body: [], hair: [], shirt: [] };
let isDrawingOnCanvas = false;

function setupDefaultPaintGrids() {
    const savedData = localStorage.getItem('glydesParadiseCharacter');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            currentCustomStyles = parsed.styles || { bodyStyle: 1, hairStyle: 1, shirtStyle: 1 };
            
            const bD = document.getElementById('bodyStyleDisplay');
            const hD = document.getElementById('hairStyleDisplay');
            const sD = document.getElementById('shirtStyleDisplay');
            if (bD) bD.innerText = currentCustomStyles.bodyStyle;
            if (hD) hD.innerText = currentCustomStyles.hairStyle;
            if (sD) sD.innerText = currentCustomStyles.shirtStyle;
            
            multiLayerTextures = parsed.textures;
            const uInput = document.getElementById('usernameInput');
            if (uInput) uInput.value = parsed.username || "New Glyder";
            return;
        } catch (e) { console.error(e); }
    }
    for (let r = 0; r < PAINT_GRID_SIZE; r++) {
        let bRow = [], hRow = [], sRow = [];
        for (let c = 0; c < PAINT_GRID_SIZE; c++) { 
            bRow.push('#ff5555'); hRow.push('#4a2c00'); sRow.push('#5555ff'); 
        }
        multiLayerTextures.body.push(bRow);
        multiLayerTextures.hair.push(hRow);
        multiLayerTextures.shirt.push(sRow);
    }
}
setupDefaultPaintGrids();

const paintCanvas = document.getElementById('paintCanvas');
const pCtx = paintCanvas.getContext('2d');
const paintLayerSelect = document.getElementById('paintLayerSelect');
const brushColorPicker = document.getElementById('brushColorPicker');
const clearPaintBtn = document.getElementById('clearPaintBtn');

function redrawPaintCanvasPreview() {
    if (!paintCanvas) return;
    const pWidth = paintCanvas.width;
    const pHeight = paintCanvas.height;
    const pixelScale = pWidth / PAINT_GRID_SIZE;
    
    pCtx.clearRect(0, 0, pWidth, pHeight);
    const bStyle = currentCustomStyles.bodyStyle;
    const hStyle = currentCustomStyles.hairStyle;
    const sStyle = currentCustomStyles.shirtStyle;

    function drawPreviewLayer(grid, clipCondition) {
        if (!grid) return;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (clipCondition && !clipCondition(r, c)) continue;
                pCtx.fillStyle = grid[r][c];
                pCtx.fillRect(c * pixelScale, r * pixelScale, pixelScale, pixelScale);
            }
        }
    }
    
    drawPreviewLayer(multiLayerTextures.body, (r, c) => bStyle === 2 ? (c >= 1 && c <= 6) : true);
    drawPreviewLayer(multiLayerTextures.shirt, (r, c) => {
        const isSlimX = bStyle === 2 ? (c >= 1 && c <= 6) : true;
        if (sStyle === 2) return isSlimX && (r >= 3);
        if (sStyle === 3) return isSlimX && (r >= 5 || (r === 4 && (c === 1 || c === 2 || c === 5 || c === 6)));
        return isSlimX && (r >= 4);
    });
    drawPreviewLayer(multiLayerTextures.hair, (r, c) => {
        if (hStyle === 2) return (r < 2 || c === 0 || c === 7);
        if (hStyle === 3) return (r < 1 || (r === 1 && (c === 1 || c === 3 || c === 5 || c === 6)));
        return (r < 2);
    });
    if (hStyle === 4) { 
        pCtx.fillStyle = '#ffdf00'; 
        pCtx.fillRect(0, 4 * pixelScale, pWidth, 2 * (pixelScale / 4)); 
    }
}
redrawPaintCanvasPreview();

function handlePaintMove(e) {
    const rect = paintCanvas.getBoundingClientRect();
    const pixelScale = paintCanvas.width / PAINT_GRID_SIZE;
    const colIdx = Math.floor((e.clientX - rect.left) / pixelScale);
    const rowIdx = Math.floor((e.clientY - rect.top) / pixelScale);
    
    if (colIdx >= 0 && colIdx < PAINT_GRID_SIZE && rowIdx >= 0 && rowIdx < PAINT_GRID_SIZE) {
        multiLayerTextures[paintLayerSelect.value][rowIdx][colIdx] = brushColorPicker.value;
        redrawPaintCanvasPreview();
    }
}

if (paintCanvas) {
    paintCanvas.addEventListener('mousedown', (e) => { isDrawingOnCanvas = true; handlePaintMove(e); });
    window.addEventListener('mouseup', () => { isDrawingOnCanvas = false; });
    paintCanvas.addEventListener('mousemove', (e) => { if (isDrawingOnCanvas) handlePaintMove(e); });
}
if (paintLayerSelect) paintLayerSelect.addEventListener('change', redrawPaintCanvasPreview);
if (clearPaintBtn) clearPaintBtn.addEventListener('click', () => { setupDefaultPaintGrids(); redrawPaintCanvasPreview(); });

// Positioned Virtual Touch Joystick Engine (Below Game Screen layout)
let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
let mobileVector = { x: 0, y: 0 };

const joyZone = document.getElementById('joystick-zone');
const joyBase = document.getElementById('joystick-base');
const joyStick = document.getElementById('joystick-stick');

if (joyBase) {
    joyBase.addEventListener('touchstart', (e) => {
        joystickActive = true;
        const rect = joyBase.getBoundingClientRect();
        joystickStartPos = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    });

    window.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        const touch = e.touches[0];
        let deltaX = touch.clientX - joystickStartPos.x;
        let deltaY = touch.clientY - joystickStartPos.y;
        let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        const maxRadius = 40;
        if (distance > maxRadius) {
            deltaX = (deltaX / distance) * maxRadius;
            deltaY = (deltaY / distance) * maxRadius;
        }
        
        if (joyStick) joyStick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        mobileVector.x = deltaX / maxRadius;
        mobileVector.y = deltaY / maxRadius;
    });

    window.addEventListener('touchend', () => {
        if (!joystickActive) return;
        joystickActive = false;
        if (joyStick) joyStick.style.transform = 'translate(0px, 0px)';
        mobileVector = { x: 0, y: 0 };
    });
}

function applyMobileVectorMovement() {
    if (!localPlayer || isTyping || (mobileVector.x === 0 && mobileVector.y === 0)) return;
    
    const baseSpeed = 5;
    localPlayer.x += mobileVector.x * baseSpeed;
    localPlayer.y += mobileVector.y * baseSpeed;
    
    localPlayer.x = Math.max(0, Math.min(WORLD_WIDTH - 32, localPlayer.x));
    localPlayer.y = Math.max(0, Math.min(WORLD_HEIGHT - 32, localPlayer.y));
    
    socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y });
}

// Intercept original movement thread loop to run our touch physics equations
const baseMovementLoop = updateMovement;
updateMovement = function() {
    baseMovementLoop();
    applyMobileVectorMovement();
};
