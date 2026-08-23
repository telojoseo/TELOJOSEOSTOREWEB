// ============================================================
// admin-orders.js — Panel admin: gestión de pedidos, agencias de envío, edición de ítems de pedido
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { deleteDoc, doc, updateDoc } from './firebase-config.js';

        window.currentOrderTab = 'Pendientes';

        window.setOrderTab = function(tab) {
            window.currentOrderTab = tab;
            const tabs = ['Pendientes', 'Atendiendo', 'Cerrados', 'Todos', 'Eliminados'];
            tabs.forEach(t => {
                const btn = document.getElementById('tab-orders-' + t.toLowerCase()); if(!btn) return;
                if(t === tab) {
                    if (t === 'Eliminados') { btn.classList.add('text-red-600', 'border-b-2', 'border-red-600'); btn.classList.remove('text-red-400'); } else { btn.classList.add('text-perfume-magenta', 'border-b-2', 'border-perfume-magenta'); btn.classList.remove('text-gray-400'); }
                } else {
                    btn.classList.remove('border-b-2', 'border-perfume-magenta', 'border-red-600');
                    if (t === 'Eliminados') { btn.classList.remove('text-red-600'); btn.classList.add('text-red-400'); } else { btn.classList.remove('text-perfume-magenta'); btn.classList.add('text-gray-400'); }
                }
            });
            window.filterAdminOrders();
        }

        window.attendOrder = async function(docId) {
            const adminName = auth.currentUser.displayName || "Empleado";
            try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', docId), { attendedBy: adminName }); window.showToast("👋 Te has asignado este pedido."); window.loadAdminOrders(); } catch(e) { window.showToast("❌ Error al asignar el pedido."); }
        }

        window.deleteAdminOrder = function(docId) {
            window.openCustomConfirm("Eliminar Pedido", "¿Estás seguro de que deseas eliminar este pedido permanentemente? Esta acción no se puede deshacer.", async () => {
                try {
                    // 1. Borrar de Firestore (fuente de verdad)
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', docId));

                    // 2. Borrar de TODOS los arrays en memoria para que no quede caché
                    window.adminOrders = (window.adminOrders || []).filter(o => o.id !== docId);
                    window.userOrdersList = (window.userOrdersList || []).filter(o => o.id !== docId);

                    // 3. Re-renderizar la vista de admin
                    window.renderAdminOrdersList();

                    // 4. Si el perfil del cliente está abierto y mostraba ese pedido, actualizarlo también
                    const ordersListEl = document.getElementById('orders-list');
                    if (ordersListEl && ordersListEl.closest('#profile-modal') && !ordersListEl.closest('#profile-modal').classList.contains('hidden')) {
                        window.renderUserOrdersPage();
                    }

                    // 5. Actualizar historial de facturas en el panel de Facturación si está abierto
                    if (document.getElementById('billing-subtab-history') && !document.getElementById('billing-subtab-history').classList.contains('hidden')) {
                        window.renderInvoiceHistory();
                    }

                    window.showToast("✅ Pedido eliminado permanentemente.");
                } catch (e) {
                    console.error('Error eliminando pedido:', e);
                    window.showToast("❌ Error al eliminar el pedido.");
                }
            });
        }

        window.recalculateOrderFinancials = async function(orderId, modifications = {}) {
            const order = window.adminOrders.find(o => o.id === orderId);
            if(!order) return;

            let newItems = modifications.items || [...order.items];
            let subtotal = newItems.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);

            let currentShipping = order.shippingFee !== undefined ? order.shippingFee : (order.total > subtotal ? order.total - subtotal : 0);
            let currentDiscount = order.discount !== undefined ? order.discount : (order.total < subtotal ? subtotal - order.total : 0);

            let shippingFee = modifications.shippingFee !== undefined ? modifications.shippingFee : currentShipping;
            let discount = modifications.discount !== undefined ? modifications.discount : currentDiscount;

            let newTotal = subtotal + shippingFee - discount;

            // Actualizar en memoria para no re-renderizar toda la lista (lo que colapsaría el acordeón)
            order.items = newItems;
            order.shippingFee = shippingFee;
            order.discount = discount;
            order.total = newTotal;

            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', orderId), {
                    items: newItems, shippingFee, discount, total: newTotal
                });
                // Actualizar solo el subtotal/total visible dentro del acordeón abierto
                window.refreshOrderAccordionTotals(orderId, subtotal, shippingFee, discount, newTotal);
                window.showToast("✅ Guardado.");
            } catch(e) { window.showToast("❌ Error al actualizar montos."); }
        }

        // Actualiza los totales en el cuerpo del acordeón sin cerrar ni re-renderizar toda la lista
        window.refreshOrderAccordionTotals = function(orderId, subtotal, shippingFee, discount, total) {
            const body = document.getElementById('order-body-' + orderId);
            if (!body) return;
            // Actualizar el total visible en la cabecera
            const header = document.getElementById('chevron-' + orderId)?.closest('button');
            if (header) {
                const totalSpan = header.querySelector('.text-sm.font-extrabold');
                if (totalSpan) totalSpan.innerText = 'RD$ ' + total.toLocaleString('en-US');
            }
            // Actualizar los spans dentro del cuerpo del acordeón
            const rows = body.querySelectorAll('[data-total-type]');
            rows.forEach(el => {
                if (el.dataset.totalType === 'subtotal') el.innerText = 'RD$ ' + subtotal.toLocaleString('en-US');
                if (el.dataset.totalType === 'discount') el.innerText = 'RD$ ' + discount.toLocaleString('en-US');
                if (el.dataset.totalType === 'shipping') el.innerText = 'RD$ ' + shippingFee.toLocaleString('en-US');
                if (el.dataset.totalType === 'total') el.innerText = 'RD$ ' + total.toLocaleString('en-US');
            });
        }

        // Save shipping agency for an order
        window.updateOrderShippingAgency = async function(orderId, agency) {
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', orderId), { shippingAgency: agency });
                const o = window.adminOrders.find(o=>o.id===orderId);
                if(o) o.shippingAgency = agency;
                window.showToast('✅ Agencia guardada.');
            } catch(e) { window.showToast('❌ Error al guardar agencia'); }
        }

        // Save tracking number for an order
        window.updateOrderTrackingNumber = async function(orderId, trackingNumber) {
            try {
                const val = trackingNumber && trackingNumber.trim().length ? trackingNumber.trim() : '';
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', orderId), { trackingNumber: val });
                const o = window.adminOrders.find(o=>o.id===orderId);
                if(o) o.trackingNumber = val;
                window.showToast('✅ Número de guía guardado.');
                // No re-renderizamos la lista para no colapsar el acordeón
            } catch(e) { window.showToast('❌ Error al guardar número de guía'); }
        }

        window.getShippingAgencies = function() {
            const defaults = [];
            try {
                const raw = localStorage.getItem('shippingAgencies');
                if (!raw) {
                    localStorage.setItem('shippingAgencies', JSON.stringify(defaults));
                    return defaults;
                }
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.every(item => item && item.name && item.url)) {
                    return parsed;
                }
            } catch (e) {
                console.warn('Error leyendo shippingAgencies desde localStorage', e);
            }
            localStorage.setItem('shippingAgencies', JSON.stringify(defaults));
            return defaults;
        }

        window.saveShippingAgencies = function(agencies) {
            try {
                localStorage.setItem('shippingAgencies', JSON.stringify(agencies));
            } catch (e) {
                console.error('Error guardando shippingAgencies', e);
            }
        }

        window.addShippingAgency = function(name, url) {
            if (!name || !url) return window.showToast('Ingresa nombre y URL de agencia.');
            const agencies = window.getShippingAgencies();
            agencies.push({ name: name.trim(), url: url.trim() });
            window.saveShippingAgencies(agencies);
            window.renderShippingAgencies();
            window.showToast('✅ Agencia añadida.');
        }

        window.deleteShippingAgency = function(index) {
            const agencies = window.getShippingAgencies();
            if (index < 0 || index >= agencies.length) return;
            agencies.splice(index, 1);
            window.saveShippingAgencies(agencies);
            window.renderShippingAgencies();
            window.showToast('🗑️ Agencia eliminada.');
        }

        window.addShippingAgencyFromForm = function() {
            const nameInput = document.getElementById('shipping-agency-name');
            const urlInput = document.getElementById('shipping-agency-url');
            if (!nameInput || !urlInput) return;
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            if (!name || !url) return window.showToast('Completa ambos campos antes de añadir.');
            window.addShippingAgency(name, url);
            nameInput.value = '';
            urlInput.value = '';
        }

        window.renderShippingAgencies = function() {
            const container = document.getElementById('shipping-agencies-list');
            if (!container) return;
            const agencies = window.getShippingAgencies();
            if (agencies.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-500">No hay agencias registradas.</p>';
                return;
            }
            let html = '';
            agencies.forEach((agency, idx) => {
                html += `
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <div class="min-w-0">
                            <p class="font-bold text-perfume-dark text-sm truncate">${agency.name}</p>
                            <p class="text-xs text-gray-500 truncate">${agency.url}</p>
                        </div>
                        <button type="button" onclick="deleteShippingAgency(${idx})" class="self-start md:self-center bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-100 transition">Borrar</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        }

        window.updateAdminItemQty = function(orderId, itemIdx, newQty) {
            const order = window.adminOrders.find(o => o.id === orderId); if(!order) return;
            let newItems = [...order.items]; 
            newItems[itemIdx].qty = parseInt(newQty);
            if(newItems[itemIdx].qty < 1) return;
            window.recalculateOrderFinancials(orderId, { items: newItems });
            window.refreshOrderItemsTable(orderId);  // Refresca la tabla sin recargar
        }

        window.removeAdminItem = function(orderId, itemIdx) {
            if(!confirm("¿Quitar este artículo de la factura?")) return;
            const order = window.adminOrders.find(o => o.id === orderId); if(!order) return;
            let newItems = [...order.items]; newItems.splice(itemIdx, 1);
            window.recalculateOrderFinancials(orderId, { items: newItems });
            window.refreshOrderItemsTable(orderId);  // Refresca la tabla sin recargar
        }

        window.updateAdminItemPrice = function(orderId, itemIdx, newPriceStr) {
            const newPrice = parseFloat(newPriceStr); if(isNaN(newPrice) || newPrice < 0) return window.showToast("Precio inválido");
            const order = window.adminOrders.find(o => o.id === orderId); if(!order) return;
            let newItems = [...order.items]; newItems[itemIdx].price = newPrice;
            window.recalculateOrderFinancials(orderId, { items: newItems });
            window.refreshOrderItemsTable(orderId);  // Refresca la tabla sin recargar
        }

        window.updateOrderShipping = function(orderId, valStr) {
            const val = parseFloat(valStr) || 0;
            window.recalculateOrderFinancials(orderId, { shippingFee: val });
        }

        window.updateOrderDiscount = function(orderId, valStr) {
            const val = parseFloat(valStr) || 0;
            window.recalculateOrderFinancials(orderId, { discount: val });
        }

        window.toggleAddItemForm = function(orderId) { 
            const form = document.getElementById('add-item-form-' + orderId); 
            if(form) form.classList.toggle('hidden'); 
        }

        window.filterNewItemSearch = function(orderId, term) {
            const box = document.getElementById(`new-item-suggestions-${orderId}`);
            const input = document.getElementById(`new-item-search-${orderId}`);
            delete input.dataset.prodId; 

            const t = term.toLowerCase().trim();
            if(t.length < 2) { box.classList.add('hidden'); return; }

            const matches = window.catalogProducts.filter(p =>
                p.name.toLowerCase().includes(t) ||
                (p.barcode && p.barcode.toLowerCase().includes(t)) ||
                (p.brand && p.brand.toLowerCase().includes(t))
            ).slice(0, 10); 

            if(matches.length > 0) {
                let html = '';
                matches.forEach(m => {
                    html += `
                    <div onclick="selectNewItem('${orderId}', '${m.id}', '${window.safeStr(m.name)}', ${m.price})" class="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                        <img src="${m.img}" class="w-6 h-6 object-contain rounded border border-gray-100 mix-blend-multiply">
                        <div class="flex-1 min-w-0">
                            <p class="text-[10px] font-bold text-gray-800 truncate leading-tight">${m.name}</p>
                            ${m.barcode ? `<p class="text-[8px] font-mono text-gray-400">${m.barcode}</p>` : ''}
                        </div>
                        <span class="text-[10px] font-bold text-perfume-magenta whitespace-nowrap">RD$ ${m.price.toLocaleString()}</span>
                    </div>`;
                    
                    if(m.decants && m.decants.length > 0) {
                        m.decants.forEach(d => {
                            const dName = `${m.name} (Decant ${d.size})`;
                            html += `
                            <div onclick="selectNewItem('${orderId}', '${m.id}_decant_${d.size}', '${window.safeStr(dName)}', ${d.price})" class="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 bg-gray-50/50">
                                <span class="w-6 text-center text-[8px] font-bold text-gray-400">DEC</span>
                                <div class="flex-1 min-w-0">
                                    <p class="text-[10px] font-bold text-gray-600 truncate leading-tight">${dName}</p>
                                </div>
                                <span class="text-[10px] font-bold text-perfume-magenta whitespace-nowrap">RD$ ${d.price.toLocaleString()}</span>
                            </div>`;
                        });
                    }
                });
                box.innerHTML = html;
                box.classList.remove('hidden');
            } else {
                box.classList.add('hidden');
            }
        }

        // Refresca la tabla de items del acordeón después de agregar/editar
        window.refreshOrderItemsTable = function(orderId) {
            const order = window.adminOrders.find(o => o.id === orderId);
            if (!order) return;
            
            const itemsTable = document.getElementById(`order-items-${orderId}`);
            if (!itemsTable) return; // El acordeón no está abierto
            
            // Re-renderizar SOLO la tabla de items
            const tbody = itemsTable.querySelector('tbody');
            if (!tbody) return;
            
            tbody.innerHTML = (order.items || []).map((item, idx) => `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="py-2 px-2 text-xs font-bold text-gray-700">${item.name}</td>
                    <td class="py-2 px-2 text-xs text-gray-600 text-center">RD$ ${item.price.toLocaleString('en-US')}</td>
                    <td class="py-2 px-2 text-xs text-center">
                        <input type="number" value="${item.qty}" min="1" class="w-12 border border-gray-300 text-center" 
                               onchange="window.updateAdminItemQty('${orderId}', ${idx}, this.value)">
                    </td>
                    <td class="py-2 px-2 text-xs text-right font-bold text-gray-800">RD$ ${(item.price * item.qty).toLocaleString('en-US')}</td>
                    <td class="py-2 px-2 text-center">
                        <button onclick="window.removeAdminItem('${orderId}', ${idx})" class="text-red-600 hover:text-red-800 font-bold text-xs">🗑️</button>
                    </td>
                </tr>
            `).join('');
        };

        window.selectNewItem = function(orderId, prodId, name, price) {
            const input = document.getElementById(`new-item-search-${orderId}`);
            input.value = name;
            input.dataset.prodId = prodId;
            document.getElementById(`new-item-price-${orderId}`).value = price;
            document.getElementById(`new-item-suggestions-${orderId}`).classList.add('hidden');
        }

        window.saveNewAdminItem = async function(orderId) {
            const searchInput = document.getElementById(`new-item-search-${orderId}`);
            const name = searchInput.value.trim();
            const price = parseFloat(document.getElementById(`new-item-price-${orderId}`).value);
            const qty = parseInt(document.getElementById(`new-item-qty-${orderId}`).value);

            if(!name || isNaN(price) || isNaN(qty)) return window.showToast("Por favor llena todos los campos.");

            const order = window.adminOrders.find(o => o.id === orderId); if(!order) return;

            let prodId = searchInput.dataset.prodId || ('custom_' + Date.now());
            let barcode = ''; let img = '';
            
            if(!prodId.startsWith('custom_')) {
                const baseId = prodId.split('_decant_')[0];
                const catalogItem = window.catalogProducts.find(p => p.id === baseId);
                if(catalogItem) { barcode = catalogItem.barcode || ''; img = catalogItem.img || ''; }
            }

            let newItems = [...order.items];
            newItems.push({ id: prodId, name, price, qty, img, barcode });

            await window.recalculateOrderFinancials(orderId, { items: newItems });
            window.refreshOrderItemsTable(orderId);  // Refresca la tabla sin recargar
            window.showToast("Artículo añadido.");
            
            searchInput.value = ''; delete searchInput.dataset.prodId;
            document.getElementById(`new-item-price-${orderId}`).value = '';
            document.getElementById(`new-item-qty-${orderId}`).value = '1';
        }

        // =================================================================
        // POS — FACTURACIÓN ESTILO ELEVENTA
        // =================================================================
