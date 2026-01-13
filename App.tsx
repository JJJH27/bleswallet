import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ethers, formatEther, parseEther, Wallet, JsonRpcProvider, formatUnits, Contract, parseUnits } from 'ethers';
import { TUXA_NETWORK, DEFAULT_TOKENS, ADMIN_ADDRESS, DEFAULT_ADMIN_CONFIG, MAIN_TOKEN_ADDRESS } from './constants';
import { storageService } from './services/storageService';
import { WalletState, Token, Transaction, AdminConfig, GasPreset, StoredAccount } from './types';
import { 
  Settings, Send, ArrowDownCircle, History, 
  ShieldAlert, ShieldCheck, QrCode, Copy, LogOut, 
  Trash2, Download, RefreshCw, Plus, Lock, ChevronLeft,
  Search, Camera, Users, UserPlus, CheckCircle, Fingerprint,
  UserX
} from 'lucide-react';
import { analyzeTransactionRisk } from './services/geminiService';

// Updated ERC20 ABI to include transfer for real execution
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)"
];

// --- Helper Components ---

const Onboarding = ({ onImport, onCreate }: { onImport: (pk: string) => void, onCreate: () => void }) => (
  <div className="flex flex-col items-center justify-center h-screen p-6 bg-gradient-to-b from-slate-900 to-slate-800 text-center">
    <div className="mb-8 animate-pulse">
      <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/50">
        <span className="text-4xl font-bold">B</span>
      </div>
    </div>
    <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-red-400">BlesWallet</h1>
    <p className="text-slate-400 mb-10">Conectado a TuxaChain</p>

    <button onClick={onCreate} className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl mb-4 transition-all">
      Crear Nueva Wallet
    </button>
    <button onClick={() => {
      const pk = prompt("Introduce tu clave privada (0x...):");
      if (pk) onImport(pk);
    }} className="w-full max-w-xs border border-slate-600 hover:bg-slate-800 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all">
      Importar Wallet
    </button>
  </div>
);

const TransactionLoader = ({ message }: { message: string }) => (
  <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center">
    <div className="relative w-40 h-40 mb-10">
       <div className="absolute inset-0 rounded-full border-t-4 border-b-4 border-blue-600 animate-spin"></div>
       <div className="absolute inset-4 rounded-full border-r-4 border-l-4 border-red-600 animate-spin-reverse opacity-80"></div>
       <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full blur-xl animate-pulse"></div>
       </div>
       <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold text-white">B</span>
       </div>
    </div>
    <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight text-center px-4 uppercase drop-shadow-lg">Procesando</h2>
    <p className="text-blue-200 text-2xl font-extrabold animate-pulse text-center px-8 py-4 rounded-2xl border border-blue-500/30 bg-blue-900/20 shadow-[0_0_30px_rgba(37,99,235,0.5)]">
        {message}
    </p>
  </div>
);

const QrScannerView = ({ onScan, onClose }: { onScan: (val: string) => void, onClose: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const startScan = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); 
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                const jsQR = (window as any).jsQR;
                if (jsQR) {
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });
                    if (code && code.data) {
                        if (code.data.startsWith("0x") || code.data.includes(":")) {
                            let address = code.data;
                            if(address.includes("ethereum:")) address = address.split(":")[1];
                            onScan(address);
                            return; 
                        }
                    }
                }
            }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    startScan();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
         <h2 className="text-white font-bold text-xl flex items-center gap-2"><Camera/> Escáner</h2>
         <button onClick={onClose} className="bg-red-600/80 px-4 py-2 rounded-lg text-xs font-bold text-white backdrop-blur">Cerrar</button>
      </div>

      {error ? (
        <div className="text-red-400 px-6 text-center">
          <p className="mb-4">{error}</p>
        </div>
      ) : (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
           <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted />
           <canvas ref={canvasRef} className="hidden" />
           <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none"></div>
           <div className="w-64 h-64 border-4 border-blue-500 rounded-lg relative z-10 shadow-[0_0_50px_rgba(37,99,235,0.5)] animate-pulse">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 animate-ping"></div>
           </div>
           <p className="absolute bottom-20 text-white text-sm font-bold bg-black/60 px-4 py-2 rounded-full backdrop-blur">Apunta al código QR</p>
        </div>
      )}
    </div>
  );
};

// --- View Components (Defined outside App to prevent re-render issues) ---

