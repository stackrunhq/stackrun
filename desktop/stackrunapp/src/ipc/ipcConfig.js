module.exports = {
    socket: '/run/stackrun/stackrun.sock',
    eventSocket: '/run/stackrun/events.sock',
    readyFile: '/run/stackrun/ready.json',
    
    socketPaths: [
        '/run/stackrun/stackrun.sock'
    ],
    
    protocolVersion: 2,
    handshakeTimeout: 5000,
    reconnectDelay: 1000,
    maxReconnectAttempts: 10
};
