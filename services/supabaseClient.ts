import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Message, UserProfile, UserRole, DriverStatus, AppSettings, BingoSettings, BingoCard, BingoRankingUser, BroadcastMessage, DriverPlan, Ride, Banner, Coupon, StoreProduct, WalletTransaction, StoreOrder, PaymentRequest } from '../types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'chegoja'
  }
});

// Helper for UUID compatibility (used for Optimistic UI in ChatWindow)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Centralized error handling helper
const handleDbError = (error: any, context: string): string => {
  // Log the full object for debugging
  console.error(`Detailed Error in ${context}: `, error);

  let msg = 'Erro desconhecido';

  if (error) {
    // Erro específico de Tabela não encontrada (Postgres 42P01)
    if (error.code === '42P01') {
      msg = "Tabela não encontrada no banco de dados. Por favor, execute o script SQL atualizado (supa.ts) no Supabase.";
    }
    else if (typeof error === 'string') {
      msg = error;
    } else if (error.message) {
      msg = error.message;
      // Adiciona detalhes se existirem (comum em erros Postgres)
      if (error.details) msg += ` (${error.details})`;
      if (error.hint) msg += ` - Dica: ${error.hint}`;
    } else if (error.error_description) {
      msg = error.error_description;
    } else {
      try {
        msg = JSON.stringify(error, null, 2); // Pretty print
        // Evita o [object Object] se o stringify falhar ou retornar genérico
        if (msg === '{}' || msg === '[object Object]') {
          msg = `Erro Genérico: ${String(error)}`;
        }
      } catch (e) {
        msg = String(error);
      }
    }
  }

  console.warn(`Database Error(${context}): ${msg}`);
  return msg;
};

// Nova função para buscar perfil individual (Útil para Auto-Open)
export const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn("Erro ao buscar perfil único:", error);
    return null;
  }
  return data as UserProfile;
};

export const fetchOnlineDrivers = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .eq('is_approved', true) // Only approved drivers
    .eq('status', DriverStatus.AVAILABLE)
    .order('created_at', { ascending: false }); // Mais recentes primeiro

  if (error) {
    handleDbError(error, "fetchOnlineDrivers");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAllDriversForAdmin = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAllDriversForAdmin");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAdminContact = async (): Promise<UserProfile | null> => {
  // Busca o primeiro admin disponível para o chat de suporte
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.ADMIN)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as UserProfile;
};

export const deleteDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "deleteDriver");
    return false;
  }
  return true;
};

export const approveDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_approved: true })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "approveDriver");
    return false;
  }
  return true;
};

export const updateDriverStatus = async (driverId: string, status: DriverStatus): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverStatus");
    return false;
  }
  return true;
};

export const updateDriverPipStatus = async (driverId: string, isPip: boolean): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_pip_active: isPip })
    .eq('id', driverId);

  if (error) {
    // Silent fail is okay for this status
    console.warn("Failed to update PiP status", error);
    return false;
  }
  return true;
};

export const updateUserLocation = async (userId: string, lat: number, lng: number): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ lat, lng })
    .eq('id', userId);

  if (error) {
    // Silent fail for location updates usually
    console.warn("Location update failed", error);
    return false;
  }
  return true;
};

export const updateDriverVehicle = async (
  driverId: string,
  vehicleData: {
    vehicle_model?: string,
    vehicle_plate?: string,
    vehicle_color?: string,
    vehicle_type?: 'car' | 'motorcycle',
    phone?: string
  }
): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update(vehicleData)
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverVehicle");
    return false;
  }
  return true;
};

/**
 * Atualiza o perfil do usuário com qualquer campo fornecido.
 * @param userId ID do usuário no banco
 * @param profileData Objeto contendo os campos a serem atualizados (ex: cpf, whatsapp, address_street, etc)
 */
export const updateUserProfile = async (
  userId: string,
  profileData: Partial<UserProfile>
): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', userId);

  if (error) {
    handleDbError(error, "updateUserProfile");
    return false;
  }
  return true;
};

export const updateDriverPassword = async (driverId: string, newPassword: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ password: newPassword })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverPassword");
    return false;
  }
  return true;
};

// --- Gerenciamento de Assinatura (Admin) ---
export const addSubscriptionDays = async (driverId: string, days: number): Promise<boolean> => {
  try {
    // 1. Pega usuário atual
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_expires_at')
      .eq('id', driverId)
      .single();

    if (fetchError) {
      handleDbError(fetchError, "addSubscriptionDays_fetch");
      return false;
    }

    const now = new Date();
    let baseDate = now;

    // Se a assinatura ainda é válida, adiciona ao final. Se não, começa de agora.
    if (user.subscription_expires_at) {
      const currentExpire = new Date(user.subscription_expires_at);
      if (currentExpire > now) {
        baseDate = currentExpire;
      }
    }

    // Se estiver removendo dias (negativo), a lógica é apenas subtrair
    // Se a intenção for resetar (ex: dias = -999 ou zerar), tratamos como expirar agora
    let newExpire = new Date(baseDate);

    if (days === 0) {
      // ZERAR (Expirar imediatamente)
      newExpire = new Date();
      newExpire.setDate(newExpire.getDate() - 1); // Ontem
    } else {
      newExpire.setDate(newExpire.getDate() + days);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ subscription_expires_at: newExpire.toISOString() })
      .eq('id', driverId);

    if (error) {
      handleDbError(error, "addSubscriptionDays_update");
      return false;
    }
    return true;
  } catch (e) {
    handleDbError(e, "addSubscriptionDays_EXCEPTION");
    return false;
  }
};