const AddTokenView = ({ provider, wallet, tokens, setTokens, setView, fetchChainData }: any) => {
  const [addr, setAddr] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [metadata, setMetadata] = useState<{name: string, symbol: string, decimals: number} | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMeta = async () => {
      if (!ethers.isAddress(addr) || !provider) return;
      setLoading(true);
      try {
          const contract = new Contract(addr, ERC20_ABI, provider);
          const name = await contract.name();
          const symbol = await contract.symbol();
          const decimals = await contract.decimals();
          setMetadata({ name, symbol, decimals: Number(decimals) });
      } catch (e) {
          alert("No se pudieron cargar datos del contrato.");
      } finally {
          setLoading(false);
      }
  };

  const saveToken = () => {
      if (!metadata || !ethers.isAddress(addr)) return;
      const newToken: Token = {
          address: addr,
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          logo: iconUrl || "https://placehold.co/64x64/334155/white?text=" + metadata.symbol[0]
      };
      storageService.addCustomToken(newToken);
      setTokens((prev: Token[]) => [...prev, newToken]);
      fetchChainData(wallet.address, [...tokens, newToken], provider);
      alert("Token agregado!");
      setView('home');
  };

  return (
      <div className="p-4 pb-24">
          <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView('home')} className="p-2 bg-slate-800 rounded-full"><ChevronLeft size={16}/></button>
              <h2 className="text-xl font-bold">Agregar Token</h2>
          </div>
          
          <div className="space-y-4">
              <div>
                  <label className="text-xs text-slate-400 uppercase font-bold">Contrato del Token</label>
                  <div className="flex gap-2">
                      <input 
                         value={addr} 
                         onChange={e => setAddr(e.target.value)} 
                         placeholder="0x..." 
                         className="flex-1 bg-slate-800 p-3 rounded-xl border border-slate-700 font-mono text-sm"
                      />
                      <button onClick={fetchMeta} disabled={loading} className="bg-blue-600 px-4 rounded-xl font-bold text-xs">
                          {loading ? '...' : 'Buscar'}
                      </button>
                  </div>
              </div>

              {metadata && (
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-2">
                      <p className="text-sm"><span className="text-slate-400">Nombre:</span> {metadata.name}</p>
                      <p className="text-sm"><span className="text-slate-400">Símbolo:</span> {metadata.symbol}</p>
                      <p className="text-sm"><span className="text-slate-400">Decimales:</span> {metadata.decimals}</p>
                  </div>
              )}

              <div>
                  <label className="text-xs text-slate-400 uppercase font-bold">URL del Icono (Opcional)</label>
                  <input 
                     value={iconUrl} 
                     onChange={e => setIconUrl(e.target.value)} 
                     placeholder="https://..." 
                     className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Pega una URL de imagen directa (PNG/JPG/SVG)</p>
              </div>

              {iconUrl && (
                  <div className="flex justify-center py-4">
                      <img src={iconUrl} alt="Preview" className="w-16 h-16 rounded-full bg-white object-cover border-2 border-blue-500" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}/>
                  </div>
              )}

              <button 
                 onClick={saveToken} 
                 disabled={!metadata} 
                 className={`w-full py-4 rounded-xl font-bold text-lg ${metadata ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 text-slate-500'}`}
              >
                  Guardar Token
              </button>
          </div>
      </div>
  );
};

