
import React, { useState, useEffect, useRef, Component } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { AdminDashboard } from './components/AdminDashboard';
import { InstallPrompt } from './components/InstallPrompt'; // Importar componente
import { AndroidSetup } from './components/AndroidSetup'; // Importar componente Android
import { BingoUserView } from './components/BingoUserView'; // Importar Bingo
import { DriverSubscription } from './components/DriverSubscription'; // Importar Planos
import { RideCalculator } from './components/RideCalculator'; // Importar Calculadora
import { ClientDashboard } from './components/ClientDashboard'; // Importar Dashboard Cliente
import { DriverRideCall } from './components/DriverRideCall'; // Importar Chamada
import { DriverRideScreen } from './components/DriverRideScreen'; // Import Tela de Corrida Ativa
import { WalletScreen } from './components/WalletScreen';
import { InstantStore } from './components/InstantStore';
import { RewardsHub } from './components/RewardsHub';
import { RidePaymentModal } from './components/RidePaymentModal';
import { DriverProfileEditor } from './components/DriverProfileEditor';
import { DriverDashboard } from './components/DriverDashboard';

import {
  registerClientWithPhoto,
  fetchOnlineDrivers,
  subscribeToMessages,
  subscribeToProfiles,
  fetchMyClients,
  registerDriver,
  loginDriver,
  fetchMessages,
  updateDriverStatus, // Import for status toggle
  fetchAdminContact,
  fetchUserProfile, // Nova função importada
  subscribeToBroadcasts, // Importar função de broadcast
  fetchAppSettings, // Import fetchAppSettings
  updateUserLocation, // Import updateUserLocation
  checkUserExists, // Import checkUserExists
  updateUserAvatar, // Import updateUserAvatar
  updateDriverPipStatus, // Import updateDriverPipStatus
  subscribeToRides, // Import rides
  acceptRide, // Import accept
  updateRideStatus, // Import update status
  fetchActiveRide, // Import fetch active
  updateDriverBalanceForCoupon,
  saveRideAddressHistory,
  ensureTestDriver,
  supabase // Import supabase
} from './services/supabaseClient';
import { activatePlan, checkSubscriptionStatus } from './services/paymentService';
import { UserProfile, UserRole, DriverStatus, Message, BroadcastMessage, Ride, AppSettings } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';
import { AdMobService } from './services/adMobService';
import { pushService } from './services/pushService';
import { sendNotification } from './services/notificationSender';

const APP_VERSION = "4.2 (Stable)";

// Se definido em build-time, restringe o app a um único papel
const FORCED_ROLE = (import.meta.env.VITE_APP_ROLE as 'client' | 'driver' | 'admin' | undefined) || undefined;

// Credenciais de teste para auto-login em builds de desenvolvimento
const DEV_AUTO_LOGIN = import.meta.env.VITE_DEV_AUTO_LOGIN === 'true';
const TEST_CLIENT_NAME  = import.meta.env.VITE_TEST_CLIENT_NAME  || 'Cliente Teste';
const TEST_CLIENT_PHONE = import.meta.env.VITE_TEST_CLIENT_PHONE || '(11) 91111-0001';
const TEST_DRIVER_USER  = import.meta.env.VITE_TEST_DRIVER_USER  || 'motorista.teste';
const TEST_DRIVER_PASS  = import.meta.env.VITE_TEST_DRIVER_PASS  || 'Teste@2026';

// ── Error Boundary ──────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error?: Error }
class ErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-gray-900 text-white p-8 text-center">
          <span className="material-icons text-5xl text-red-400 mb-4">error_outline</span>
          <h2 className="text-xl font-bold mb-2">Algo deu errado</h2>
          <p className="text-gray-400 text-sm mb-6">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-whatsapp-green rounded-xl font-bold text-black"
          >
            Recarregar App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Offline Banner ──────────────────────────────────────────────────────────
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return isOnline;
};

interface MarqueeProps {
  text: string;
}

