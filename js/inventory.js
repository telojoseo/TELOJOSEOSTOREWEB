// ============================================================
// inventory.js — Inventario: tabla, movimientos de stock
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from './firebase-config.js';

        window.renderInventoryTable = function(term = "") {
            const valueEl = document.getElementById('inventory-total-value');
            const unitsEl = document.getElementById('inventory-total-units');
            const agotadosEl = document.getElementById('inventory-total-agotados');
            const tbody = document.getElementById('inventory-table-body');
            if (!tbody) return;

            const products = window.catalogProducts || [];

            let totalValue = 0, totalUnits = 0, totalAgotados = 0;
            products.forEach(p => {
                const isOut = !!p.isAgotado || (typeof p.stock === 'number' && p.stock <= 0);
                if (isOut) totalAgotados++;
                if (typeof p.stock === 'number') {
                    totalValue += p.stock * p.price;
                    totalUnits += p.stock;
                }
            });

            if (valueEl) valueEl.innerText = `RD$ ${totalValue.toLocaleString('en-US')}`;
            if (unitsEl) unitsEl.innerText = totalUnits.toLocaleString('en-US');
            if (agotadosEl) agotadosEl.innerText = totalAgotados;

            // Alerta de stock bajo: umbral configurable y guardado en localStorage
            const thresholdInput = document.getElementById('low-stock-threshold');
            const lowStockList = document.getElementById('low-stock-list');
            if (thresholdInput && lowStockList) {
                if (!thresholdInput.value) {
                    thresholdInput.value = localStorage.getItem('lowStockThreshold') || '3';
                }
                const threshold = parseInt(thresholdInput.value) || 0;
                localStorage.setItem('lowStockThreshold', threshold);

                const lowStock = products.filter(p => typeof p.stock === 'number' && p.stock > 0 && p.stock <= threshold);
                if (lowStock.length === 0) {
                    lowStockList.innerHTML = `<p class="text-xs text-gray-400 text-center py-3">✅ Ningún producto está por debajo del umbral de stock.</p>`;
                } else {
                    lowStockList.innerHTML = lowStock.map(p => `
                        <div class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span class="text-xs font-bold text-amber-800 truncate">${p.name}</span>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-xs font-extrabold text-amber-700">${p.stock} disp.</span>
                                <button onclick="window.switchBillingSubTab('movements'); window.preselectMovementProduct('${p.id}')" class="text-[10px] bg-amber-600 text-white px-2 py-1 rounded-md font-bold hover:bg-amber-700 transition">Reabastecer</button>
                            </div>
                        </div>`).join('');
                }
            }

            const t = term.toLowerCase().trim();
            let list = products.filter(p => typeof p.stock === 'number'); // Solo productos con inventario controlado
            if (t) {
                list = list.filter(p =>
                    p.name.toLowerCase().includes(t) ||
                    (p.barcode && p.barcode.toLowerCase().includes(t)) ||
                    (p.brand && p.brand.toLowerCase().includes(t))
                );
            }
            list = [...list].sort((a, b) => (b.stock * b.price) - (a.stock * a.price));

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-sm text-gray-400 py-6">No hay productos con inventario controlado.</td></tr>`;
                return;
            }

            let html = '';
            list.forEach(p => {
                const isOut = !!p.isAgotado || p.stock <= 0;
                const valueRow = p.stock * p.price;
                html += `
                <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="py-2 pr-2">
                        <div class="flex items-center gap-2">
                            <img src="${p.img}" class="w-8 h-8 object-contain rounded border border-gray-100 mix-blend-multiply">
                            <span class="text-xs font-bold text-gray-700 truncate max-w-[180px]">${p.name}</span>
                        </div>
                    </td>
                    <td class="py-2 pr-2 text-center">
                        <span class="text-xs font-bold ${isOut ? 'text-red-600' : 'text-green-700'}">${isOut ? 'Agotado' : p.stock}</span>
                    </td>
                    <td class="py-2 pr-2 text-right text-xs text-gray-600">RD$ ${p.price.toLocaleString('en-US')}</td>
                    <td class="py-2 pr-2 text-right text-xs font-bold text-perfume-dark">RD$ ${valueRow.toLocaleString('en-US')}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        // =================================================================
        // MOVIMIENTOS DE INVENTARIO (entradas, ajustes, devoluciones, pérdidas)
        // =================================================================
        window.movementSelectedProduct = null;

        // Selecciona un producto directamente desde la alerta de stock bajo.
        window.preselectMovementProduct = function(prodId) {
            const prod = window.catalogProducts.find(p => p.id === prodId);
            if (!prod) return;
            window.movementSelectedProduct = prod;
            const box = document.getElementById('movement-selected-product');
            box.classList.remove('hidden');
            box.innerText = `Producto seleccionado: ${prod.name} (Stock actual: ${prod.stock})`;
            document.getElementById('movement-type').value = 'Entrada';
            document.getElementById('movement-qty').focus();
        }

        window.filterMovementProductSearch = function(term) {
            const box = document.getElementById('movement-product-suggestions');
            const t = term.toLowerCase().trim();
            if (t.length < 2) { box.classList.add('hidden'); return; }

            const matches = (window.catalogProducts || []).filter(p =>
                typeof p.stock === 'number' && (p.name.toLowerCase().includes(t) || (p.barcode && p.barcode.toLowerCase().includes(t)))
            ).slice(0, 10);

            if (matches.length > 0) {
                box.innerHTML = matches.map(m => `
                    <div onclick='window.selectMovementProduct(${JSON.stringify(m.id)})' class="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                        <img src="${m.img}" class="w-7 h-7 object-contain rounded border border-gray-100 mix-blend-multiply">
                        <div class="flex-1 min-w-0"><p class="text-[11px] font-bold text-gray-800 truncate">${m.name}</p></div>
                        <span class="text-[10px] font-bold text-gray-500">Stock: ${m.stock}</span>
                    </div>`).join('');
                box.classList.remove('hidden');
            } else {
                box.innerHTML = `<p class="text-xs text-gray-400 p-3 text-center">Sin resultados con inventario controlado.</p>`;
                box.classList.remove('hidden');
            }
        }

        window.selectMovementProduct = function(prodId) {
            window.preselectMovementProduct(prodId);
            document.getElementById('movement-product-search').value = '';
            document.getElementById('movement-product-suggestions').classList.add('hidden');
        }

        // Guarda el movimiento: ajusta el stock real del producto y deja un registro permanente con fecha y responsable.
        window.saveInventoryMovement = async function() {
            if (!window.movementSelectedProduct) return window.showToast("Selecciona un producto primero.");
            const qtyChange = parseInt(document.getElementById('movement-qty').value);
            if (isNaN(qtyChange) || qtyChange === 0) return window.showToast("Escribe una cantidad distinta de cero.");

            const type = document.getElementById('movement-type').value;
            const note = document.getElementById('movement-note').value.trim();
            const adminName = (auth.currentUser && auth.currentUser.displayName) || "Empleado";

            try {
                const prodRef = doc(db, 'artifacts', appId, 'public', 'data', 'productos', window.movementSelectedProduct.id);
                const pSnap = await getDoc(prodRef);
                if (!pSnap.exists()) return window.showToast("❌ El producto ya no existe.");

                const currentStock = pSnap.data().stock || 0;
                const newStock = Math.max(0, currentStock + qtyChange);
                const updateData = { stock: newStock };
                if (newStock <= 0) updateData.isAgotado = true;
                else if (pSnap.data().isAgotado) updateData.isAgotado = false;
                await updateDoc(prodRef, updateData);

                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'movimientosInventario'), {
                    productId: window.movementSelectedProduct.id,
                    productName: window.movementSelectedProduct.name,
                    type: type,
                    qtyChange: qtyChange,
                    stockBefore: currentStock,
                    stockAfter: newStock,
                    note: note,
                    adminName: adminName,
                    date: new Date().toISOString()
                });

                window.showToast("✅ Movimiento registrado y stock actualizado.");
                document.getElementById('movement-qty').value = ''; document.getElementById('movement-note').value = '';
                document.getElementById('movement-selected-product').classList.add('hidden');
                window.movementSelectedProduct = null;

                await window.loadDynamicProducts(true);
                window.loadInventoryMovements();
            } catch(e) {
                console.error(e);
                window.showToast("❌ Error al registrar el movimiento.");
            }
        }

        // Carga y muestra los últimos movimientos de inventario registrados.
        window.loadInventoryMovements = async function() {
            const listDiv = document.getElementById('movements-history-list');
            if (!listDiv) return;
            listDiv.innerHTML = `<p class="text-xs text-gray-400 text-center py-6">Cargando movimientos...</p>`;
            try {
                const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'movimientosInventario'));
                let movements = []; snap.forEach(d => movements.push({ id: d.id, ...d.data() }));
                movements.sort((a, b) => new Date(b.date) - new Date(a.date));
                movements = movements.slice(0, 60);

                if (movements.length === 0) {
                    listDiv.innerHTML = `<p class="text-xs text-gray-400 text-center py-6">Aún no hay movimientos registrados.</p>`;
                    return;
                }

                const typeIcons = { 'Entrada': '➕', 'Ajuste': '⚖️', 'Devolución': '↩️', 'Pérdida': '⚠️' };
                listDiv.innerHTML = movements.map(m => {
                    const dateStr = new Date(m.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                    const changeColor = m.qtyChange > 0 ? 'text-green-600' : 'text-red-600';
                    return `
                    <div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-gray-700 truncate">${typeIcons[m.type] || '🔄'} ${m.productName}</p>
                            <p class="text-[10px] text-gray-400">${m.type} • ${dateStr} • ${m.adminName}${m.note ? ' • ' + m.note : ''}</p>
                        </div>
                        <span class="text-xs font-extrabold ${changeColor} shrink-0 ml-2">${m.qtyChange > 0 ? '+' : ''}${m.qtyChange}</span>
                    </div>`;
                }).join('');
            } catch(e) {
                console.error(e);
                listDiv.innerHTML = `<p class="text-xs text-red-400 text-center py-6">Error cargando movimientos.</p>`;
            }
        }

        // =================================================================
        // HISTORIAL DE FACTURAS (con reimpresión)
        // =================================================================
