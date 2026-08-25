const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const customizerScreen = document.getElementById('customizer-screen');
const uiWrapper = document.getElementById('ui-wrapper');
const joinGameBtn = document.getElementById('joinGameBtn');
const chatInput = document.getElementById('chatInput');
const chatLog = document.getElementById('chatLog');

let localPlayer = null;
let otherPlayers = {};
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let isTyping = false;
let gameActive = false;

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
const camera = { x: 0, y: 0 };

// Handle character customizer click and submission
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

    // PERSISTENCE ENGINE: Automatically save their full design file to browser memory
    const savePackage = {
        username: usernameField,
        styles: currentCustomStyles,
        textures: multiLayerTextures
    };
    localStorage.setItem('glydesParadiseCharacter', JSON.stringify(savePackage));

    // Hide selection screens and transmit player package data to the single-server instance
    customizerScreen.style.display = 'none';
    uiWrapper.style.display = 'flex';
    gameActive = true;
    socket.emit('joinGame', customData);
});


// Manage client keyboard tracking states
window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    if (e.key === 'Enter') {
        if (isTyping) {
            const msg = chatInput.value.trim();
            if (msg.length > 0) socket.emit('sendMessage', msg);
            chatInput.value = '';
            chatInput.blur();
            isTyping = false;
        } else {
            chatInput.focus();
            isTyping = true;
            Object.keys(keys).forEach(k => keys[k] = false);
        }
        return;
    }
    if (!isTyping && e.key in keys) keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key in keys) keys[e.key] = false;
});

// Network socket connection synchronization
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
        msgElement.innerHTML = `<span style="color:${targetPlayer.colors.body}; font-weight:bold;">${targetPlayer.username}:</span> ${data.text}`;
        chatLog.appendChild(msgElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        targetPlayer.activeChat = { text: data.text, expiresAt: Date.now() + 5000 };
    }
});

// Central Engine Runtime Update Loops
function gameLoop() {
    updateMovement();
    updateCamera();
    renderGame();
    
    // Feed local pixel values into your debug UI locator element
    if (localPlayer) {
        document.getElementById('debug-coords').innerText = `Position - X: ${Math.floor(localPlayer.x)}, Y: ${Math.floor(localPlayer.y)}`;
    }
    
    requestAnimationFrame(gameLoop);
}


function updateMovement() {
    if (!localPlayer || isTyping) return;
    let moved = false;
    const speed = 5;

    if (keys.ArrowLeft && localPlayer.x > 0) { localPlayer.x -= speed; moved = true; }
    if (keys.ArrowRight && localPlayer.x < WORLD_WIDTH - 32) { localPlayer.x += speed; moved = true; }
    if (keys.ArrowUp && localPlayer.y > 0) { localPlayer.y -= speed; moved = true; }
    if (keys.ArrowDown && localPlayer.y < WORLD_HEIGHT - 32) { localPlayer.y += speed; moved = true; }

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
}

// Simple, solid procedural grid lines that can never break or crash loops
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

                // 1. Docks & Waterfront Ocean Layer (Bottom 400 pixels)
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
                // 2. Fixed 9x9 Wooden Login Spawn Area centered around (1600, 1200)
                else if (x >= 1312 && x < 1888 && y >= 912 && y < 1488) {
                    ctx.fillStyle = '#8b5a2b'; // Dark wood tile look
                    ctx.fillRect(x, y, gridSize, gridSize);
                    ctx.strokeStyle = '#5c3a1a';
                    ctx.strokeRect(x, y, gridSize, gridSize);
                }
                // 3. Grass fields with scattered stones
                else {
                    if ((x * 3 + y * 7) % 13 === 0) {
                        ctx.fillStyle = '#888888'; 
                        ctx.fillRect(x + 16, y + 24, 6, 4);
                    }
                    if ((x * 5 + y * 2) % 17 === 0) {
                        ctx.fillStyle = '#aaaaaa'; 
                        ctx.fillRect(x + 40, y + 12, 8, 5);
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
    const renderPixelSize = 32 / 8; // Scales 8x8 textures into our 32x32 player box bounds

    // Helper helper function that draws an 8x8 matrix pixel block layer safely
    function drawTextureLayer(grid, clipCondition) {
        if (!grid) return;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                // If a bounding clip condition function is given, check if we should skip drawing this pixel
                if (clipCondition && !clipCondition(r, c)) continue;
                ctx.fillStyle = grid[r][c];
                ctx.fillRect(x + (c * renderPixelSize), y + (r * renderPixelSize), renderPixelSize, renderPixelSize);
            }
        }
    }

    // 1. LAYER ONE: Body Rendering Logic
    if (textures && textures.body) {
        drawTextureLayer(textures.body, (r, c) => {
            if (bStyle === 2) return (c >= 1 && c <= 6); // Slim body shape clipping limits
            return true;
        });
    }

    // 2. LAYER TWO: Shirt Overlay Logic
    if (textures && textures.shirt) {
        drawTextureLayer(textures.shirt, (r, c) => {
            const isSlimX = bStyle === 2 ? (c >= 1 && c <= 6) : true;
            if (sStyle === 2) return isSlimX && (r >= 3); // High collar shirt row cuts
            if (sStyle === 3) return isSlimX && (r >= 5 || (r === 4 && (c === 1 || c === 2 || c === 5 || c === 6))); // Suspender harness straps layout cut
            return isSlimX && (r >= 4); // Standard classic t-shirt block cutoff line
        });
    }

    // 3. LAYER THREE: Hair Overlay Logic
    if (textures && textures.hair) {
        drawTextureLayer(textures.hair, (r, c) => {
            if (hStyle === 2) return (r < 2 || c === 0 || c === 7); // Long side fringe lines shape cut
            if (hStyle === 3) return (r < 1 || (r === 1 && (c === 1 || c === 3 || c === 5 || c === 6))); // Spiky bangs layout row cuts
            if (hStyle === 4) return (r < 2); // Headband width cropping layer
            return (r < 2); // Default classic hair strip crop line
        });
        
        // Add a dedicated golden highlight strip over your custom texture if Headband style 4 is active
        if (hStyle === 4) {
            ctx.fillStyle = '#ffdf00';
            ctx.fillRect(x, y + 4, 32, 2);
        }
    }

    // Draw centering multiplayer usernames
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

