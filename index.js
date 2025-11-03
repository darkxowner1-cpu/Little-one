const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve HTML form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active sessions
let activeSessions = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        defaultQueryTimeoutMs: 60_000
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan QR Code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ Bot is online and connected!');
            startAutoFeatures(sock);
        }

        if (connection === 'close') {
            console.log('❌ Connection closed, reconnecting...');
            startBot();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Auto view status
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        // Auto view status updates
        if (msg.key.remoteJid === 'status@broadcast') {
            console.log('👀 Auto-viewing status...');
            await sock.readMessages([msg.key]);
        }
    });

    // Auto react to messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        if (msg.message && msg.key.remoteJid !== 'status@broadcast') {
            // Auto typing indicator
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
            
            setTimeout(async () => {
                await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
                
                // Auto react with 👍
                await sock.sendMessage(msg.key.remoteJid, {
                    react: {
                        text: '👍',
                        key: msg.key
                    }
                });
            }, 2000);
        }
    });

    return sock;
}

function startAutoFeatures(sock) {
    console.log('🚀 Starting auto features...');
    
    // Periodic presence update
    setInterval(() => {
        sock.sendPresenceUpdate('available');
    }, 60000);
}

// API to start bot
app.post('/start-bot', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        console.log(`Starting bot for: ${phoneNumber}`);
        
        await startBot();
        res.json({ 
            success: true, 
            message: 'Bot started successfully! Check terminal for QR code.' 
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🤖 Bot server running on port ${PORT}`);
    console.log(`🌐 Open: http://localhost:${PORT}`);
});

// Start bot automatically
startBot().catch(console.error);