export const fetchMyClients = async (driverId: string): Promise<UserProfile[]> => {
  try {
    // Find users who have exchanged messages with this driver
    // We look for messages where driver is receiver OR sender to be thorough
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`receiver_id.eq.${driverId}, sender_id.eq.${driverId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      handleDbError(error, "fetchMyClients (messages)");
      return [];
    }

    if (!data || data.length === 0) return [];

    // Extract IDs that are NOT the driver's ID
    const contactIds = new Set<string>();
    data.forEach((m: any) => {
      if (m.sender_id !== driverId) contactIds.add(m.sender_id);
      if (m.receiver_id !== driverId) contactIds.add(m.receiver_id);
    });

    const idsArray = Array.from(contactIds);
    if (idsArray.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', idsArray);

    if (profileError) {
      handleDbError(profileError, "fetchMyClients (profiles)");
      return [];
    }

    return profiles as UserProfile[] || [];
  } catch (e) {
    handleDbError(e, "fetchMyClients_EXCEPTION");
    return [];
  }
};

export const fetchMessages = async (user1: string, user2: string): Promise<Message[]> => {
  try {
    console.log(`[DB] Buscando mensagens entre ${user1} e ${user2}`);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user1}, receiver_id.eq.${user2}), and(sender_id.eq.${user2}, receiver_id.eq.${user1})`)
      .order('created_at', { ascending: true });

    if (error) {
      handleDbError(error, "fetchMessages");
      return [];
    }
    console.log(`[DB] ${data?.length || 0} mensagens encontradas.`);
    return data as Message[];
  } catch (e) {
    handleDbError(e, "fetchMessages_EXCEPTION");
    return [];
  }
};

export const sendMessage = async (message: Partial<Message>) => {
  // We allow the UI to generate the ID for optimistic updates, 
  // but we ensure the object passed matches the table structure.
  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) {
    handleDbError(error, "sendMessage");
    return null;
  }
  return data as Message;
};

export const deleteMessageForEveryone = async (messageId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('messages')
    .update({
      content: '🚫 Esta mensagem foi apagada',
      media_url: null,
      media_type: 'text'
    })
    .eq('id', messageId);

  if (error) {
    handleDbError(error, "deleteMessageForEveryone");
    return false;
  }
  return true;
};

// --- Settings Functions (Taximeter & App) ---

export const fetchAppSettings = async (): Promise<AppSettings> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .single();

  const defaultSettings: AppSettings = {
    car_base_price: 5.0,
    car_price_km: 2.5,
    car_price_min: 0.5,
    car_start_distance_limit: 0,
    moto_base_price: 3.5,
    moto_price_km: 1.8,
    moto_price_min: 0.3,
    moto_start_distance_limit: 0,
    night_car_base_price: 7.0,
    night_car_price_km: 3.5,
    night_car_price_min: 0.7,
    dawn_car_base_price: 10.0,
    dawn_car_price_km: 4.5,
    dawn_car_price_min: 1.0,
    night_moto_base_price: 5.0,
    night_moto_price_km: 2.5,
    night_moto_price_min: 0.5,
    dawn_moto_base_price: 7.5,
    dawn_moto_price_km: 3.5,
    dawn_moto_price_min: 0.8,
    night_start_time: '19:00',
    night_end_time: '23:59',
    dawn_start_time: '00:00',
    dawn_end_time: '05:00',
    marquee_text: 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ',
    coin_value_brl: 1.0
  };

  if (error || !data) {
    return defaultSettings;
  }

  return {
    ...defaultSettings,
    ...data
  } as AppSettings;
};

export const updateAppSettings = async (settings: AppSettings): Promise<string | null> => {
  // Extract ID to prevent updating it manually
  const { id, ...updates } = settings;

  // 1. Check if exists row, if not insert, else update
  const { data: existing, error: fetchError } = await supabase.from('app_settings').select('id').limit(1);

  if (fetchError) {
    console.error("[updateAppSettings] Fetch Error:", fetchError);
    return handleDbError(fetchError, "updateAppSettings Fetch");
  }

  let dbError;

  if (existing && existing.length > 0) {
    const { error: upError } = await supabase
      .from('app_settings')
      .update(updates)
      .eq('id', existing[0].id);
    dbError = upError;
  } else {
    // If no record exists, insert a new one
    const { error: inError } = await supabase
      .from('app_settings')
      .insert([updates]);
    dbError = inError;
  }

  if (dbError) {
    console.error("[updateAppSettings] Save Error:", dbError);
    return handleDbError(dbError, "updateAppSettings Save");
  }

  return null;
};

// --- Driver Plans Functions ---

export const fetchDriverPlans = async (): Promise<DriverPlan[]> => {
  const { data, error } = await supabase
    .from('driver_plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) {
    handleDbError(error, "fetchDriverPlans");
    return [];
  }
  return data as DriverPlan[];
};

export const updateDriverPlan = async (plan: DriverPlan): Promise<boolean> => {
  const { error } = await supabase
    .from('driver_plans')
    .update({
      title: plan.title,
      description: plan.description,
      price: plan.price,
      days: plan.days
    })
    .eq('id', plan.id);

  if (error) {
    handleDbError(error, "updateDriverPlan");
    return false;
  }
  return true;
};

// --- BANNER FUNCTIONS ---
export const fetchBanners = async (): Promise<Banner[]> => {
  console.log('[fetchBanners] Buscando banners do banco...');
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('order', { ascending: true });

  if (error) {
    console.error('[fetchBanners] Erro:', error);
    handleDbError(error, "fetchBanners");
    return [];
  }
  console.log('[fetchBanners] Dados recebidos:', data);
  return data as Banner[];
};

