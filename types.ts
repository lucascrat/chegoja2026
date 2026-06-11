
// 🛑 PARE! 🛑
// ESTE É UM ARQUIVO TYPESCRIPT (.ts) PARA A APLICAÇÃO REACT.
// ⚠️ NÃO COPIE ESTE CÓDIGO PARA O SUPABASE SQL EDITOR. ⚠️
//
// O CÓDIGO CORRETO PARA O SUPABASE ESTÁ NO ARQUIVO 'supabase_setup.sql' (supa.ts).

export enum UserRole {
  CLIENT = 'client',
  DRIVER = 'driver',
  ADMIN = 'admin'
}

export enum DriverStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline'
}

export interface UserProfile {
  id: string;
  username: string;
  phone?: string; // Novo campo
  password?: string; // Campo para senha (opcional no objeto, mas existe no banco)
  role: UserRole;
  status: DriverStatus;
  is_approved?: boolean; // Novo campo para aprovação
  subscription_expires_at?: string; // Data de validade da assinatura
  avatar_url?: string;
  created_at?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_color?: string;
  vehicle_type?: 'car' | 'motorcycle'; // Novo campo para tipo de veículo
  lat?: number;
  lng?: number;
  unread_count?: number; // Contador de mensagens não lidas (Frontend Only)
  is_pip_active?: boolean; // Indica se o app nativo está em modo PiP
  wallet_coins?: number; // Moedas do cliente (Bingo/Videos)
  financial_balance?: number; // Saldo do motorista (Ganhos/Cupons)
  pix_key?: string; // Chave PIX do motorista
  whatsapp?: string; // WhatsApp oficial do perfil
  cpf?: string; // CPF do usuário
  address_street?: string; // Rua do endereço
  address_number?: string; // Número do endereço
  address_neighborhood?: string; // Bairro
  address_city?: string; // Cidade
  address_zip?: string; // CEP
  email?: string; // E-mail do usuário
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  media_url?: string;
  media_type: 'text' | 'audio' | 'image' | 'location';
  created_at: string;
  is_read: boolean;
}

export interface ChatContact {
  user: UserProfile;
  lastMessage?: Message;
  unreadCount: number;
}

export interface CallRecord {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'rejected';
  timestamp: string;
  duration: number;
  clientName: string;
}

export interface AppSettings {
  id?: string;
  car_base_price: number;
  car_price_km: number;
  car_price_min: number;
  car_start_distance_limit: number;
  moto_base_price: number;
  moto_price_km: number;
  moto_price_min: number;
  moto_start_distance_limit: number;

  // Dynamic Pricing (Night: 20:00 - 23:59)
  night_car_base_price?: number;
  night_car_price_km?: number;
  night_car_price_min?: number;
  night_moto_base_price?: number;
  night_moto_price_km?: number;
  night_moto_price_min?: number;

  // Dynamic Pricing (Dawn: 00:00 - 05:00)
  dawn_car_base_price?: number;
  dawn_car_price_km?: number;
  dawn_car_price_min?: number;
  dawn_moto_base_price?: number;
  dawn_moto_price_km?: number;
  dawn_moto_price_min?: number;

  // Dynamic Pricing Adjusted Hours
  night_start_time?: string; // HH:mm
  night_end_time?: string;   // HH:mm
  dawn_start_time?: string;  // HH:mm
  dawn_end_time?: string;    // HH:mm

  marquee_text?: string;
  car_icon_url?: string;
  moto_icon_url?: string;
  car_name?: string;
  car_description?: string;
  moto_name?: string;
  moto_description?: string;
  coin_value_brl?: number;

  // Efí Bank Settings
  efi_client_id?: string;
  efi_client_secret?: string;
  efi_pix_key?: string;
  efi_account_code?: string;

  // WhatsApp Settings
  official_whatsapp?: string;
}

// Interfaces do Bingo
export interface BingoSettings {
  id?: string;
  prize_image: string;
  prize_description: string;
  youtube_link: string;
  drawn_numbers: number[]; // Array de números sorteados
  is_active: boolean;
}

export interface BingoCard {
  id: string;
  user_id: string;
  numbers: number[]; // Array de 24 ou 25 números da cartela
  created_at: string;
}

export interface BingoRankingUser {
  username: string;
  user_id: string;
  avatar_url?: string;
  hits: number; // Quantos números acertou
  missing: number; // Quantos faltam
}

// Nova interface para notificações em massa
export interface BroadcastMessage {
  id: string;
  title: string;
  message: string;
  target_role: 'client' | 'driver' | 'all';
  created_at: string;
}

