
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { updateUserProfile, fetchUserProfile, createPaymentRequest, fetchMyPaymentRequests } from '../services/supabaseClient';

interface DriverProfileEditorProps {
    currentUser: UserProfile;
    onClose: () => void;
    onUpdate: (updated: UserProfile) => void;
}

export const DriverProfileEditor: React.FC<DriverProfileEditorProps> = ({ currentUser, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'pix' | 'withdraw'>('profile');

    // Profile Fields
    const [phone, setPhone] = useState(currentUser.phone || '');
    const [whatsapp, setWhatsapp] = useState(currentUser.whatsapp || '');
    const [vehicleModel, setVehicleModel] = useState(currentUser.vehicle_model || '');
    const [vehiclePlate, setVehiclePlate] = useState(currentUser.vehicle_plate || '');
    const [vehicleColor, setVehicleColor] = useState(currentUser.vehicle_color || '');
    const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>(currentUser.vehicle_type || 'car');

    // PIX Fields
    const [pixKey, setPixKey] = useState(currentUser.pix_key || '');
    const [cpf, setCpf] = useState(currentUser.cpf || '');
    const [email, setEmail] = useState(currentUser.email || '');

    // Address (optional for PIX)
    const [addressStreet, setAddressStreet] = useState(currentUser.address_street || '');
    const [addressNumber, setAddressNumber] = useState(currentUser.address_number || '');
    const [addressNeighborhood, setAddressNeighborhood] = useState(currentUser.address_neighborhood || '');
    const [addressCity, setAddressCity] = useState(currentUser.address_city || '');
    const [addressZip, setAddressZip] = useState(currentUser.address_zip || '');

    // Withdrawal Fields
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [processingWithdraw, setProcessingWithdraw] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);

    useEffect(() => {
        loadPendingRequests();
    }, []);

    const loadPendingRequests = async () => {
        const requests = await fetchMyPaymentRequests(currentUser.id);
        setPendingRequests(requests.filter(r => r.status === 'pending'));
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        const success = await updateUserProfile(currentUser.id, {
            phone,
            whatsapp,
            vehicle_model: vehicleModel,
            vehicle_plate: vehiclePlate.toUpperCase(),
            vehicle_color: vehicleColor,
            vehicle_type: vehicleType
        });

        if (success) {
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            alert('Dados atualizados com sucesso!');
        } else {
            alert('Erro ao atualizar dados. Tente novamente.');
        }
        setSaving(false);
    };

    const handleSavePix = async () => {
        if (!pixKey.trim()) {
            alert('Por favor, insira uma chave PIX válida.');
            return;
        }

        setSaving(true);
        const success = await updateUserProfile(currentUser.id, {
            pix_key: pixKey,
            cpf,
            email,
            address_street: addressStreet,
            address_number: addressNumber,
            address_neighborhood: addressNeighborhood,
            address_city: addressCity,
            address_zip: addressZip
        });

        if (success) {
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            alert('Dados PIX atualizados com sucesso!');
        } else {
            alert('Erro ao atualizar dados. Tente novamente.');
        }
        setSaving(false);
    };

    const handleWithdraw = async () => {
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) {
            alert('Por favor, insira um valor válido.');
            return;
        }

        if (!currentUser.pix_key) {
            alert('Configure sua chave PIX antes de solicitar saque.');
            setActiveTab('pix');
            return;
        }

        const balance = currentUser.financial_balance || 0;
        if (amount > balance) {
            alert(`Saldo insuficiente. Seu saldo atual é R$ ${balance.toFixed(2)}`);
            return;
        }

        if (amount < 5) {
            alert('O valor mínimo para saque é R$ 5,00');
            return;
        }

        if (!window.confirm(`Confirma saque de R$ ${amount.toFixed(2)} para a chave PIX:\n${currentUser.pix_key}?`)) {
            return;
        }

        setProcessingWithdraw(true);
        const result = await createPaymentRequest(
            currentUser.id,
            'driver_payout',
            amount,
            0,
            currentUser.pix_key
        );

        if (result.success) {
            alert(result.message);
            setWithdrawAmount('');
            // Refresh balance
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            loadPendingRequests();
        } else {
            alert(result.message);
        }
        setProcessingWithdraw(false);
    };

    const formatCPF = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})$/);
        if (match) {
            let formatted = '';
            if (match[1]) formatted += match[1];
            if (match[2]) formatted += '.' + match[2];
            if (match[3]) formatted += '.' + match[3];
            if (match[4]) formatted += '-' + match[4];
            return formatted;
        }
        return value;
    };

    const formatPhone = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{0,2})(\d{0,5})(\d{0,4})$/);
        if (match) {
            let formatted = '';
            if (match[1]) formatted += '(' + match[1];
            if (match[2]) formatted += ') ' + match[2];
            if (match[3]) formatted += '-' + match[3];
            return formatted;
        }
        return value;
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center gap-4 border-b border-white/10 shrink-0">
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition"
                >
                    <span className="material-icons">close</span>
                </button>
                <div className="flex-1">
                    <h1 className="text-white font-bold text-lg">Meus Dados</h1>
                    <p className="text-gray-400 text-xs">Configure seu perfil e recebimentos</p>
                </div>
                <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-full">
                    <span className="material-icons text-green-500 text-sm">account_balance_wallet</span>
                    <span className="text-green-500 font-bold text-sm">R$ {(currentUser.financial_balance || 0).toFixed(2)}</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-whatsapp-panel/80 border-b border-white/5 shrink-0">
                {[
                    { id: 'profile', label: 'Perfil', icon: 'person' },
                    { id: 'pix', label: 'PIX / Recebimento', icon: 'pix' },
                    { id: 'withdraw', label: 'Sacar', icon: 'payments' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-2 ${activeTab === tab.id
                                ? 'text-whatsapp-green border-whatsapp-green bg-whatsapp-green/5'
                                : 'text-gray-400 border-transparent hover:text-white'
                            }`}
                    >
                        <span className="material-icons text-sm">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'profile' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* Avatar Section */}
                        <div className="bg-whatsapp-panel/40 p-6 rounded-2xl border border-white/5 text-center">
                            <img
                                src={currentUser.avatar_url || 'https://via.placeholder.com/100'}
                                alt="Avatar"
                                className="w-24 h-24 rounded-full mx-auto border-4 border-whatsapp-green/30 object-cover mb-4"
                            />
                            <h2 className="text-white font-bold text-xl">{currentUser.username}</h2>
                            <p className="text-gray-400 text-sm">Motorista desde {new Date(currentUser.created_at || '').toLocaleDateString('pt-BR')}</p>
                        </div>

                        {/* Contact Info */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-blue-400 text-sm">contact_phone</span>
                                Contato
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Telefone</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">WhatsApp</label>
                                <input
                                    type="tel"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                />
                            </div>
                        </div>

                        {/* Vehicle Info */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-orange-400 text-sm">directions_car</span>
                                Veículo
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Tipo de Veículo</label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setVehicleType('car')}
                                        className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition ${vehicleType === 'car'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-black/30 text-gray-400 border border-white/10'
                                            }`}
                                    >
                                        <span className="material-icons">directions_car</span>
                                        Carro
                                    </button>
                                    <button
                                        onClick={() => setVehicleType('motorcycle')}
                                        className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition ${vehicleType === 'motorcycle'
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-black/30 text-gray-400 border border-white/10'
                                            }`}
                                    >
                                        <span className="material-icons">two_wheeler</span>
                                        Moto
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Modelo</label>
                                    <input
                                        type="text"
                                        value={vehicleModel}
                                        onChange={(e) => setVehicleModel(e.target.value)}
                                        placeholder="Ex: Honda Civic 2020"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Placa</label>
                                    <input
                                        type="text"
                                        value={vehiclePlate}
                                        onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                                        placeholder="ABC1D23"
                                        maxLength={7}
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition font-mono uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Cor</label>
                                    <input
                                        type="text"
                                        value={vehicleColor}
                                        onChange={(e) => setVehicleColor(e.target.value)}
                                        placeholder="Ex: Prata"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving}
                            className="w-full bg-whatsapp-green hover:bg-green-500 text-white font-bold py-4 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <span className="material-icons animate-spin">sync</span>
                            ) : (
                                <span className="material-icons">save</span>
                            )}
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                )}

                {activeTab === 'pix' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* PIX Info Banner */}
                        <div className="bg-gradient-to-r from-teal-500/20 to-green-500/20 p-4 rounded-2xl border border-teal-500/30">
                            <div className="flex items-start gap-3">
                                <span className="material-icons text-teal-400 text-2xl">pix</span>
                                <div>
                                    <h3 className="text-white font-bold">Chave PIX para Recebimento</h3>
                                    <p className="text-gray-300 text-sm mt-1">
                                        Configure sua chave PIX para receber pagamentos de corridas e cupons de desconto utilizados por clientes.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* PIX Key */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-teal-400 text-sm">vpn_key</span>
                                Chave PIX
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Sua Chave PIX *</label>
                                <input
                                    type="text"
                                    value={pixKey}
                                    onChange={(e) => setPixKey(e.target.value)}
                                    placeholder="CPF, E-mail, Telefone ou Chave Aleatória"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-teal-500/30 focus:border-teal-500 outline-none transition"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Esta é a chave que receberá os pagamentos.</p>
                            </div>
                        </div>

                        {/* Personal Data */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-purple-400 text-sm">badge</span>
                                Dados Pessoais
                            </h3>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">CPF</label>
                                    <input
                                        type="text"
                                        value={cpf}
                                        onChange={(e) => setCpf(formatCPF(e.target.value))}
                                        placeholder="000.000.000-00"
                                        maxLength={14}
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">E-mail</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="seu@email.com"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address (Optional) */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-yellow-400 text-sm">home</span>
                                Endereço
                                <span className="text-[10px] text-gray-500 font-normal">(Opcional)</span>
                            </h3>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Rua</label>
                                    <input
                                        type="text"
                                        value={addressStreet}
                                        onChange={(e) => setAddressStreet(e.target.value)}
                                        placeholder="Nome da rua"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Nº</label>
                                    <input
                                        type="text"
                                        value={addressNumber}
                                        onChange={(e) => setAddressNumber(e.target.value)}
                                        placeholder="123"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Bairro</label>
                                    <input
                                        type="text"
                                        value={addressNeighborhood}
                                        onChange={(e) => setAddressNeighborhood(e.target.value)}
                                        placeholder="Nome do bairro"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Cidade</label>
                                    <input
                                        type="text"
                                        value={addressCity}
                                        onChange={(e) => setAddressCity(e.target.value)}
                                        placeholder="Nome da cidade"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">CEP</label>
                                    <input
                                        type="text"
                                        value={addressZip}
                                        onChange={(e) => setAddressZip(e.target.value)}
                                        placeholder="00000-000"
                                        maxLength={9}
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSavePix}
                            disabled={saving}
                            className="w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-4 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <span className="material-icons animate-spin">sync</span>
                            ) : (
                                <span className="material-icons">save</span>
                            )}
                            {saving ? 'Salvando...' : 'Salvar Dados PIX'}
                        </button>
                    </div>
                )}

                {activeTab === 'withdraw' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* Balance Card */}
                        <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 p-6 rounded-2xl border border-green-500/30 text-center">
                            <p className="text-gray-400 text-sm uppercase font-bold mb-1">Saldo Disponível</p>
                            <p className="text-4xl font-black text-green-500">R$ {(currentUser.financial_balance || 0).toFixed(2)}</p>
                            {currentUser.pix_key ? (
                                <p className="text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                                    <span className="material-icons text-xs text-teal-400">pix</span>
                                    PIX: {currentUser.pix_key}
                                </p>
                            ) : (
                                <p className="text-xs text-red-400 mt-2">
                                    ⚠️ Configure sua chave PIX na aba "PIX / Recebimento"
                                </p>
                            )}
                        </div>

                        {/* Pending Requests */}
                        {pendingRequests.length > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-2xl">
                                <h4 className="text-yellow-500 font-bold text-sm mb-2 flex items-center gap-2">
                                    <span className="material-icons text-sm">schedule</span>
                                    Saques Pendentes
                                </h4>
                                {pendingRequests.map(req => (
                                    <div key={req.id} className="flex justify-between items-center bg-black/20 p-3 rounded-xl mt-2">
                                        <div>
                                            <p className="text-white font-bold">R$ {req.amount_money.toFixed(2)}</p>
                                            <p className="text-[10px] text-gray-400">{new Date(req.created_at).toLocaleString('pt-BR')}</p>
                                        </div>
                                        <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded-full font-bold">Aguardando</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Withdraw Form */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-green-400 text-sm">payments</span>
                                Solicitar Saque
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Valor do Saque (R$)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="5"
                                        max={currentUser.financial_balance || 0}
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full bg-black/30 text-white text-2xl font-bold pl-12 pr-4 py-4 rounded-xl border border-white/10 focus:border-green-500 outline-none transition text-center"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">Mínimo: R$ 5,00</p>
                            </div>

                            {/* Quick Amount Buttons */}
                            <div className="grid grid-cols-4 gap-2">
                                {[10, 25, 50, 100].map(amount => (
                                    <button
                                        key={amount}
                                        onClick={() => setWithdrawAmount(amount.toString())}
                                        disabled={(currentUser.financial_balance || 0) < amount}
                                        className="py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        R$ {amount}
                                    </button>
                                ))}
                            </div>

                            {/* All Balance Button */}
                            <button
                                onClick={() => setWithdrawAmount((currentUser.financial_balance || 0).toString())}
                                disabled={!currentUser.financial_balance || currentUser.financial_balance < 5}
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-sm transition disabled:opacity-30"
                            >
                                Sacar Todo Saldo
                            </button>
                        </div>

                        {/* Withdraw Button */}
                        <button
                            onClick={handleWithdraw}
                            disabled={processingWithdraw || !currentUser.pix_key || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                        >
                            {processingWithdraw ? (
                                <>
                                    <span className="material-icons animate-spin">sync</span>
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <span className="material-icons">send</span>
                                    Solicitar Saque via PIX
                                </>
                            )}
                        </button>

                        {/* Info Note */}
                        <p className="text-xs text-gray-500 text-center">
                            O saque será processado manualmente em até 24 horas úteis. Você receberá uma notificação quando for concluído.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