export const addBanner = async (imageUrl: string, linkUrl?: string, order: number = 0): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .insert([{ image_url: imageUrl, link_url: linkUrl, order, active: true }]);

  if (error) {
    handleDbError(error, "addBanner");
    return false;
  }
  return true;
};

export const deleteBanner = async (bannerId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .delete()
    .eq('id', bannerId);

  if (error) {
    handleDbError(error, "deleteBanner");
    return false;
  }
  return true;
};

export const updateBannerOrder = async (bannerId: string, order: number): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .update({ order })
    .eq('id', bannerId);

  if (error) {
    handleDbError(error, "updateBannerOrder");
    return false;
  }
  return true;
};

// Upload Banner Image to Supabase Storage
export const uploadBannerImage = async (file: File): Promise<string | null> => {
  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `banners/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      handleDbError(error, "uploadBannerImage");
      return null;
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    handleDbError(e, "uploadBannerImage_EXCEPTION");
    return null;
  }
};

// --- BINGO FUNCTIONS ---

export const fetchBingoSettings = async (): Promise<BingoSettings> => {
  const { data, error } = await supabase.from('bingo_settings').select('*').limit(1).maybeSingle();

  if (error) {
    // Se a tabela não existir, o erro já foi logado. Retornamos null para evitar crash.
    handleDbError(error, "fetchBingoSettings");
  }

  if (!data) {
    // Retorna padrão se não existir ou se der erro
    return {
      prize_image: 'https://placehold.co/600x400/png?text=Pr%C3%AAmio',
      prize_description: 'Prêmio do Sorteio',
      youtube_link: '',
      drawn_numbers: [],
      is_active: true
    };
  }
  return data as BingoSettings;
};

export const updateBingoSettings = async (settings: Partial<BingoSettings>): Promise<boolean> => {
  const { data: existing, error: fetchError } = await supabase.from('bingo_settings').select('id').limit(1);

  if (fetchError && fetchError.code === '42P01') {
    alert("A tabela do Bingo não foi criada. Execute o SQL em 'supa.ts'.");
    return false;
  }

  let error;
  if (existing && existing.length > 0) {
    const { error: up } = await supabase.from('bingo_settings').update(settings).eq('id', existing[0].id);
    error = up;
  } else {
    const { error: ins } = await supabase.from('bingo_settings').insert([settings]);
    error = ins;
  }

  if (error) {
    handleDbError(error, "updateBingoSettings");
    return false;
  }
  return true;
};

export const drawBingoNumber = async (): Promise<number | null> => {
  const settings = await fetchBingoSettings();
  if (!settings) return null;

  let available = [];
  for (let i = 1; i <= 75; i++) {
    if (!settings.drawn_numbers.includes(i)) available.push(i);
  }

  if (available.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * available.length);
  const newNumber = available[randomIndex];
  const newDrawn = [...settings.drawn_numbers, newNumber];

  await updateBingoSettings({ drawn_numbers: newDrawn });
  return newNumber;
};

export const drawSpecificBingoNumber = async (numberToDraw: number): Promise<boolean> => {
  const settings = await fetchBingoSettings();
  if (!settings) return false;

  // Se já foi sorteado, ignora
  if (settings.drawn_numbers.includes(numberToDraw)) return false;

  const newDrawn = [...settings.drawn_numbers, numberToDraw];
  return await updateBingoSettings({ drawn_numbers: newDrawn });
};

export const resetBingo = async (): Promise<boolean> => {
  return await updateBingoSettings({ drawn_numbers: [] });
};

export const getOrCreateBingoCard = async (userId: string): Promise<BingoCard | null> => {
  // 1. Check exists
  const { data, error } = await supabase.from('bingo_cards').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    handleDbError(error, "getBingoCard_check");
    // Se a tabela não existir, o erro já foi logado. Retornamos null para evitar crash.
    return null;
  }

  if (data) return data as BingoCard;

  // 2. Create new card
  // Gera 25 números aleatórios únicos entre 1 e 75 para preencher o grid 5x5
  const numbers = new Set<number>();
  while (numbers.size < 25) {
    numbers.add(Math.floor(Math.random() * 75) + 1);
  }
  const numbersArray = Array.from(numbers).sort((a, b) => a - b);

  const { data: newCard, error: createError } = await supabase
    .from('bingo_cards')
    .insert([{ user_id: userId, numbers: numbersArray }])
    .select()
    .single();

  if (createError) {
    handleDbError(createError, "createBingoCard");
    return null;
  }
  return newCard as BingoCard;
};

export const fetchBingoRanking = async (): Promise<BingoRankingUser[]> => {
  // Busca settings para saber numeros sorteados
  const settings = await fetchBingoSettings();
  const drawnSet = new Set(settings.drawn_numbers);

  // Busca todas as cartelas com info do usuario
  const { data: cards, error } = await supabase
    .from('bingo_cards')
    .select('*, profiles:user_id(username, id, avatar_url)');

  if (error) {
    handleDbError(error, "fetchBingoRanking");
    return [];
  }

  if (!cards) return [];

  const ranking: BingoRankingUser[] = cards.map((card: any) => {
    const myNumbers: number[] = card.numbers;
    const hits = myNumbers.filter(n => drawnSet.has(n)).length;
    return {
      username: card.profiles?.username || 'Desconhecido',
      user_id: card.profiles?.id,
      avatar_url: card.profiles?.avatar_url,
      hits: hits,
      missing: myNumbers.length - hits
    };
  });

  // Ordena por acertos (Decrescente)
  return ranking.sort((a, b) => b.hits - a.hits).slice(0, 10); // Top 10
};

export const subscribeToBingo = (onUpdate: () => void) => {
  return supabase
    .channel('chegoja:bingo')
    .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'bingo_settings' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'bingo_cards' }, onUpdate)
    .subscribe();
};

// --- Storage Functions ---

export const uploadFile = async (file: Blob, folder: 'audio' | 'images' | 'attachments', extension?: string): Promise<string | null> => {
  try {
    let fileExt = extension;

    // Fallback defaults if no extension provided
    if (!fileExt) {
      if (file.type === 'image/jpeg') fileExt = 'jpg';
      else if (file.type === 'image/png') fileExt = 'png';
      else if (file.type.includes('audio')) fileExt = 'webm'; // Default legacy
      else fileExt = 'bin';
    }

    // Sanitize extension (remove leading dot if exists)
    fileExt = fileExt?.replace(/^\./, '');

    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Ensure we pass the correct content type if possible
    const options: any = {
      cacheControl: '3600',
      upsert: false
    };

    if (file instanceof File) {
      options.contentType = file.type;
    }

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, options);

    if (error) {
      handleDbError(error, "uploadFile");
      return null;
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    handleDbError(e, "uploadFile_EXCEPTION");
    return null;
  }
};

export const subscribeToMessages = (
  userId: string,
  onMessage: (msg: Message) => void
) => {
  // Usamos um canal único por usuário para evitar conflitos de broadcast
  return supabase
    .channel(`chat_updates:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'chegoja',
        table: 'messages'
      },
      (payload) => {
        const msg = (payload.new || payload.old) as Message;
        if (!msg) return;

        // Filtro manual no cliente: Garante que a mensagem pertence a este usuário
        // Isso é mais robusto que o filtro do Postgres em alguns ambientes.
        if (msg.sender_id === userId || msg.receiver_id === userId) {
          onMessage(msg);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[ChatSub:${userId}] Status:`, status);
    });
};

export const markMessagesAsRead = async (userId: string, senderId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .eq('sender_id', senderId)
    .eq('is_read', false);

  if (error) {
    handleDbError(error, "markMessagesAsRead");
    return false;
  }
  return true;
};

// --- AUTH FUNCTIONS ---

export const registerClientWithPhoto = async (username: string, phone: string, avatarFile?: File): Promise<UserProfile | null> => {
  try {
    let finalUrl = null;
    if (avatarFile) {
      finalUrl = await uploadFile(avatarFile, 'images');
    }

    // Check if exists
    const { data: existing } = await supabase.from('profiles').select('*').eq('phone', phone).maybeSingle();
    if (existing) {
      // Auto login
      return existing as UserProfile;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username,
        phone,
        role: UserRole.CLIENT,
        status: DriverStatus.AVAILABLE,
        avatar_url: finalUrl || `https://ui-avatars.com/api/?name=${username}`
      }])
      .select()
      .single();

    if (error) {
      handleDbError(error, "registerClientWithPhoto");
      return null;
    }
    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "registerClientWithPhoto_EXCEPTION");
    return null;
  }
};

