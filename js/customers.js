// ============================================================
// customers.js — Base de clientes para Facturación (búsqueda + alta rápida)
// ============================================================
// Colección Firestore: artifacts/{appId}/public/data/clientes
// Campos: nombre, taxId (RNC/Cédula), telefono, email, direccion, createdAt
//
// Solo para recibos internos (sin NCF/e-CF). El RNC/Cédula es opcional y
// se guarda como referencia del cliente, no como comprobante fiscal.

import { db, appId } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from './firebase-config.js';

window.crmClients = [];
window.crmClientsLoaded = false;
window.facturaSelectedClient = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.loadCrmClients = async function(force = false) {
    if (window.crmClientsLoaded && !force) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion'));
        window.crmClients = [];
        snap.forEach(d => window.crmClients.push({ id: d.id, ...d.data() }));
        window.crmClientsLoaded = true;
    } catch (e) { console.error("Error cargando clientes:", e); }
};

window.billingCustomerSearchLive = async function(term) {
    await window.loadCrmClients();

    // Si el texto ya no coincide con el cliente seleccionado, lo deseleccionamos
    if (window.facturaSelectedClient && window.facturaSelectedClient.nombre !== term) {
        window.facturaSelectedClient = null;
    }

    const dropdown = document.getElementById('billing-customer-suggestions');
    if (!dropdown) return;
    const clean = (term || '').trim().toLowerCase();

    let matches;
    if (clean.length < 1) {
        // Campo vacío (recién enfocado): mostramos todos los clientes guardados, más recientes primero
        matches = window.crmClients.slice().reverse().slice(0, 8);
        if (matches.length === 0) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    } else {
        matches = window.crmClients.filter(c =>
            (c.nombre || '').toLowerCase().includes(clean) ||
            (c.taxId || '').toLowerCase().includes(clean)
        ).slice(0, 6);
        if (matches.length === 0) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    }

    dropdown.innerHTML = matches.map(c => `
        <div onclick="window.selectCrmClientById('${c.id}')" class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-100 last:border-0">
            <div class="font-bold text-gray-800">${escapeHtml(c.nombre)}</div>
            <div class="text-gray-400">${escapeHtml(c.taxId) || 'Sin RNC/Cédula'}${c.telefono ? ' · ' + escapeHtml(c.telefono) : ''}${c.email ? ' · ' + escapeHtml(c.email) : ''}</div>
        </div>
    `).join('');
    dropdown.classList.remove('hidden');
};

window.selectCrmClientById = function(id) {
    const client = window.crmClients.find(c => c.id === id);
    if (!client) return;
    window.facturaSelectedClient = client;
    const input = document.getElementById('billing-customer-name');
    if (input) input.value = client.nombre;
    const emailInput = document.getElementById('billing-customer-email');
    if (emailInput) emailInput.value = client.email || '';
    window.hideCrmSuggestions();
};

window.hideCrmSuggestions = function() {
    const dropdown = document.getElementById('billing-customer-suggestions');
    if (dropdown) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; }
};

window.openAddCustomerModal = function() {
    const modal = document.getElementById('add-customer-modal');
    if (!modal) return;
    document.getElementById('new-customer-name').value = document.getElementById('billing-customer-name')?.value || '';
    document.getElementById('new-customer-taxid').value = '';
    document.getElementById('new-customer-phone').value = '';
    document.getElementById('new-customer-email').value = '';
    document.getElementById('new-customer-address').value = '';
    window.hideCrmSuggestions();
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => document.getElementById('new-customer-name')?.focus(), 50);
};