export interface DriverPlan {
  id: string;
  title: string;
  description: string;
  price: number;
  days: number;
}

// Interfaces para Pagamento Pix Transparente
export interface PayerFormData {
  firstName: string;
  lastName: string;
  email: string;
  cpf: string;
  phone?: string;
  birthDate?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

// Interface para pagamento com cartão
export interface CardFormData {
  cardNumber: string;
  cardholderName: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  installments: number;
}

export interface Banner {
  id: string;
  image_url: string;
  link_url?: string;
  active: boolean;
  order: number;
  created_at: string;
}

export interface Coupon {
  id: string;
  image_url: string;
  discount_value: number;
  vehicle_type: 'car' | 'motorcycle' | 'all';
  total_quantity: number;
  used_quantity: number;
  is_active: boolean;
  created_at: string;
}

export interface PixPaymentResponse {
  id: string | number;
  status: string;
  point_of_interaction: {
    transaction_data: {
      qr_code: string; // Copia e Cola
      qr_code_base64: string; // Imagem
    }
  }
}

export interface Ride {
  id: string;
  client_id: string;
  driver_id?: string;
  status: 'searching' | 'accepted' | 'en_route' | 'arrived' | 'started' | 'waiting_payment' | 'finished' | 'cancelled';
  vehicle_type: 'car' | 'motorcycle';
  origin_lat: number;
  origin_lng: number;
  origin_address?: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_address?: string;
  estimated_price?: number;
  estimated_time?: number;
  distance_km?: number;
  created_at: string;
  updated_at: string;

  // Dispatch Control
  ignored_drivers?: string[]; // IDs do Supabase
  is_broadcast?: boolean;
  last_driver_offered_at?: string;

  // Detalhes extras carregados via join
  driver?: UserProfile;
  client?: UserProfile;
  coupon_id?: string;
  discount_amount?: number;
  payment_method?: 'pix' | 'card' | 'cash' | 'coins';
  payment_status?: 'pending' | 'completed' | 'failed';
  final_price?: number;
  coins_used?: number;
  rating?: number; // 1-5 estrelas dadas pelo cliente
  rating_comment?: string;
}

// Tipo para as abas do Painel Admin
export type AdminTab = 'details' | 'map' | 'history' | 'settings' | 'chat' | 'bingo' | 'approvals' | 'notifications' | 'plans' | 'banners' | 'coupons' | 'central' | 'wallets' | 'store';

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price_brl: number;
  price_coins: number;
  image_url?: string;
  stock: number;
  active: boolean;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'earning' | 'purchase' | 'discount' | 'payout' | 'bonus';
  amount_coins: number;
  amount_money: number;
  description: string;
  created_at: string;
}

export interface PaymentRequest {
  id: string;
  user_id: string;
  amount_money: number;
  amount_coins: number;
  pix_key: string;
  status: 'pending' | 'paid' | 'rejected';
  type: 'driver_payout' | 'client_withdrawal';
  admin_note?: string;
  created_at: string;
  updated_at: string;
  user?: UserProfile; // Joined
}

export interface StoreOrder {
  id: string;
  user_id: string;
  product_id: string;
  status: 'pending' | 'delivered';
  payment_method: 'coins' | 'pix';
  amount_coins: number;
  amount_money: number;
  created_at: string;
  delivered_at?: string;
  // Joins
  product?: StoreProduct;
  user?: UserProfile;
}

// Interface global para comunicação com Android Nativo e Google Maps
declare global {
  interface Window {
    Android?: {
      triggerNativeAlert: () => void;
      triggerNativeMessageSound: () => void; // Novo método para mensagens
      stopNativeAlert: () => void;
      showToast: (msg: string) => void;
      bringToFront: () => void;
      enterPipMode: () => void; // Novo método PiP
      requestPermissions: () => void; // Solicitar permissões necessárias
    };
    pushalert?: any;
    google?: any; // Google Maps API
  }
}

// Helper types for Supabase Generic usage
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: UserProfile
        Insert: UserProfile
        Update: Partial<UserProfile>
      }
      messages: {
        Row: Message
        Insert: Message
        Update: Partial<Message>
      }
      app_settings: {
        Row: AppSettings
        Insert: AppSettings
        Update: Partial<AppSettings>
      }
      broadcasts: { // Nova tabela
        Row: BroadcastMessage
        Insert: Partial<BroadcastMessage>
        Update: Partial<BroadcastMessage>
      }
    }
  }
}