export const registerDriver = async (
  username: string,
  password?: string,
  vehicleType?: 'car' | 'motorcycle',
  vehicleModel?: string,
  vehiclePlate?: string,
  vehicleColor?: string,
  avatarFile?: File
): Promise<UserProfile | null> => {
  try {
    let avatar_url = null;
    if (avatarFile) {
      avatar_url = await uploadFile(avatarFile, 'images');
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username,
        password,
        role: UserRole.DRIVER,
        status: DriverStatus.OFFLINE,
        is_approved: false, // Default pending
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        vehicle_plate: vehiclePlate,
        vehicle_color: vehicleColor,
        avatar_url: avatar_url || `https://ui-avatars.com/api/?name=${username}`
      }])
      .select()
      .single();

    if (error) {
      handleDbError(error, "registerDriver");
      return null;
    }
    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "registerDriver_EXCEPTION");
    return null;
  }
};

export const ensureTestDriver = async (username: string, password: string): Promise<UserProfile | null> => {
  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .eq('role', UserRole.DRIVER)
      .maybeSingle();

    if (existing) return existing as UserProfile;

    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username,
        password,
        role: UserRole.DRIVER,
        status: DriverStatus.AVAILABLE,
        is_approved: true,
        vehicle_type: 'car',
        vehicle_model: 'Gol G5',
        vehicle_plate: 'TST-0001',
        vehicle_color: 'Prata',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=22c55e&color=fff`
      }])
      .select()
      .single();

    if (error) { console.warn('ensureTestDriver:', error); return null; }
    return data as UserProfile;
  } catch (e) {
    console.warn('ensureTestDriver exception:', e);
    return null;
  }
};

export const loginUser = async (username: string, password?: string, role?: UserRole): Promise<UserProfile | null> => {
  try {
    let query = supabase.from('profiles').select('*').eq('username', username);

    if (role) {
      query = query.eq('role', role);
    }

    if (password) {
      query = query.eq('password', password);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      handleDbError(error, "loginUser");
      return null;
    }

    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "loginUser_EXCEPTION");
    return null;
  }
};

export const loginDriver = async (username: string, password?: string): Promise<UserProfile | null> => {
  const data = await loginUser(username, password, UserRole.DRIVER);

  if (data) {
    // If logging in, ensure they are set to available IF approved
    if (data.is_approved) {
      updateDriverStatus(data.id, DriverStatus.AVAILABLE).catch(e =>
        console.warn("Non-critical: Failed to update status on login", e)
      );
      return { ...data, status: DriverStatus.AVAILABLE } as UserProfile;
    }
    return data;
  }

  return null;
};

export const checkUserExists = async (field: 'username' | 'phone', value: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq(field, value)
    .maybeSingle();

  if (error) {
    console.warn(`Error checking ${field} existence:`, error);
    return false;
  }

  return !!data;
};

export const updateUserAvatar = async (userId: string, avatarFile: File): Promise<string | null> => {
  try {
    const ext = avatarFile.name.split('.').pop() || 'jpg';
    const url = await uploadFile(avatarFile, 'images', ext);

    if (!url) {
      console.error("Failed to upload avatar file");
      return null;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', userId);

    if (error) {
      handleDbError(error, "updateUserAvatar");
      return null;
    }

    return url;
  } catch (e) {
    handleDbError(e, "updateUserAvatar_EXCEPTION");
    return null;
  }
};

/**
 * CUPONS DE DESCONTO
 */

export const fetchAvailableCoupons = async (): Promise<Coupon[]> => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAvailableCoupons");
    return [];
  }

  // Filtrar apenas cupons que ainda têm estoque (para garantir)
  return (data as Coupon[]).filter(c => c.used_quantity < c.total_quantity);
};

export const fetchAllCoupons = async (): Promise<Coupon[]> => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAllCoupons");
    return [];
  }

  return data as Coupon[];
};

export const createCoupon = async (coupon: Partial<Coupon>, imageFile?: File): Promise<Coupon | null> => {
  try {
    let finalUrl = coupon.image_url;

    if (imageFile) {
      finalUrl = await uploadFile(imageFile, 'images');
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        ...coupon,
        image_url: finalUrl,
        used_quantity: 0,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      handleDbError(error, "createCoupon");
      return null;
    }

    return data as Coupon;
  } catch (e) {
    handleDbError(e, "createCoupon_EXCEPTION");
    return null;
  }
};

export const deleteCoupon = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('coupons')
    .delete()
    .eq('id', id);

  if (error) {
    handleDbError(error, "deleteCoupon");
    return false;
  }

  return true;
};

export const useCoupon = async (id: string): Promise<boolean> => {
  // RPC ou Incremento direto? RPC é melhor para atomicidade
  const { error } = await supabase.rpc('increment_coupon_usage', { coupon_id: id });

  if (error) {
    // Se a função RPC não existir, tentamos via update direto (menos seguro contra race conditions mas funciona para MVP)
    const { data: coupon } = await supabase.from('coupons').select('used_quantity, total_quantity').eq('id', id).single();
    if (coupon && coupon.used_quantity < coupon.total_quantity) {
      const { error: updateError } = await supabase
        .from('coupons')
        .update({ used_quantity: coupon.used_quantity + 1 })
        .eq('id', id);
      return !updateError;
    }
    return false;
  }

  return true;
};

// --- RIDES FUNCTIONS ---

export const createRideRequest = async (rideData: Partial<Ride>): Promise<{ data: Ride | null, error: string | null }> => {
  const { data, error } = await supabase
    .from('rides')
    .insert([rideData])
    .select()
    .single();

  if (error) {
    const msg = handleDbError(error, "createRideRequest");
    return { data: null, error: msg };
  }
  return { data: data as Ride, error: null };
};

export const cancelRide = async (rideId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "cancelRide");
    return false;
  }
  return true;
};

export const acceptRide = async (rideId: string, driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      driver_id: driverId,
      status: 'en_route',
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId)
    .eq('status', 'searching'); // Garante que ninguém aceitou ainda

  if (error) {
    handleDbError(error, "acceptRide");
    return false;
  }
  return true;
};

export const updateRideStatus = async (rideId: string, status: Ride['status']): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "updateRideStatus");
    return false;
  }
  return true;
};

export const updateRidePayment = async (rideId: string, paymentData: any): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      ...paymentData,
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "updateRidePayment");
    return false;
  }
  return true;
};

export const fetchActiveRide = async (userId: string, role: 'client' | 'driver'): Promise<Ride | null> => {
  const field = role === 'client' ? 'client_id' : 'driver_id';
  const { data, error } = await supabase
    .from('rides')
    .select('*, driver:driver_id(*), client:client_id(*)')
    .eq(field, userId)
    .not('status', 'in', '("finished","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    handleDbError(error, "fetchActiveRide");
    return null;
  }
  return data as Ride;
};

export const subscribeToRides = (userId: string, role: 'client' | 'driver', callback: (ride: Ride) => void) => {
  const filter = role === 'client' ? `client_id=eq.${userId}` : `status=eq.searching`;

  // Para motoristas, também queremos ver atualizações de corridas que já aceitamos
  const channelName = `rides:${userId}`;

  return supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'chegoja',
        table: 'rides'
      },
      (payload) => {
        const ride = (payload.new || payload.old) as Ride;
        if (!ride) return;

        // Filtro manual mais preciso
        if (role === 'client' && ride.client_id === userId) {
          callback(ride);
        } else if (role === 'driver') {
          if (ride.status === 'searching' || ride.driver_id === userId) {
            callback(ride);
          }
        }
      }
    )
    .subscribe();
};

export const subscribeToProfiles = (callback: (payload?: any) => void) => {
  return supabase
    .channel('profiles-global')
    .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'profiles' }, (payload) => {
      callback(payload);
    })
    .subscribe();
};

export const subscribeToBroadcasts = (callback: (msg: BroadcastMessage) => void) => {
  return supabase
    .channel('broadcasts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'chegoja',
        table: 'broadcasts'
      },
      (payload) => {
        callback(payload.new as BroadcastMessage);
      }
    )
    .subscribe();
};

export const sendBroadcast = async (title: string, message: string, targetRole: 'client' | 'driver' | 'all'): Promise<boolean> => {
  const { error } = await supabase
    .from('broadcasts')
    .insert([{ title, message, target_role: targetRole }]);

  if (error) {
    handleDbError(error, "sendBroadcast");
    return false;
  }
  return true;
};

/**
 * CARTEIRA E LOJA (WALLETS & STORE)
 */

export const fetchWalletTransactions = async (userId: string): Promise<WalletTransaction[]> => {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchWalletTransactions");
    return [];
  }
  return data as WalletTransaction[];
};

// --- PAGAMENTOS E SAQUES ---

export const createPaymentRequest = async (
  userId: string,
  type: 'driver_payout' | 'client_withdrawal',
  amountMoney: number,
  amountCoins: number,
  pixKey: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // Operação atômica no banco: valida saldo, debita, cria request e loga
    // a transação — tudo numa só chamada (sem risco de perder saldo).
    const { data, error } = await supabase.rpc('request_payout', {
      p_user_id: userId,
      p_type: type,
      p_amount_money: amountMoney,
      p_amount_coins: amountCoins,
      p_pix_key: pixKey
    });

    if (error) {
      console.error("Erro na RPC request_payout", error);
      return { success: false, message: handleDbError(error, "request_payout") };
    }

    return {
      success: !!data?.success,
      message: data?.message || (data?.success ? "Solicitação enviada!" : "Erro ao processar solicitação.")
    };
  } catch (e) {
    console.error("Exception in createPaymentRequest", e);
    return { success: false, message: "Erro ao processar solicitação." };
  }
};

export const fetchPaymentRequests = async (): Promise<PaymentRequest[]> => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*, user:user_id(*)')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchPaymentRequests");
    return [];
  }
  return data as PaymentRequest[];
};

export const fetchMyPaymentRequests = async (userId: string): Promise<PaymentRequest[]> => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchMyPaymentRequests");
    return [];
  }
  return data as PaymentRequest[];
};

export const updatePaymentRequestStatus = async (
  requestId: string,
  status: 'paid' | 'rejected',
  adminNote?: string
): Promise<boolean> => {
  try {
    const { data: request, error: fetchError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) return false;

    if (status === 'rejected' && request.status === 'pending') {
      // Refund the user
      if (request.type === 'client_withdrawal') {
        await supabase.rpc('increment_coins', {
          user_id_param: request.user_id,
          amount_param: request.amount_coins
        });
      } else {
        // Driver refund (Fetch current + add back)
        const { data: user } = await supabase.from('profiles').select('financial_balance').eq('id', request.user_id).single();
        if (user) {
          await supabase.from('profiles').update({
            financial_balance: (user.financial_balance || 0) + request.amount_money
          }).eq('id', request.user_id);
        }
      }

      // Log Refund
      await supabase.from('wallet_transactions').insert({
        user_id: request.user_id,
        type: 'bonus', // or 'refund'
        amount_coins: request.type === 'client_withdrawal' ? request.amount_coins : 0,
        amount_money: request.type === 'driver_payout' ? request.amount_money : 0,
        description: `Estorno de Saque Rejeitado`
      });
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      handleDbError(error, "updatePaymentRequestStatus");
      return false;
    }
    return true;
  } catch (e) {
    console.error("Exception updatePaymentRequestStatus", e);
    return false;
  }
};


export const fetchAllWalletTransactions = async (): Promise<WalletTransaction[]> => {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*, user:user_id(username, avatar_url, phone, whatsapp)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    handleDbError(error, "fetchAllWalletTransactions");
    return [];
  }
  return data as any[];
};

export const fetchStoreProducts = async (): Promise<StoreProduct[]> => {
  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchStoreProducts");
    return [];
  }
  return data as StoreProduct[];
};

export const addCoinsToUser = async (userId: string, coins: number, description: string): Promise<boolean> => {
  try {
    // 1. Increment coins using a secure RPC (Function) to avoid RLS/mapping issues
    const { data: newBalance, error: rpcError } = await supabase
      .rpc('increment_coins', {
        user_id_param: userId,
        amount_param: coins
      });

    if (rpcError) {
      console.error("[addCoins] RPC Error:", rpcError);

      // Fallback: Tentativa direta se a RPC não existir
      const { data: user } = await supabase.from('profiles').select('wallet_coins').eq('id', userId).single();
      const currentCoins = Number(user?.wallet_coins || 0);
      const { error: upError } = await supabase.from('profiles').update({ wallet_coins: currentCoins + coins }).eq('id', userId);
      if (upError) return false;
    }

    // 2. Record the transaction (Histórico)
    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'earning',
      amount_coins: coins,
      description
    });

    console.log(`[addCoins] Sucesso para usuário ${userId}`);
    return true;
  } catch (e) {
    console.error("[addCoins] Exception:", e);
    return false;
  }
};

export const purchaseStoreProduct = async (userId: string, product: StoreProduct, paymentType: 'coins' | 'pix' | 'card'): Promise<{ success: boolean, message: string }> => {
  try {
    // 1. Buscar dados do usuário e do produto atualizados
    const { data: user } = await supabase.from('profiles').select('wallet_coins').eq('id', userId).single();
    const { data: currentProduct } = await supabase.from('store_products').select('stock, active').eq('id', product.id).single();

    if (!currentProduct || !currentProduct.active) {
      return { success: false, message: "Produto não disponível no momento." };
    }

    if (currentProduct.stock <= 0) {
      return { success: false, message: "Produto esgotado!" };
    }

    if (paymentType === 'coins') {
      if ((user?.wallet_coins || 0) < product.price_coins) {
        return { success: false, message: "Moedas insuficientes!" };
      }

      // Decrementar moedas e estoque
      await supabase.from('profiles').update({ wallet_coins: (user?.wallet_coins || 0) - product.price_coins }).eq('id', userId);
      await supabase.from('store_products').update({ stock: currentProduct.stock - 1 }).eq('id', product.id);

      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_coins: -product.price_coins,
        description: `Compra (Moedas): ${product.name}`
      });

      // Registrar Pedido
      await supabase.from('store_orders').insert({
        user_id: userId,
        product_id: product.id,
        status: 'pending',
        payment_method: 'coins',
        amount_coins: product.price_coins,
        amount_money: 0
      });

      return { success: true, message: "Resgate realizado com sucesso! Verifique seu histórico." };
    } else {
      // Para PIX ou CARTÃO, esta função é chamada após a confirmação do pagamento externo

      // Decrementar estoque (Moedas já foram pagas externamente)
      await supabase.from('store_products').update({ stock: currentProduct.stock - 1 }).eq('id', product.id);

      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_money: product.price_brl,
        description: `Compra via ${paymentType.toUpperCase()}: ${product.name}`
      });

      // Registrar Pedido
      await supabase.from('store_orders').insert({
        user_id: userId,
        product_id: product.id,
        status: 'pending',
        payment_method: paymentType,
        amount_coins: 0,
        amount_money: product.price_brl
      });

      return { success: true, message: `Pagamento ${paymentType.toUpperCase()} confirmado! Seu pedido foi registrado.` };
    }
  } catch (e) {
    handleDbError(e, "purchaseStoreProduct");
    return { success: false, message: "Erro ao processar compra. Tente novamente." };
  }
};

export const fetchStoreOrders = async (): Promise<StoreOrder[]> => {
  const { data, error } = await supabase
    .from('store_orders')
    .select('*, product:store_products(*), user:profiles(*)')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchStoreOrders");
    return [];
  }
  return data as any as StoreOrder[];
};

export const updateStoreOrderStatus = async (orderId: string, status: 'delivered'): Promise<boolean> => {
  const { error } = await supabase
    .from('store_orders')
    .update({
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null
    })
    .eq('id', orderId);

  if (error) {
    handleDbError(error, "updateStoreOrderStatus");
    return false;
  }
  return true;
};


export const payDriverBalance = async (driverId: string, amount: number): Promise<boolean> => {
  try {
    const { data: user } = await supabase.from('profiles').select('financial_balance').eq('id', driverId).single();
    const currentBalance = Number(user?.financial_balance || 0);

    if (currentBalance < amount) return false;

    await supabase.from('profiles').update({ financial_balance: currentBalance - amount }).eq('id', driverId);

    await supabase.from('wallet_transactions').insert({
      user_id: driverId,
      type: 'payout',
      amount_money: -amount,
      description: 'Resgate de saldo / Pagamento recebido'
    });

    return true;
  } catch (e) {
    return false;
  }
};

export const updateDriverBalanceForCoupon = async (driverId: string, amount: number, rideId: string): Promise<boolean> => {
  try {
    const { data: user } = await supabase.from('profiles').select('financial_balance').eq('id', driverId).single();
    const currentBalance = Number(user?.financial_balance || 0);

    await supabase.from('profiles').update({ financial_balance: currentBalance + amount }).eq('id', driverId);

    await supabase.from('wallet_transactions').insert({
      user_id: driverId,
      type: 'bonus',
      amount_money: amount,
      description: `Bônus Cupom: Corrida #${rideId.slice(0, 6)}`
    });
    return true;
  } catch (e) {
    return false;
  }
};

