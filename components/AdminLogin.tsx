import React, { useState, useEffect } from 'react';
import { loginUser, UserRole } from '../services/supabaseClient';
import { UserProfile } from '../types';
import { soundService } from '../services/soundService';

interface AdminLoginProps {
  onLogin: (user: UserProfile) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    // Check for saved credentials
    const savedUser = localStorage.getItem('chegoja_admin_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setUsername(user.username);
        setRememberMe(true);
      } catch (e) {
        localStorage.removeItem('chegoja_admin_user');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await loginUser(username, password, UserRole.ADMIN);
      
      if (user) {
        soundService.playReceived();
        
        if (rememberMe) {
          localStorage.setItem('chegoja_admin_user', JSON.stringify({ username }));
        } else {
          localStorage.removeItem('chegoja_admin_user');
        }
        
        onLogin(user);
      } else {
        setError('Credenciais de administrador incorretas.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar. Verifique sua internet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Logo Top */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20">
        <img src="/logo.png" alt="ChegoJá" className="w-24 h-24 rounded-full shadow-lg bg-white p-2" />
      </div>

      {/* Login Card */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-[92%] max-w-md text-center z-10 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Painel Administrativo</h2>
          <p className="text-gray-500 mt-2">Entre com suas credenciais de admin</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2" role="alert">
            <span className="material-icons text-base">error_outline</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="text-left">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Usuário
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition"
              placeholder="Digite seu usuário"
              required
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="text-left">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition pr-12"
                placeholder="Digite sua senha"
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <span className="material-icons">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Lembrar usuário</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-bold py-3 px-6 rounded-lg transition shadow-sm flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="material-icons animate-spin">sync</span>
                Entrando...
              </>
            ) : (
              <>
                <span className="material-icons">login</span>
                Acessar Painel
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            ChegoJá Painel Admin v4.2 • Acesso restrito a administradores
          </p>
        </div>
      </div>

      {/* Version badge */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-300 bg-white/80 px-2 py-1 rounded backdrop-blur-sm">
        v4.2 (Stable)
      </div>
    </div>
  );
};

export default AdminLogin;