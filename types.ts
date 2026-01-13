export interface Token {
  symbol: string;
  name: string;
  address: string; // 'native' or contract address
  decimals: number;
  balance?: string;
  logo?: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  symbol: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  fee: string;
  gasUsed: string;
  gasPrice: string;
}

export interface AdminConfig {
  feeFrequency: number; // Every N transactions
  defaultFee: string; // Amount of MAIN TOKEN to charge
}

export interface StoredAccount {
  address: string;
  encryptedPk: string;
  name: string;
}

export interface WalletState {
  address: string;
  privateKey?: string; // Only in memory, encrypted in storage
  mnemonic?: string;
  isAdmin: boolean;
  txCount: number;
  name: string;
}

export enum GasPreset {
  SLOW = 'slow',
  STANDARD = 'standard',
  FAST = 'fast',
  CUSTOM = 'custom'
}