export const createDispatchRide = async (dispatchData: any): Promise<{ ride: Ride | null, success: boolean, message: string }> => {
  try {
    const isBroadcast = !!dispatchData.isBroadcast;

    // If broadcast, it's 'searching' but with is_broadcast=true
    const initialStatus = dispatchData.selectedDriverId ? 'accepted' : 'searching';

    const { data, error } = await supabase
      .from('rides')
      .insert([{
        client_id: '11111111-1111-1111-1111-111111111111',
        status: initialStatus,
        driver_id: dispatchData.selectedDriverId || null,
        vehicle_type: dispatchData.vehicleType,
        origin_lat: dispatchData.originLat,
        origin_lng: dispatchData.originLng,
        origin_address: dispatchData.originAddress,
        destination_lat: dispatchData.destinationLat,
        destination_lng: dispatchData.destinationLng,
        destination_address: dispatchData.destinationAddress,
        estimated_price: dispatchData.estimatedPrice,
        is_broadcast: isBroadcast,
        last_driver_offered_at: dispatchData.selectedDriverId ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (error) throw error;

    let msg = "Procurando motoristas...";
    if (dispatchData.selectedDriverId) msg = "Corrida despachada com sucesso!";
    if (isBroadcast) msg = "Corrida disparada para TODOS os motoristas!";

    return {
      ride: data as Ride,
      success: true,
      message: msg
    };
  } catch (e: any) {
    const errorMsg = handleDbError(e, "createDispatchRide");
    return { ride: null, success: false, message: errorMsg };
  }
};

/**
 * ADMIN: GESTÃO DE PRODUTOS (STORE MANAGEMENT)
 */

export const createStoreProduct = async (product: Partial<StoreProduct>): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .insert([product]);

  if (error) {
    return handleDbError(error, "createStoreProduct");
  }
  return null;
};

export const updateStoreProduct = async (productId: string, updates: Partial<StoreProduct>): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .update(updates)
    .eq('id', productId);

  if (error) {
    return handleDbError(error, "updateStoreProduct");
  }
  return null;
};

export const deleteStoreProduct = async (productId: string): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .delete()
    .eq('id', productId);

  if (error) {
    return handleDbError(error, "deleteStoreProduct");
  }
  return null;
};