const MarqueeBanner: React.FC<MarqueeProps> = ({ text }) => (
  <div className="bg-gradient-to-r from-purple-900 via-indigo-800 to-purple-900 overflow-hidden relative h-8 flex items-center shadow-md z-30 shrink-0">
    <div className="animate-marquee whitespace-nowrap flex gap-10 items-center w-full">
      <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
        <span className="material-icons text-sm">stars</span>
        {text}
      </span>
      <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
      <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
        <span className="material-icons text-sm">emoji_events</span>
        SORTEIO ATIVO AGORA!
      </span>
      <span className="text-white font-medium text-xs">Clique no ícone do Bingo para ver sua cartela.</span>
      {/* Duplicate for seamless loop */}
      <span className="text-yellow-300 font-bold text-sm flex items-center gap-2 ml-10">
        <span className="material-icons text-sm">stars</span>
        {text}
      </span>
      <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
    </div>
    {/* Shine Effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-1/2 h-full -skew-x-12 animate-shimmer pointer-events-none"></div>
  </div>
);

function AppInner() {
  const isOnline = useOnlineStatus();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeContact, setActiveContact] = useState<UserProfile | null>(null);

  const [contactList, setContactList] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // Login States — se FORCED_ROLE definido, começa no modo correto
  const [loginMode, setLoginMode] = useState<'client' | 'driver' | 'admin'>(
    FORCED_ROLE === 'driver' ? 'driver' : FORCED_ROLE === 'admin' ? 'admin' : 'client'
  );
  const [isRegisteringDriver, setIsRegisteringDriver] = useState(false);
  const [entryName, setEntryName] = useState('');
  const [entryPhone, setEntryPhone] = useState('');
  const [entryAvatarFile, setEntryAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // New Driver Registration States
  const [entryVehicleType, setEntryVehicleType] = useState<'car' | 'motorcycle'>('car');
  const [entryVehicleModel, setEntryVehicleModel] = useState('');
  const [entryVehiclePlate, setEntryVehiclePlate] = useState('');
  const [entryVehicleColor, setEntryVehicleColor] = useState('');

  // Password State
  const [entryPassword, setEntryPassword] = useState('');
  const [showEntryPassword, setShowEntryPassword] = useState(false); // Toggle show registration password
  const [authPassword, setAuthPassword] = useState(''); // Used for Login
  const [showAuthPassword, setShowAuthPassword] = useState(false); // Toggle show login password
  const [isLoading, setIsLoading] = useState(false);

  // Mobile View State
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [showAndroidSetup, setShowAndroidSetup] = useState(false); // Estado do modal Android

  // BINGO STATE
  const [showBingo, setShowBingo] = useState(false);

  // PLANOS STATE
  // CALCULATOR STATE
  const [showCalculator, setShowCalculator] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showStore, setShowStore] = useState(false);

  // DRIVER MENU STATE
  const [showDriverMenu, setShowDriverMenu] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [rideToRate, setRideToRate] = useState<Ride | null>(null); // Avaliação pós-corrida
  const [ratingStars, setRatingStars] = useState(0);
  const [isRideMapMinimized, setIsRideMapMinimized] = useState(false); // Controla se a tela de mapa está minimizada
  const [bannerText, setBannerText] = useState('ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ');
  const [appSettings, setAppSettingsState] = useState<AppSettings | null>(null);

  // REFS para evitar stale closures em subcrições de tempo real
  const activeRideRef = useRef<Ride | null>(null);
  const incomingRideRef = useRef<Ride | null>(null);

  // Sincronizar REFS com States
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  useEffect(() => { incomingRideRef.current = incomingRide; }, [incomingRide]);

  // Carregar dados iniciais (Settings e Corrida Ativa)
  useEffect(() => {
    const init = async () => {
      console.log('[DEBUG] init function starting, currentUser:', currentUser ? currentUser.id : 'null');
      try {
        const settings = await fetchAppSettings();
        console.log('[DEBUG] settings fetched');
        setAppSettingsState(settings);

        if (currentUser) {
          console.log('[DEBUG] Initializing services for user:', currentUser.id);
          const role = currentUser.role === UserRole.CLIENT ? 'client' : 'driver';
          const ride = await fetchActiveRide(currentUser.id, role);
          if (ride) {
            console.log('[DEBUG] Active ride found:', ride.id);
            setActiveRide(ride);
          }

          // Inicializar Push Notifications para todos os usuários
          console.log('[DEBUG] Calling pushService.initialize...');
          await pushService.initialize(currentUser.id);

          // Permissões específicas por papel
          if (currentUser.role === UserRole.DRIVER) {
            console.log('[DEBUG] Driver detected, handles permissions...');
            // Solicitar permissão de notificação (Web API)
            soundService.requestPermission();

            // Solicitar permissões nativas Android (overlay, bateria, etc)
            // Apenas se estiver rodando no Android nativo via Capacitor
            if (window.Android?.requestPermissions) {
              console.log('[DEBUG] Calling native Android permissions for driver...');
              window.Android.requestPermissions();
            }
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error in init function:', error);
      }
    };
    init();

    // Sincronização em tempo real das configurações (Taxas, Banners, etc)
    const settingsSub = supabase
      .channel('global_settings_sync')
      .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
        console.log('[Realtime] App Settings atualizado globalmente:', payload.new);
        setAppSettingsState(payload.new as AppSettings);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsSub);
    };
  }, [currentUser]);

  // Subscrever a corridas (Para Motorista receber chamadas e para ambos verem atualizações)
  useEffect(() => {
    if (!currentUser) return;

    console.log(`[Realtime] Iniciando monitoramento de corridas para ${currentUser.role}...`);

    const sub = subscribeToRides(currentUser.id, currentUser.role === UserRole.CLIENT ? 'client' : 'driver', async (ride) => {
      // LOGICA PARA MOTORISTA (Receber Chamada)
      if (currentUser.role === UserRole.DRIVER) {
        // Corrida buscando motorista (comportamento normal ou direcionado)
        if (ride.status === 'searching' && !activeRideRef.current && (!incomingRideRef.current || incomingRideRef.current.id !== ride.id)) {
          // Se for uma corrida direcionada (tem driver_id preenchido), só eu posso ver
          if (ride.driver_id && ride.driver_id !== currentUser.id) {
            console.log(`[Realtime] Corrida ignorada (direcionada para outro motorista)`);
            return;
          }

          console.log(`[Realtime] Nova corrida pendente detectada!`);
          setIncomingRide(ride);
          soundService.playRingtone();
          if (window.Android?.bringToFront) window.Android.bringToFront();
        }

        // NOVO: Corrida da Central - já vem 'accepted' e atribuída ao motorista
        // Se a corrida está accepted, é para mim, e eu não tenho corrida ativa
        // Mostra a tela de chamada igual corrida normal (com som, vibração, botões)
        if (ride.status === 'accepted' && ride.driver_id === currentUser.id && !activeRideRef.current && !incomingRideRef.current) {
          console.log(`[Realtime] 📞 CENTRAL: Corrida recebida! ID: ${ride.id}`);
          console.log(`[Realtime] 📞 Iniciando som e vibração...`);

          // Marcar como corrida da central para tratamento especial
          const centralRide = {
            ...ride,
            origin_address: `📞 CENTRAL: ${ride.origin_address}`
          };

          // Mostrar tela de chamada
          setIncomingRide(centralRide);

          // IMPORTANTE: Tocar som e vibrar com delay para garantir que a UI atualizou
          setTimeout(() => {
            console.log(`[Realtime] 📞 Tocando ringtone...`);
            soundService.playRingtone();

            // Vibrar via navegador
            if (navigator.vibrate) {
              navigator.vibrate([1000, 500, 1000, 500, 1000]);
            }

            // Trazer app para frente (Android nativo)
            if (window.Android?.bringToFront) {
              console.log(`[Realtime] 📞 Trazendo app para frente...`);
              window.Android.bringToFront();
            }

            // Disparar alerta nativo (som + vibração Android)
            if (window.Android?.triggerNativeAlert) {
              console.log(`[Realtime] 📞 Disparando alerta nativo Android...`);
              window.Android.triggerNativeAlert();
            }
          }, 100);
        }

        // Se a corrida que eu estou fazendo mudar (cancelamento, etc)
        if (activeRideRef.current && ride.id === activeRideRef.current.id) {
          if (ride.status === 'cancelled') {
            alert("O cliente cancelou a corrida.");
            setActiveRide(null);
            soundService.stopRingtone();
          } else {
            // Manter meus próprios dados de motorista que já estão no activeRide
            setActiveRide({ ...ride, driver: currentUser });
          }
        }
      }

      // LOGICA PARA CLIENTE (Ver Aceite, Chegada, etc)
      if (currentUser.role === UserRole.CLIENT) {
        if (ride.status === 'finished' || ride.status === 'cancelled') {
          // Salvar histórico de endereços quando corrida finalizar
          if (ride.status === 'finished' && ride.origin_address) {
            saveRideAddressHistory(currentUser.id, ride.origin_address, ride.destination_address).catch(console.warn);
          }
          // Pedir avaliação ao cliente quando finalizar com motorista
          if (ride.status === 'finished' && ride.driver_id && !ride.rating) {
            setRideToRate({ ...activeRideRef.current, ...ride });
            setRatingStars(0);
          }
          setActiveRide(null);
        } else {
          // Manter dados que já temos (como motorista) e mesclar com o novo status
          setActiveRide(prev => {
            if (!prev) return ride;

            // Se o ID do motorista mudou ou não tínhamos motorista, buscar dados novos
            if (ride.driver_id && (!prev.driver || prev.driver_id !== ride.driver_id)) {
              fetchUserProfile(ride.driver_id).then(driverData => {
                setActiveRide(current => current ? { ...current, ...ride, driver: driverData || undefined } : null);
              });
              return { ...prev, ...ride }; // Retorna temporário enquanto busca
            }

            return { ...prev, ...ride, driver: prev.driver }; // Mescla status novo com motorista atual
          });
        }
      }
    });

    // Polling de segurança (motorista): detecta cancelamento do cliente
    // mesmo se o realtime falhar
    const driverRidePoll = currentUser.role === UserRole.DRIVER ? setInterval(async () => {
      const prev = activeRideRef.current;
      if (!prev) return;
      const fresh = await fetchActiveRide(currentUser.id, 'driver');
      if (!fresh || fresh.id !== prev.id) {
        // Corrida sumiu da lista de ativas = cancelada ou finalizada externamente
        const { data } = await supabase.from('rides').select('status').eq('id', prev.id).maybeSingle();
        if (data?.status === 'cancelled') {
          alert("O cliente cancelou a corrida.");
          soundService.stopRingtone();
          setActiveRide(null);
        }
        return;
      }
      if (fresh.status !== prev.status) {
        console.log(`[RidePoll/Driver] Status: ${prev.status} -> ${fresh.status}`);
        setActiveRide({ ...fresh, driver: currentUser });
      }
    }, 5000) : null;

    return () => {
      console.log(`[Realtime] Encerrando monitoramento de corridas.`);
      sub.unsubscribe();
      if (driverRidePoll) clearInterval(driverRidePoll);
    };
  }, [currentUser?.id, currentUser?.role]); // Fix: Removed activeRideRef dependency to prevent reconnection gaps



  const handleAcceptRide = async () => {
    if (!incomingRide || !currentUser) return;

    // Check if this is a Central dispatch ride (already accepted status)
    const isCentralDispatch = incomingRide.status === 'accepted' && incomingRide.driver_id === currentUser.id;

    if (isCentralDispatch) {
      // Central ride - already accepted, just activate it
      console.log('[Dispatch] Ativando corrida da Central');
      soundService.stopRingtone();
      setActiveRide({ ...incomingRide, driver: currentUser });
      setIncomingRide(null);
    } else {
      // Normal ride - need to accept it
      const ok = await acceptRide(incomingRide.id, currentUser.id);
      if (ok) {
        soundService.stopRingtone();
        setActiveRide({ ...incomingRide, status: 'en_route', driver_id: currentUser.id, driver: currentUser });
        setIncomingRide(null);
      } else {
        alert("Esta corrida já foi aceita por outro motorista.");
        setIncomingRide(null);
        soundService.stopRingtone();
      }
    }
  };

  const handleRejectRide = async () => {
    if (!incomingRide || !currentUser) return;

    console.log(`[Ride] Motorista recusou a corrida ${incomingRide.id}. Buscando outro...`);

    // Call next driver logic
    const { findAndAssignNextDriver: rotate } = await import('./services/supabaseClient');
    await rotate(incomingRide.id, currentUser.id);

    soundService.stopRingtone();
    setIncomingRide(null);
  };


  // Refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<any>(null);

  // Computed Subscription Status
  const subStatus = currentUser?.role === UserRole.DRIVER
    ? checkSubscriptionStatus(currentUser.subscription_expires_at)
    : { isValid: true, daysLeft: 0 };

  const [isAdMobReady, setIsAdMobReady] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false); // PiP State

  // Refs para estabilizar inscrições em tempo real
  const activeContactRef = useRef<UserProfile | null>(null);
  const contactListRef = useRef<UserProfile[]>([]);
  // Refs para estabilizar inscrições em tempo real
  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    contactListRef.current = contactList;
  }, [contactList]);

  // --- Lifecycle ---

  useEffect(() => {
    // Initialize AdMob
    const initAdMob = async () => {
      await AdMobService.initialize();
      setIsAdMobReady(true);
    };
    initAdMob();

    const loadSettings = async () => {
      const settings = await fetchAppSettings();
      if (settings.marquee_text) {
        setBannerText(settings.marquee_text);
      }
    };
    loadSettings();

    // Remove Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.remove();
      }, 500);
    }
  }, []);

  // 1. PERSISTÊNCIA DE DADOS (LOCAL STORAGE) + AUTO-LOGIN de teste
  useEffect(() => {
    const savedUser = localStorage.getItem('chegoja_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        console.log("Login automático via memória do aparelho:", user.username);
        setCurrentUser(user);

        // Revalida o perfil no banco em segundo plano (pega banimento/edição do admin)
        if (user.id && user.role !== UserRole.ADMIN) {
          fetchUserProfile(user.id).then(fresh => {
            if (!fresh) {
              // Conta apagada pelo admin — desloga
              console.warn("Conta não existe mais no servidor. Encerrando sessão.");
              localStorage.removeItem('chegoja_user');
              setCurrentUser(null);
            } else {
              setCurrentUser(fresh);
              localStorage.setItem('chegoja_user', JSON.stringify(fresh));
            }
          }).catch(e => console.warn("Falha ao revalidar sessão:", e));
        }

        if (user.role === UserRole.DRIVER) {
          setTimeout(() => requestDriverPermissions(), 1000);
          if (window.Android?.requestPermissions) {
            window.Android.requestPermissions();
          }
        }
        return;
      } catch (e) {
        console.error("Erro ao restaurar sessão:", e);
        localStorage.removeItem('chegoja_user');
      }
    }

    // Sem sessão salva: auto-login de teste quando DEV_AUTO_LOGIN está ativo
    if (!DEV_AUTO_LOGIN || !FORCED_ROLE) return;

    const devLogin = async () => {
      // Usa estado separado para não bloquear o botão manual
      let user: UserProfile | null = null;
      try {
        if (FORCED_ROLE === 'client') {
          console.log('[DEV] Auto-login como cliente teste...');
          user = await registerClientWithPhoto(TEST_CLIENT_NAME, TEST_CLIENT_PHONE);
        } else if (FORCED_ROLE === 'driver') {
          console.log('[DEV] Auto-login como motorista teste...');
          user = await loginDriver(TEST_DRIVER_USER, TEST_DRIVER_PASS);
          if (!user) {
            user = await ensureTestDriver(TEST_DRIVER_USER, TEST_DRIVER_PASS);
          }
          if (user && window.Android?.requestPermissions) {
            window.Android.requestPermissions();
          }
        }

        if (user) {
          console.log('[DEV] Usuário teste logado:', user.username);
          localStorage.setItem('chegoja_user', JSON.stringify(user));
          setCurrentUser(user);
        } else {
          console.warn('[DEV] Auto-login falhou — preencha os dados manualmente.');
        }
      } catch (e) {
        console.error('[DEV] Erro no auto-login:', e);
      }
    };

    devLogin();
  }, []);

  // 2. CHECK PAYMENT RETURN (Mercado Pago Redirect)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const status = query.get('status');
    const planId = query.get('plan_id');

    if (status === 'approved' && planId && currentUser) {
      const processPayment = async () => {
        setIsLoading(true);
        const success = await activatePlan(currentUser.id, planId);
        if (success) {
          alert("Pagamento aprovado! Seu plano foi ativado.");
          const updatedUser = await loginDriver(currentUser.username, currentUser.password);
          if (updatedUser) {
            setCurrentUser(updatedUser);
            localStorage.setItem('chegoja_user', JSON.stringify(updatedUser));
          }
        } else {
          alert("Houve um problema ao ativar seu plano. Entre em contato com o suporte.");
        }
        window.history.replaceState({}, document.title, "/");
        setIsLoading(false);
      };
      processPayment();
    }
  }, [currentUser]);

  // 3. Wake Lock for Drivers
  useEffect(() => {
    if (currentUser?.role === UserRole.DRIVER) {
      const requestWakeLock = async () => {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            console.log("Wake Lock is active");
          }
        } catch (err) {
          console.warn("Wake Lock request failed:", err);
        }
      };

      requestWakeLock();

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && currentUser?.role === UserRole.DRIVER) {
          requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) {
          wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      };
    }
  }, [currentUser]);

  // 3.4 Reconectar Realtime ao voltar do background (Android mata o websocket)
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        const channels = supabase.getChannels();
        const stale = channels.some(c => c.state !== 'joined');
        if (stale || channels.length === 0) {
          console.log('[Realtime] App voltou ao foco — reconectando canais...');
          supabase.realtime.disconnect();
          supabase.realtime.connect();
          // Re-subscreve os canais existentes
          channels.forEach(c => { if (c.state !== 'joined') c.subscribe(); });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, []);

  // 3.5 PiP Listeners (Native)
  useEffect(() => {
    const handlePipExit = () => {
      console.log("Saiu do PiP");
      setIsPipActive(false); // Update local state
      window.focus();

      if (currentUser?.role === UserRole.DRIVER) {
        updateDriverPipStatus(currentUser.id, false);
      }

      setTimeout(() => {
        soundService.playPipExitSound();
      }, 500);
    };

    const handlePipEnter = () => {
      console.log("Entrou no PiP");
      setIsPipActive(true); // Update local state
      if (currentUser?.role === UserRole.DRIVER) {
        updateDriverPipStatus(currentUser.id, true);
      }
    };

    window.addEventListener('pipExit', handlePipExit);
    window.addEventListener('pipEnter', handlePipEnter);

    return () => {
      window.removeEventListener('pipExit', handlePipExit);
      window.removeEventListener('pipEnter', handlePipEnter);
    };
  }, [currentUser]);

  // 4. Load Contacts
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === UserRole.ADMIN) return;

    if (currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      return;
    }

    const loadContacts = async () => {
      if (currentUser.role === UserRole.CLIENT) {
        const drivers = await fetchOnlineDrivers();
        setContactList(drivers);
      } else if (currentUser.role === UserRole.DRIVER) {
        const clients = await fetchMyClients(currentUser.id);
        setContactList(clients);
      }
    };

    loadContacts();

    const profileSub = subscribeToProfiles(async (payload?: any) => {
      // Refresh current user if it was their profile that changed
      if (payload?.new?.id === currentUser.id) {
        console.log("[Realtime] Atualizando perfil do usuário logado...");
        const updated = await fetchUserProfile(currentUser.id);
        if (updated) {
          setCurrentUser(updated);
          localStorage.setItem('chegoja_user', JSON.stringify(updated));
        }
      }
      loadContacts();
    });

    return () => {
      profileSub.unsubscribe();
    };
  }, [currentUser]);

  // 5a. Carregar Histórico quando mudar o contato
  useEffect(() => {
    if (!currentUser || !activeContact || currentUser.role === UserRole.ADMIN) return;

    const loadHistory = async () => {
      console.log(`[Chat] Carregando histórico com ${activeContact.username}...`);
      const history = await fetchMessages(currentUser.id, activeContact.id);

      setMessages(prev => {
        // Mescla o histórico com mensagens que já podem estar na tela (otimistas)
        // Evita duplicatas usando o ID
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = history.filter(m => !existingIds.has(m.id));
        return [...prev, ...newOnes].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    };
    loadHistory();
  }, [currentUser?.id, activeContact?.id]);

  // 5b. Inscrição ÚNICA e ESTÁVEL para mensagens
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    console.log(`[Realtime] Iniciando inscrição de mensagens para ${currentUser.username}...`);
    const sub = subscribeToMessages(currentUser.id, async (newMsg) => {
      // Usamos REFs para pegar os valores MAIS RECENTES sem disparar re-inscrição
      const currentActive = activeContactRef.current;
      const currentList = contactListRef.current;

      console.log(`[Chat] Nova mensagem recebida:`, newMsg);

      if (newMsg.sender_id !== currentUser.id) {
        // Notificação se o app estiver em background ou sem foco
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          const senderName = currentList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
          soundService.sendNotification(
            `Mensagem de ${senderName}`,
            newMsg.media_type === 'text' ? newMsg.content : '📷 Enviou uma mídia'
          );
        }

        if (currentUser.role === UserRole.DRIVER && currentUser.is_approved) {
          const isIncomingCallAlert = newMsg.content && (
            newMsg.content.includes("Cliente ligando") ||
            newMsg.content.includes("ligando...")
          );

          // LÓGICA DE INTERRUPÇÃO
          if (currentActive && currentActive.id !== newMsg.sender_id) {
            soundService.playReceived();
            setContactList(prev => {
              const exists = prev.some(c => c.id === newMsg.sender_id);
              if (exists) {
                return prev.map(c => c.id === newMsg.sender_id ? { ...c, unread_count: (c.unread_count || 0) + 1 } : c);
              } else {
                fetchUserProfile(newMsg.sender_id).then(profile => {
                  if (profile) setContactList(curr => [{ ...profile, unread_count: 1 }, ...curr]);
                });
                return prev;
              }
            });
            return;
          }

          if (isIncomingCallAlert) soundService.playRingtone();
          else soundService.playMessageAlert();

          if (window.Android?.bringToFront) window.Android.bringToFront();

          let senderProfile = currentList.find(c => c.id === newMsg.sender_id);
          if (!senderProfile) {
            senderProfile = await fetchUserProfile(newMsg.sender_id) || undefined;
            if (senderProfile) setContactList(prev => [senderProfile as UserProfile, ...prev]);
          }

          if (senderProfile && !currentActive) {
            setTimeout(() => {
              setActiveContact(senderProfile!);
              setShowChatOnMobile(true);
            }, 200);
          }
        } else {
          soundService.playReceived();
        }
      }

      // Atualizar a lista de mensagens se for do chat que está ABERTO agora
      if (currentActive && (newMsg.sender_id === currentActive.id || newMsg.receiver_id === currentActive.id)) {
        console.log(`[Chat] Adicionando mensagem ao chat ativo.`);
        setMessages(prev => {
          const index = prev.findIndex(m => m.id === newMsg.id);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = newMsg;
            return updated;
          }
          return [...prev, newMsg];
        });
      }
    });

    return () => {
      console.log(`[Realtime] Encerrando inscrição de mensagens.`);
      sub.unsubscribe();
    };
  }, [currentUser?.id]); // APENAS depende do ID do usuário logado


  // 6. Broadcast Listener
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    const handleBroadcast = (broadcast: BroadcastMessage) => {
      if (broadcast.target_role === 'all' || broadcast.target_role === currentUser.role) {

        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          soundService.sendNotification(broadcast.title, broadcast.message);
        }

        if (currentUser.role === UserRole.DRIVER) {
          soundService.playRingtone();
          setTimeout(() => soundService.stopRingtone(), 5000);
        } else {
          soundService.playReceived();
        }

        alert(`[Notificação do Admin]\n${broadcast.title}\n\n${broadcast.message}`);
      }
    };

    const sub = subscribeToBroadcasts(handleBroadcast);

    return () => {
      sub.unsubscribe();
    };

  }, [currentUser]);

  // 7. Pending Driver Logic: Auto-select Admin Contact (MOVED TO TOP LEVEL)
  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false && !activeContact) {
      fetchAdminContact().then(admin => {
        if (admin) setActiveContact(admin);
      });
    }
  }, [currentUser, activeContact]);

  // 8. Pending Driver Logic: Realtime Self-Approval Listener (MOVED TO TOP LEVEL)
  useEffect(() => {
    let sub: any;
    if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      console.log("Monitorando aprovação do motorista...");
      sub = subscribeToProfiles(async () => {
        if (currentUser) {
          const me = await loginDriver(currentUser.username, currentUser.password || undefined);
          if (me && me.is_approved) {
            console.log("Motorista aprovado! Atualizando tela...");
            setCurrentUser(me);
            localStorage.setItem('chegoja_user', JSON.stringify(me));
            window.location.reload();
          }
        }
      });
    }
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [currentUser]);

  const lastGpsUpdate = useRef<number>(0);

  // Subscrever ao movimento do MOTORISTA (para o Cliente ver no mapa a cada 35 segundos)
  useEffect(() => {
    if (currentUser?.role === UserRole.CLIENT && activeRide?.driver_id && activeRide.status !== 'searching') {
      console.log("[GPS] Iniciando rastreamento econômico do motorista (35s)...");

      const updateLocation = async () => {
        // Busca apenas lat/lng (não o perfil inteiro) para economizar banco/banda
        const { data } = await supabase
          .from('profiles')
          .select('lat,lng')
          .eq('id', activeRide.driver_id!)
          .maybeSingle();
        if (data) {
          setActiveRide(prev => prev?.driver
            ? { ...prev, driver: { ...prev.driver, lat: data.lat, lng: data.lng } }
            : prev);
        }
      };

      // Busca imediata
      updateLocation();

      // Intervalo de 35 segundos para economizar API
      const interval = setInterval(updateLocation, 35000);

      return () => clearInterval(interval);
    }
  }, [currentUser, activeRide?.driver_id, activeRide?.status === 'searching']);

  // 9. Continuous Location Tracking (GPS) - Agora com throttle para economizar banco
  useEffect(() => {
    if (!currentUser) return;

    let watchId: number | null = null;

    if ('geolocation' in navigator) {
      console.log("Iniciando rastreamento de localização com economia...");
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const now = Date.now();

          // Throttle: Só envia pro banco a cada 10 segundos
          if (now - lastGpsUpdate.current > 10000) {
            updateUserLocation(currentUser.id, latitude, longitude);
            lastGpsUpdate.current = now;
          }
        },
        (error) => {
          console.warn("Erro no rastreamento de localização:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        }
      );
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUser?.id]);

  // --- Handlers ---

  const handleUpdateProfileAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentUser) {
      const confirmUpdate = window.confirm("Deseja alterar sua foto de perfil?");
      if (!confirmUpdate) return;

      const newUrl = await updateUserAvatar(currentUser.id, file);
      if (newUrl) {
        const updated = { ...currentUser, avatar_url: newUrl };
        setCurrentUser(updated);
        localStorage.setItem('chegoja_user', JSON.stringify(updated));
        alert("Foto de perfil atualizada com sucesso!");
      } else {
        alert("Erro ao atualizar foto. Tente novamente.");
      }
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEntryAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const requestDriverPermissions = async () => {
    console.log("Iniciando solicitação de permissões completas do motorista...");
    try {
      await soundService.requestPermission();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log("Permissão Microfone: OK");
      } catch (err) {
        console.warn("Permissão de Microfone negada:", err);
      }

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => console.log("GPS Ativo e Permitido", pos.coords),
          (err) => {
            console.warn("GPS Negado ou Erro", err);
          },
          { enableHighAccuracy: true }
        );
      }

    } catch (e) {
      console.warn("Erro geral ao solicitar permissões:", e);
    }
  };

  // Função para ativar o modo PiP (Picture-in-Picture) no Android
  const handleEnterPip = () => {
    if (window.Android && window.Android.enterPipMode) {
      window.Android.enterPipMode();
    } else {
      alert("O modo PiP (janela flutuante) só está disponível no aplicativo Android nativo.");
    }
  };

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    let formatted = numbers;
    if (numbers.length > 0) {
      formatted = `(${numbers.slice(0, 2)}`;
      if (numbers.length > 2) {
        formatted += `) ${numbers.slice(2, 7)}`;
      }
      if (numbers.length > 7) {
        formatted += `-${numbers.slice(7, 11)}`;
      }
    }
    return formatted;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEntryPhone(formatPhoneNumber(e.target.value));
  };

  const handleCheckUser = async (field: 'username' | 'phone', value: string) => {
    if (!value) return;
    // Only check if we are in registration mode (or client login which is registration-like)
    if (loginMode === 'client' || (loginMode === 'driver' && isRegisteringDriver)) {
      // For phone, we might want to check the clean version if that's how it's stored, 
      // but registerClientWithPhoto uses the value passed. 
      // If we format it, we should probably store it formatted or clean it before sending.
      // Let's assume for now we check the value as is (formatted) if that's what we send, 
      // OR we clean it. 
      // Ideally we should clean it before saving.
      // Let's check the exact value.
      const exists = await checkUserExists(field, value);
      if (exists) {
        if (loginMode === 'client' && field === 'phone') {
          // Clients are auto-logged in if exists, so maybe just warn?
          // User said: "sempre verifique se tem outro igual se tiver avise o cliente para tentar outro"
          alert("Este telefone já possui cadastro. Se for você, o login será feito automaticamente.");
        } else {
          alert(`Este ${field === 'username' ? 'nome de usuário' : 'telefone'} já está em uso. Por favor, tente outro.`);
        }
      }
    }
  };

  const handleLogin = async () => {
    if (!entryName.trim()) {
      alert('Por favor, preencha seu nome.');
      return;
    }
    setIsLoading(true);

    try {
      let user: UserProfile | null = null;

      console.log(`[Login] Tentando entrar como ${loginMode}. Nome: ${entryName}, Telefone: ${entryPhone}`);

      if (loginMode === 'client') {
        if (!entryPhone.trim()) {
          alert("Por favor, insira seu telefone.");
          setIsLoading(false);
          return;
        }
        try {
          console.log("[Login] Chamando registerClientWithPhoto...");
          user = await registerClientWithPhoto(entryName, entryPhone, entryAvatarFile || undefined);
          console.log("[Login] Resposta do registerClientWithPhoto:", user);
        } catch (err: any) {
          console.error("[Login] Erro no login do cliente:", err);
          alert("Erro ao entrar: " + (err.message || "Verifique sua conexão."));
          setIsLoading(false);
          return;
        }
      }
      else if (loginMode === 'driver') {
        if (isRegisteringDriver) {
          if (!entryVehicleModel || !entryVehiclePlate || !entryPassword) {
            alert("Por favor, preencha todos os campos obrigatórios, incluindo a senha.");
            setIsLoading(false);
            return;
          }
          const newUser = await registerDriver(
            entryName,
            entryPassword,
            entryVehicleType,
            entryVehicleModel,
            entryVehiclePlate,
            entryVehicleColor,
            entryAvatarFile || undefined
          );
          if (newUser) {
            console.log('Driver registration success:', newUser.id);
            user = newUser;
            // Chamar permissões imediatamente após registro bem sucedido se for Android
            if (window.Android?.requestPermissions) {
              window.Android.requestPermissions();
            }
          }
        } else {
          if (!authPassword) {
            alert("Por favor, digite sua senha.");
            setIsLoading(false);
            return;
          }

          const loggedInUser = await loginDriver(entryName, authPassword);

          if (!loggedInUser) {
            alert(`Usuário ou senha incorretos. Verifique suas credenciais.`);
            setIsLoading(false);
            return;
          }
          console.log('Driver Login Success:', loggedInUser.username);
          user = loggedInUser;
          // Chamar permissões imediatamente após login bem sucedido se for Android
          if (window.Android?.requestPermissions) {
            window.Android.requestPermissions();
          }
        }
      }
      else if (loginMode === 'admin') {
        // Validação no servidor (bcrypt) — sem credenciais no código
        const { loginUser } = await import('./services/supabaseClient');
        const admin = await loginUser(entryName, authPassword, UserRole.ADMIN);
        if (admin) {
          user = admin;
        } else {
          alert("Credenciais de administrador incorretas.");
        }
      }

      if (user) {
        localStorage.setItem('chegoja_user', JSON.stringify(user));
        setCurrentUser(user);

        if (user.role === UserRole.DRIVER) {
          requestDriverPermissions();
        }

        // Sincronizar corrida ativa
        if (user.role !== UserRole.ADMIN) {
          const active = await fetchActiveRide(user.id, user.role as any);
          if (active && user.role === UserRole.DRIVER && active.status === 'searching') {
            setIncomingRide(active);
          }
        }
      }

    } catch (e) {
      console.error("Login Error", e);
      alert("Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut().catch(console.warn);
    localStorage.removeItem('chegoja_user');
    setCurrentUser(null);
    setContactList([]);
    setMessages([]);
    setActiveContact(null);
  };

  const handleContactSelect = (contact: UserProfile) => {
    if (currentUser?.role === UserRole.ADMIN) return;

    // Reset unread count when opening chat
    setContactList(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));

    setActiveContact(contact);
    setMessages([]);
    setShowChatOnMobile(true);
  };

  const handleBackToList = () => {
    setShowChatOnMobile(false);
    setActiveContact(null);
  };

  const handleStatusToggle = async () => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER || !currentUser.is_approved) {
      alert("Você precisa ser aprovado pelo admin para ficar online.");
      return;
    }

    if (!subStatus.isValid) {
      alert("Sua assinatura venceu! Renove para ficar online.");
      setShowPlans(true);
      return;
    }

    const newStatus = currentUser.status === DriverStatus.AVAILABLE ? DriverStatus.BUSY : DriverStatus.AVAILABLE;

    const updatedUser = { ...currentUser, status: newStatus };
    setCurrentUser(updatedUser);
    localStorage.setItem('chegoja_user', JSON.stringify(updatedUser));

    await updateDriverStatus(currentUser.id, newStatus);
  };

  const resetForm = () => {
    setEntryName('');
    setEntryPhone('');
    setAvatarPreview(null);
    setEntryAvatarFile(null);
    setAuthPassword('');
    setEntryPassword('');
    setEntryVehicleModel('');
    setEntryVehiclePlate('');
    setEntryVehicleColor('');
  };

  // --- Render: Admin Dashboard (Dedicated Page) ---
  if (currentUser && currentUser.role === UserRole.ADMIN) {
    return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // --- Render: Hard Block for Expired Drivers ---
  // Se o motorista está aprovado MAS a assinatura venceu, bloqueia tudo
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved && !subStatus.isValid) {
    return (
      <DriverSubscription
        currentUser={currentUser}
        onClose={() => { }}
        isBlocked={true}
      />
    );
  }

  // --- Render: Pending Approval Screen (Drivers) WITH CHAT ---
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
    return (
      <div className="flex h-[100dvh] w-full flex-col bg-gray-100 relative overflow-hidden">
        {/* AdMob Banner Removed */}
        <InstallPrompt />
        {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}

        {/* Header de Aviso */}
        <div className="bg-yellow-500 p-3 text-white shadow-md z-20 shrink-0">
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                <span className="material-icons text-white">hourglass_empty</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm">Cadastro Enviado!</span>
                <span className="text-xs opacity-90">Aguardando liberação do Admin.</span>
              </div>
            </div>
            <button onClick={handleLogout} className="text-white/80 hover:text-white">
              <span className="material-icons">logout</span>
            </button>
          </div>

          {/* BOTÃO GRANDE PARA ATIVAR PERMISSÕES */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={requestDriverPermissions}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 animate-pulse border-2 border-white/30"
            >
              <span className="material-icons">notifications_active</span>
              ATIVAR PERMISSÕES
            </button>

            {/* BOTÃO PARA APP NATIVO */}
            <button
              onClick={() => setShowAndroidSetup(true)}
              className="w-full bg-green-700 hover:bg-green-800 active:scale-95 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 border-2 border-green-500/50"
            >
              <span className="material-icons">android</span>
              BAIXAR APP NATIVO
            </button>
          </div>
          <p className="text-[10px] text-white/80 text-center mt-1">
            Fale com o suporte abaixo para agilizar sua aprovação.
          </p>
        </div>

        {/* Chat Area (Preenche o resto da tela) */}
        <div className="flex-1 relative bg-whatsapp-panel">
          {activeContact ? (
            <ChatWindow
              currentUser={currentUser}
              chatPartner={activeContact}
              messages={messages}
              onSendMessage={(msg) => setMessages(p => [...p, msg])}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <span className="animate-spin mr-2 material-icons">sync</span> Conectando ao suporte...
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Render: Login Screen ---
  if (!currentUser) {
    return (
      <div className="h-[100dvh] w-full bg-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
        {!isOnline && (
          <div className="absolute top-0 left-0 right-0 z-[999] bg-red-600 text-white text-center text-xs font-bold py-1.5 flex items-center justify-center gap-2">
            <span className="material-icons text-sm">wifi_off</span>
            Sem conexão — verifique sua internet
          </div>
        )}
        {/* AdMob Banner Removed */}

        {/* PWA Prompt Component - Always active on login screen */}
        <InstallPrompt />

        {/* Top Right Controls — ocultos quando o app tem papel fixo */}
        {!FORCED_ROLE && (
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
            <button
              onClick={() => { setLoginMode('driver'); setIsRegisteringDriver(false); resetForm(); }}
              className={`p-3 rounded-full transition shadow-lg ${loginMode === 'driver' ? 'bg-whatsapp-green text-white transform scale-110' : 'bg-white text-gray-400'}`}
              title="Acesso Motorista"
            >
              <span className="material-icons">directions_car</span>
            </button>

            <button
              onClick={() => { setLoginMode('admin'); setEntryName(''); setAuthPassword(''); }}
              className={`p-3 rounded-full transition shadow-lg ${loginMode === 'admin' ? 'bg-blue-600 text-white transform scale-110' : 'bg-white text-gray-400'}`}
              title="Acesso Admin"
            >
              <span className="material-icons">admin_panel_settings</span>
            </button>

            {loginMode !== 'client' && (
              <button
                onClick={() => { setLoginMode('client'); resetForm(); }}
                className="p-3 bg-white text-gray-400 shadow-lg rounded-full hover:text-whatsapp-green"
                title="Voltar para Cliente"
              >
                <span className="material-icons">person</span>
              </button>
            )}
          </div>
        )}

        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-[92%] max-w-md text-center z-10 max-h-[92vh] overflow-y-auto custom-scrollbar">
          <div className="mb-6 flex flex-col items-center">
            {/* Avatar Picker for Client OR Driver Registration */}
            {(loginMode === 'client' || (loginMode === 'driver' && isRegisteringDriver)) ? (
              <div className="relative cursor-pointer group" onClick={() => avatarInputRef.current?.click()}>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-200 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-whatsapp-green p-2 rounded-full text-white shadow-sm transform scale-75">
                  <span className="material-icons text-sm">edit</span>
                </div>
                <input
                  type="file"
                  ref={avatarInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </div>
            ) : (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${loginMode === 'admin' ? 'bg-blue-600' : 'bg-whatsapp-green'}`}>
                {loginMode === 'driver' ? (
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="material-icons text-4xl text-white">security</span>
                )}
              </div>
            )}
          </div>

          <h2 className="text-2xl font-bold text-whatsapp-dark mb-2">
            {FORCED_ROLE === 'driver'
              ? (isRegisteringDriver ? 'Novo Motorista' : 'ChegoJá Motorista')
              : FORCED_ROLE === 'client'
                ? 'ChegoJá Cliente'
                : loginMode === 'client' ? 'Bem-vindo(a)' : loginMode === 'driver' ? (isRegisteringDriver ? 'Novo Motorista' : 'Login Motorista') : 'Área Administrativa'}
          </h2>
          <p className="text-gray-500 mb-6 text-sm">
            {loginMode === 'client'
              ? 'Preencha seus dados para começar.'
              : loginMode === 'driver'
                ? (isRegisteringDriver ? 'Complete seu cadastro para análise.' : 'Entre para trabalhar.')
                : 'Acesso restrito.'}
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder={loginMode === 'client' ? "Seu Nome Completo" : "Nome de Usuário"}
              value={entryName}
              onChange={e => setEntryName(e.target.value)}
              onBlur={() => handleCheckUser('username', entryName)}
              maxLength={20}
              disabled={isLoading}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
            />

            {loginMode === 'client' && (
              <input
                type="tel"
                placeholder="Seu Telefone (Whatsapp)"
                value={entryPhone}
                onChange={handlePhoneChange}
                onBlur={() => handleCheckUser('phone', entryPhone)}
                maxLength={15}
                disabled={isLoading}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
              />
            )}

            {loginMode === 'driver' && isRegisteringDriver && (
              <>
                <div className="relative">
                  <input
                    type={showEntryPassword ? 'text' : 'password'}
                    placeholder="Crie uma Senha (Letras e Números)"
                    value={entryPassword}
                    onChange={e => setEntryPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEntryPassword(!showEntryPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-whatsapp-green"
                  >
                    <span className="material-icons">{showEntryPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setEntryVehicleType('car')}
                    className={`flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'car' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-white text-gray-500 border-gray-300'}`}
                  >
                    <span className="material-icons text-sm">directions_car</span>
                    Carro
                  </button>
                  <button
                    onClick={() => setEntryVehicleType('motorcycle')}
                    className={`flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'motorcycle' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-white text-gray-500 border-gray-300'}`}
                  >
                    <span className="material-icons text-sm">two_wheeler</span>
                    Moto
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Modelo (Ex: Civic)"
                    value={entryVehicleModel}
                    onChange={e => setEntryVehicleModel(e.target.value)}
                    className="col-span-2 p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                  />
                  <input
                    type="text"
                    placeholder="Placa"
                    value={entryVehiclePlate}
                    onChange={e => setEntryVehiclePlate(e.target.value)}
                    className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm uppercase"
                  />
                  <input
                    type="text"
                    placeholder="Cor"
                    value={entryVehicleColor}
                    onChange={e => setEntryVehicleColor(e.target.value)}
                    className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                  />
                </div>
              </>
            )}

            {(loginMode === 'driver' && !isRegisteringDriver) || loginMode === 'admin' ? (
              <div className="relative">
                <input
                  type={showAuthPassword ? 'text' : 'password'}
                  placeholder="Sua Senha"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  disabled={isLoading}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword(!showAuthPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-whatsapp-green"
                >
                  <span className="material-icons">{showAuthPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            ) : null}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className={`w-full text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center active:scale-95 ${loginMode === 'admin' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-whatsapp-green hover:bg-whatsapp-outgoing'
                } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                loginMode === 'client' ? 'INICIAR ATENDIMENTO' : (isRegisteringDriver ? 'FINALIZAR CADASTRO' : 'ENTRAR')
              )}
            </button>
          </div>

          {loginMode === 'driver' && (
            <div className="mt-4 text-sm">
              <button
                onClick={() => { setIsRegisteringDriver(!isRegisteringDriver); resetForm(); }}
                className="text-whatsapp-green hover:underline font-medium p-2"
                disabled={isLoading}
              >
                {isRegisteringDriver ? 'Já tenho conta? Fazer Login' : 'Não tem conta? Cadastre-se como Motorista'}
              </button>
            </div>
          )}
        </div>

        {/* Version Indicator */}
        <div className="absolute bottom-2 text-xs text-gray-400 opacity-50 font-mono">
          {APP_NAME} {APP_VERSION}
        </div>
      </div>
    );
  }

  // --- Render: PiP Mode (Simplified) ---
  if (isPipActive) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-black">
        <div className="w-[90vw] h-[90vw] max-w-[200px] max-h-[200px] rounded-full overflow-hidden border-4 border-whatsapp-green shadow-xl animate-pulse bg-white flex items-center justify-center">
          <img src="/logo.png" alt="ChegoJá" className="w-[85%] h-[85%] object-contain" />
        </div>
      </div>
    );
  }

  // --- Render: Main App (Client/Driver Chat) ---
  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-app-bg relative">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[999] bg-red-600 text-white text-center text-xs font-bold py-1.5 flex items-center justify-center gap-2 animate-pulse">
          <span className="material-icons text-sm">wifi_off</span>
          Sem conexão — verifique sua internet
        </div>
      )}
      {/* AdMob Banner Removed */}
      <MarqueeBanner text={bannerText} />

      <div className="flex-1 flex overflow-hidden relative">
        <InstallPrompt />
        {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}




        {/* DRIVER ACTIVE RIDE SCREEN (Só mostra se não estiver minimizado) */}
        {activeRide && currentUser?.role === UserRole.DRIVER && !activeContact && !isRideMapMinimized && (
          <DriverRideScreen
            ride={activeRide}
            driver={currentUser}
            settings={appSettings}
            onStatusUpdate={async (statusInput) => {
              const newStatus = statusInput as any; // Allow custom statuses

              // 1. Handle Local ACK (Driver clicked "Close" on Success Screen)
              if (newStatus === 'finished_ack') {
                await updateDriverStatus(currentUser.id, DriverStatus.AVAILABLE);
                setActiveRide(null);
                setIsRideMapMinimized(false);
                return;
              }

              // 2. Handle Normal DB Updates
              const ok = await updateRideStatus(activeRide.id, newStatus);
              if (ok) {
                // Notificar Cliente sobre mudanças importantes
                if (newStatus === 'arrived' || newStatus === 'waiting_payment') {
                  const title = newStatus === 'arrived' ? "Motorista Chegou! 🚗" : "Corrida Finalizada! 🏁";
                  const body = newStatus === 'arrived' ? "Seu motorista parceiro chegou ao local de partida." : "O motorista solicitou o pagamento da corrida.";

                  sendNotification(
                    title,
                    body,
                    'user',
                    {
                      targetUserId: activeRide.client_id,
                      sound: 'ubb',
                      data: {
                        type: 'status_update',
                        ride_id: activeRide.id,
                        status: newStatus
                      }
                    }
                  ).catch(err => console.error("[Push] Erro ao notificar cliente:", err));
                }

                if (newStatus === 'cancelled') {
                  // Cancelled -> Close immediately
                  await updateDriverStatus(currentUser.id, DriverStatus.AVAILABLE);
                  setActiveRide(null);
                  setIsRideMapMinimized(false);
                } else if (newStatus === 'finished') {
                  // Finished -> Keep open to show Success Screen
                  // Se finalizar com cupom, creditar motorista
                  if (activeRide.coupon_id) {
                    const discount = activeRide.discount_amount || 0;
                    if (discount > 0) {
                      await updateDriverBalanceForCoupon(currentUser.id, discount, activeRide.id);
                      alert(`Bônus de R$ ${discount.toFixed(2)} creditado em sua carteira!`);
                    }
                  }
                  // Update local state to show 'Success' UI in DriverRideScreen
                  setActiveRide({ ...activeRide, status: 'finished' });
                } else {
                  setActiveRide({ ...activeRide, status: newStatus });
                }
              }
            }}
            onChat={() => {
              // Não fecha mais o mapa, o chat é tratado internamente pelo popup
            }}
            onMinimize={() => setIsRideMapMinimized(true)}
          />
        )}



        {/* BOTÃO FLUTUANTE PARA VOLTAR AO MAPA (Quando minimizado) */}
        {activeRide && currentUser?.role === UserRole.DRIVER && isRideMapMinimized && (
          <button
            onClick={() => setIsRideMapMinimized(false)}
            className="fixed bottom-24 right-4 z-[90] bg-whatsapp-green text-black p-4 rounded-2xl shadow-2xl animate-bounce flex items-center gap-2 font-bold"
          >
            <span className="material-icons">navigation</span>
            <span className="text-sm">Voltar ao Mapa</span>
          </button>
        )}

        {/* DRIVER RIDE CALL OVERLAY */}
        {incomingRide && (
          <DriverRideCall
            ride={incomingRide}
            onAccept={handleAcceptRide}
            onReject={handleRejectRide}
          />
        )}

        {/* RATING MODAL (Cliente avalia o motorista pós-corrida) */}
        {rideToRate && currentUser?.role === UserRole.CLIENT && (
          <div className="absolute inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-[#1c272d] rounded-[32px] p-8 w-full max-w-sm border border-white/10 shadow-2xl text-center">
              <img
                src={rideToRate.driver?.avatar_url || '/logo.png'}
                className="w-20 h-20 rounded-full object-cover border-4 border-whatsapp-green mx-auto mb-4"
              />
              <h2 className="text-white font-black text-xl mb-1">Como foi sua viagem?</h2>
              <p className="text-gray-400 text-sm mb-6">
                Avalie {rideToRate.driver?.username?.split(' ')[0] || 'o motorista'}
              </p>

              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRatingStars(star)}
                    className="active:scale-90 transition-transform"
                  >
                    <span className={`material-icons text-4xl ${star <= ratingStars ? 'text-yellow-400' : 'text-gray-600'}`}>
                      star
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setRideToRate(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition"
                >
                  Pular
                </button>
                <button
                  disabled={ratingStars === 0}
                  onClick={async () => {
                    await supabase.from('rides')
                      .update({ rating: ratingStars })
                      .eq('id', rideToRate.id);
                    setRideToRate(null);
                  }}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${ratingStars > 0
                    ? 'bg-whatsapp-green text-white hover:bg-[#00a884]'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BINGO OVERLAY */}
        {showBingo && currentUser && (
          <div className="absolute inset-0 z-[100] bg-black/90 animate-fade-in flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <BingoUserView currentUser={currentUser} onClose={() => setShowBingo(false)} />
            </div>
          </div>
        )}

        {/* PLANS OVERLAY */}
        {showPlans && currentUser && (
          <div className="absolute inset-0 z-[100] bg-black/90 animate-fade-in flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <DriverSubscription currentUser={currentUser} onClose={() => setShowPlans(false)} />
            </div>
          </div>
        )}

        {/* CALCULATOR OVERLAY */}
        {showCalculator && currentUser && (
          <RideCalculator currentUser={currentUser} onClose={() => setShowCalculator(false)} />
        )}

        {/* DRIVER PROFILE OVERLAY */}
        {showDriverProfile && currentUser && currentUser.role === UserRole.DRIVER && (
          <DriverProfileEditor
            currentUser={currentUser}
            onClose={() => setShowDriverProfile(false)}
            onUpdate={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
          />
        )}

        {/* MAIN VIEW LOGIC */}
        {currentUser?.role === UserRole.CLIENT && !activeContact && !showBingo && !showPlans && !showCalculator ? (
          <ClientDashboard
            currentUser={currentUser}
            onStartChat={(driver) => {
              setActiveContact(driver);
              setShowChatOnMobile(true);
            }}
            onOpenBingo={() => setShowBingo(true)}
            onOpenWallet={() => setShowWallet(true)}
            activeRide={activeRide}
            setActiveRide={setActiveRide}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
            onLogout={handleLogout}
          />
        ) : currentUser?.role === UserRole.DRIVER && !activeContact && !showBingo && !showPlans && !showCalculator ? (
          <DriverDashboard
            currentUser={currentUser}
            onOpenProfile={() => setShowDriverProfile(true)}
            onOpenPlans={() => setShowPlans(true)}
            onOpenBingo={() => setShowBingo(true)}
            onOpenCalculator={() => setShowCalculator(true)}
            onLogout={handleLogout}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
          />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div className={`w-full md:w-[400px] bg-whatsapp-dark border-r border-gray-800 flex flex-col relative ${showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
              {/* My Profile Header */}
              <div className="h-16 px-4 flex items-center justify-between shrink-0 bg-whatsapp-panel shadow-sm z-10">
                <div className="flex items-center gap-3">
                  <div className="relative group cursor-pointer" onClick={() => profileAvatarRef.current?.click()} title="Alterar foto">
                    <img src={currentUser.avatar_url || 'https://via.placeholder.com/40'} alt="Me" className="w-10 h-10 rounded-full border border-gray-600 object-cover group-hover:opacity-80 transition" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 rounded-full transition">
                      <span className="material-icons text-white text-xs">edit</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={profileAvatarRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleUpdateProfileAvatar}
                  />
                  <div className="flex flex-col">
                    <p className="text-gray-200 font-medium truncate max-w-[120px] sm:max-w-[150px] leading-tight">{currentUser.username}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                        {currentUser.role === 'driver' ? 'Motorista' : 'Cliente'}
                      </span>
                      {currentUser.role === 'client' && (
                        <div className="flex items-center gap-1 bg-yellow-400/10 px-1.5 py-0.5 rounded-full border border-yellow-400/20">
                          <span className="material-icons text-yellow-500 text-[10px]">stars</span>
                          <span className="text-yellow-400 text-[10px] font-black">{currentUser.wallet_coins || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 text-gray-400 items-center relative">
                  {currentUser.role === UserRole.DRIVER ? (
                    <>
                      {/* Status Toggle Button - ALWAYS VISIBLE */}
                      <button
                        onClick={handleStatusToggle}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 shadow-sm ${!currentUser.is_approved ? 'bg-gray-500 cursor-not-allowed' :
                          currentUser.status === DriverStatus.AVAILABLE
                            ? 'bg-green-600 text-white hover:bg-green-500 ring-2 ring-green-600/30'
                            : 'bg-red-600 text-white hover:bg-red-500 ring-2 ring-red-600/30'
                          }`}
                        title={!currentUser.is_approved ? "Aguardando Aprovação" : "Toque para mudar status"}
                        disabled={!currentUser.is_approved}
                      >
                        <span className="material-icons text-sm">{currentUser.status === DriverStatus.AVAILABLE ? 'lock_open' : 'lock'}</span>
                        {currentUser.status === DriverStatus.AVAILABLE ? 'LIVRE' : 'OCUPADO'}
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setShowDriverMenu(!showDriverMenu)}
                          className="p-2 rounded-full hover:bg-gray-700/50 active:scale-90 transition text-gray-300"
                        >
                          <span className="material-icons">grid_view</span>
                          {subStatus.daysLeft <= 5 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-whatsapp-panel"></span>
                          )}
                        </button>

                        {showDriverMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDriverMenu(false)}></div>
                            <div className="absolute right-0 top-12 bg-[#2a3942] rounded-xl shadow-2xl border border-gray-700 p-2 w-48 z-50 flex flex-col gap-1 animate-fade-in">
                              <button
                                onClick={() => { setShowCalculator(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-blue-400">calculate</span>
                                Simular Corrida
                              </button>
                              <button
                                onClick={() => { setShowBingo(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-purple-400">casino</span>
                                Bingo
                              </button>
                              <button
                                onClick={() => { setShowPlans(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm w-full text-left"
                              >
                                <span className="material-icons text-yellow-400">monetization_on</span>
                                <div className="flex flex-col">
                                  <span>Meus Planos</span>
                                  <span className={`text-[10px] font-bold ${subStatus.daysLeft > 5 ? 'text-green-400' : 'text-red-400'}`}>
                                    {subStatus.daysLeft} dias restantes
                                  </span>
                                </div>
                              </button>
                              <button
                                onClick={() => { soundService.requestPermission(); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-blue-400">notifications_active</span>
                                Ativar Sons
                              </button>
                              <button
                                onClick={() => { handleEnterPip(); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-indigo-400">picture_in_picture_alt</span>
                                Modo Flutuante (PiP)
                              </button>
                              <button
                                onClick={() => { setShowDriverProfile(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-teal-400">account_balance_wallet</span>
                                <div className="flex flex-col">
                                  <span>Meus Dados / PIX</span>
                                  <span className="text-[10px] font-bold text-green-400">R$ {(currentUser.financial_balance || 0).toFixed(2)}</span>
                                </div>
                              </button>
                              <div className="h-[1px] bg-gray-600 my-1"></div>
                              <button
                                onClick={handleLogout}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-red-900/30 rounded-lg transition text-red-400 text-sm"
                              >
                                <span className="material-icons">logout</span>
                                Sair
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowCalculator(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full transition flex items-center justify-center shadow-lg"
                        title="Simular Corrida"
                      >
                        <span className="material-icons text-sm">calculate</span>
                      </button>
                      <button
                        onClick={() => setShowBingo(true)}
                        className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white p-2 rounded-full transition flex items-center justify-center animate-bounce shadow-lg ring-2 ring-yellow-400 ring-offset-2 ring-offset-whatsapp-panel"
                        title="Jogar Bingo - Ganhe Prêmios!"
                      >
                        <span className="material-icons text-sm font-bold drop-shadow-md">emoji_events</span>
                      </button>
                      <button
                        onClick={() => setShowWallet(true)}
                        className="bg-green-600 hover:bg-green-500 text-white p-2 rounded-full transition flex items-center justify-center shadow-lg"
                        title="Minha Carteira"
                      >
                        <span className="material-icons text-sm">account_balance_wallet</span>
                      </button>
                      <button className="p-2 rounded-full hover:bg-red-900/30 hover:text-red-400 transition" title="Sair" onClick={handleLogout}><span className="material-icons">logout</span></button>
                    </>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <div className="p-1 sm:p-2 bg-whatsapp-dark border-b border-gray-800/50">
                <div className="bg-whatsapp-panel rounded-lg flex items-center px-3 sm:px-4 py-1.5 sm:py-2 transition focus-within:bg-[#2a3942]">
                  <span className="material-icons text-gray-400 text-sm">search</span>
                  <input
                    type="text"
                    placeholder={currentUser.role === 'client' ? "Buscar motorista..." : "Buscar cliente..."}
                    className="bg-transparent text-gray-200 placeholder-gray-500 ml-4 w-full text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {contactList.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => handleContactSelect(contact)}
                    className={`flex items-center px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer hover:bg-whatsapp-panel border-b border-gray-800 transition active:bg-[#2a3942] ${activeContact?.id === contact.id ? 'bg-whatsapp-panel' : ''}`}
                  >
                    <div className="relative w-12 h-12 mr-4 shrink-0">
                      <img src={contact.avatar_url || 'https://via.placeholder.com/150'} alt={contact.username} className="w-full h-full rounded-full object-cover" />
                      {contact.role === UserRole.DRIVER && (
                        <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-whatsapp-dark ${contact.status === DriverStatus.AVAILABLE ? 'bg-green-500' :
                          contact.status === DriverStatus.BUSY ? 'bg-red-500' : 'bg-gray-500'
                          }`}></span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-0.5 sm:mb-1">
                        <div className="flex items-center gap-1 sm:gap-2 overflow-hidden">
                          <h3 className="text-gray-100 font-medium truncate text-[15px] sm:text-[16px]">{contact.username}</h3>
                          {contact.role === UserRole.DRIVER && (
                            <>
                              <span
                                className={`material-icons text-sm ml-1 ${contact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                                title={contact.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                              >
                                {contact.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 sm:gap-1 shrink-0">
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            {contact.role === UserRole.DRIVER && contact.status === DriverStatus.AVAILABLE ? "Online" : "Agora"}
                          </span>
                          {contact.unread_count && contact.unread_count > 0 && (
                            <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-sm animate-pulse">
                              {contact.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={`text-sm truncate ${contact.unread_count && contact.unread_count > 0 ? 'text-gray-100 font-semibold' : 'text-gray-400'}`}>
                          {contact.role === UserRole.DRIVER
                            ? (contact.status === DriverStatus.AVAILABLE ? "Disponível - Toque para conversar" : "Ocupado no momento")
                            : `Tel: ${contact.phone || 'Sem telefone'}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-whatsapp-panel relative ${!showChatOnMobile ? 'hidden md:flex' : 'flex'} h-full`}>
              {activeContact ? (
                <ChatWindow
                  currentUser={currentUser}
                  chatPartner={activeContact}
                  messages={messages}
                  onSendMessage={(msg) => setMessages(p => [...p, msg])}
                  onBack={handleBackToList}
                />
              ) : (
                <div className="hidden md:flex h-full flex-col items-center justify-center text-center border-b-8 border-whatsapp-green bg-[#222e35]">
                  <div className="mb-4">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png" alt="Welcome" className="opacity-40 w-32" />
                  </div>
                  <h1 className="text-3xl font-light text-gray-200 mb-4">{APP_NAME}</h1>
                  <p className="text-gray-400 text-sm max-w-md">
                    Envie e receba mensagens sem precisar manter seu celular conectado.<br />
                    Otimizado para comunicação rápida entre motoristas e passageiros.
                  </p>
                  <div className="mt-8 flex items-center gap-2 text-gray-500 text-xs">
                    <span className="material-icons text-[12px]">lock</span>
                    Protegido com criptografia de ponta a ponta
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* REWARDS/WALLET OVERLAY */}
      {showWallet && currentUser && (
        <div className="absolute inset-0 z-[120] bg-black animate-fade-in flex flex-col">
          {currentUser.role === UserRole.CLIENT ? (
            <RewardsHub
              currentUser={currentUser}
              onClose={() => setShowWallet(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          ) : (
            <WalletScreen
              currentUser={currentUser}
              onClose={() => setShowWallet(false)}
              onOpenStore={() => { setShowWallet(false); setShowStore(true); }}
            />
          )}
        </div>
      )}

      {/* STORE OVERLAY */}
      {showStore && currentUser && (
        <div className="absolute inset-0 z-[130] bg-black animate-fade-in flex flex-col">
          {currentUser.role === UserRole.CLIENT ? (
            <RewardsHub
              currentUser={currentUser}
              onClose={() => setShowStore(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          ) : (
            <InstantStore
              currentUser={currentUser}
              onClose={() => setShowStore(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