// Properties managing geometric selection slider limits
let currentCustomStyles = { bodyStyle: 1, hairStyle: 1, shirtStyle: 1 };
const MAX_STYLES = { bodyStyle: 3, hairStyle: 4, shirtStyle: 3 };

// Track changes to hair/shirt items and trigger updates to custom preview rendering
window.changeStyle = function(category, direction) {
    let nextVal = currentCustomStyles[category] + direction;
    if (nextVal < 1) nextVal = MAX_STYLES[category];
    if (nextVal > MAX_STYLES[category]) nextVal = 1;
    currentCustomStyles[category] = nextVal;
    document.getElementById(`${category}Display`).innerText = nextVal;
    redrawPaintCanvasPreview(); // Re-render preview instantly when styles change
};

const PAINT_GRID_SIZE = 8;
let multiLayerTextures = {
    body: [],
    hair: [],
    shirt: []
};

function setupDefaultPaintGrids() {
    // Check if a saved character design already exists in the player's browser memory
    const savedData = localStorage.getItem('glydesParadiseCharacter');

    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            
            // 1. Instantly restore their saved hair, body, and shirt styles
            currentCustomStyles = parsed.styles || { bodyStyle: 1, hairStyle: 1, shirtStyle: 1 };
            
            // Update the textual menu arrow indicators to display the saved style IDs
            document.getElementById(`bodyStyleDisplay`).innerText = currentCustomStyles.bodyStyle;
            document.getElementById(`hairStyleDisplay`).innerText = currentCustomStyles.hairStyle;
            document.getElementById(`shirtStyleDisplay`).innerText = currentCustomStyles.shirtStyle;
            
            // 2. Load up their custom painted 8x8 matrix pixel textures perfectly
            multiLayerTextures = parsed.textures;
            
            // Restore their custom typed username into the text field box
            document.getElementById('usernameInput').value = parsed.username || "New Glyder";
            
            console.log("Persistent profile retrieved successfully from localStorage!");
            return; // Exit out since we successfully recovered their data
        } catch (e) {
            console.error("Error reading browser memory cache, reverting to default templates.", e);
        }
    }

    // FALLBACK DEFAULT: If no local file exists, generate the default solid colored blocks
    multiLayerTextures.body = []; multiLayerTextures.hair = []; multiLayerTextures.shirt = [];
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
// Trigger the setup sequence
setupDefaultPaintGrids();

const paintCanvas = document.getElementById('paintCanvas');
const pCtx = paintCanvas.getContext('2d');
const paintLayerSelect = document.getElementById('paintLayerSelect');
const brushColorPicker = document.getElementById('brushColorPicker');
const clearPaintBtn = document.getElementById('clearPaintBtn');
let isDrawingOnCanvas = false;

function redrawPaintCanvasPreview() {
    const activeLayer = paintLayerSelect.value;
    const currentGrid = multiLayerTextures[activeLayer];
    const pixelSize = paintCanvas.width / PAINT_GRID_SIZE;
    
    pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    for (let r = 0; r < PAINT_GRID_SIZE; r++) {
        for (let c = 0; c < PAINT_GRID_SIZE; c++) {
            pCtx.fillStyle = currentGrid[r][c];
            pCtx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
        }
    }
}

paintLayerSelect.addEventListener('change', redrawPaintCanvasPreview);
redrawPaintCanvasPreview();

