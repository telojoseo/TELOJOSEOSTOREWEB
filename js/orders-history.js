// ============================================================
// orders-history.js — Historial de pedidos del cliente
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { collection, doc, getDocsFromServer, updateDoc } from './firebase-config.js';

        window.userOrdersList = [];
        window.userOrdersPage = 1;
        window.ordersPerPage = 5;

        window.fetchUserOrders = async function() {
            if (!window.userId) return; 
            const listDiv = document.getElementById('orders-list'); 
            const pagDiv = document.getElementById('orders-pagination');
            listDiv.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Buscando historial...</p>';
            if(pagDiv) pagDiv.innerHTML = '';

            try {
                const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'pedidos'); 
                // Usamos getDocsFromServer para forzar lectura del servidor y evitar que Firestore
                // devuelva pedidos ya eliminados desde su caché offline.
                const querySnapshot = await getDocsFromServer(ordersRef); 
                let orders = []; 
                querySnapshot.forEach((d) => { const data = d.data(); if(data.userId === window.userId) orders.push({ id: d.id, ...data }); }); 
                
                window.userOrdersList = orders.sort((a, b) => new Date(b.date) - new Date(a.date));
                window.userOrdersPage = 1;
                window.renderUserOrdersPage();
            } catch (error) { 
                listDiv.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error al cargar historial.</p>'; 
            }
        }

        window.renderUserOrdersPage = function() {
            const listDiv = document.getElementById('orders-list'); 
            const pagDiv = document.getElementById('orders-pagination');
            const toggleBtn = document.getElementById('btn-toggle-all-orders');
            
            if (window.userOrdersList.length === 0) { 
                listDiv.innerHTML = '<div class="bg-white border border-gray-100 p-4 rounded-lg text-center"><p class="text-sm text-gray-500">Aún no tienes pedidos.</p></div>'; 
                if(pagDiv) pagDiv.innerHTML = '';
                if(toggleBtn) { toggleBtn.classList.add('hidden'); toggleBtn.style.display = 'none'; }
                return; 
            }

            // Lógica para mostrar/ocultar el botón "Ver Todos" debajo de "Activar Alertas"
            if (window.userOrdersList.length > 2) {
                if(toggleBtn) {
                    toggleBtn.classList.remove('hidden');
                    toggleBtn.style.display = 'flex'; // Fuerza a mostrarse ignorando conflictos de CSS
                    toggleBtn.innerHTML = window.ordersPerPage === 2 
                        ? `Ver todos mis pedidos (${window.userOrdersList.length})` 
                        : `Mostrar menos (Paginado)`;
                }
            } else {
                if(toggleBtn) {
                    toggleBtn.classList.add('hidden');
                    toggleBtn.style.display = 'none';
                }
            }

            const totalPages = Math.ceil(window.userOrdersList.length / window.ordersPerPage);
            if (window.userOrdersPage > totalPages) window.userOrdersPage = totalPages;

            const startIdx = (window.userOrdersPage - 1) * window.ordersPerPage;
            const endIdx = startIdx + window.ordersPerPage;
            const ordersToShow = window.userOrdersList.slice(startIdx, endIdx);

            let html = '';
            ordersToShow.forEach(order => {
                const dateStr = new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                
                // PANEL DE ACCIONES RÁPIDAS (Soporte / Descargar PDF / Cancelar)
                let actionButtons = `<div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-100">`;
                
                // Botón de Modificar/Ayuda
                actionButtons += `
                    <button onclick="contactSupportForOrder('${order.orderId || order.id}')" class="bg-[#25D366]/10 text-[#25D366] py-2 rounded-xl text-[10px] md:text-xs font-bold hover:bg-[#25D366]/20 transition flex items-center justify-center gap-1 shadow-sm border border-[#25D366]/20">
                        💬 Ayuda
                    </button>`;

                // Botón para Descargar Factura PDF
                actionButtons += `
                    <button onclick="generateInvoicePDF('${order.id}')" class="bg-gray-100 text-gray-700 py-2 rounded-xl text-[10px] md:text-xs font-bold hover:bg-gray-200 transition flex items-center justify-center gap-1 shadow-sm border border-gray-200">
                        📄 Bajar PDF
                    </button>`;
                
                // Botón de Cancelar (Solo si está Recibido)
                if(order.status === 'Recibido') {
                    actionButtons += `
                    <button onclick="cancelCustomerOrder('${order.id}')" class="col-span-2 bg-red-50 text-red-500 py-2 rounded-xl text-[10px] md:text-xs font-bold hover:bg-red-100 transition flex items-center justify-center gap-1 shadow-sm border border-red-100 mt-1">
                        🚫 Cancelar Pedido
                    </button>`;
                }
                
                actionButtons += `</div>`;
                
                // Tracking accordion (only for shipped/completed orders)
                let trackingHtml = '';
                if (order.status === 'Enviado' || order.status === 'Completado' || order.status === 'ENVIADO' || order.status === 'COMPLETADO') {
                    const agencyMatch = window.getShippingAgencies().find(a => a.name === order.shippingAgency);
                    const url = agencyMatch ? agencyMatch.url : null;

                    trackingHtml = `
                    <button onclick="toggleTracking('${order.id}')" class="w-full flex items-center justify-between bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg hover:bg-blue-100 transition-all text-sm mb-2">
                        <span>📍 Desplegar Rastreo</span>
                        <span id="arrow-${order.id}">▼</span>
                    </button>
                    <div id="tracking-container-${order.id}" class="hidden transition-all duration-300">
                    `;

                    if (url) {
                        // Se usa la URL de la agencia tal cual está configurada en Ajustes, sin pegarle
                        // el número de guía. El número solo se muestra como texto copiable, porque
                        // muchas agencias requieren que el cliente lo pegue manualmente en su web.
                        // NOTA: ya no se usa <iframe> porque casi todas las páginas de rastreo de
                        // agencias bloquean ser embebidas dentro de otro sitio (X-Frame-Options/CSP),
                        // lo cual hacía que se viera en blanco, sobre todo en el celular.
                        const trackingNumberHtml = order.trackingNumber ? `<span class="font-mono text-gray-700">${order.trackingNumber}</span><button onclick="navigator.clipboard.writeText('${order.trackingNumber}').then(()=>window.showToast('Número de guía copiado'))" class="ml-2 inline-flex items-center text-gray-400 hover:text-blue-600 transition-all active:scale-90">📋</button>` : `<span class="font-mono text-gray-700">Pendiente</span>`;
                        trackingHtml += `
                        <p class="text-sm font-bold mb-3">Guía de ${order.shippingAgency || 'Agencia'}: ${trackingNumberHtml}</p>
                        <a href="${url}" target="_blank" rel="noopener" class="w-full flex items-center justify-center gap-2 bg-perfume-magenta text-white font-bold px-4 py-3 rounded-lg hover:bg-perfume-dark transition-all text-sm">🔎 Rastrear con ${order.shippingAgency || 'la agencia'} ↗</a>
                        <p class="text-xs text-gray-500 mt-2 text-center">Se abrirá la página de ${order.shippingAgency || 'la agencia'} en una pestaña nueva. Si te pide el número de guía, cópialo de arriba y pégalo allí.</p>
                        `;
                    } else {
                        trackingHtml += `
                        <div class="text-center text-gray-500 text-sm py-4">Información de rastreo en proceso...</div>
                        `;
                    }

                    trackingHtml += `</div>`;
                }

                html += `
                <div class="bg-white border border-gray-200 p-4 md:p-5 rounded-2xl shadow-sm hover:shadow-lg transition duration-300">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-sm text-perfume-dark font-mono font-black bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">${order.orderId || '#PED-XXX'}</span>
                        <span class="text-xs text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">📅 ${dateStr}</span>
                    </div>
                    
                    ${window.generateStepperHTML(order.status)}

                    <div class="mt-4 pt-4 border-t border-gray-100">
                        <div class="space-y-2 mb-4">
                            ${order.items.map(item => { 
                                const skuText = item.barcode ? ` <span class="text-[9px] text-gray-400 font-mono bg-gray-100 px-1 rounded">[${item.barcode}]</span>` : ''; 
                                return `<p class="text-sm text-gray-700 flex justify-between bg-gray-50 p-2 rounded-lg"><span><span class="font-bold text-perfume-dark">${item.qty}x</span> ${item.name}${skuText}</span> <span class="font-bold text-gray-600">RD$ ${(item.price * item.qty).toLocaleString()}</span></p>`; 
                            }).join('')}
                        </div>
                        <div class="flex justify-between items-center bg-perfume-light border border-perfume-magenta/20 p-3 rounded-xl">
                            <span class="font-bold text-perfume-dark text-sm uppercase tracking-wide">Monto Final:</span>
                            <span class="font-extrabold text-perfume-magenta text-xl">RD$ ${order.total.toLocaleString('en-US')}</span>
                        </div>
                        ${trackingHtml}
                        ${actionButtons}
                    </div>
                </div>`;
            });
            listDiv.innerHTML = html;

            // Renderizar Paginación (Números)
            if (pagDiv) {
                let pHTML = '';
                if (totalPages > 1) {
                    pHTML += `<div class="flex gap-2 justify-center items-center w-full flex-nowrap overflow-x-auto no-scrollbar py-1">`;
                    pHTML += `<button onclick="changeUserOrdersPage(${window.userOrdersPage - 1})" class="shrink-0 px-3 py-1.5 rounded-lg border ${window.userOrdersPage === 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-perfume-magenta text-perfume-magenta'} text-xs font-bold" ${window.userOrdersPage === 1 ? 'disabled' : ''}>Ant</button>`;
                    const pages = window.getPaginationRange(window.userOrdersPage, totalPages);
                    pages.forEach(i => {
                        if (i === '...') {
                            pHTML += `<span class="shrink-0 px-1 text-gray-400 select-none text-xs">…</span>`;
                        } else {
                            pHTML += `<button onclick="changeUserOrdersPage(${i})" class="shrink-0 w-8 h-8 rounded-lg border ${i === window.userOrdersPage ? 'bg-perfume-magenta text-white border-perfume-magenta' : 'border-gray-300 text-gray-600'} text-xs font-bold transition-all">${i}</button>`;
                        }
                    });
                    pHTML += `<button onclick="changeUserOrdersPage(${window.userOrdersPage + 1})" class="shrink-0 px-3 py-1.5 rounded-lg border ${window.userOrdersPage === totalPages ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-perfume-magenta text-perfume-magenta'} text-xs font-bold" ${window.userOrdersPage === totalPages ? 'disabled' : ''}>Sig</button>`;
                    pHTML += `</div>`;
                }
                pagDiv.innerHTML = pHTML;
            }
        }

        window.changeUserOrdersPage = function(page) {
            window.userOrdersPage = page;
            window.renderUserOrdersPage();
            const _sc = document.querySelector('#profile-modal .flex-1'); if(_sc) _sc.scrollTo({top: 0, behavior: 'smooth'});
        }
        
        window.toggleAllUserOrders = function() {
            window.ordersPerPage = (window.ordersPerPage === 2) ? 9999 : 2;
            window.userOrdersPage = 1;
            window.renderUserOrdersPage();
            const _sc = document.querySelector('#profile-modal .flex-1'); if(_sc) _sc.scrollTo({top: 0, behavior: 'smooth'});
        }

        // Helper: Toggle tracking iframe accordion
        window.toggleTracking = function(orderId) {
            const container = document.getElementById(`tracking-container-${orderId}`);
            const arrow = document.getElementById(`arrow-${orderId}`);
            if (!container) return;
            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                if (arrow) arrow.innerText = '▲';
            } else {
                container.classList.add('hidden');
                if (arrow) arrow.innerText = '▼';
            }
        }

        // --- ACCIONES RÁPIDAS DEL CLIENTE ---
        window.cancelCustomerOrder = async function(docId) {
            window.openCustomConfirm("Cancelar Pedido", "Si te arrepentiste, podemos cancelar tu pedido ahora. Esta acción es definitiva.", async () => {
                try {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', docId), { status: 'Cancelado' });
                    window.showToast("✅ Tu pedido ha sido cancelado exitosamente.");
                    window.fetchUserOrders(); // FIX: Corregido el llamado que causaba el falso "Error de conexión"
                } catch(e) { 
                    console.error("Error al cancelar pedido:", e);
                    window.showToast("❌ Error al cancelar. Intenta de nuevo."); 
                }
            });
        }

        window.contactSupportForOrder = function(orderId) {
            let adminPhone = "18495161973";
            if (window.siteConfig) {
                if (window.siteConfig.sWa && window.siteConfig.sWa.length > 5) adminPhone = window.siteConfig.sWa.replace(/\D/g, ''); 
                else if (window.siteConfig.fPhone && window.siteConfig.fPhone.length > 5) adminPhone = window.siteConfig.fPhone.replace(/\D/g, ''); 
            }
            if (adminPhone.length === 10) adminPhone = '1' + adminPhone; 
            if (adminPhone.length < 10) adminPhone = "18495161973"; 
            
            const text = `Hola FamlyFragrancerd 👋,\nQuisiera hacerles una consulta o modificación respecto a mi pedido *${orderId}*.`;
            // Usamos window.open y la API universal de WhatsApp para asegurar que abra en todas las plataformas
            window.open(`https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(text)}`, '_blank');
        }
        // --- FIN LÓGICA HISTORIAL ---
        
