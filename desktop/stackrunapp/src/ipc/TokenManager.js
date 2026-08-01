const fs = require('fs');
const path = require('path');
const os = require('os');

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenEnvVar = 'STACKRUN_DSERVER_TOKEN';
    }

    generateToken() {
        const uuid = require('crypto').randomUUID();
        this.token = uuid;
        return uuid;
    }

    async init() {
        try {
            const envToken = process.env[this.tokenEnvVar];
            if (envToken) {
                this.token = envToken;
                console.log(`[TokenManager] Token from environment: ${this.token.substring(0, 8)}...`);
                return this.token;
            }
            
            this.token = this.generateToken();
            process.env[this.tokenEnvVar] = this.token;
            
            console.log(`[TokenManager] Token generated: ${this.token.substring(0, 8)}...`);
            console.log(`[TokenManager] PID: ${process.pid}`);
            return this.token;
        } catch (error) {
            console.error(`[TokenManager] Failed to initialize token: ${error.message}`);
            throw error;
        }
    }

    async cleanup() {
        this.token = null;
        console.log('[TokenManager] Cleanup completed');
    }

    getToken() {
        return this.token;
    }

    getEnv() {
        return {
            [this.tokenEnvVar]: this.token,
            'STACKRUN_DSERVER_PID': process.pid.toString()
        };
    }

    static async validateToken() {
        const tokenFromEnv = process.env['STACKRUN_DSERVER_TOKEN'];
        
        if (!tokenFromEnv) {
            console.warn('[TokenManager] STACKRUN_DSERVER_TOKEN not set in environment');
            return false;
        }

        return true;
    }

    static async getTokenData() {
        return {
            token: process.env['STACKRUN_DSERVER_TOKEN'],
            pid: process.pid
        };
    }
}

module.exports = TokenManager;