const socket = io();
let ecdhKeyPair = null;
let sharedAesKey = null;
let myPublicKeyBase64 = null; // Store this to re-send later

// --- Helpers ---
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
    return bytes.buffer;
}

function logMessage(text, type) {
    const box = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.textContent = text;
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
}

// --- Cryptography & Networking ---

// 1. Generate keys on load
async function generateKeys() {
    logMessage("Generating Ephemeral Diffie-Hellman keys...", "system");
    ecdhKeyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
    
    const exportedPubKey = await window.crypto.subtle.exportKey("raw", ecdhKeyPair.publicKey);
    myPublicKeyBase64 = bufferToBase64(exportedPubKey);
    
    sendPublicKey();
}

// 2. Transmit public key
function sendPublicKey() {
    if (myPublicKeyBase64) {
        logMessage("Sending Public Key to Server...", "system");
        socket.emit('public_key_exchange', { dh_public: myPublicKeyBase64 });
    }
}

// 3. Listen for new gadgets joining
socket.on('user_joined', () => {
    logMessage("New gadget detected. Re-transmitting public key...", "system");
    sendPublicKey();
});

// 4. Derive Shared Secret
socket.on('public_key_exchange', async (data) => {
    logMessage("Received interlocutor's Public Key. Deriving AES key...", "system");
    
    const otherPubKeyBuffer = base64ToBuffer(data.dh_public);
    const importedOtherPubKey = await window.crypto.subtle.importKey(
        "raw", otherPubKeyBuffer, { name: "ECDH", namedCurve: "P-256" }, true, []
    );

    sharedAesKey = await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: importedOtherPubKey },
        ecdhKeyPair.privateKey,
        { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );

    logMessage("Secure E2EE Channel Established! (AES-GCM 256)", "system");
});

// 5. Encrypt and Send
async function sendChatMessage() {
    if (!sharedAesKey) {
        alert("Wait for the secure channel to establish first!");
        return;
    }

    const input = document.getElementById('message-input');
    const plaintext = input.value;
    if (!plaintext) return;

    logMessage(plaintext, "sent");
    input.value = '';

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, sharedAesKey, encodedText
    );

    socket.emit('encrypted_message', {
        nonce: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer)
    });
}

// 6. Receive and Decrypt
socket.on('encrypted_message', async (data) => {
    if (!sharedAesKey) return;

    try {
        const iv = base64ToBuffer(data.nonce);
        const ciphertext = base64ToBuffer(data.ciphertext);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) }, sharedAesKey, ciphertext
        );

        const plaintext = new TextDecoder().decode(decryptedBuffer);
        logMessage(plaintext, "received");

    } catch (error) {
        logMessage("SECURITY ALERT: Message tampering detected! (Bad Auth Tag)", "system");
    }
});

window.onload = generateKeys;