// ============================================================
// admin-orders-dashboard.js — Dashboard admin de pedidos, clientes, estados y stock
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from './firebase-config.js';

        window.openOrdersDashboard = function() { 
            window.closeProfileModal(); 
            window.closeAdminModal(); 
            const modal = document.getElementById('orders-dashboard-modal'); 
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            setTimeout(()=> modal.classList.remove('opacity-0'), 10); 
            window.loadAdminOrders();
            history.replaceState({}, '', '/monitor-pedidos');
        }

        window.closeOrdersDashboard = function() { 
            const modal = document.getElementById('orders-dashboard-modal'); 
            modal.classList.add('opacity-0'); 
            setTimeout(()=> { modal.style.display = 'none'; }, 300);
            history.replaceState({}, '', '/');
        }

        window.loadAdminOrders = async function() {
            const listDiv = document.getElementById('admin-orders-list'); 
            listDiv.innerHTML = '<div class="col-span-full text-center py-10"><div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-perfume-magenta mb-4"></div><p class="text-gray-500 font-bold">Sincronizando el panel de pedidos...</p></div>';
            try {
                const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'pedidos'); 
                const querySnapshot = await getDocs(ordersRef); 
                window.adminOrders = []; 
                querySnapshot.forEach(doc => window.adminOrders.push({ id: doc.id, ...doc.data() })); 
                window.adminOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
                const searchInput = document.getElementById('admin-search-orders'); 
                if(searchInput) searchInput.value = ''; 
                window.renderAdminOrdersList();
                window.extractClientsFromOrders();
            } catch(e) { 
                listDiv.innerHTML = '<p class="text-sm text-red-500 col-span-full text-center py-4">Error cargando pedidos.</p>'; 
            }
        }

        window.filterAdminOrders = function() { 
            const term = document.getElementById('admin-search-orders').value.toLowerCase(); 
            window.renderAdminOrdersList(term); 
        }

        window.extractClientsFromOrders = async function() {
            const listDiv = document.getElementById('admin-clients-list');
            if (listDiv && (!window.adminClients || window.adminClients.length === 0)) {
                listDiv.innerHTML = '<p class="text-sm text-gray-500 py-8 text-center animate-pulse">Cargando base de datos de clientes...</p>';
            }

            const clientsMap = new Map();
            
            // 1. Cargar todos los clientes registrados desde la colección global
            try {
                const clientsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'clientes'));
                clientsSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.email) {
                        clientsMap.set(data.email.toLowerCase(), { 
                            id: data.uid ? window.generateNumericId(data.uid) : 'N/A', 
                            name: data.name || 'Cliente', 
                            email: data.email, 
                            phone: data.phone || '', 
                            orderCount: 0, 
                            totalSpent: 0 
                        });
                    }
                });
            } catch(e) { console.error("Error cargando directorio de clientes", e); }

            // 2. Fusionar con el historial de compras para obtener estadísticas
            window.adminOrders.forEach(o => {
                if (o.customerEmail && o.customerEmail !== '@' && o.customerEmail !== 'Sin correo registrado') {
                    const email = o.customerEmail.toLowerCase();
                    if (!clientsMap.has(email)) {
                        clientsMap.set(email, { id: o.userId ? window.generateNumericId(o.userId) : 'N/A', name: o.customerName || 'Cliente', email: o.customerEmail, phone: o.customerPhone || '', orderCount: 1, totalSpent: o.total || 0 });
                    } else {
                        let c = clientsMap.get(email); c.orderCount++; c.totalSpent += (o.total || 0);
                        if (o.customerPhone && !c.phone) c.phone = o.customerPhone;
                        if (o.userId && (c.id === 'Sin ID' || c.id === 'N/A')) c.id = window.generateNumericId(o.userId); 
                    }
                }
            });
            
            const wholesaleList = (window.siteConfig?.wholesaleEmails || "").split(',').map(e=>e.trim().toLowerCase()).filter(e=>e);
            wholesaleList.forEach(email => {
                if (!clientsMap.has(email)) { clientsMap.set(email, { id: 'N/A', name: 'Usuario Mayorista', email: email, phone: '', orderCount: 0, totalSpent: 0 }); }
            });

            window.adminClients = Array.from(clientsMap.values());
            const searchInput = document.getElementById('admin-search-clients');
            window.renderAdminClientsList(searchInput ? searchInput.value : "");
        }

        window.renderAdminClientsList = function(filterTerm = "") {
            const listDiv = document.getElementById('admin-clients-list'); if (!listDiv) return;
            let filtered = window.adminClients;
            
            if (filterTerm && typeof filterTerm === 'string') { 
                const t = filterTerm.toLowerCase().trim(); 
                if (t !== "") {
                    filtered = filtered.filter(c => {
                        const sName = c.name ? String(c.name).toLowerCase() : "";
                        const sEmail = c.email ? String(c.email).toLowerCase() : "";
                        const sPhone = c.phone ? String(c.phone).toLowerCase() : "";
                        const sId = c.id ? String(c.id).toLowerCase() : "";
                        return sName.includes(t) || sEmail.includes(t) || sPhone.includes(t) || sId.includes(t);
                    }); 
                }
            }
            
            if (filtered.length === 0) { 
                listDiv.innerHTML = `
                    <div class="text-center py-8">
                        <p class="text-sm text-gray-500 font-bold mb-1">No se encontraron clientes.</p>
                        <p class="text-[11px] text-gray-400 max-w-sm mx-auto mt-2">Nota: El sistema ahora muestra <strong>todos los usuarios registrados</strong> en la tienda, incluso si aún no han comprado.</p>
                    </div>`;
                return;
            }

            const wholesaleList = (window.siteConfig?.wholesaleEmails || "").split(',').map(e=>e.trim().toLowerCase());
            let html = '';
            filtered.forEach(c => {
                const isWholesale = wholesaleList.includes(c.email.toLowerCase());
                const toggleBtn = isWholesale ? `<button onclick="toggleWholesaleStatus('${c.email}')" class="bg-yellow-100 text-yellow-800 border border-yellow-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-200 transition shadow-sm">⭐ Es Mayorista (Quitar)</button>` : `<button onclick="toggleWholesaleStatus('${c.email}')" class="bg-gray-100 text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 transition shadow-sm">Hacer Mayorista</button>`;
                html += `<div class="flex flex-col md:flex-row items-start md:items-center justify-between bg-white border border-gray-200 p-4 rounded-xl shadow-sm mb-3 gap-4"><div><p class="font-bold text-perfume-dark text-sm flex items-center gap-2">${c.name} ${isWholesale ? '<span class="text-[10px] bg-yellow-400 text-black px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">VIP</span>' : ''}</p><div class="text-xs text-gray-500 mt-1 space-y-0.5"><p>📧 ${c.email}</p><p>📞 ${c.phone || 'Sin teléfono'}</p><p class="font-mono text-[9px] text-gray-400 mt-1 flex items-center gap-1"><span class="bg-gray-100 border border-gray-200 px-1.5 rounded font-bold text-gray-600">ID: ${c.id}</span></p></div></div><div class="flex flex-col md:items-end gap-2 w-full md:w-auto"><div class="text-xs text-gray-600 font-medium bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg">🛍️ ${c.orderCount} pedidos | 💰 RD$ ${c.totalSpent.toLocaleString('en-US')}</div>${toggleBtn}</div></div>`;
            });
            listDiv.innerHTML = html;
        }

        window.toggleWholesaleStatus = async function(email) {
            if(!email) return; email = email.toLowerCase().trim();
            let emails = (window.siteConfig?.wholesaleEmails || "").split(',').map(e=>e.trim().toLowerCase()).filter(e=>e);
            
            if (emails.includes(email)) emails = emails.filter(e => e !== email);
            else emails.push(email);
            
            const newVal = emails.join(', ');
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), { wholesaleEmails: newVal }, { merge: true });
                window.siteConfig.wholesaleEmails = newVal; 
                const input = document.getElementById('cfg-wholesale-emails'); if(input) input.value = newVal;
                window.showToast(emails.includes(email) ? "✅ Añadido a mayoristas" : "❌ Eliminado de mayoristas");
                window.extractClientsFromOrders();
            } catch(e) { window.showToast("Error al actualizar estado."); }
        }

        window.renderAdminOrdersList = function(filterTerm = "") {
            const listDiv = document.getElementById('admin-orders-list'); 
            let filtered = window.adminOrders;
            
            if (window.currentOrderTab === 'Pendientes') {
                filtered = filtered.filter(o => !o.attendedBy && o.status !== 'Completado' && o.status !== 'Cancelado' && o.status !== 'Eliminado');
            } else if (window.currentOrderTab === 'Atendiendo') {
                filtered = filtered.filter(o => o.attendedBy && o.status !== 'Completado' && o.status !== 'Cancelado' && o.status !== 'Eliminado');
            } else if (window.currentOrderTab === 'Cerrados') {
                filtered = filtered.filter(o => o.status === 'Completado' || o.status === 'Cancelado');
            } else if (window.currentOrderTab === 'Todos') {
                filtered = filtered.filter(o => o.status !== 'Eliminado');
            } else if (window.currentOrderTab === 'Eliminados') {
                filtered = filtered.filter(o => o.status === 'Eliminado');
            }
            
            if (filterTerm) { 
                filtered = filtered.filter(o => 
                    (o.orderId && o.orderId.toLowerCase().includes(filterTerm)) || 
                    (o.customerName && o.customerName.toLowerCase().includes(filterTerm)) || 
                    (o.customerPhone && o.customerPhone.toLowerCase().includes(filterTerm))
                ); 
            }

            if (filtered.length === 0) return listDiv.innerHTML = '<p class="text-sm text-gray-500 text-center py-10">No hay pedidos en esta categoría actualmente.</p>';

            const statusColors = { Recibido: 'bg-yellow-100 text-yellow-800 border-yellow-200', Procesando: 'bg-blue-100 text-blue-700 border-blue-200', Enviado: 'bg-indigo-100 text-indigo-700 border-indigo-200', Completado: 'bg-green-100 text-green-700 border-green-200', Cancelado: 'bg-red-100 text-red-600 border-red-200', Eliminado: 'bg-gray-100 text-gray-400 border-gray-200' };
            const shippingAgenciesList = window.getShippingAgencies();

            let html = '';
            filtered.forEach(order => {
                const dateStr = new Date(order.date).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                const statusBadge = statusColors[order.status] || 'bg-gray-100 text-gray-600 border-gray-200';
                const statusLabel = window.statusDisplayNames[order.status] || order.status;
                const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
                let subtotal = order.items.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
                let shippingFee = order.shippingFee !== undefined ? order.shippingFee : (order.total > subtotal ? order.total - subtotal : 0);
                let discount = order.discount !== undefined ? order.discount : (order.total < subtotal ? subtotal - order.total : 0);
                let calculatedTotal = subtotal + shippingFee - discount;
                const attendedBadge = order.attendedBy ? `<span class="text-[10px] text-gray-400 font-bold">👨‍💻 ${order.attendedBy}</span>` : '';
                const attendButton = (!order.attendedBy && order.status !== 'Eliminado') ? `<button onclick="attendOrder('${order.id}')" class="w-full bg-gray-800 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-black transition flex items-center justify-center gap-2 shadow-sm mb-2">👋 Tomar y Atender</button>` : '';

                let editableItemsHTML = '';
                order.items.forEach((item, idx) => {
                    const skuText = item.barcode ? `<span class="text-[9px] text-gray-400 font-mono">${item.barcode}</span>` : '';
                    editableItemsHTML += `
                    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <div class="flex items-center gap-2 flex-1 min-w-0">
                            <div class="flex items-center gap-1 shrink-0">
                                <button onclick="updateAdminItemQty('${order.id}',${idx},-1)" class="bg-gray-200 w-6 h-6 rounded flex items-center justify-center font-bold text-gray-600 hover:bg-red-100 hover:text-red-600 transition text-sm">−</button>
                                <span class="text-xs font-bold w-5 text-center">${item.qty}</span>
                                <button onclick="updateAdminItemQty('${order.id}',${idx},1)" class="bg-gray-200 w-6 h-6 rounded flex items-center justify-center font-bold text-gray-600 hover:bg-green-100 hover:text-green-600 transition text-sm">+</button>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-xs font-medium text-gray-800 truncate leading-tight">${item.name}</p>
                                ${skuText}
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 ml-2">
                            <div class="flex flex-col items-end">
                                <div class="flex items-center gap-1">
                                    <span class="text-[9px] text-gray-400 font-bold">RD$</span>
                                    <input type="number" value="${item.price}" onchange="updateAdminItemPrice('${order.id}',${idx},this.value)" class="w-16 text-right text-xs border border-gray-300 px-1 py-1 rounded focus:outline-none focus:border-perfume-magenta font-bold bg-white">
                                </div>
                                <span class="text-[9px] text-gray-400 font-bold">= RD$ ${(item.price * item.qty).toLocaleString('en-US')}</span>
                            </div>
                            <button onclick="removeAdminItem('${order.id}',${idx})" class="text-gray-300 hover:text-red-500 transition text-lg font-bold w-6 h-6 flex items-center justify-center">&times;</button>
                        </div>
                    </div>`;
                });

                html += `
                <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden ${order.status === 'Eliminado' ? 'opacity-60' : ''}">
                    
                    <!-- CABECERA del acordeón (siempre visible) -->
                    <button onclick="window.toggleOrderAccordion('${order.id}')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left">
                        <!-- Chevron -->
                        <svg id="chevron-${order.id}" class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
                        
                        <!-- ID + Nombre -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-extrabold text-gray-900 bg-gray-100 px-2 py-0.5 rounded font-mono">${order.orderId || '#PED-XXX'}</span>
                                <span class="text-sm font-bold text-gray-700 truncate">${order.customerName || 'Cliente'}</span>
                                ${attendedBadge}
                            </div>
                            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span class="text-[10px] text-gray-400">${dateStr}</span>
                                <span class="text-[10px] text-gray-400">${itemCount} artículo(s)</span>
                            </div>
                        </div>
                        
                        <!-- Estado + Total -->
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}">${statusLabel}</span>
                            <span class="text-sm font-extrabold text-gray-900">RD$ ${calculatedTotal.toLocaleString('en-US')}</span>
                        </div>
                    </button>

                    <!-- CUERPO del acordeón (colapsado por defecto) -->
                    <div id="order-body-${order.id}" class="hidden border-t border-gray-100">
                        <div class="p-4 space-y-4">

                            <!-- Fila: Estado + Eliminar -->
                            <div class="flex items-center gap-2 flex-wrap">
                                <select onchange="updateOrderStatus('${order.id}', this.value)" class="flex-1 text-xs font-bold border border-gray-300 rounded-lg px-2 py-2 outline-none cursor-pointer bg-gray-50 hover:bg-white transition">
                                    <option value="Recibido" ${order.status==='Recibido'?'selected':''}>📥 ${window.statusDisplayNames['Recibido']}</option>
                                    <option value="Procesando" ${order.status==='Procesando'?'selected':''}>⚙️ ${window.statusDisplayNames['Procesando']}</option>
                                    <option value="Enviado" ${order.status==='Enviado'?'selected':''}>🚚 ${window.statusDisplayNames['Enviado']}</option>
                                    <option value="Completado" ${order.status==='Completado'?'selected':''}>✅ ${window.statusDisplayNames['Completado']}</option>
                                    <option value="Cancelado" ${order.status==='Cancelado'?'selected':''}>❌ ${window.statusDisplayNames['Cancelado']}</option>
                                    <option value="Eliminado" ${order.status==='Eliminado'?'selected':''}>🗑️ ${window.statusDisplayNames['Eliminado']}</option>
                                </select>
                                ${order.status !== 'Eliminado' ? `<button onclick="deleteAdminOrder('${order.id}')" class="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition border border-red-100" title="Eliminar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                            </div>

                            <!-- Info cliente + agencia -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div class="bg-gray-50 rounded-lg p-3">
                                    <p class="text-[10px] font-bold text-gray-400 uppercase mb-1">Cliente</p>
                                    <p class="text-sm font-bold text-gray-800">${order.customerName || '—'}</p>
                                    <p class="text-xs text-gray-500">${order.customerPhone || 'Sin número'}</p>
                                    ${order.customerEmail ? `<p class="text-[10px] text-gray-400">${order.customerEmail}</p>` : ''}
                                </div>
                                <div class="bg-gray-50 rounded-lg p-3">
                                    <p class="text-[10px] font-bold text-gray-400 uppercase mb-1">Envío</p>
                                    <select onchange="updateOrderShippingAgency('${order.id}', this.value)" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white mb-1.5">
                                        <option value="">Seleccionar agencia</option>
                                        ${shippingAgenciesList.map(a => `<option value="${a.name}" ${order.shippingAgency === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}
                                    </select>
                                    <input type="text" value="${order.trackingNumber || ''}" onblur="updateOrderTrackingNumber('${order.id}', this.value)" placeholder="Número de guía" class="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
                                </div>
                            </div>

                            <!-- Artículos editables -->
                            <div class="bg-gray-50 rounded-lg p-3">
                                <p class="text-[10px] font-bold text-gray-400 uppercase mb-2">Artículos</p>
                                ${editableItemsHTML}

                                <!-- Form añadir artículo -->
                                <div id="add-item-form-${order.id}" class="hidden mt-3 p-3 bg-white border border-gray-200 rounded-lg border-l-4 border-l-perfume-magenta">
                                    <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Añadir Producto</p>
                                    <div class="relative mb-2">
                                        <input type="text" id="new-item-search-${order.id}" placeholder="Buscar por nombre..."
                                               oninput="filterNewItemSearch('${order.id}', this.value)" autocomplete="off"
                                               class="border border-gray-300 p-2 rounded w-full text-xs outline-none focus:border-perfume-magenta bg-gray-50">
                                        <div id="new-item-suggestions-${order.id}" class="absolute z-20 w-full bg-white border border-gray-200 shadow-xl max-h-40 overflow-y-auto hidden rounded-b-lg"></div>
                                    </div>
                                    <div class="flex gap-2">
                                        <input type="number" id="new-item-price-${order.id}" placeholder="Precio RD$" class="border border-gray-300 p-2 rounded flex-1 text-xs outline-none focus:border-perfume-magenta">
                                        <input type="number" id="new-item-qty-${order.id}" value="1" min="1" class="border border-gray-300 p-2 rounded w-16 text-xs text-center outline-none">
                                        <button onclick="saveNewAdminItem('${order.id}')" class="bg-perfume-magenta text-white rounded px-3 text-xs font-bold hover:bg-perfume-dark transition">OK</button>
                                    </div>
                                    <button onclick="toggleAddItemForm('${order.id}')" class="text-gray-400 text-[10px] w-full text-center mt-2 hover:text-red-500 uppercase tracking-widest font-bold">Cerrar</button>
                                </div>
                                <button onclick="toggleAddItemForm('${order.id}')" class="mt-2 text-perfume-magenta text-[10px] font-bold uppercase tracking-widest hover:underline flex items-center gap-1 bg-white border border-perfume-magenta/20 px-2 py-1 rounded">
                                    + Añadir Artículo
                                </button>
                            </div>

                            <!-- Totales -->
                            <div class="space-y-1.5">
                                <div class="flex justify-between items-center text-xs">
                                    <span class="text-gray-400 font-bold uppercase">Subtotal</span>
                                    <span class="font-bold text-gray-700">RD$ ${subtotal.toLocaleString('en-US')}</span>
                                </div>
                                <div class="flex justify-between items-center bg-blue-50 px-2 py-1.5 rounded">
                                    <span class="text-blue-500 text-[10px] font-bold uppercase">Envío / Extra</span>
                                    <div class="flex items-center gap-1">
                                        <span class="text-blue-500 text-[10px] font-bold">+RD$</span>
                                        <input type="number" onchange="updateOrderShipping('${order.id}', this.value)" value="${shippingFee}" class="w-16 text-right text-xs border border-blue-200 px-1 py-1 rounded focus:outline-none focus:border-blue-500 font-bold text-blue-600 bg-white">
                                    </div>
                                </div>
                                <div class="flex justify-between items-center bg-green-50 px-2 py-1.5 rounded">
                                    <span class="text-green-500 text-[10px] font-bold uppercase">Descuento</span>
                                    <div class="flex items-center gap-1">
                                        <span class="text-green-500 text-[10px] font-bold">−RD$</span>
                                        <input type="number" onchange="updateOrderDiscount('${order.id}', this.value)" value="${discount}" class="w-16 text-right text-xs border border-green-200 px-1 py-1 rounded focus:outline-none focus:border-green-500 font-bold text-green-600 bg-white">
                                    </div>
                                </div>
                                <div class="flex justify-between items-center border-t border-gray-200 pt-2">
                                    <span class="text-gray-900 font-black uppercase text-xs tracking-wide">Total Final</span>
                                    <span class="text-perfume-magenta font-extrabold text-lg">RD$ ${calculatedTotal.toLocaleString('en-US')}</span>
                                </div>
                            </div>

                            <!-- Acciones -->
                            ${attendButton}
                            <div class="flex flex-col gap-2">
                                <button onclick="generateAndSendPDF('${order.id}')" class="w-full bg-perfume-magenta text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-perfume-dark transition flex items-center justify-center gap-2 shadow-sm">
                                    📄 Generar PDF y Enviar a Cliente
                                </button>
                                <div class="flex gap-2">
                                    <button onclick="generateInvoicePDF('${order.id}')" class="flex-1 bg-gray-100 text-gray-800 px-2 py-2.5 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition flex items-center justify-center gap-1 border border-gray-300">
                                        ⬇️ Bajar PDF
                                    </button>
                                    <button onclick="notifyCustomerWhatsApp('${order.id}')" class="flex-1 bg-[#25D366] text-white px-2 py-2.5 rounded-lg text-[10px] font-bold hover:bg-[#20ba59] transition flex items-center justify-center gap-1 border border-[#20ba59]">
                                        💬 WhatsApp
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            });
            listDiv.innerHTML = html;
        }

        // Abre o cierra un pedido del acordeón
        window.toggleOrderAccordion = function(orderId) {
            const body = document.getElementById('order-body-' + orderId);
            const chevron = document.getElementById('chevron-' + orderId);
            if (!body || !chevron) return;
            const isOpen = !body.classList.contains('hidden');
            body.classList.toggle('hidden', isOpen);
            chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
        }

        // Descuenta el stock de una lista de artículos (pedido o factura) en la base de datos.
        // Si el stock de un producto llega a 0, lo marca automáticamente como "Agotado".
        window.deductStockForItems = async function(items) {
            for (let item of items) {
                if (item.id && !String(item.id).startsWith('custom_')) {
                    try {
                        const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'productos', item.id);
                        const pSnap = await getDoc(pRef);
                        if (pSnap.exists() && typeof pSnap.data().stock === 'number') {
                            const newStock = Math.max(0, pSnap.data().stock - item.qty);
                            const updateData = { stock: newStock };
                            if (newStock <= 0) updateData.isAgotado = true;
                            await updateDoc(pRef, updateData);
                        }
                    } catch(e) { console.error('Error al descontar stock:', e); }
                }
            }
        }

        // Repone el stock de una lista de artículos (usado al revertir un pedido de "Completado" a otro estado).
        // Si el producto vuelve a tener stock, le quita la marca de "Agotado" automática.
        window.restoreStockForItems = async function(items) {
            for (let item of items) {
                if (item.id && !String(item.id).startsWith('custom_')) {
                    try {
                        const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'productos', item.id);
                        const pSnap = await getDoc(pRef);
                        if (pSnap.exists() && typeof pSnap.data().stock === 'number') {
                            const restoredStock = pSnap.data().stock + item.qty;
                            const updateData = { stock: restoredStock };
                            if (restoredStock > 0 && pSnap.data().isAgotado) updateData.isAgotado = false;
                            await updateDoc(pRef, updateData);
                        }
                    } catch(e) { console.error('Error al reponer stock:', e); }
                }
            }
        }

        window.updateOrderStatus = async function(docId, newStatus) { 
            try { 
                const order = window.adminOrders.find(o => o.id === docId);
                if (!order) return;

                let stockDeducted = order.stockDeducted || false;
                if (newStatus === 'Completado' && !stockDeducted) {
                    stockDeducted = true;
                    await window.deductStockForItems(order.items);
                    window.loadDynamicProducts(true); 
                } else if (newStatus !== 'Completado' && stockDeducted) {
                    stockDeducted = false;
                    await window.restoreStockForItems(order.items);
                    window.loadDynamicProducts(true); 
                }

                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', docId), { status: newStatus, stockDeducted });
                
                // Actualizar en memoria sin re-renderizar toda la lista (no colapsa el acordeón)
                order.status = newStatus;
                order.stockDeducted = stockDeducted;

                // Solo actualizar el badge de estado en la cabecera del acordeón
                const statusColors = { Recibido:'bg-yellow-100 text-yellow-800 border-yellow-200', Procesando:'bg-blue-100 text-blue-700 border-blue-200', Enviado:'bg-indigo-100 text-indigo-700 border-indigo-200', Completado:'bg-green-100 text-green-700 border-green-200', Cancelado:'bg-red-100 text-red-600 border-red-200', Eliminado:'bg-gray-100 text-gray-400 border-gray-200' };
                const header = document.getElementById('chevron-' + docId)?.closest('button');
                if (header) {
                    const badge = header.querySelector('.rounded-full.border');
                    if (badge) {
                        badge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[newStatus] || 'bg-gray-100 text-gray-600 border-gray-200'}`;
                        badge.innerText = window.statusDisplayNames[newStatus] || newStatus;
                    }
                }
                if(newStatus !== 'Eliminado') window.showToast("✅ Estado: " + (window.statusDisplayNames[newStatus] || newStatus));
            } catch(e) { 
                window.showToast("❌ Error al actualizar estado."); console.error(e);
            } 
        }