window.closeAddCustomerModal = function() {
    const modal = document.getElementById('add-customer-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.saveNewCustomer = async function() {
    const nombre = document.getElementById('new-customer-name').value.trim();
    if (!nombre) return window.showToast("⚠️ El nombre del cliente es obligatorio.");
    const btn = document.getElementById('btn-save-new-customer');
    const originalText = btn.innerHTML;
    btn.innerHTML = "Guardando..."; btn.disabled = true;
    try {
        const newClient = {
            nombre,
            taxId: document.getElementById('new-customer-taxid').value.trim(),
            telefono: document.getElementById('new-customer-phone').value.trim(),
            email: document.getElementById('new-customer-email').value.trim(),
            direccion: document.getElementById('new-customer-address').value.trim(),
            creditEnabled: false,
            creditLimit: 0,
            creditBalance: 0,
            createdAt: new Date().toISOString()
        };
        const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion'), newClient);
        const savedClient = { id: ref.id, ...newClient };
        window.crmClients.push(savedClient);
        window.selectCrmClientById(savedClient.id);
        // Si veníamos del flujo de "Crédito" en el modal de Cobrar, refrescamos ese aviso
        if (window.facturaPaymentMethod === 'Credito' && window.setBillingPaymentMethod) {
            window.setBillingPaymentMethod('Credito');
        }
        window.closeAddCustomerModal();
        window.showToast("✅ Cliente guardado.");
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error al guardar el cliente.");
    } finally {
        btn.innerHTML = originalText; btn.disabled = false;
    }
};

// Se llama al limpiar/resetear la facturación (ver window.clearBillingSelection en billing.js)
window.clearCrmSelection = function() {
    window.facturaSelectedClient = null;
    window.hideCrmSuggestions();
};

// ── PANEL "CLIENTES": listar, buscar, editar, eliminar, crédito ────────────
window._editingClientId = null;

window.renderClientsPanel = async function(filterTerm = "") {
    const listDiv = document.getElementById('clients-panel-list');
    if (!listDiv) return;
    await window.loadCrmClients();

    const clean = (filterTerm || "").trim().toLowerCase();
    let clients = window.crmClients.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    if (clean) {
        clients = clients.filter(c =>
            (c.nombre || '').toLowerCase().includes(clean) ||
            (c.taxId || '').toLowerCase().includes(clean) ||
            (c.telefono || '').toLowerCase().includes(clean) ||
            (c.id || '').toLowerCase().includes(clean)
        );
    }

    if (clients.length === 0) {
        listDiv.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">${clean ? 'No se encontró ningún cliente con esa búsqueda.' : 'Todavía no has agregado ningún cliente.'}</p>`;
        return;
    }

    listDiv.innerHTML = clients.map(c => {
        const hasDebt = c.creditEnabled && (c.creditBalance || 0) > 0;
        return `
        <div class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div class="min-w-0">
                <p class="font-bold text-gray-800 text-sm truncate">${escapeHtml(c.nombre)}</p>
                <p class="text-xs text-gray-400 truncate">${escapeHtml(c.taxId) || 'Sin RNC/Cédula'}${c.telefono ? ' · ' + escapeHtml(c.telefono) : ''}${c.email ? ' · ' + escapeHtml(c.email) : ''}</p>
                <p class="text-[10px] text-gray-300 mt-0.5">ID: ${c.id}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                ${hasDebt ? `<span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">Debe: RD$ ${(c.creditBalance).toLocaleString('en-US')}</span>` : (c.creditEnabled ? `<span class="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">Al día</span>` : '')}
                <button onclick="window.openEditCustomerModal('${c.id}')" class="text-xs font-bold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition">✏️ Editar</button>
            </div>
        </div>`;
    }).join('');
};

window.openEditCustomerModal = function(id) {
    const client = window.crmClients.find(c => c.id === id);
    if (!client) return;
    window._editingClientId = id;
    document.getElementById('edit-customer-name').value = client.nombre || '';
    document.getElementById('edit-customer-taxid').value = client.taxId || '';
    document.getElementById('edit-customer-phone').value = client.telefono || '';
    document.getElementById('edit-customer-email').value = client.email || '';
    document.getElementById('edit-customer-address').value = client.direccion || '';
    document.getElementById('edit-customer-credit-enabled').checked = !!client.creditEnabled;
    document.getElementById('edit-customer-credit-limit').value = client.creditLimit || 0;
    const balance = client.creditBalance || 0;
    document.getElementById('edit-customer-credit-balance').textContent = `RD$ ${balance.toLocaleString('en-US')}`;
    document.getElementById('btn-credit-payment').classList.toggle('hidden', balance <= 0);

    const modal = document.getElementById('edit-customer-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeEditCustomerModal = function() {
    window._editingClientId = null;
    const modal = document.getElementById('edit-customer-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.saveEditedCustomer = async function() {
    const id = window._editingClientId;
    if (!id) return;
    const nombre = document.getElementById('edit-customer-name').value.trim();
    if (!nombre) return window.showToast("⚠️ El nombre del cliente es obligatorio.");

    const btn = document.getElementById('btn-save-edited-customer');
    const originalText = btn.innerHTML;
    btn.innerHTML = "Guardando..."; btn.disabled = true;
    try {
        const updates = {
            nombre,
            taxId: document.getElementById('edit-customer-taxid').value.trim(),
            telefono: document.getElementById('edit-customer-phone').value.trim(),
            email: document.getElementById('edit-customer-email').value.trim(),
            direccion: document.getElementById('edit-customer-address').value.trim(),
            creditEnabled: document.getElementById('edit-customer-credit-enabled').checked,
            creditLimit: parseFloat(document.getElementById('edit-customer-credit-limit').value) || 0
        };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion', id), updates);
        const idx = window.crmClients.findIndex(c => c.id === id);
        if (idx > -1) window.crmClients[idx] = { ...window.crmClients[idx], ...updates };
        // Si es el cliente seleccionado en la venta actual y estamos en el flujo de Crédito, refrescamos ese aviso
        if (window.facturaSelectedClient?.id === id) {
            window.facturaSelectedClient = { ...window.facturaSelectedClient, ...updates };
            if (window.facturaPaymentMethod === 'Credito' && window.setBillingPaymentMethod) window.setBillingPaymentMethod('Credito');
        }
        window.closeEditCustomerModal();
        window.renderClientsPanel(document.getElementById('clients-panel-search')?.value || '');
        window.showToast("✅ Cliente actualizado.");
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error al actualizar el cliente.");
    } finally {
        btn.innerHTML = originalText; btn.disabled = false;
    }
};

window.deleteCustomer = async function() {
    const id = window._editingClientId;
    if (!id) return;
    const client = window.crmClients.find(c => c.id === id);
    if (client && client.creditBalance > 0) {
        if (!confirm(`Este cliente tiene un saldo pendiente de RD$ ${client.creditBalance.toLocaleString('en-US')}. ¿Seguro que quieres eliminarlo de todas formas?`)) return;
    } else if (!confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;

    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion', id));
        window.crmClients = window.crmClients.filter(c => c.id !== id);
        window.closeEditCustomerModal();
        window.renderClientsPanel(document.getElementById('clients-panel-search')?.value || '');
        window.showToast("✅ Cliente eliminado.");
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error al eliminar el cliente.");
    }
};

// Registrar un abono (pago parcial o total) contra el saldo de crédito del cliente
window.registerCreditPayment = async function() {
    const id = window._editingClientId;
    if (!id) return;
    const client = window.crmClients.find(c => c.id === id);
    if (!client) return;
    const currentBalance = client.creditBalance || 0;
    const amountStr = prompt(`Saldo actual: RD$ ${currentBalance.toLocaleString('en-US')}\n¿Cuánto abonó el cliente?`, currentBalance);
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return window.showToast("⚠️ Ingresa un monto válido.");

    const newBalance = Math.max(0, currentBalance - amount);
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion', id), { creditBalance: newBalance });
        client.creditBalance = newBalance;
        document.getElementById('edit-customer-credit-balance').textContent = `RD$ ${newBalance.toLocaleString('en-US')}`;
        document.getElementById('btn-credit-payment').classList.toggle('hidden', newBalance <= 0);
        window.renderClientsPanel(document.getElementById('clients-panel-search')?.value || '');
        window.showToast(`✅ Abono de RD$ ${amount.toLocaleString('en-US')} registrado.`);
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error al registrar el abono.");
    }
};

// Suma el monto de una venta a crédito al saldo del cliente (llamado desde generateManualInvoice)
window.addToClientCredit = async function(clientId, amount) {
    try {
        const client = window.crmClients.find(c => c.id === clientId);
        const newBalance = (client?.creditBalance || 0) + amount;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientesFacturacion', clientId), { creditBalance: newBalance });
        if (client) client.creditBalance = newBalance;
        return true;
    } catch (e) {
        console.error("Error actualizando crédito del cliente:", e);
        return false;
    }
};

// Reporte de Cuentas por Cobrar (clientes con saldo de crédito pendiente)
window.renderCreditReport = async function() {
    const listDiv = document.getElementById('report-credit-list');
    const totalEl = document.getElementById('report-credit-total');
    if (!listDiv) return;

    await window.loadCrmClients();
    const debtors = window.crmClients
        .filter(c => c.creditEnabled && (c.creditBalance || 0) > 0)
        .sort((a, b) => (b.creditBalance || 0) - (a.creditBalance || 0));

    const total = debtors.reduce((acc, c) => acc + (c.creditBalance || 0), 0);
    if (totalEl) totalEl.textContent = `RD$ ${total.toLocaleString('en-US')}`;

    if (debtors.length === 0) {
        listDiv.innerHTML = `<p class="text-sm text-gray-400 text-center py-4">Ningún cliente tiene saldo pendiente. 🎉</p>`;
        return;
    }

    listDiv.innerHTML = debtors.map(c => `
        <div class="flex items-center justify-between border-b border-gray-100 py-2 px-1">
            <div class="min-w-0">
                <p class="font-bold text-gray-800 text-sm truncate">${escapeHtml(c.nombre)}</p>
                <p class="text-xs text-gray-400 truncate">${c.telefono ? escapeHtml(c.telefono) : ''}${c.creditLimit ? ` · Límite: RD$ ${c.creditLimit.toLocaleString('en-US')}` : ''}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-sm font-extrabold text-amber-700">RD$ ${(c.creditBalance).toLocaleString('en-US')}</span>
                <button onclick="window.switchBillingSubTab('clients'); setTimeout(() => window.openEditCustomerModal('${c.id}'), 150)" class="text-xs font-bold text-blue-600 hover:text-blue-800 underline">Ver</button>
            </div>
        </div>
    `).join('');
};