export const uploadStoreProductImage = async (file: File): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    // Upload to 'chat-media' bucket (reusing existing public bucket)
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading product image:', error);
    return null;
  }
};

/**
 * DINAMIC PRICING UTILITIES
 */

export const getTariffForTime = (settings: AppSettings, vehicleType: 'car' | 'motorcycle') => {
  const now = new Date();
  const hours = now.getHours();

  // Dawn: 00:00 - 05:00
  if (hours >= 0 && hours < 5) {
    if (vehicleType === 'car') {
      return {
        base: settings.dawn_car_base_price || settings.car_base_price,
        perKm: settings.dawn_car_price_km || settings.car_price_km,
        perMin: settings.dawn_car_price_min || settings.car_price_min,
        label: "Madrugada"
      };
    } else {
      return {
        base: settings.dawn_moto_base_price || settings.moto_base_price,
        perKm: settings.dawn_moto_price_km || settings.moto_price_km,
        perMin: settings.dawn_moto_price_min || settings.moto_price_min,
        label: "Madrugada"
      };
    }
  }

  // Night: 20:00 - 23:59
  if (hours >= 20 && hours <= 23) {
    if (vehicleType === 'car') {
      return {
        base: settings.night_car_base_price || settings.car_base_price,
        perKm: settings.night_car_price_km || settings.car_price_km,
        perMin: settings.night_car_price_min || settings.car_price_min,
        label: "Noite"
      };
    } else {
      return {
        base: settings.night_moto_base_price || settings.moto_base_price,
        perKm: settings.night_moto_price_km || settings.moto_price_km,
        perMin: settings.night_moto_price_min || settings.moto_price_min,
        label: "Noite"
      };
    }
  }

  // Standard
  if (vehicleType === 'car') {
    return {
      base: settings.car_base_price,
      perKm: settings.car_price_km,
      perMin: settings.car_price_min,
      label: "Padrão"
    };
  } else {
    return {
      base: settings.moto_base_price,
      perKm: settings.moto_price_km,
      perMin: settings.moto_price_min,
      label: "Padrão"
    };
  }
};

