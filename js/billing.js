// ============================================================
// billing.js — Punto de venta / Facturación (POS)
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { addDoc, collection, doc, setDoc, updateDoc, runTransaction } from './firebase-config.js';

        window.facturaItems = [];
        window.facturaSelectedOrderId = null;
        window.facturaPaymentMethod = 'Efectivo';

        // Busca en vivo mientras el usuario escribe y muestra sugerencias en dropdown
        window.billingSearchLive = function(term) {
            const drop = document.getElementById('billing-suggestions-drop');
            const t = term.trim().toLowerCase();
            if (t.length < 2) { drop.classList.add('hidden'); return; }
            const matches = (window.catalogProducts || []).filter(p =>
                p.name.toLowerCase().includes(t) ||
                (p.barcode && p.barcode.toLowerCase().includes(t)) ||
                (p.brand && p.brand.toLowerCase().includes(t))
            ).slice(0, 12);
            if (!matches.length) { drop.innerHTML = '<p class="text-xs text-gray-400 p-3 text-center">Sin resultados.</p>'; drop.classList.remove('hidden'); return; }
            drop.innerHTML = matches.map(p => {
                const isOut = !!p.isAgotado || (typeof p.stock === 'number' && p.stock <= 0);
                const isWholesale = window.isWholesaler && p.wholesalePrice && p.wholesalePrice < p.price;
                const activePrice = isWholesale ? p.wholesalePrice : p.price;
                const stockTag = typeof p.stock === 'number' ? `<span class="text-[9px] font-bold ${isOut ? 'text-red-500' : 'text-green-600'}">${isOut ? 'Agotado' : p.stock + ' disp.'}</span>` : '';
                const priceHtml = isWholesale
                    ? `<span class="text-yellow-700 font-extrabold whitespace-nowrap text-xs">RD$ ${p.wholesalePrice.toLocaleString('en-US')} <span class="text-[9px] bg-yellow-100 px-1 rounded">MAYOR</span></span>`
                    : `<span class="text-green-700 font-extrabold whitespace-nowrap text-xs">RD$ ${p.price.toLocaleString('en-US')}</span>`;
                return `<div onclick="${!isOut ? `window.addBillingItem('${p.id}','${p.name.replace(/'/g,"\'")}',${activePrice});document.getElementById('billing-code-input').value='';document.getElementById('billing-suggestions-drop').classList.add('hidden');document.getElementById('billing-code-input').focus()` : ''}"
                    class="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 ${isOut ? 'opacity-40 pointer-events-none' : 'hover:bg-blue-50 cursor-pointer'}">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-gray-800 truncate">${p.name}</p>
                        <p class="text-[10px] text-gray-400">${p.brand || ''}${p.barcode ? ' · ' + p.barcode : ''} ${stockTag}</p>
                    </div>
                    ${priceHtml}
                </div>`;
            }).join('');
            drop.classList.remove('hidden');
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#billing-code-input') && !e.target.closest('#billing-suggestions-drop')) {
                document.getElementById('billing-suggestions-drop')?.classList.add('hidden');
            }
        });

        window.billingAddByCode = function(val) {
            const t = val.trim(); if (!t) return;
            let prod = window.catalogProducts.find(p => p.barcode && p.barcode.toLowerCase() === t.toLowerCase());
            if (!prod) {
                const matches = window.catalogProducts.filter(p => p.name.toLowerCase().includes(t.toLowerCase()));
                if (matches.length === 1) prod = matches[0];
                else if (matches.length > 1) { window.billingSearchLive(t); document.getElementById('billing-code-input').select(); return; }
            }
            if (!prod) return window.showToast('Producto no encontrado. Selecciónalo de la lista.');
            const isWholesale = window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price;
            const activePrice = isWholesale ? prod.wholesalePrice : prod.price;
            window.addBillingItem(prod.id, prod.name, activePrice);
            document.getElementById('billing-code-input').value = '';
            document.getElementById('billing-suggestions-drop').classList.add('hidden');
            document.getElementById('billing-code-input').focus();
        }

        window.addBillingItemByBarcode = function(code) {
            const prod = window.catalogProducts.find(p => p.barcode && p.barcode === code);
            if (!prod) return window.showToast("⚠️ Producto no encontrado con ese código.");
            window.addBillingItem(prod.id, prod.name, prod.price);
        }

        window.addBillingItem = function(prodId, name, price) {
            const prod = window.catalogProducts.find(p => p.id === prodId);
            if (prod && (!!prod.isAgotado || (typeof prod.stock === 'number' && prod.stock <= 0))) return window.showToast("⚠️ Ese producto está agotado.");
            const existing = window.facturaItems.find(i => i.id === prodId);
            const currentQty = existing ? existing.qty : 0;
            if (prod && typeof prod.stock === 'number' && (currentQty + 1) > prod.stock) return window.showToast(`Solo quedan ${prod.stock} unidades.`);
            if (existing) { existing.qty += 1; }
            else { window.facturaItems.push({ id: prodId, name, price, qty: 1, img: prod?.img || '', barcode: prod?.barcode || '', cost: prod?.cost || null }); }
            window.renderBillingItems();
        }

        window.updateBillingItemQty = function(idx, delta) {
            const item = window.facturaItems[idx]; if (!item) return;
            const prod = window.catalogProducts.find(p => p.id === item.id);
            const newQty = item.qty + delta;
            if (newQty < 1) return window.removeBillingItem(idx);
            if (prod && typeof prod.stock === 'number' && newQty > prod.stock) return window.showToast(`Solo quedan ${prod.stock} unidades.`);
            item.qty = newQty;
            window.renderBillingItems();
        }

        window.updateBillingItemPrice = function(idx, val) {
            const p = parseFloat(val); if (isNaN(p) || p < 0) return;
            window.facturaItems[idx].price = p;
            window.renderBillingItems();
        }

        window.updateBillingItemDiscount = function(idx, val) {
            const d = parseFloat(val) || 0;
            window.facturaItems[idx].lineDiscount = d;
            window.renderBillingItems();
        }

        window.removeBillingItem = function(idx) {
            window.facturaItems.splice(idx, 1);
            window.renderBillingItems();
        }

        window.applyBillingDiscountPct = function() {
            const pct = parseFloat(document.getElementById('billing-discount-pct')?.value) || 0;
            const subtotal = window.facturaItems.reduce((a, i) => a + i.price * i.qty, 0);
            const el = document.getElementById('billing-discount');
            if (el) el.value = Math.round(subtotal * pct / 100);
            window.renderBillingItems();
        }

        window.calcChange = function() {
            const total = window._billingCurrentTotal || 0;
            const received = parseFloat(document.getElementById('billing-cash-received')?.value) || 0;
            const el = document.getElementById('billing-change-display');
            if (el) el.innerText = `RD$ ${Math.max(0, received - total).toLocaleString('en-US')}`;
        }

        window.renderBillingItems = function() {
            const tbody = document.getElementById('billing-items-list');         // Desktop tabla
            const mobileDiv = document.getElementById('billing-items-mobile');   // Mobile tarjetas
            const totalEl = document.getElementById('billing-total');
            const subtotalEl = document.getElementById('billing-subtotal-display');
            const discountDisplayEl = document.getElementById('billing-discount-display');
            if (!totalEl) return;

            const globalDiscount = parseFloat(document.getElementById('billing-discount')?.value) || 0;

            // ----- Estado vacío -----
            if (window.facturaItems.length === 0) {
                const emptyHTML = `<tr id="billing-empty-row"><td colspan="8" class="text-center text-gray-400 text-sm py-16">
                    <div class="flex flex-col items-center gap-2">
                        <svg class="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                        <span class="font-medium">Escanea un código o busca un producto para comenzar</span>
                    </div></td></tr>`;
                if (tbody) tbody.innerHTML = emptyHTML;
                if (mobileDiv) mobileDiv.innerHTML = `<div class="flex flex-col items-center justify-center text-gray-400 py-14 gap-2">
                    <svg class="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                    <span class="text-sm font-medium text-center px-4">Escribe o escanea un producto para comenzar</span>
                </div>`;
                totalEl.innerText = 'RD$ 0.00';
                if (subtotalEl) { subtotalEl.innerText = ''; subtotalEl.classList.add('hidden'); }
                if (discountDisplayEl) { discountDisplayEl.innerText = ''; discountDisplayEl.classList.add('hidden'); }
                window._billingCurrentTotal = 0;
                window.calcChange();
                return;
            }

            let subtotal = 0;
            let tableHTML = '';
            let mobileHTML = '';

            window.facturaItems.forEach((item, idx) => {
                const lineDisc = item.lineDiscount || 0;
                const lineTotal = (item.price * item.qty) - lineDisc;
                subtotal += lineTotal;
                const prod = window.catalogProducts.find(p => p.id === item.id);
                const stockVal = prod && typeof prod.stock === 'number' ? prod.stock : '—';
                const stockColor = stockVal === '—' ? 'text-gray-400' : stockVal <= 0 ? 'text-red-500 font-bold' : stockVal <= 3 ? 'text-amber-600 font-bold' : 'text-gray-600';
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                // ----- Fila de tabla (desktop) -----
                tableHTML += `<tr class="${rowBg} border-b border-gray-200 hover:bg-blue-50 transition-colors">
                    <td class="px-3 py-2 text-xs text-gray-400 font-bold text-center">${idx + 1}</td>
                    <td class="px-3 py-2">
                        <p class="text-xs font-bold text-gray-800 leading-tight">${item.name}</p>
                        ${item.barcode ? `<p class="text-[9px] text-gray-400 font-mono leading-tight">${item.barcode}</p>` : ''}
                    </td>
                    <td class="px-3 py-2 text-right">
                        <input type="number" value="${item.price}" onchange="window.updateBillingItemPrice(${idx}, this.value)"
                            class="w-24 text-right text-xs font-bold border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-2 py-1 focus:outline-none bg-transparent">
                    </td>
                    <td class="px-3 py-2">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="window.updateBillingItemQty(${idx},-1)" class="w-7 h-7 rounded bg-gray-200 hover:bg-red-100 hover:text-red-600 font-extrabold text-sm flex items-center justify-center transition select-none">−</button>
                            <span class="w-8 text-center text-sm font-extrabold text-gray-800">${item.qty}</span>
                            <button onclick="window.updateBillingItemQty(${idx},1)" class="w-7 h-7 rounded bg-gray-200 hover:bg-green-100 hover:text-green-600 font-extrabold text-sm flex items-center justify-center transition select-none">+</button>
                        </div>
                    </td>
                    <td class="px-3 py-2 text-right text-sm font-extrabold text-gray-900">RD$ ${lineTotal.toLocaleString('en-US')}</td>
                    <td class="px-3 py-2 text-center text-xs font-bold ${stockColor}">${stockVal}</td>
                    <td class="px-3 py-2">
                        <input type="number" value="${lineDisc}" min="0" onchange="window.updateBillingItemDiscount(${idx}, this.value)"
                            class="w-24 text-right text-xs border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-2 py-1 focus:outline-none bg-transparent">
                    </td>
                    <td class="px-2 py-2 text-center">
                        <button onclick="window.removeBillingItem(${idx})" class="text-gray-300 hover:text-red-500 transition font-bold text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-red-50">×</button>
                    </td>
                </tr>`;

                // ----- Tarjeta móvil -----
                mobileHTML += `<div class="bg-white px-4 py-3 ${idx % 2 !== 0 ? 'bg-gray-50' : ''}">
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-gray-800 leading-tight">${item.name}</p>
                            ${item.barcode ? `<p class="text-[10px] text-gray-400 font-mono">${item.barcode}</p>` : ''}
                            <p class="text-[10px] text-gray-400 mt-0.5">Stock: <span class="${stockColor}">${stockVal}</span></p>
                        </div>
                        <button onclick="window.removeBillingItem(${idx})" class="text-gray-300 hover:text-red-500 text-xl font-bold leading-none p-1 shrink-0">×</button>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <!-- Cantidad -->
                        <div class="flex items-center gap-2">
                            <button onclick="window.updateBillingItemQty(${idx},-1)" class="w-9 h-9 rounded-lg bg-gray-200 hover:bg-red-100 hover:text-red-600 font-extrabold text-lg flex items-center justify-center transition select-none">−</button>
                            <span class="w-8 text-center text-base font-extrabold text-gray-900">${item.qty}</span>
                            <button onclick="window.updateBillingItemQty(${idx},1)" class="w-9 h-9 rounded-lg bg-gray-200 hover:bg-green-100 hover:text-green-600 font-extrabold text-lg flex items-center justify-center transition select-none">+</button>
                        </div>
                        <!-- Precio editable -->
                        <div class="flex flex-col items-end">
                            <div class="flex items-center gap-1">
                                <span class="text-[10px] text-gray-400">RD$</span>
                                <input type="number" value="${item.price}" onchange="window.updateBillingItemPrice(${idx}, this.value)"
                                    class="w-20 text-right text-sm font-bold border-b-2 border-gray-300 focus:border-blue-500 outline-none bg-transparent py-0.5">
                            </div>
                            <p class="text-[10px] text-gray-400 mt-0.5">Subtotal: <span class="font-extrabold text-gray-700">RD$ ${lineTotal.toLocaleString('en-US')}</span></p>
                        </div>
                    </div>
                    ${lineDisc > 0 ? `<p class="text-[10px] text-green-600 font-bold mt-1">Desc. línea: −RD$ ${lineDisc.toLocaleString('en-US')}</p>` : ''}
                </div>`;
            });

            if (tbody) tbody.innerHTML = tableHTML;
            if (mobileDiv) mobileDiv.innerHTML = mobileHTML;

            const total = Math.max(0, subtotal - globalDiscount);
            window._billingCurrentTotal = total;
            totalEl.innerText = `RD$ ${total.toLocaleString('en-US')}`;

            if (globalDiscount > 0) {
                if (subtotalEl) { subtotalEl.innerText = `Subtotal: RD$ ${subtotal.toLocaleString('en-US')}`; subtotalEl.classList.remove('hidden'); }
                if (discountDisplayEl) { discountDisplayEl.innerText = `Desc.: − RD$ ${globalDiscount.toLocaleString('en-US')}`; discountDisplayEl.classList.remove('hidden'); }
            } else {
                if (subtotalEl) subtotalEl.classList.add('hidden');
                if (discountDisplayEl) discountDisplayEl.classList.add('hidden');
            }
            window.calcChange();
        }

        window.setBillingPaymentMethod = function(method) {
            window.facturaPaymentMethod = method;
            const styles = {
                Efectivo: 'border-green-600 bg-green-50 text-green-700',
                Tarjeta: 'border-purple-500 bg-purple-50 text-purple-700',
                Transferencia: 'border-blue-500 bg-blue-50 text-blue-700',
                Mixto: 'border-amber-500 bg-amber-50 text-amber-700',
                Credito: 'border-red-500 bg-red-50 text-red-700'
            };
            ['Efectivo','Tarjeta','Transferencia','Mixto','Credito'].forEach(m => {
                const el = document.getElementById(`billing-pay-btn-${m.toLowerCase()}`); if (!el) return;
                const active = m === method;
                el.className = `flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${active ? styles[m] : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`;
            });
            const entity = document.getElementById('billing-payment-entity');
            const cashCalc = document.getElementById('billing-cash-calculator');
            const creditWarning = document.getElementById('billing-credit-warning');
            if (entity) entity.classList.toggle('hidden', method !== 'Transferencia');
            if (cashCalc) cashCalc.classList.toggle('hidden', method === 'Transferencia' || method === 'Tarjeta' || method === 'Credito');

            if (creditWarning) {
                if (method === 'Credito') {
                    const client = window.facturaSelectedClient;
                    if (!client) {
                        creditWarning.innerHTML = `⚠️ Elige un cliente guardado arriba para venderle a crédito, o
                            <button type="button" onclick="window.openAddCustomerModal()" class="underline font-bold text-amber-900 hover:text-amber-950">agrégalo ahora mismo</button>.`;
                        creditWarning.classList.remove('hidden');
                    } else if (!client.creditEnabled) {
                        creditWarning.innerHTML = `⚠️ ${client.nombre} no tiene crédito habilitado.
                            <button type="button" onclick="window.openEditCustomerModal('${client.id}')" class="underline font-bold text-amber-900 hover:text-amber-950">Habilítalo ahora</button>.`;
                        creditWarning.classList.remove('hidden');
                    } else {
                        const total = window._billingCurrentTotal || 0;
                        const projected = (client.creditBalance || 0) + total;
                        const limit = client.creditLimit || 0;
                        if (limit > 0 && projected > limit) {
                            creditWarning.innerHTML = `⚠️ Esta venta dejaría a ${client.nombre} debiendo RD$ ${projected.toLocaleString('en-US')}, por encima de su límite de RD$ ${limit.toLocaleString('en-US')}.`;
                        } else {
                            creditWarning.innerHTML = `ℹ️ Se sumará RD$ ${total.toLocaleString('en-US')} al saldo de ${client.nombre} (deberá: RD$ ${projected.toLocaleString('en-US')}).`;
                        }
                        creditWarning.classList.remove('hidden');
                    }
                } else {
                    creditWarning.classList.add('hidden');
                }
            }
        }

        // ── MODAL DE COBRAR (estilo Eleventa) ──
        window.openCobrarModal = function() {
            if (window.facturaItems.length === 0) return window.showToast("Agrega al menos un producto al ticket.");
            const modal = document.getElementById('billing-cobrar-modal');
            if (!modal) return;
            document.getElementById('cobrar-modal-total').innerText = document.getElementById('billing-total').innerText;
            document.getElementById('cobrar-modal-article-count').innerText = window.facturaItems.reduce((acc, i) => acc + i.qty, 0);
            document.getElementById('billing-cash-received').value = '';
            window.setBillingPaymentMethod('Efectivo');
            window.calcChange();
            modal.classList.remove('hidden'); modal.classList.add('flex');
            document.addEventListener('keydown', window._cobrarModalKeyHandler);
            setTimeout(() => document.getElementById('billing-cash-received')?.focus(), 50);
        }

        window.closeCobrarModal = function() {
            const modal = document.getElementById('billing-cobrar-modal');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
            document.removeEventListener('keydown', window._cobrarModalKeyHandler);
        }

        window._cobrarModalKeyHandler = function(e) {
            if (e.key === 'F1') { e.preventDefault(); window.generateManualInvoice(true); }
            else if (e.key === 'F2') { e.preventDefault(); window.generateManualInvoice(false); }
            else if (e.key === 'Escape') { e.preventDefault(); window.closeCobrarModal(); }
        }

        window.toggleBillingOrdersDrawer = function() {
            const drawer = document.getElementById('billing-orders-drawer');
            if (!drawer) return;
            const isHidden = drawer.classList.contains('hidden');
            if (isHidden) {
                // Posicionar el drawer debajo del botón que lo abre
                const btn = document.querySelector('[onclick*="toggleBillingOrdersDrawer"]');
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    drawer.style.top = (rect.bottom + 6) + 'px';
                } else {
                    drawer.style.top = '110px';
                }

                if (!window.adminOrders || window.adminOrders.length === 0) {
                    window.loadAdminOrders().then(() => window.renderBillingOrdersList());
                } else {
                    window.renderBillingOrdersList();
                }
                drawer.classList.remove('hidden');

                setTimeout(() => {
                    document.addEventListener('click', function closeBillingDrawer(e) {
                        if (!drawer.contains(e.target) && !e.target.closest('[onclick*="toggleBillingOrdersDrawer"]')) {
                            drawer.classList.add('hidden');
                            document.removeEventListener('click', closeBillingDrawer);
                        }
                    });
                }, 50);
            } else {
                drawer.classList.add('hidden');
            }
        }

        window.renderBillingOrdersList = function() {
            const listDiv = document.getElementById('billing-orders-list');
            const countEl = document.getElementById('billing-pending-count');
            if (!listDiv) return;
            const pending = (window.adminOrders || []).filter(o => o.status !== 'Completado' && o.status !== 'Cancelado' && o.status !== 'Eliminado');
            if (countEl) countEl.innerText = pending.length;
            if (!pending.length) { listDiv.innerHTML = `<p class="text-xs text-gray-400 text-center py-3">No hay pedidos en proceso.</p>`; return; }
            listDiv.innerHTML = pending.map(order => {
                const isSelected = window.facturaSelectedOrderId === order.id;
                const itemCount = (order.items || []).reduce((s, i) => s + i.qty, 0);
                return `<button onclick="window.selectBillingOrder('${order.id}')"
                    class="w-full text-left px-3 py-2 rounded border-2 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'} transition mb-1">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-extrabold text-gray-700">${order.orderId || '#PED-XXX'}</span>
                        <span class="text-[9px] text-gray-400">${itemCount} art. · RD$ ${(order.total||0).toLocaleString('en-US')}</span>
                    </div>
                    <p class="text-xs text-gray-600 truncate">${order.customerName || 'Cliente'}</p>
                </button>`;
            }).join('');
        }

        window.selectBillingOrder = function(orderId) {
            const order = window.adminOrders.find(o => o.id === orderId); if (!order) return;
            window.facturaSelectedOrderId = orderId;
            window.facturaItems = (order.items || []).map(i => {
                const prod = window.catalogProducts.find(p => p.id === i.id);
                return { ...i, cost: i.cost !== undefined ? i.cost : (prod?.cost || null) };
            });
            document.getElementById('billing-customer-name').value = order.customerName || '';
            const badge = document.getElementById('billing-selected-order-badge');
            if (badge) { badge.classList.remove('hidden'); badge.classList.add('flex'); }
            document.getElementById('billing-selected-order-label').innerText = order.orderId || '#PED-XXX';
            window.renderBillingOrdersList();
            window.renderBillingItems();
            document.getElementById('billing-orders-drawer')?.classList.add('hidden');
            document.getElementById('billing-code-input')?.focus();
            window.showToast("Pedido cargado.");
        }

        window.clearBillingSelection = function() {
            window.facturaSelectedOrderId = null;
            window.facturaItems = [];
            if (window.clearCrmSelection) window.clearCrmSelection();
            ['billing-customer-name','billing-customer-email','billing-payment-entity','billing-cash-received'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            ['billing-discount','billing-discount-pct'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0'; });
            document.getElementById('billing-payment-entity')?.classList.add('hidden');
            document.getElementById('billing-orders-drawer')?.classList.add('hidden');
            const badge = document.getElementById('billing-selected-order-badge');
            if (badge) { badge.classList.add('hidden'); badge.classList.remove('flex'); }
            window.setBillingPaymentMethod('Efectivo');
            window.renderBillingOrdersList();
            window.renderBillingItems(); // actualiza tabla desktop + tarjetas mobile
            document.getElementById('billing-code-input')?.focus();
        }


        window.openBillingModal = async function() {
            window.closeProfileModal();
            // Cerrar otros modales sin disparar su routing
            const adminModal = document.getElementById('admin-modal');
            if (adminModal) { adminModal.classList.add('opacity-0'); setTimeout(()=>{ adminModal.style.display='none'; }, 300); }
            const ordersModal = document.getElementById('orders-dashboard-modal');
            if (ordersModal) { ordersModal.classList.add('opacity-0'); setTimeout(()=>{ ordersModal.style.display='none'; }, 300); }

            const modal = document.getElementById('billing-modal');
            if (!modal) return;
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.height = '100dvh';
            modal.classList.remove('opacity-0');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
            history.replaceState({}, '', '/facturacion');
            window.switchBillingSubTab('invoice');
            if (!window.adminOrders || window.adminOrders.length === 0) await window.loadAdminOrders();
            window.renderBillingOrdersList();
            if (window.innerWidth >= 768) {
                setTimeout(() => document.getElementById('billing-code-input')?.focus(), 200);
            }
        }

        window.closeBillingModal = function() {
            const modal = document.getElementById('billing-modal');
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            history.replaceState({}, '', '/');
        }

        // Abre el Panel de Admin directamente en la pestaña de Productos
        // para agregar un producto nuevo sin salir de Facturación
        window.openBillingAddProduct = function() {
            // Cierra el billing modal para abrir el admin encima limpiamente
            const billingModal = document.getElementById('billing-modal');
            if (billingModal) billingModal.style.display = 'none';

            // Abre el panel admin directamente en la pestaña de Productos
            const adminModal = document.getElementById('admin-modal');
            if (!adminModal) return;
            adminModal.style.display = 'flex';
            adminModal.style.flexDirection = 'column';
            adminModal.style.zIndex = '300'; // encima de todo
            setTimeout(() => adminModal.classList.remove('opacity-0'), 10);
            window.renderAdminDecants();
            window.renderShippingAgencies();
            window.switchAdminTab('products');
            window.resetAdminForm();

            // Sobrescribe temporalmente closeAdminModal para regresar a Facturación
            const origClose = window.closeAdminModal;
            window.closeAdminModal = function() {
                adminModal.classList.add('opacity-0');
                setTimeout(() => {
                    adminModal.style.display = 'none';
                    adminModal.style.zIndex = '200'; // restaurar z-index
                }, 300);
                window.closeAdminModal = origClose; // restaurar función original
                // Cargar nuevos productos y regresar al billing
                window.loadDynamicProducts(true).then(() => {
                    window.showToast("✅ Catálogo actualizado.");
                    window.openBillingModal();
                });
            };
        }

        window.switchBillingSubTab = function(tab) {
            const subtabs = ['invoice', 'inventory', 'movements', 'history', 'reports', 'settings', 'printer', 'clients'];
            subtabs.forEach(t => {
                const el = document.getElementById('billing-subtab-' + t); const btn = document.getElementById('billing-subtab-btn-' + t);
                if (el) el.classList.add('hidden');
                if (btn) { btn.classList.replace('text-perfume-magenta', 'text-gray-500'); btn.classList.remove('border-b-2', 'border-perfume-magenta'); }
            });
            document.getElementById('billing-subtab-' + tab).classList.remove('hidden');
            const activeBtn = document.getElementById('billing-subtab-btn-' + tab);
            activeBtn.classList.replace('text-gray-500', 'text-perfume-magenta'); activeBtn.classList.add('border-b-2', 'border-perfume-magenta');

            if (tab === 'inventory') window.renderInventoryTable();
            if (tab === 'movements') window.loadInventoryMovements();
            if (tab === 'history') window.renderInvoiceHistory();
            if (tab === 'reports') { window.setReportRange(window.currentReportRange || 'today'); window.renderCreditReport(); }
            if (tab === 'settings') window.loadInvoiceConfigForm();
            if (tab === 'printer' && window.checkQzStatus) window.checkQzStatus();
            if (tab === 'clients' && window.renderClientsPanel) window.renderClientsPanel();
        }

        // ── DATOS DE FACTURA (aislado del formulario general de Configuración) ──
        // Lee/guarda SOLO estas claves puntuales, con merge:true, para que
        // nunca pueda pisar accidentalmente el resto del diseño de la tienda.
        window.loadInvoiceConfigForm = function() {
            const cfg = window.siteConfig || {};
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            const setChk = (id, val, def = false) => { const el = document.getElementById(id); if (el) el.checked = val !== undefined ? val : def; };
            setVal('inv-cfg-business-name', cfg.invBusinessName);
            setVal('inv-cfg-tax-id', cfg.invTaxId);
            setVal('inv-cfg-address', cfg.invAddress);
            setVal('inv-cfg-tagline', cfg.invTagline);
            setVal('inv-cfg-whatsapp', cfg.invWhatsapp);
            setVal('inv-cfg-instagram', cfg.invInstagram);
            setVal('inv-cfg-tiktok', cfg.invTiktok);
            setVal('inv-cfg-footer-msg', cfg.invFooterMsg);
            setVal('inv-cfg-footer-extra', cfg.invFooterExtra);
            setVal('inv-cfg-logo-url', cfg.invLogoUrl);
            const fontFamilySel = document.getElementById('inv-cfg-font-family'); if (fontFamilySel) fontFamilySel.value = cfg.invFontFamily || 'helvetica';
            const fontWeightSel = document.getElementById('inv-cfg-font-weight'); if (fontWeightSel) fontWeightSel.value = cfg.invFontWeight || 'normal';
            const spacingSel = document.getElementById('inv-cfg-line-spacing'); if (spacingSel) spacingSel.value = cfg.invLineSpacing || 'normal';
            const fontSizeSel = document.getElementById('inv-cfg-font-size'); if (fontSizeSel) fontSizeSel.value = (cfg.invFontSize || 16);
            setChk('inv-cfg-show-logo', cfg.invShowLogo, true);
            setChk('inv-cfg-show-unit-price', cfg.invShowUnitPrice, false);
            setChk('inv-cfg-full-description', cfg.invFullDescription, false);
            setChk('inv-cfg-print-client-name', cfg.invPrintClientName, true);
            setChk('inv-cfg-print-client-phone', cfg.invPrintClientPhone, false);
            setChk('inv-cfg-print-client-taxid', cfg.invPrintClientTaxId, false);
            setChk('inv-cfg-print-client-address', cfg.invPrintClientAddress, false);
            setVal('inv-cfg-emailjs-service', cfg.emailjsServiceId || 'service_tahlcsm');
            setVal('inv-cfg-emailjs-template', cfg.emailjsTemplateId || 'template_9jzzasl');
            setVal('inv-cfg-emailjs-pubkey', cfg.emailjsPublicKey || 'gNeoOBpSmrXsW7E1J');
            setChk('inv-cfg-email-enabled', cfg.emailAutoSend, true);
            window.initEmailJs();
            window.renderTicketPreview();
        }

        window.saveInvoiceConfig = async function() {
            const btn = document.getElementById('btn-save-inv-cfg');
            const originalText = btn.innerHTML;
            btn.innerHTML = "Guardando..."; btn.disabled = true;
            try {
                const gv = (id) => document.getElementById(id).value.trim();
                const gc = (id) => document.getElementById(id).checked;
                const invData = {
                    invBusinessName: gv('inv-cfg-business-name'),
                    invTaxId: gv('inv-cfg-tax-id'),
                    invAddress: gv('inv-cfg-address'),
                    invTagline: gv('inv-cfg-tagline'),
                    invWhatsapp: gv('inv-cfg-whatsapp'),
                    invInstagram: gv('inv-cfg-instagram'),
                    invTiktok: gv('inv-cfg-tiktok'),
                    invFooterMsg: gv('inv-cfg-footer-msg'),
                    invFooterExtra: gv('inv-cfg-footer-extra'),
                    invLogoUrl: gv('inv-cfg-logo-url'),
                    invFontFamily: document.getElementById('inv-cfg-font-family').value,
                    invFontWeight: document.getElementById('inv-cfg-font-weight').value,
                    invLineSpacing: document.getElementById('inv-cfg-line-spacing').value,
                    invFontSize: parseInt(document.getElementById('inv-cfg-font-size').value) || 16,
                    invShowLogo: gc('inv-cfg-show-logo'),
                    invShowUnitPrice: gc('inv-cfg-show-unit-price'),
                    invFullDescription: gc('inv-cfg-full-description'),
                    invPrintClientName: gc('inv-cfg-print-client-name'),
                    invPrintClientPhone: gc('inv-cfg-print-client-phone'),
                    invPrintClientTaxId: gc('inv-cfg-print-client-taxid'),
                    invPrintClientAddress: gc('inv-cfg-print-client-address'),
                    emailjsServiceId: gv('inv-cfg-emailjs-service'),
                    emailjsTemplateId: gv('inv-cfg-emailjs-template'),
                    emailjsPublicKey: gv('inv-cfg-emailjs-pubkey'),
                    emailAutoSend: gc('inv-cfg-email-enabled')
                };
                // merge:true — solo toca estas claves, el resto del documento de config queda intacto
                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), invData, { merge: true });
                window.siteConfig = { ...(window.siteConfig || {}), ...invData };
                window.cachedPdfLogo = null; // fuerza a recargar el logo con la URL nueva la próxima vez que se imprima
                window.initEmailJs();
                window.showToast("✅ Datos de factura guardados.");
            } catch (e) {
                console.error(e);
                window.showToast("❌ Error al guardar los datos de factura.");
            } finally {
                btn.innerHTML = originalText; btn.disabled = false;
            }
        }

        // Ticket de ejemplo usado tanto para la vista previa en vivo como para la prueba de impresión real
        function getSampleTicketData() {
            return {
                orderId: '#DEMO-0001',
                date: new Date().toISOString(),
                customerName: 'Cliente de Ejemplo',
                customerTaxId: '001-1234567-8',
                customerPhone: '849-000-0000',
                customerAddress: 'Calle Ejemplo #12, Santiago',
                paymentMethod: 'Efectivo',
                items: [
                    { name: 'Agua Ciel 600ml', qty: 1, price: 7 },
                    { name: 'Coca Cola Light', qty: 1, price: 8 },
                    { name: 'Coca Sprite', qty: 1, price: 8 },
                    { name: 'Tomate', qty: 1, price: 10 }
                ],
                total: 33
            };
        }

        // Vista previa en vivo, estilo Eleventa: se re-dibuja cada vez que el admin
        // cambia un campo del formulario. Lee directo del DOM (no de Firestore) para
        // reflejar cambios sin guardar todavía.
        window.renderTicketPreview = function() {
            const box = document.getElementById('ticket-preview');
            if (!box) return;
            const gv = (id) => document.getElementById(id)?.value.trim() || '';
            const gc = (id) => document.getElementById(id)?.checked || false;

            const businessName = gv('inv-cfg-business-name') || 'FamlyFragrancerd';
            const tagline = gv('inv-cfg-tagline');
            const address = gv('inv-cfg-address');
            const taxId = gv('inv-cfg-tax-id');
            const whatsapp = gv('inv-cfg-whatsapp');
            const instagram = gv('inv-cfg-instagram');
            const tiktok = gv('inv-cfg-tiktok');
            const footerMsg = gv('inv-cfg-footer-msg') || '¡Gracias por su compra!';
            const footerExtra = gv('inv-cfg-footer-extra');
            const logoUrl = gv('inv-cfg-logo-url') || window.siteConfig?.logoUrl || "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png";
            const fontFamily = document.getElementById('inv-cfg-font-family')?.value || 'helvetica';
            const fontWeight = document.getElementById('inv-cfg-font-weight')?.value || 'normal';
            const cssFontFamily = { helvetica: "'Helvetica', Arial, sans-serif", courier: "'Courier New', monospace", times: "'Times New Roman', serif" }[fontFamily];
            box.style.fontFamily = cssFontFamily;
            box.style.fontWeight = fontWeight === 'bold' ? '700' : '400';
            const showLogo = gc('inv-cfg-show-logo');
            const showUnitPrice = gc('inv-cfg-show-unit-price');
            const printClientName = gc('inv-cfg-print-client-name');
            const printClientPhone = gc('inv-cfg-print-client-phone');
            const printClientTaxId = gc('inv-cfg-print-client-taxid');
            const printClientAddress = gc('inv-cfg-print-client-address');
            const lineSpacing = document.getElementById('inv-cfg-line-spacing')?.value || 'normal';
            const sepMargin = { compact: 'my-0.5', normal: 'my-2', wide: 'my-4' }[lineSpacing];
            const itemGap = { compact: '', normal: 'mb-1', wide: 'mb-2.5' }[lineSpacing];
            const blockGap = { compact: '', normal: 'mt-1', wide: 'mt-3' }[lineSpacing];

            const sample = getSampleTicketData();
            const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            let html = '';
            if (showLogo && logoUrl) {
                html += `<div class="flex justify-center py-1"><img src="${esc(logoUrl)}" class="h-12 object-contain" onerror="this.style.display='none'"></div>`;
            }
            html += `<div class="text-center font-bold text-[12px]">${esc(businessName)}</div>`;
            if (tagline) html += `<div class="text-center italic">${esc(tagline)}</div>`;
            if (address) html += `<div class="text-center">${esc(address)}</div>`;
            if (taxId) html += `<div class="text-center">RNC/Cédula: ${esc(taxId)}</div>`;
            if (whatsapp) html += `<div class="text-center">WhatsApp: ${esc(whatsapp)}</div>`;
            if (instagram) html += `<div class="text-center">Instagram: ${esc(instagram)}</div>`;
            if (tiktok) html += `<div class="text-center">Tiktok: ${esc(tiktok)}</div>`;
            html += `<div class="border-t border-dashed border-gray-400 ${sepMargin}"></div>`;
            html += `<div class="${blockGap}">${new Date(sample.date).toLocaleString('es-DO')}</div>`;
            html += `<div>Ticket: ${sample.orderId}</div>`;
            if (printClientName) html += `<div>Cliente: ${esc(sample.customerName)}</div>`;
            if (printClientTaxId) html += `<div>RNC/Cédula cliente: ${esc(sample.customerTaxId)}</div>`;
            if (printClientPhone) html += `<div>Tel. cliente: ${esc(sample.customerPhone)}</div>`;
            if (printClientAddress) html += `<div>Dirección cliente: ${esc(sample.customerAddress)}</div>`;
            html += `<div class="border-t border-dashed border-gray-400 ${sepMargin}"></div>`;
            sample.items.forEach(item => {
                const lineTotal = (item.price * item.qty).toLocaleString('en-US');
                html += `<div class="flex justify-between ${itemGap}"><span>${item.qty}x ${esc(item.name)}</span><span>RD$ ${lineTotal}</span></div>`;
                if (showUnitPrice) html += `<div class="text-gray-500 pl-3 ${itemGap}">P. unit: RD$ ${item.price.toLocaleString('en-US')}</div>`;
            });
            html += `<div class="border-t border-dashed border-gray-400 ${sepMargin}"></div>`;
            html += `<div class="flex justify-between font-bold text-[12px] ${blockGap}"><span>TOTAL:</span><span>RD$ ${sample.total.toLocaleString('en-US')}</span></div>`;
            html += `<div class="${blockGap}">Pago: ${esc(sample.paymentMethod)}</div>`;
            html += `<div class="text-center ${blockGap}">${esc(footerMsg)}</div>`;
            if (footerExtra) {
                footerExtra.split('\n').forEach(line => { if (line.trim()) html += `<div class="text-center">${esc(line.trim())}</div>`; });
            }

            box.innerHTML = html;
        }

        // Imprime un ticket de ejemplo real (usa el mismo camino que una venta real:
        // impresión directa si hay impresora QZ conectada, si no, PDF con diálogo).
        // ── FOLIO SECUENCIAL DE MOSTRADOR (Folio 1, Folio 2, Folio 3...) ──
        // Distinto de los pedidos de la tienda en línea (que usan #PED-xxxxx).
        // Usa una transacción para que dos ventas al mismo tiempo nunca repitan folio.
        window.getNextMostradorFolio = async function() {
            const counterRef = doc(db, 'artifacts', appId, 'public', 'data', 'counters', 'mostradorFolio');
            const newFolio = await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(counterRef);
                const current = snap.exists() ? (snap.data().lastFolio || 0) : 0;
                const next = current + 1;
                transaction.set(counterRef, { lastFolio: next }, { merge: true });
                return next;
            });
            return newFolio;
        }

        window.testPrintSampleTicket = function() {
            window.showToast("🖨️ Enviando ticket de ejemplo...");
            window.printThermalReceiptDirect(getSampleTicketData());
        }

        // Diagnóstico del logo: intenta el MISMO proceso que usa la impresión real
        // (cargar imagen + dibujar en canvas) y explica exactamente por qué falla,
        // en vez de fallar en silencio como hacía antes.
        window.testLogoLoad = function() {
            const resultEl = document.getElementById('logo-diagnostic-result');
            const logoUrl = (document.getElementById('inv-cfg-logo-url')?.value.trim()) || window.siteConfig?.logoUrl || "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png";

            if (!logoUrl) {
                resultEl.className = 'text-xs text-amber-600 font-bold';
                resultEl.textContent = '⚠️ No hay ninguna URL de logo configurada (ni aquí, ni en Configuración → Identidad Visual).';
                return;
            }

            resultEl.className = 'text-xs text-gray-400';
            resultEl.textContent = '🔄 Verificando...';

            const img = new Image();
            img.crossOrigin = "Anonymous";
            const timeout = setTimeout(() => {
                resultEl.className = 'text-xs text-red-600 font-bold';
                resultEl.textContent = '❌ La imagen tardó demasiado en cargar o la URL no responde.';
            }, 8000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toDataURL('image/png'); // esto es lo que realmente truena si hay problema de CORS
                    window.cachedPdfLogo = canvas.toDataURL('image/png');
                    resultEl.className = 'text-xs text-green-600 font-bold';
                    resultEl.textContent = '✅ El logo carga correctamente. Debería aparecer en tu próxima factura.';
                    window.renderTicketPreview();
                } catch (e) {
                    resultEl.className = 'text-xs text-red-600 font-bold';
                    resultEl.textContent = '❌ La imagen carga pero el servidor donde está alojada bloquea que se use en PDFs (error de CORS). Sube la imagen a otro sitio que sí lo permita (ej. GitHub, imgur) y pega esa URL aquí.';
                    console.error("Logo CORS error:", e);
                }
            };
            img.onerror = () => {
                clearTimeout(timeout);
                resultEl.className = 'text-xs text-red-600 font-bold';
                resultEl.textContent = '❌ La URL no carga ninguna imagen (revisa que esté bien copiada, completa, y que empiece con https://).';
            };
            img.src = logoUrl;
        }

        // ── ENVÍO DE FACTURA POR CORREO (EmailJS) ──────────────────────────
        // No requiere backend: EmailJS usa una "Public Key" (segura para el
        // navegador, no es un secreto) para mandar el correo directo desde acá.
        window._emailJsReady = false;
        window.initEmailJs = function() {
            const cfg = window.siteConfig || {};
            if (typeof emailjs === 'undefined' || !cfg.emailjsPublicKey) { window._emailJsReady = false; return; }
            try {
                emailjs.init({ publicKey: cfg.emailjsPublicKey });
                window._emailJsReady = true;
            } catch (e) { console.error("EmailJS init error:", e); window._emailJsReady = false; }
        }

        // Arma el detalle de la venta como HTML para el cuerpo del correo
        // (plan gratis de EmailJS no adjunta el PDF, así que se ve todo aquí).
        function buildInvoiceEmailHtml(order) {
            const rows = order.items.map(item => `
                <tr>
                    <td style="padding:4px 8px;border-bottom:1px solid #eee;">${item.qty}x ${item.name}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">RD$ ${(item.price * item.qty).toLocaleString('en-US')}</td>
                </tr>`).join('');
            return `
                <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
                    ${rows}
                </table>
                <table style="width:100%;margin-top:8px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                    <tr><td>TOTAL</td><td style="text-align:right;">RD$ ${(order.total || 0).toLocaleString('en-US')}</td></tr>
                </table>`;
        }

        // Envía el correo. NUNCA bloquea ni revierte la venta si falla —
        // se llama después de que la venta ya quedó registrada con éxito.
        window.sendInvoiceEmail = async function(order, toEmail) {
            if (!toEmail) return;
            const cfg = window.siteConfig || {};
            if (!cfg.emailAutoSend) return;
            if (!window._emailJsReady) { window.initEmailJs(); if (!window._emailJsReady) return; }
            if (!cfg.emailjsServiceId || !cfg.emailjsTemplateId) return;

            try {
                await emailjs.send(cfg.emailjsServiceId, cfg.emailjsTemplateId, {
                    to_email: toEmail,
                    customer_name: order.customerName || 'Cliente',
                    business_name: cfg.invBusinessName || 'FamlyFragrancerd',
                    order_id: order.orderId || '',
                    order_date: new Date(order.date || Date.now()).toLocaleString('es-DO'),
                    payment_method: order.paymentMethod || 'Efectivo',
                    total: `RD$ ${(order.total || 0).toLocaleString('en-US')}`,
                    items_html: buildInvoiceEmailHtml(order),
                    footer_msg: cfg.invFooterMsg || '¡Gracias por su compra!'
                });
                window.showToast(`📧 Factura enviada a ${toEmail}`);
            } catch (e) {
                console.error("Error enviando correo:", e);
                window.showToast("⚠️ La venta se guardó bien, pero el correo no se pudo enviar.");
            }
        }

        window.testSendSampleEmail = function() {
            const cfg = window.siteConfig || {};
            if (!cfg.emailjsServiceId || !cfg.emailjsTemplateId || !cfg.emailjsPublicKey) {
                return window.showToast("⚠️ Completa Service ID, Template ID y Public Key primero.");
            }
            const testEmail = prompt("¿A qué correo enviamos la prueba?", auth.currentUser?.email || "");
            if (!testEmail) return;
            window.initEmailJs();
            // La prueba ignora el toggle "Activar envío automático" para poder probar aunque esté apagado
            const cfgBackup = cfg.emailAutoSend;
            window.siteConfig.emailAutoSend = true;
            window.sendInvoiceEmail(getSampleTicketData(), testEmail).finally(() => {
                window.siteConfig.emailAutoSend = cfgBackup;
            });
        }

        // Genera la factura, descuenta el inventario y marca Agotado si llega a 0
        window.generateManualInvoice = async function(printReceipt = true) {
            if (window.facturaItems.length === 0) return window.showToast("Agrega al menos un producto al ticket.");
            const customerName = document.getElementById('billing-customer-name').value.trim() || 'Cliente de Mostrador';
            const subtotal = window.facturaItems.reduce((acc, i) => acc + (i.price * i.qty), 0);
            const discountAmt = parseFloat(document.getElementById('billing-discount')?.value) || 0;
            const total = Math.max(0, subtotal - discountAmt);
            const paymentMethod = window.facturaPaymentMethod || 'Efectivo';
            const paymentEntity = document.getElementById('billing-payment-entity')?.value.trim();
            if (paymentMethod === 'Transferencia' && !paymentEntity) return window.showToast("⚠️ Escribe la entidad bancaria.");
            const adminName = (auth.currentUser && auth.currentUser.displayName) || "Empleado";
            const selectedClient = window.facturaSelectedClient;

            // Validaciones para venta a crédito
            if (paymentMethod === 'Credito') {
                if (!selectedClient) return window.showToast("⚠️ Elige un cliente guardado para vender a crédito.");
                if (!selectedClient.creditEnabled) return window.showToast(`⚠️ ${selectedClient.nombre} no tiene crédito habilitado.`);
                const limit = selectedClient.creditLimit || 0;
                const projected = (selectedClient.creditBalance || 0) + total;
                if (limit > 0 && projected > limit) {
                    if (!confirm(`Esta venta deja a ${selectedClient.nombre} debiendo RD$ ${projected.toLocaleString('en-US')}, por encima de su límite de RD$ ${limit.toLocaleString('en-US')}.\n\n¿Facturar de todas formas?`)) return;
                }
            }

            const customerTaxId = selectedClient?.taxId || '';
            const customerPhoneCrm = selectedClient?.telefono || '';
            const customerAddressCrm = selectedClient?.direccion || '';
            const customerEmail = document.getElementById('billing-customer-email')?.value.trim() || selectedClient?.email || '';
            window.showToast("Generando factura... ⏳");
            try {
                const orderData = { items: window.facturaItems, total, discount: discountAmt, customerName, customerTaxId, status: 'Completado', stockDeducted: true, paymentMethod, paymentEntity: paymentMethod === 'Transferencia' ? paymentEntity : null, attendedBy: adminName };
                let finalOrderForReceipt;
                if (window.facturaSelectedOrderId) {
                    await window.deductStockForItems(window.facturaItems);
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', window.facturaSelectedOrderId), orderData);
                    await window.loadAdminOrders(); window.loadDynamicProducts(true);
                    finalOrderForReceipt = { orderId: window.facturaSelectedOrderId, ...orderData, date: new Date().toISOString() };
                    // Todos los await anteriores tuvieron éxito → recién aquí imprimimos (si se pidió)
                    if (printReceipt) window.printThermalReceiptDirect(finalOrderForReceipt);
                } else {
                    const folioNum = await window.getNextMostradorFolio();
                    const orderId = `Folio ${folioNum}`;
                    await window.deductStockForItems(window.facturaItems);
                    const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'pedidos'), { orderId, folio: folioNum, userId: 'mostrador', customerName, customerPhone: customerPhoneCrm, customerEmail, customerAddress: customerAddressCrm, date: new Date().toISOString(), source: 'mostrador', ...orderData });
                    await window.loadAdminOrders(); window.loadDynamicProducts(true);
                    finalOrderForReceipt = { orderId, ...orderData, date: new Date().toISOString() };
                    // Todos los await anteriores tuvieron éxito → recién aquí imprimimos (si se pidió)
                    if (printReceipt) window.printThermalReceiptDirect(finalOrderForReceipt);
                }
                // La venta ya quedó registrada con éxito → recién aquí sumamos al crédito y mandamos el correo
                if (paymentMethod === 'Credito' && selectedClient) {
                    await window.addToClientCredit(selectedClient.id, total);
                }
                if (customerEmail) window.sendInvoiceEmail(finalOrderForReceipt, customerEmail);
                window.showToast(printReceipt ? "✅ Venta registrada e impresa." : "✅ Venta registrada (sin imprimir).");
                window.closeCobrarModal();
                window.clearBillingSelection();
                window.renderInventoryTable();
                window.renderBillingOrdersList();
                window.renderBillingProductGrid();
            } catch(e) { console.error(e); window.showToast("❌ Error al generar la factura."); }
        }

        // Calcula y muestra valor total del inventario, unidades y productos agotados