function handlePaintMove(e) {
    const rect = paintCanvas.getBoundingClientRect();
    const colIdx = Math.floor((e.clientX - rect.left) / (paintCanvas.width / PAINT_GRID_SIZE));
    const rowIdx = Math.floor((e.clientY - rect.top) / (paintCanvas.height / PAINT_GRID_SIZE));
    
    if (colIdx >= 0 && colIdx < PAINT_GRID_SIZE && rowIdx >= 0 && rowIdx < PAINT_GRID_SIZE) {
        const activeLayer = paintLayerSelect.value;
        multiLayerTextures[activeLayer][rowIdx][colIdx] = brushColorPicker.value;
        redrawPaintCanvasPreview();
    }
}

paintCanvas.addEventListener('mousedown', (e) => { isDrawingOnCanvas = true; handlePaintMove(e); });
window.addEventListener('mouseup', () => { isDrawingOnCanvas = false; });
paintCanvas.addEventListener('mousemove', (e) => { if (isDrawingOnCanvas) handlePaintMove(e); });

clearPaintBtn.addEventListener('click', () => {
    const activeLayer = paintLayerSelect.value;
    const defaultColors = { body: '#ff5555', hair: '#4a2c00', shirt: '#5555ff' };
    
    for (let r = 0; r < PAINT_GRID_SIZE; r++) {
        for (let c = 0; c < PAINT_GRID_SIZE; c++) {
            multiLayerTextures[activeLayer][r][c] = defaultColors[activeLayer];
        }
    }
    redrawPaintCanvasPreview();
});

// Draws the full, live layered character preview inside the customizer box frame
function redrawPaintCanvasPreview() {
    const pWidth = paintCanvas.width;
    const pHeight = paintCanvas.height;
    const pixelScale = pWidth / PAINT_GRID_SIZE; // Scales our 8x8 matrix grid cleanly to 160x160

    pCtx.clearRect(0, 0, pWidth, pHeight);

    const bStyle = currentCustomStyles.bodyStyle;
    const hStyle = currentCustomStyles.hairStyle;
    const sStyle = currentCustomStyles.shirtStyle;

    // Helper to process grid pixel coordinates safely
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

    // 1. Draw Body Layer
    drawPreviewLayer(multiLayerTextures.body, (r, c) => {
        if (bStyle === 2) return (c >= 1 && c <= 6); // Slim profile
        return true;
    });

    // 2. Draw Shirt Layer
    drawPreviewLayer(multiLayerTextures.shirt, (r, c) => {
        const isSlimX = bStyle === 2 ? (c >= 1 && c <= 6) : true;
        if (sStyle === 2) return isSlimX && (r >= 3); // High collar
        if (sStyle === 3) return isSlimX && (r >= 5 || (r === 4 && (c === 1 || c === 2 || c === 5 || c === 6))); // Suspender straps
        return isSlimX && (r >= 4); // Standard cutoff
    });

    // 3. Draw Hair Layer
    drawPreviewLayer(multiLayerTextures.hair, (r, c) => {
        if (hStyle === 2) return (r < 2 || c === 0 || c === 7); // Long hair
        if (hStyle === 3) return (r < 1 || (r === 1 && (c === 1 || c === 3 || c === 5 || c === 6))); // Spiky bangs
        if (hStyle === 4) return (r < 2); // Headband width crop
        return (r < 2); // Short crop
    });

    // Draw overlay asset lines if headband style 4 is active
    if (hStyle === 4) {
        pCtx.fillStyle = '#ffdf00';
        pCtx.fillRect(0, 4 * pixelScale, pWidth, 2 * (pixelScale / 4));
    }
}

// Initial draw sequence trigger
redrawPaintCanvasPreview();

// Converts direct click coordinates on character into 8x8 index array positions
function handlePaintMove(e) {
    const rect = paintCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const pixelScale = paintCanvas.width / PAINT_GRID_SIZE;
    const colIdx = Math.floor(mouseX / pixelScale);
    const rowIdx = Math.floor(mouseY / pixelScale);

    if (colIdx >= 0 && colIdx < PAINT_GRID_SIZE && rowIdx >= 0 && rowIdx < PAINT_GRID_SIZE) {
        const activeLayer = paintLayerSelect.value;
        multiLayerTextures[activeLayer][rowIdx][colIdx] = brushColorPicker.value;
        redrawPaintCanvasPreview(); // Instantly update visual canvas frames
    }
}

// Connect mouse listeners to handle interactive drag painting
paintCanvas.addEventListener('mousedown', (e) => { isDrawingOnCanvas = true; handlePaintMove(e); });
window.addEventListener('mouseup', () => { isDrawingOnCanvas = false; });
paintCanvas.addEventListener('mousemove', (e) => { if (isDrawingOnCanvas) handlePaintMove(e); });

// Attach layer selection swap to update look windows
paintLayerSelect.addEventListener('change', redrawPaintCanvasPreview);

clearPaintBtn.addEventListener('click', () => {
    setupDefaultPaintGrids();
    redrawPaintCanvasPreview();
});