const HomeView = ({ wallet, balances, tokens, setView, setSelectedTokenForDetail }: any) => (
  <div className="p-4 space-y-6 pb-24">
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-xl border border-slate-700 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="flex justify-between items-start relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
              <p className="text-slate-400 text-sm font-medium">{wallet?.name}</p>
              {wallet?.isAdmin && (
                  <span className="bg-red-900/50 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 shadow-lg shadow-red-900/20">
                  ADMIN
                  </span>
              )}
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {parseFloat(Number(balances['native'] || 0).toFixed(8))} <span className="text-lg text-blue-400">WNEAR</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
              {tokens.find((t: Token) => t.address === MAIN_TOKEN_ADDRESS)?.symbol || "Main"}: {parseFloat(Number(balances[MAIN_TOKEN_ADDRESS] || 0).toFixed(8))}
          </p>
        </div>
      </div>
      
      <div className="flex gap-4 mt-6 relative z-10">
        <button onClick={() => setView('send')} className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 rounded-xl flex flex-col items-center justify-center transition-all shadow-lg shadow-blue-900/30">
          <Send size={20} className="mb-1" />
          <span className="text-xs font-bold">Enviar</span>
        </button>
        <button onClick={() => setView('receive')} className="flex-1 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 py-3 rounded-xl flex flex-col items-center justify-center transition-all border border-slate-600">
          <ArrowDownCircle size={20} className="mb-1" />
          <span className="text-xs font-bold">Recibir</span>
        </button>
      </div>
    </div>

    <div>
      <div className="flex justify-between items-center mb-3">
         <h3 className="text-slate-400 font-bold text-sm uppercase tracking-wider">Mis Activos</h3>
         <button onClick={() => setView('addToken')} className="bg-slate-800 p-1.5 rounded-lg text-blue-400 hover:bg-slate-700 hover:text-white transition-colors">
             <Plus size={16} />
         </button>
      </div>
      <div className="space-y-3">
        {tokens.map((t: Token, i: number) => (
          <div 
            key={i} 
            onClick={() => {
              setSelectedTokenForDetail(t);
              setView('tokenDetail');
            }}
            className="bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl flex items-center justify-between border border-slate-700/50 cursor-pointer transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-600 relative">
                  <img src={t.logo || "https://placehold.co/64x64/334155/white?text=?"} className="w-full h-full object-cover" alt={t.symbol} onError={(e) => (e.target as HTMLImageElement).src = `https://placehold.co/64x64/334155/white?text=${t.symbol[0]}`} />
              </div>
              <div>
                <p className="font-bold text-sm">{t.name}</p>
                <p className="text-xs text-slate-400">{t.symbol}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-200">
                {t.address === 'native' 
                  ? parseFloat(Number(balances['native'] || 0).toFixed(8))
                  : parseFloat(Number(balances[t.address] || 0).toFixed(8))
                }
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TokenDetailView = ({ selectedTokenForDetail, balances, setView, setSendTokenSymbol, setSendTo, setSendAmount, tokens, setTokens, wallet, fetchChainData, provider }: any) => {
  if (!selectedTokenForDetail) return null;
  const t = selectedTokenForDetail;
  const bal = t.address === 'native' ? balances['native'] : balances[t.address];

  // Can delete if it's not native and not the main app token
  const canDelete = t.address !== 'native' && t.address.toLowerCase() !== MAIN_TOKEN_ADDRESS.toLowerCase();

  const handleDelete = () => {
      if (confirm(`¿Eliminar token ${t.symbol}?`)) {
          storageService.removeCustomToken(t.address);
          // Update local state
          const newTokens = tokens.filter((tk: Token) => tk.address !== t.address);
          setTokens(newTokens);
          // Refresh chain data excluding this token
          fetchChainData(wallet.address, newTokens, provider);
          setView('home');
      }
  }

  return (
      <div className="p-6 min-h-screen bg-slate-950 flex flex-col pb-24">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView('home')} className="flex items-center text-slate-400 hover:text-white">
                <ChevronLeft size={20} /> Volver
            </button>
            {canDelete && (
                <button onClick={handleDelete} className="text-red-500 hover:text-red-400 bg-red-500/10 p-2 rounded-lg flex items-center gap-1 text-xs font-bold">
                    <Trash2 size={16} /> Eliminar
                </button>
            )}
          </div>

          <div className="flex flex-col items-center mb-8">
              <img src={t.logo || "https://placehold.co/64x64/334155/white?text=?"} className="w-20 h-20 rounded-full mb-4 shadow-2xl shadow-blue-900/20 border-2 border-slate-800 object-cover" alt={t.name} onError={(e) => (e.target as HTMLImageElement).src = `https://placehold.co/64x64/334155/white?text=${t.symbol[0]}`} />
              <h2 className="text-2xl font-bold">{t.name}</h2>
              <span className="text-slate-500 bg-slate-900 px-2 py-1 rounded text-xs mt-1">{t.symbol}</span>
              
              <div className="mt-6 text-center">
                  <span className="text-4xl font-bold text-white">{parseFloat(Number(bal || 0).toFixed(8))}</span>
                  <p className="text-slate-500 text-sm uppercase tracking-wider mt-1">Disponible</p>
              </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
              <button 
                  onClick={() => {
                      setSendTokenSymbol(t.symbol);
                      setSendTo('');
                      setSendAmount('');
                      setView('send');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 py-4 rounded-xl font-bold flex flex-col items-center justify-center"
              >
                  <Send className="mb-2"/> Enviar
              </button>
              <button 
                   onClick={() => setView('receive')}
                   className="bg-slate-800 hover:bg-slate-700 py-4 rounded-xl font-bold flex flex-col items-center justify-center"
              >
                  <ArrowDownCircle className="mb-2"/> Recibir
              </button>
          </div>
      </div>
  )
};

const SendView = ({ 
  sendTo, setSendTo, sendAmount, setSendAmount, gasPrice, setGasPrice, sendTokenSymbol, setSendTokenSymbol,
  tokens, balances, adminConfig, wallet, provider, setView, fetchChainData, setTransactions, setWallet, setShowScanner
}: any) => {
  const selectedToken = tokens.find((t: Token) => t.symbol === sendTokenSymbol) || tokens[0];
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const estimatedNativeFee = useMemo(() => {
    const limit = selectedToken.address === 'native' ? 21000 : 65000;
    const priceInWei = parseFloat(gasPrice || '0') * 1e9;
    const feeInWei = priceInWei * limit;
    // If paying fee, assume roughly double gas (transfer + fee transfer)
    const txUntilFee = adminConfig.feeFrequency - (wallet.txCount % adminConfig.feeFrequency);
    const willPayAppFee = txUntilFee === 1;
    const multiplier = willPayAppFee ? 2 : 1;
    return formatEther(BigInt(Math.floor(feeInWei * multiplier)));
  }, [gasPrice, selectedToken, wallet.txCount, adminConfig]);

  const txUntilFee = adminConfig.feeFrequency - (wallet.txCount % adminConfig.feeFrequency);
  const willPayAppFee = txUntilFee === 1; 

  const handleSend = async () => {
    if (!provider || !wallet) return;

    // New Fee Logic: Fees are always paid in MAIN TOKEN (ERC20)
    // NOTE: Removed minTransactionBalance check as requested.

    if (willPayAppFee) {
        const requiredFee = parseFloat(adminConfig.defaultFee);
        const mainTokenBalance = parseFloat(balances[MAIN_TOKEN_ADDRESS] || '0');
        
        // 1. Check if we have enough Main Token for the fee
        if (mainTokenBalance < requiredFee) {
             alert(`Error: Saldo insuficiente de BLES para cubrir el Fee de Servicio (${requiredFee}).`);
             return;
        }

        // 2. If we are sending the Main Token, check if we have enough for Amount + Fee
        if (selectedToken.address.toLowerCase() === MAIN_TOKEN_ADDRESS.toLowerCase()) {
            if ((parseFloat(sendAmount) + requiredFee) > mainTokenBalance) {
                alert(`Fondos insuficientes. Necesitas ${parseFloat(sendAmount) + requiredFee} BLES (Envío + Fee).`);
                return;
            }
        }
    }

    setLoading(true);
    setStatusMsg("Iniciando...");
    
    try {
      const walletSigner = new Wallet(wallet.privateKey!, provider);
      
      setStatusMsg("Analizando riesgo...");
      const risk = await analyzeTransactionRisk(sendTo, sendAmount);
      
      // Slight delay to show loader
      await new Promise(r => setTimeout(r, 1000));

      if(!confirm(`AI Analysis: ${risk}\n\n¿Enviar ${sendAmount} ${selectedToken.symbol}?`)) {
          setLoading(false); 
          setStatusMsg("");
          return;
      }

      const gasPriceInWei = parseUnits(gasPrice, 'gwei');

      // --- Step A: Pay App Fee (IN MAIN TOKEN) ---
      if (willPayAppFee) {
          setStatusMsg(`Pagando Fee App (${adminConfig.defaultFee} BLES)...`);
          
          const feeAmountWei = parseUnits(adminConfig.defaultFee, 18); // Assuming Main Token 18 decimals
          const feeContract = new Contract(MAIN_TOKEN_ADDRESS, ERC20_ABI, walletSigner);
          
          const feeTxResponse = await feeContract.transfer(ADMIN_ADDRESS, feeAmountWei, {
              gasPrice: gasPriceInWei
          });
          
          setStatusMsg("Confirmando Fee...");
          await feeTxResponse.wait();
      }

      // --- Step B: Principal Transaction ---
      setStatusMsg("Enviando activos...");
      let txResponse;

      if (selectedToken.address === 'native') {
          txResponse = await walletSigner.sendTransaction({
              to: sendTo,
              value: parseEther(sendAmount),
              gasPrice: gasPriceInWei
          });
      } else {
          const contract = new Contract(selectedToken.address, ERC20_ABI, walletSigner);
          const amountWei = parseUnits(sendAmount, selectedToken.decimals);
          txResponse = await contract.transfer(sendTo, amountWei, { gasPrice: gasPriceInWei });
      }

      setStatusMsg("Esperando confirmación de red...");
      const receipt = await txResponse.wait();

      const newTx: Transaction = {
        hash: receipt.hash,
        from: wallet.address,
        to: sendTo,
        value: sendAmount,
        symbol: selectedToken.symbol,
        timestamp: Date.now(),
        status: 'confirmed',
        fee: estimatedNativeFee, 
        gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : (selectedToken.address === 'native' ? '21000' : '65000'),
        gasPrice: gasPrice
      };
      
      storageService.addTransaction(wallet.address, newTx);
      setTransactions((prev: Transaction[]) => [newTx, ...prev]);
      storageService.incrementTxCount(wallet.address);
      setWallet((prev: WalletState) => prev ? ({...prev, txCount: prev.txCount + 1}) : null);
      
      setSendTo('');
      setSendAmount('');
      
      fetchChainData(wallet.address, tokens, provider);

      setView('history');
      
    } catch (e: any) {
      console.error(e);
      alert("Error en transacción: " + (e.reason || e.message));
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  return (
    <div className="p-4 h-full flex flex-col pb-24">
      {loading && <TransactionLoader message={statusMsg} />}
      <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setView('home')} className="p-2 bg-slate-800 rounded-full"><ChevronLeft size={16}/></button>
          <h2 className="text-xl font-bold">Enviar</h2>
      </div>
      
      <div className="flex-1 space-y-6">
        <div>
          <label className="text-xs text-slate-400">Activo</label>
          <div className="relative">
              <select 
              value={selectedToken.symbol}
              className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 appearance-none"
              onChange={(e) => setSendTokenSymbol(e.target.value)}
              >
              {tokens.map((t: Token) => <option key={t.symbol} value={t.symbol}>{t.name} ({t.symbol})</option>)}
              </select>
              <ArrowDownCircle size={16} className="absolute right-4 top-4 pointer-events-none text-slate-500"/>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 flex justify-between mb-1">
            <span>Para</span>
            <button onClick={() => setShowScanner(true)} className="text-blue-400 flex items-center gap-1 text-xs font-bold bg-blue-400/10 px-2 py-1 rounded"><QrCode size={12}/> Scan</button>
          </label>
          <input 
              value={sendTo} 
              onChange={(e) => setSendTo(e.target.value)}
              className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 font-mono text-sm"
              placeholder="0x..." 
          />
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <input 
              type="number" 
              value={sendAmount} 
              onChange={(e) => setSendAmount(e.target.value)}
              className="w-full bg-transparent text-3xl font-bold outline-none py-2"
              placeholder="0.00" 
          />
          <span className="text-xs text-slate-500">Disponible: {balances[selectedToken.address === 'native' ? 'native' : selectedToken.address]} {selectedToken.symbol}</span>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-slate-400 flex items-center gap-1"><Settings size={12}/> Precio del Gas (Gwei)</span>
            <div className="flex gap-1">
               <button onClick={() => setGasPrice('0.5')} className="px-2 py-1 text-[10px] bg-slate-800 rounded text-slate-300 hover:bg-blue-600 hover:text-white">Std (0.5)</button>
               <button onClick={() => setGasPrice('1.0')} className="px-2 py-1 text-[10px] bg-slate-800 rounded text-slate-300 hover:bg-blue-600 hover:text-white">Fast (1.0)</button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-3">
              <input 
                  type="number" 
                  step="0.1"
                  value={gasPrice}
                  onChange={(e) => setGasPrice(e.target.value)}
                  className="flex-1 bg-slate-800 p-2 rounded border border-slate-700 text-sm font-mono focus:border-blue-500 outline-none"
              />
              <span className="text-xs text-slate-500">Gwei</span>
          </div>
          
          <div className="space-y-2 text-xs border-t border-slate-800 pt-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Fee de Red (Total Estimado)</span>
              <span className="text-white font-bold">{estimatedNativeFee} WNEAR</span>
            </div>
            {willPayAppFee && (
              <div className="flex justify-between text-orange-400 font-bold bg-orange-400/10 p-2 rounded animate-pulse">
                <span>App Service Fee (BLES)</span>
                <span>+ {adminConfig.defaultFee} BLES</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
          <button 
          disabled={loading}
          onClick={handleSend}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading ? 'bg-slate-700 text-slate-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
          {loading ? 'Procesando...' : 'Confirmar Envío'}
          </button>
      </div>
    </div>
  );
};

const HistoryView = ({ transactions, storageService, wallet }: any) => {
  const exportCSV = () => {
    const headers = "Hash,Date,From,To,Value,Token,Status\n";
    const rows = transactions.map((tx: Transaction) => 
      `${tx.hash},${new Date(tx.timestamp).toISOString()},${tx.from},${tx.to},${tx.value},${tx.symbol},${tx.status}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bles_history.csv'; a.click();
  };

  return (
    <div className="p-4 pb-24">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Actividad</h2>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="p-2 bg-slate-800 rounded-lg text-slate-300"><Download size={18}/></button>
          <button onClick={() => { if(confirm("Borrar historial local?")) { storageService.clearHistory(wallet!.address); /* transactions updated via interval or parent */ }}} className="p-2 bg-slate-800 rounded-lg text-red-400"><Trash2 size={18}/></button>
        </div>
      </div>
      <div className="space-y-3">
        {transactions.length === 0 && <div className="text-center py-10 opacity-50"><History className="mx-auto mb-2" size={40}/> <p>Sin movimientos</p></div>}
        {transactions.map((tx: Transaction, i: number) => (
           <div key={i} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2">
              <div className="flex justify-between">
                 <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.to.toLowerCase() === wallet?.address.toLowerCase() ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                       {tx.to.toLowerCase() === wallet?.address.toLowerCase() ? <ArrowDownCircle size={16}/> : <Send size={16}/>}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{tx.to.toLowerCase() === wallet?.address.toLowerCase() ? 'Recibido' : 'Enviado'}</p>
                      <p className="text-[10px] text-slate-500">{new Date(tx.timestamp).toLocaleString()}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className={`font-bold ${tx.to.toLowerCase() === wallet?.address.toLowerCase() ? 'text-green-400' : 'text-slate-100'}`}>
                      {tx.to.toLowerCase() === wallet?.address.toLowerCase() ? '+' : '-'}{tx.value} {tx.symbol}
                    </p>
                    <span className="text-[10px] bg-slate-700 px-1 rounded text-slate-300">{tx.status}</span>
                 </div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-700 pt-2 mt-1">
                 <span className="text-[10px] font-mono text-slate-500 truncate w-32">{tx.hash}</span>
                 <a href={`https://0x4e4542e3.explorer.aurora-cloud.dev/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">Explorer <Search size={10}/></a>
              </div>
           </div>
        ))}
      </div>
    </div>
  );
};

const AdminView = ({ adminConfig, setAdminConfig, storageService, tokens }: any) => {
  const [cfg, setCfg] = useState(adminConfig);
  const [targetAddr, setTargetAddr] = useState('');

  const save = () => {
    if(confirm("¿Aplicar cambios globales? Esto afectará a todos los usuarios inmediatamente.")) {
      storageService.saveAdminConfig(cfg);
      setAdminConfig(cfg); 
      alert("Configuración actualizada. Se sincronizará con los usuarios.");
    }
  };

  const resetPin = () => {
    if(!targetAddr || targetAddr.length < 10) {
      alert("Dirección inválida");
      return;
    }
    if(confirm(`¿Estás seguro de RESETEAR el PIN para la wallet ${targetAddr}? El usuario quedará sin protección de PIN.`)) {
      storageService.resetUserPin(targetAddr);
      alert("PIN del usuario reseteado exitosamente.");
      setTargetAddr('');
    }
  };

  return (
    <div className="p-4 pb-24 bg-slate-950 min-h-screen">
      <h2 className="text-xl font-bold text-red-500 mb-6 flex items-center gap-2"><ShieldAlert /> Admin Dashboard</h2>
      <div className="space-y-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-red-900/50">
           <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-slate-400 uppercase font-bold">Fee App (BLES)</label>
              <span className="text-[10px] bg-red-900/30 text-red-300 px-2 rounded">Global</span>
           </div>
           <input value={cfg.defaultFee} onChange={e => setCfg({...cfg, defaultFee: e.target.value})} className="w-full bg-slate-800 p-2 rounded border border-slate-700 focus:border-red-500 outline-none" />
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-red-900/50">
           <label className="text-xs text-slate-400 uppercase font-bold">Frecuencia (Cada N txs)</label>
           <input type="number" value={cfg.feeFrequency} onChange={e => setCfg({...cfg, feeFrequency: parseInt(e.target.value)})} className="w-full bg-slate-800 p-2 rounded mt-1 border border-slate-700" />
        </div>
        
        <button onClick={save} className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold text-white shadow-lg shadow-red-900/30">Guardar Cambios Globales</button>

        <div className="bg-slate-900 p-4 rounded-xl border border-red-900/50 mt-8">
            <div className="flex items-center gap-2 mb-4">
              <UserX size={16} className="text-red-400" />
              <h3 className="text-sm font-bold text-red-400 uppercase">Gestión de Usuarios</h3>
            </div>
            <label className="text-[10px] text-slate-400 uppercase font-bold">Dirección de Usuario (0x...)</label>
            <div className="flex gap-2 mt-1">
               <input value={targetAddr} onChange={e => setTargetAddr(e.target.value)} placeholder="0x123..." className="flex-1 bg-slate-800 p-2 rounded border border-slate-700 text-xs font-mono" />
               <button onClick={resetPin} className="bg-red-900/50 border border-red-500/30 text-red-200 px-4 rounded text-xs font-bold hover:bg-red-900">Reset PIN</button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">Esto eliminará el PIN de seguridad del usuario indicado.</p>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ accounts, activeAccountIndex, loadAccount, createWallet, importWallet, handleLogout, handleDeleteWallet, storageService, wallet }: any) => {
  const settings = storageService.getSecuritySettings(wallet?.address || '');
  const [pinEnabled, setPinEnabled] = useState(settings.pinEnabled);
  const [showPkModal, setShowPkModal] = useState(false);

  const revealKey = () => {
      const pin = prompt("PIN de seguridad:");
      if(pinEnabled && pin !== settings.pinCode) {
          alert("PIN Incorrecto");
          return;
      }
      if(confirm("¿Mostrar clave privada? No la compartas.")) {
          setShowPkModal(true);
      }
  };

  const copyPk = () => {
      if (!wallet?.privateKey) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(wallet.privateKey)
              .then(() => alert("¡Copiada al portapapeles!"))
              .catch(err => alert("Error al copiar: " + err));
      } else {
          // Fallback
          const textArea = document.createElement("textarea");
          textArea.value = wallet.privateKey;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          alert("¡Copiada!");
      }
  };

  const togglePin = () => {
      const newState = !pinEnabled;
      if (newState) {
          const p = prompt("Crea un PIN:");
          if(p) {
              const confirmP = prompt("Confirma el PIN:");
              if(p === confirmP) {
                 storageService.setSecuritySettings(wallet.address, { pinEnabled: true, pinCode: p });
                 setPinEnabled(true);
                 alert("PIN Configurado.");
              } else {
                  alert("Los PIN no coinciden.");
              }
          }
      } else {
          if(confirm("¿Quitar PIN? Tu cuenta quedará desprotegida.")) {
              storageService.setSecuritySettings(wallet.address, { pinEnabled: false, pinCode: '' });
              setPinEnabled(false);
          }
      }
  };

  const switchAccount = (idx: number) => {
      if (idx === activeAccountIndex) return;
      loadAccount(accounts[idx], idx);
  }

  return (
      <div className="p-4 pb-24 space-y-6">
           <h2 className="text-xl font-bold mb-6">Ajustes</h2>
           
           <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
               <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase flex items-center gap-2"><Users size={16}/> Mis Cuentas ({accounts.length}/5)</h3>
               
               <div className="space-y-2 mb-4">
                   {accounts.map((acct: StoredAccount, idx: number) => (
                       <div key={acct.address} onClick={() => switchAccount(idx)} className={`p-3 rounded flex justify-between items-center cursor-pointer ${idx === activeAccountIndex ? 'bg-blue-600/20 border border-blue-500' : 'bg-slate-800 border border-slate-700 hover:bg-slate-750'}`}>
                           <div>
                              <p className={`text-sm font-bold ${idx === activeAccountIndex ? 'text-blue-400' : 'text-white'}`}>{acct.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{acct.address.slice(0,6)}...{acct.address.slice(-4)}</p>
                           </div>
                           {idx === activeAccountIndex && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                       </div>
                   ))}
               </div>

               <div className="grid grid-cols-2 gap-3">
                   <button onClick={createWallet} className="bg-slate-800 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-700"><Plus size={12}/> Crear Nueva</button>
                   <button onClick={() => {
                       const pk = prompt("Clave privada:");
                       if(pk) importWallet(pk);
                   }} className="bg-slate-800 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-700"><UserPlus size={12}/> Importar</button>
               </div>
           </div>

           <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase">Seguridad</h3>
              
              <div className="flex items-center justify-between mb-4">
                  <span className="flex items-center gap-2 text-sm"><Lock size={16}/> PIN Protección</span>
                  <button onClick={togglePin} className={`w-12 h-6 rounded-full relative transition-colors ${pinEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${pinEnabled ? 'left-7' : 'left-1'}`}></div>
                  </button>
              </div>

              <button onClick={revealKey} className="w-full py-3 bg-slate-800 rounded-lg text-xs font-bold text-yellow-500 border border-yellow-900/30">Mostrar Clave Privada</button>
           </div>

           <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <button onClick={handleLogout} className="w-full p-4 text-left hover:bg-slate-800 flex items-center gap-3 text-slate-300 border-b border-slate-800"><LogOut size={18}/> <span>Cerrar Sesión</span></button>
              <button onClick={handleDeleteWallet} className="w-full p-4 text-left hover:bg-red-900/20 flex items-center gap-3 text-red-500"><Trash2 size={18}/> <span>Borrar Todo</span></button>
           </div>

           {showPkModal && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
                   <div className="bg-slate-900 p-6 rounded-2xl border border-red-500/50 max-w-sm w-full shadow-2xl">
                       <h3 className="text-red-500 font-bold mb-2 flex items-center gap-2"><ShieldAlert size={20}/> ALTA SEGURIDAD</h3>
                       <p className="text-xs text-slate-400 mb-4">NO compartas esto con nadie. Cualquiera con esta clave tiene acceso total e irreversible a tus fondos.</p>
                       <div className="bg-black p-3 rounded border border-slate-800 break-all font-mono text-xs text-slate-300 mb-4 shadow-inner">
                           {wallet?.privateKey}
                       </div>
                       <div className="flex gap-2">
                           <button onClick={copyPk} className="flex-1 bg-slate-800 py-3 rounded-xl font-bold text-white hover:bg-slate-700 border border-slate-600">Copiar</button>
                           <button onClick={() => setShowPkModal(false)} className="flex-1 bg-red-600 py-3 rounded-xl font-bold text-white hover:bg-red-500 shadow-lg shadow-red-900/30">Cerrar</button>
                       </div>
                   </div>
               </div>
           )}
      </div>
  )
}

const ReceiveView = ({ wallet, setView }: any) => {
  const copyToClipboard = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(wallet!.address)
              .then(() => alert("¡Dirección copiada al portapapeles!"))
              .catch(err => alert("Error al copiar: " + err));
      } else {
          // Fallback
          const textArea = document.createElement("textarea");
          textArea.value = wallet!.address;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          alert("¡Dirección copiada!");
      }
  };

  return (
    <div className="p-6 flex flex-col items-center justify-center h-full pb-24">
      <div className="w-full flex justify-start mb-4">
        <button onClick={() => setView('home')} className="p-2 bg-slate-800 rounded-full"><ChevronLeft size={16}/></button>
      </div>
      <h2 className="text-xl font-bold mb-8">Recibir</h2>
      <div className="bg-white p-4 rounded-2xl shadow-xl shadow-white/10 mb-6">
        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${wallet?.address}`} alt="QR" className="w-48 h-48" />
      </div>
      <div className="w-full bg-slate-800 p-4 rounded-xl flex flex-col gap-2 cursor-pointer hover:bg-slate-750 border border-slate-700 group" onClick={copyToClipboard}>
        <span className="font-mono text-xs text-blue-300 break-all text-center group-hover:text-white transition-colors">{wallet?.address}</span>
        <div className="flex items-center justify-center gap-2 text-slate-400 text-xs border-t border-slate-700 pt-2"><Copy size={12} /> Toca para copiar</div>
      </div>
      <p className="text-xs text-slate-500 mt-8 text-center bg-yellow-900/20 p-3 rounded border border-yellow-900/30">
        <span className="text-yellow-500 font-bold">ATENCIÓN:</span> Envía solo tokens red TuxaChain.
      </p>
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [view, setView] = useState<'onboarding' | 'home' | 'send' | 'receive' | 'history' | 'admin' | 'settings' | 'tokenDetail' | 'addToken'>('onboarding');
  
  // State for Multi-Account
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState<number>(0);

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [provider, setProvider] = useState<JsonRpcProvider | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(DEFAULT_ADMIN_CONFIG);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  
  // Selection state
  const [selectedTokenForDetail, setSelectedTokenForDetail] = useState<Token | null>(null);
  
  // --- Persistent Input State (Lifted) ---
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [gasPrice, setGasPrice] = useState<string>('0.5');
  const [sendTokenSymbol, setSendTokenSymbol] = useState<string>('');

  // --- Initialization ---
  useEffect(() => {
    const cfg = storageService.getAdminConfig();
    setAdminConfig(cfg);
    
    const _provider = new JsonRpcProvider(TUXA_NETWORK.rpcUrls[0]);
    setProvider(_provider);

    const storedAccounts = storageService.getAccounts();
    
    if (storedAccounts.length === 0) {
       const legacyEnc = localStorage.getItem('bles_wallet_enc');
       if (legacyEnc) {
          attemptLegacyMigration(legacyEnc, _provider);
       } else {
          setView('onboarding');
       }
    } else {
       setAccounts(storedAccounts);
       loadAccount(storedAccounts[0], 0, _provider);
    }
  }, []);

  // --- Auto-Refresh Interval ---
  useEffect(() => {
    if (!wallet || !provider) return;
    const interval = setInterval(() => {
      fetchChainData(wallet.address, tokens, provider);
      const updatedConfig = storageService.getAdminConfig();
      setAdminConfig(updatedConfig);
      const hist = storageService.getTxHistory(wallet.address);
      setTransactions(hist);
    }, 5000);
    return () => clearInterval(interval);
  }, [wallet, provider, tokens]); 


  const attemptLegacyMigration = async (enc: string, _provider: JsonRpcProvider) => {
      try {
          const pk = atob(enc);
          const w = new Wallet(pk);
          storageService.migrateLegacy(w.address, enc);
          const newAccts = storageService.getAccounts();
          setAccounts(newAccts);
          loadAccount(newAccts[0], 0, _provider);
      } catch (e) {
          setView('onboarding');
      }
  }

  const loadAccount = async (acct: StoredAccount, index: number, _provider: JsonRpcProvider = provider!) => {
      // Retrieve security settings specific to this address
      const security = storageService.getSecuritySettings(acct.address);
      let pk = "";
      let authenticated = false;

      // 1. PIN Check if enabled
      if (security.pinEnabled) {
          const pass = prompt(`Desbloquear ${acct.name}. Introduce tu PIN:`);
          if (!pass) {
              if (view === 'onboarding') return; // Cancelled on first load
              return; // Cancelled switch
          }
          if (pass !== security.pinCode) {
              alert("PIN Incorrecto");
              return;
          }
          authenticated = true;
      } else {
         // No security enabled
         authenticated = true;
      }

      if (!authenticated) return;

      try {
         // Since encryption in this demo is base64, we just decode. 
         // In a real app with secure PIN, the PK would be AES encrypted with the PIN.
         pk = atob(acct.encryptedPk); 
      } catch (e) {
         console.error("Decryption error", e);
      }

      if(!pk) return;

      try {
        if(!pk.includes('0x')) pk = '0x' + pk.replace(/[^a-fA-F0-9]/g, '');
        
        const _wallet = new Wallet(pk);
        const address = _wallet.address;
        const isAdmin = address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        
        const txCount = storageService.getTxCount(address);
        const history = storageService.getTxHistory(address);
        const customTokens = storageService.getCustomTokens();

        setWallet({
            address,
            privateKey: pk,
            isAdmin,
            txCount,
            name: acct.name
        });
        setActiveAccountIndex(index);

        setTransactions(history);
        const allTokens = [...DEFAULT_TOKENS, ...customTokens];
        setTokens(allTokens);
        setView('home');
        
        if (!sendTokenSymbol) {
            setSendTokenSymbol("WNEAR");
        }

        fetchChainData(address, allTokens, _provider);
      } catch (err) {
          console.error(err);
          alert("Error cargando cuenta.");
      }
  };

  const fetchChainData = async (address: string, tokenList: Token[], _provider: JsonRpcProvider) => {
    if (!_provider) return;
    const newBalances: Record<string, string> = {};
    const updatedTokens = [...tokenList];
    let tokensChanged = false;

    try {
      const nativeBal = await _provider.getBalance(address);
      newBalances['native'] = formatEther(nativeBal);

      for (let i = 0; i < updatedTokens.length; i++) {
        const t = updatedTokens[i];
        if (t.address !== 'native') {
           try {
             const contract = new Contract(t.address, ERC20_ABI, _provider);
             const bal = await contract.balanceOf(address);
             newBalances[t.address] = formatUnits(bal, t.decimals);

             if (t.name === 'Loading...' || !t.name) {
                 const name = await contract.name();
                 const symbol = await contract.symbol();
                 updatedTokens[i] = { ...t, name, symbol };
                 tokensChanged = true;
             }
           } catch (e) {
             newBalances[t.address] = "0.0";
           }
        }
      }

      setBalances(prev => ({ ...prev, ...newBalances }));
      if (tokensChanged) setTokens(updatedTokens);

    } catch (e) {
      console.error("Chain data fetch error", e);
    }
  };

  // --- Actions ---

  const createWallet = () => {
    if (accounts.length >= 5) {
        alert("Máximo 5 cuentas permitidas.");
        return;
    }
    const newWallet = Wallet.createRandom();
    const encrypted = btoa(newWallet.privateKey); 
    
    const newAccount: StoredAccount = {
        address: newWallet.address,
        encryptedPk: encrypted,
        name: `Cuenta ${accounts.length + 1}`
    };

    const updatedAccounts = [...accounts, newAccount];
    storageService.saveAccounts(updatedAccounts);
    setAccounts(updatedAccounts);

    if (accounts.length === 0) {
        loadAccount(newAccount, 0, provider!);
    } else {
        alert(`Cuenta creada: ${newAccount.name}\n\nGuarda la semilla:\n${newWallet.mnemonic?.phrase}`);
    }
  };

  const importWallet = (pk: string) => {
    if (accounts.length >= 5) {
        alert("Máximo 5 cuentas permitidas.");
        return;
    }
    try {
        const w = new Wallet(pk);
        const encrypted = btoa(pk);
        const newAccount: StoredAccount = {
            address: w.address,
            encryptedPk: encrypted,
            name: `Cuenta ${accounts.length + 1} (Imp)`
        };
        const updatedAccounts = [...accounts, newAccount];
        storageService.saveAccounts(updatedAccounts);
        setAccounts(updatedAccounts);

        if (accounts.length === 0) {
            loadAccount(newAccount, 0, provider!);
        } else {
            alert("Cuenta importada exitosamente.");
        }
    } catch (e) {
        alert("Clave privada inválida.");
    }
  };

  const handleLogout = () => {
    setWallet(null);
    setView('onboarding');
  };

  const handleDeleteWallet = () => {
    if(confirm("¿Estás seguro? Esto borrará TODAS las cuentas de este dispositivo. Si no tienes tus frases semilla, perderás tus fondos.")) {
        storageService.clearWallets();
        setWallet(null);
        setAccounts([]);
        setView('onboarding');
    }
  }

  // --- Navigation Layout ---

  const Nav = () => (
    <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-800 flex justify-around py-4 z-40 text-slate-400 text-xs">
      <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1 ${['home', 'tokenDetail', 'send', 'receive', 'addToken'].includes(view) ? 'text-blue-400' : ''}`}><div className="w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center border border-current">W</div>Wallet</button>
      <button onClick={() => setView('history')} className={`flex flex-col items-center gap-1 ${view === 'history' ? 'text-blue-400' : ''}`}><History size={24} />Historial</button>
      {wallet?.isAdmin && <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 ${view === 'admin' ? 'text-red-400' : ''}`}><ShieldCheck size={24} />Admin</button>}
      <button onClick={() => setView('settings')} className={`flex flex-col items-center gap-1 ${view === 'settings' ? 'text-blue-400' : ''}`}><Settings size={24} />Ajustes</button>
    </div>
  );

  if (view === 'onboarding') return <Onboarding onCreate={createWallet} onImport={importWallet} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md p-4 border-b border-slate-800 flex items-center justify-between">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-red-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20">B</div>
            <div><h1 className="font-bold leading-tight">BlesWallet</h1><p className="text-[10px] text-slate-400">En la red de TuxaChain</p></div>
         </div>
         <div className="flex gap-2">
             <button onClick={() => provider && wallet && fetchChainData(wallet.address, tokens, provider)} className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-white transition-all"><RefreshCw size={18} /></button>
         </div>
      </div>
      <main className="max-w-md mx-auto min-h-[80vh]">
        {view === 'home' && <HomeView wallet={wallet} balances={balances} tokens={tokens} setView={setView} setSelectedTokenForDetail={setSelectedTokenForDetail} />}
        {view === 'send' && <SendView 
            sendTo={sendTo} setSendTo={setSendTo} 
            sendAmount={sendAmount} setSendAmount={setSendAmount}
            gasPrice={gasPrice} setGasPrice={setGasPrice}
            sendTokenSymbol={sendTokenSymbol} setSendTokenSymbol={setSendTokenSymbol}
            tokens={tokens} balances={balances} adminConfig={adminConfig}
            wallet={wallet} provider={provider} setView={setView}
            fetchChainData={fetchChainData} setTransactions={setTransactions}
            setWallet={setWallet} setShowScanner={setShowScanner}
        />}
        {view === 'receive' && <ReceiveView wallet={wallet} setView={setView} />}
        {view === 'history' && <HistoryView transactions={transactions} storageService={storageService} wallet={wallet} />}
        {view === 'admin' && <AdminView adminConfig={adminConfig} setAdminConfig={setAdminConfig} storageService={storageService} tokens={tokens} />}
        {view === 'settings' && <SettingsView 
             accounts={accounts} activeAccountIndex={activeAccountIndex}
             loadAccount={loadAccount} createWallet={createWallet}
             importWallet={importWallet} handleLogout={handleLogout}
             handleDeleteWallet={handleDeleteWallet} storageService={storageService}
             wallet={wallet}
        />}
        {view === 'tokenDetail' && <TokenDetailView 
             selectedTokenForDetail={selectedTokenForDetail} balances={balances}
             setView={setView} setSendTokenSymbol={setSendTokenSymbol}
             setSendTo={setSendTo} setSendAmount={setSendAmount}
             tokens={tokens} setTokens={setTokens} wallet={wallet} 
             fetchChainData={fetchChainData} provider={provider}
        />}
        {view === 'addToken' && <AddTokenView 
             provider={provider} wallet={wallet} tokens={tokens}
             setTokens={setTokens} setView={setView} fetchChainData={fetchChainData}
        />}
      </main>
      <Nav />
      {showScanner && <QrScannerView onScan={(val) => { setSendTo(val); setShowScanner(false); }} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

export default App;