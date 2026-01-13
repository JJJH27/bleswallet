import { AdminConfig, Transaction, Token, StoredAccount } from '../types';
import { DEFAULT_ADMIN_CONFIG } from '../constants';

const KEYS = {
  WALLET_ENC: 'bles_wallet_enc', // Legacy key
  WALLETS: 'bles_wallets_v2',    // New key for array of accounts
  TX_HISTORY: 'bles_tx_history',
  CUSTOM_TOKENS: 'bles_custom_tokens',
  ADMIN_CONFIG: 'bles_admin_config',
  USER_TX_COUNT: 'bles_user_tx_count',
  SECURITY_SETTINGS: 'bles_security_settings' // Now stores a map: { [address]: { pinEnabled: boolean, pinCode: string } }
};

export const storageService = {
  // --- Multi-Account Management ---
  
  saveAccounts: (accounts: StoredAccount[]) => {
    localStorage.setItem(KEYS.WALLETS, JSON.stringify(accounts));
  },

  getAccounts: (): StoredAccount[] => {
    const rawV2 = localStorage.getItem(KEYS.WALLETS);
    if (rawV2) {
      return JSON.parse(rawV2);
    }

    // Migration: Check for legacy single wallet
    const legacy = localStorage.getItem(KEYS.WALLET_ENC);
    if (legacy) {
      return [];
    }
    return [];
  },

  // Helper to migrate legacy single string to account structure
  migrateLegacy: (address: string, encryptedPk: string) => {
    const accounts: StoredAccount[] = [{
        address,
        encryptedPk,
        name: "Cuenta 1"
    }];
    localStorage.setItem(KEYS.WALLETS, JSON.stringify(accounts));
    localStorage.removeItem(KEYS.WALLET_ENC); // Clear old key
  },

  clearWallets: () => {
    localStorage.removeItem(KEYS.WALLETS);
    localStorage.removeItem(KEYS.WALLET_ENC);
    localStorage.removeItem(KEYS.SECURITY_SETTINGS);
  },

  // --- Config & Data ---

  getAdminConfig: (): AdminConfig => {
    const stored = localStorage.getItem(KEYS.ADMIN_CONFIG);
    return stored ? JSON.parse(stored) : DEFAULT_ADMIN_CONFIG;
  },

  saveAdminConfig: (config: AdminConfig) => {
    localStorage.setItem(KEYS.ADMIN_CONFIG, JSON.stringify(config));
  },

  getTxHistory: (address: string): Transaction[] => {
    const all = localStorage.getItem(KEYS.TX_HISTORY);
    if (!all) return [];
    const parsed = JSON.parse(all);
    return parsed[address.toLowerCase()] || [];
  },

  addTransaction: (address: string, tx: Transaction) => {
    const allStr = localStorage.getItem(KEYS.TX_HISTORY);
    const all = allStr ? JSON.parse(allStr) : {};
    const key = address.toLowerCase();
    
    if (!all[key]) all[key] = [];
    all[key].unshift(tx); // Add to beginning
    localStorage.setItem(KEYS.TX_HISTORY, JSON.stringify(all));
  },

  clearHistory: (address: string) => {
    const allStr = localStorage.getItem(KEYS.TX_HISTORY);
    if(allStr) {
        const all = JSON.parse(allStr);
        delete all[address.toLowerCase()];
        localStorage.setItem(KEYS.TX_HISTORY, JSON.stringify(all));
    }
  },

  getCustomTokens: (): Token[] => {
    const stored = localStorage.getItem(KEYS.CUSTOM_TOKENS);
    return stored ? JSON.parse(stored) : [];
  },

  addCustomToken: (token: Token) => {
    const current = storageService.getCustomTokens();
    // Prevent duplicates
    if (!current.find(t => t.address.toLowerCase() === token.address.toLowerCase())) {
      current.push(token);
      localStorage.setItem(KEYS.CUSTOM_TOKENS, JSON.stringify(current));
    }
  },

  removeCustomToken: (tokenAddress: string) => {
    const current = storageService.getCustomTokens();
    const filtered = current.filter(t => t.address.toLowerCase() !== tokenAddress.toLowerCase());
    localStorage.setItem(KEYS.CUSTOM_TOKENS, JSON.stringify(filtered));
  },

  getTxCount: (address: string): number => {
    const all = JSON.parse(localStorage.getItem(KEYS.USER_TX_COUNT) || '{}');
    return all[address.toLowerCase()] || 0;
  },

  incrementTxCount: (address: string) => {
    const all = JSON.parse(localStorage.getItem(KEYS.USER_TX_COUNT) || '{}');
    const key = address.toLowerCase();
    all[key] = (all[key] || 0) + 1;
    localStorage.setItem(KEYS.USER_TX_COUNT, JSON.stringify(all));
  },

  // --- Security Settings (Per Address) ---

  getSecuritySettings: (address: string) => {
    const all = JSON.parse(localStorage.getItem(KEYS.SECURITY_SETTINGS) || '{}');
    const settings = all[address.toLowerCase()];
    // Structure: { pinEnabled: boolean, pinCode?: string }
    return settings || { pinEnabled: false };
  },

  setSecuritySettings: (address: string, settings: { pinEnabled: boolean, pinCode?: string }) => {
    const all = JSON.parse(localStorage.getItem(KEYS.SECURITY_SETTINGS) || '{}');
    all[address.toLowerCase()] = { ...all[address.toLowerCase()], ...settings };
    localStorage.setItem(KEYS.SECURITY_SETTINGS, JSON.stringify(all));
  },

  // Admin feature: Reset PIN for a specific user address
  resetUserPin: (address: string) => {
    const all = JSON.parse(localStorage.getItem(KEYS.SECURITY_SETTINGS) || '{}');
    if (all[address.toLowerCase()]) {
      all[address.toLowerCase()] = { pinEnabled: false, pinCode: '' };
      localStorage.setItem(KEYS.SECURITY_SETTINGS, JSON.stringify(all));
    }
  }
};