/**
 * ADMIN: ADVANCED DISPATCH
 */

export const findAndAssignNextDriver = async (rideId: string, currentDriverId: string): Promise<boolean> => {
  try {
    // 1. Get current ride to see ignored drivers
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) return false;

    // Convert to array of strings (UUIDs)
    const ignored: string[] = Array.isArray(ride.ignored_drivers) ? ride.ignored_drivers : [];
    if (!ignored.includes(currentDriverId)) {
      ignored.push(currentDriverId);
    }

    // 2. Find next available driver
    const { data: nextDrivers, error: driverError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'driver')
      .eq('status', 'available')
      .eq('is_approved', true)
      .eq('vehicle_type', ride.vehicle_type)
      .not('id', 'in', `(${ignored.length > 0 ? ignored.map(id => `'${id}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"})`)
      .limit(1);

    if (driverError) throw driverError;

    if (nextDrivers && nextDrivers.length > 0) {
      // Assign to next
      await supabase
        .from('rides')
        .update({
          driver_id: nextDrivers[0].id,
          status: 'accepted',
          ignored_drivers: ignored,
          last_driver_offered_at: new Date().toISOString()
        })
        .eq('id', rideId);
      return true;
    } else {
      // No more drivers, set back to searching
      await supabase
        .from('rides')
        .update({
          driver_id: null,
          status: 'searching',
          ignored_drivers: ignored
        })
        .eq('id', rideId);
      return false;
    }
  } catch (e) {
    console.error("Error in findAndAssignNextDriver:", e);
    return false;
  }
};

// Registra endereços usados na corrida no histórico do cliente
export const saveRideAddressHistory = async (
  userId: string,
  originAddress: string,
  destinationAddress?: string
): Promise<void> => {
  try {
    const entries = [
      { user_id: userId, address: originAddress, used_count: 1 },
      ...(destinationAddress ? [{ user_id: userId, address: destinationAddress, used_count: 1 }] : [])
    ].filter(e => e.address);

    if (entries.length === 0) return;

    // Upsert: incrementa contador se já existe, insere se não existe
    for (const entry of entries) {
      const { data: existing } = await supabase
        .schema('chegoja')
        .from('address_history')
        .select('id, used_count')
        .eq('user_id', entry.user_id)
        .eq('address', entry.address)
        .maybeSingle();

      if (existing) {
        await supabase
          .schema('chegoja')
          .from('address_history')
          .update({ used_count: (existing.used_count || 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .schema('chegoja')
          .from('address_history')
          .insert(entry);
      }
    }
  } catch (e) {
    // Não crítico — falha silenciosa
    console.warn('[AddressHistory] Falha ao salvar histórico:', e);
  }
};
