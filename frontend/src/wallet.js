import { BrowserProvider } from 'ethers';

export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_ID_HEX = '0x38';

export const BSC_NETWORK_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: [
    'https://bsc-dataseed.binance.org/',
    'https://bsc.publicnode.com',
    'https://bsc-dataseed1.defibit.io/',
  ],
  blockExplorerUrls: ['https://bscscan.com'],
};

export async function switchToBscNetwork() {
  if (!window.ethereum) throw new Error('No Web3 wallet detected. Please install MetaMask, Trust Wallet, or Rabby.');

  const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => null);
  if (currentChainHex && parseInt(currentChainHex, 16) === BSC_CHAIN_ID) {
    return;
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    // Error code 4902 (or nested originalError) indicates the chain has not been added to the wallet yet
    const code = switchError?.code ?? switchError?.data?.originalError?.code;
    if (
      code === 4902 ||
      code === -32603 ||
      String(switchError?.message || '').toLowerCase().includes('unrecognized chain')
    ) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BSC_NETWORK_PARAMS],
      });
    } else {
      throw switchError;
    }
  }
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error('No Web3 wallet detected. Please install MetaMask, Trust Wallet, or Rabby.');

  // 1. Request account connection
  await window.ethereum.request({ method: 'eth_requestAccounts' });

  // 2. Automatically switch (or add) BNB Smart Chain (Chain ID 56 / 0x38) by default
  await switchToBscNetwork();

  // 3. Instantiate fresh BrowserProvider after network switch so signer is bound to BNB Chain
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return { provider, signer, address, chainId: Number(network.chainId) };
}
