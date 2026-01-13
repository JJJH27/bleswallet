import { Token, AdminConfig } from './types';

export const TUXA_NETWORK = {
  id: 1313161955,
  hexId: '0x4e4542e3',
  name: "TuxaChain",
  rpcUrls: ["https://0x4e4542e3.rpc.aurora-cloud.dev"],
  blockExplorerUrls: ["https://0x4e4542e3.explorer.aurora-cloud.dev/"],
  nativeCurrency: {
    name: "WNEAR",
    symbol: "WNEAR",
    decimals: 18
  }
};

// New Main Token Contract
export const MAIN_TOKEN_ADDRESS = "0x2830b5a25e70ABb6f82B3333f3DF4A88379Cc91a";
export const ADMIN_ADDRESS = "0x1dE4c3F241B5f44Bbebbd47946E9e21F3b5e962f";

export const DEFAULT_TOKENS: Token[] = [
  {
    symbol: "WNEAR",
    name: "WNEAR",
    address: "native",
    decimals: 18,
    logo: "https://cryptologos.cc/logos/near-protocol-near-logo.png?v=026" 
  },
  {
    symbol: "BLES", 
    name: "Blessing",   
    address: MAIN_TOKEN_ADDRESS,
    decimals: 18,
    logo: "https://amaranth-gothic-carp-349.mypinata.cloud/ipfs/bafybeibde42bpy5sk6d6dfx7zl4ytca4zq7eglywcdaqdnk3qw3hky6ptq"
  }
];

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  feeFrequency: 1,
  defaultFee: "0.0002" // Amount of MAIN TOKEN (BLES)
};