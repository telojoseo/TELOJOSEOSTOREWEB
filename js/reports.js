// ============================================================
// reports.js — Historial de facturas y reportes de ventas
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';

        window.renderInvoiceHistory = function(term = "") {
            const listDiv = document.getElementById('invoice-history-list');
            if (!listDiv) return;

            let invoices = (window.adminOrders || []).filter(o => o.status === 'Completado');
            const t = term.toLowerCase().trim();
            if (t) {
                invoices = invoices.filter(o => (o.customerName || '').toLowerCase().includes(t) || (o.orderId || '').toLowerCase().includes(t));
            }
            invoices.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (invoices.length === 0) {
                listDiv.innerHTML = `<p class="text-sm text-gray-400 text-center py-10">No hay facturas completadas todavía.</p>`;
                return;
            }

            listDiv.innerHTML = invoices.map(order => {
                const dateStr = new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const payLabel = order.paymentMethod === 'Transferencia' ? `🏦 Transferencia${order.paymentEntity ? ' (' + order.paymentEntity + ')' : ''}` : (order.paymentMethod ? '💵 Efectivo' : '—');
                const itemCount = (order.items || []).reduce((s, i) => s + i.qty, 0);
                return `
                <div class="bg-white border border-gray-200 p-3 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-extrabold text-perfume-dark bg-gray-100 px-2 py-0.5 rounded">${order.orderId || '#PED-XXX'}</span>
                            <span class="text-[10px] text-gray-400">${dateStr}</span>
                        </div>
                        <p class="text-sm font-bold text-gray-700 mt-1 truncate">${order.customerName || 'Cliente'}</p>
                        <p class="text-[11px] text-gray-400">${itemCount} artículo(s) • ${payLabel}${order.attendedBy ? ' • Atendió: ' + order.attendedBy : ''}</p>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <span class="text-sm font-extrabold text-perfume-dark">RD$ ${(order.total || 0).toLocaleString('en-US')}</span>
                        <button onclick="window.generateInvoicePDF('${order.id}')" class="bg-gray-800 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-black transition">🖨️ Reimprimir</button>
                    </div>
                </div>`;
            }).join('');
        }

        // =================================================================
        // REPORTES (ventas por período, por vendedor, productos más vendidos y ganancia)
        // =================================================================
        window.currentReportRange = 'today';

        window.setReportRange = function(range) {
            window.currentReportRange = range;
            ['today', 'week', 'month', 'all'].forEach(r => {
                const btn = document.getElementById('report-range-btn-' + r);
                if (!btn) return;
                if (r === range) { btn.className = "px-3 py-1.5 rounded-lg border-2 border-perfume-magenta bg-perfume-magenta text-white text-xs font-bold transition"; }
                else { btn.className = "px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 text-xs font-bold transition hover:border-perfume-magenta"; }
            });
            window.renderReports();
        }

        window.renderReports = function() {
            const now = new Date();
            let startDate = null;
            if (window.currentReportRange === 'today') { startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
            else if (window.currentReportRange === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); startDate = d; }
            else if (window.currentReportRange === 'month') { startDate = new Date(now.getFullYear(), now.getMonth(), 1); }

            let invoices = (window.adminOrders || []).filter(o => o.status === 'Completado');
            if (startDate) invoices = invoices.filter(o => new Date(o.date) >= startDate);

            let totalSales = 0, totalProfit = 0;
            const byAgent = {};
            const byProduct = {};

            invoices.forEach(order => {
                totalSales += order.total || 0;
                const agent = order.attendedBy || (order.source === 'mostrador' ? 'Mostrador' : 'Tienda Web');
                if (!byAgent[agent]) byAgent[agent] = { count: 0, total: 0 };
                byAgent[agent].count++; byAgent[agent].total += order.total || 0;

                (order.items || []).forEach(item => {
                    if (!byProduct[item.id || item.name]) byProduct[item.id || item.name] = { name: item.name, qty: 0, revenue: 0, profit: 0 };
                    const p = byProduct[item.id || item.name];
                    p.qty += item.qty;
                    p.revenue += item.price * item.qty;
                    if (typeof item.cost === 'number' && item.cost !== null) {
                        const lineProfit = (item.price - item.cost) * item.qty;
                        p.profit += lineProfit;
                        totalProfit += lineProfit;
                    }
                });
            });

            document.getElementById('report-total-sales').innerText = `RD$ ${totalSales.toLocaleString('en-US')}`;
            document.getElementById('report-total-orders').innerText = invoices.length;
            document.getElementById('report-total-profit').innerText = `RD$ ${totalProfit.toLocaleString('en-US')}`;

            const agentDiv = document.getElementById('report-by-agent');
            const agentEntries = Object.entries(byAgent).sort((a, b) => b[1].total - a[1].total);
            agentDiv.innerHTML = agentEntries.length === 0
                ? `<p class="text-xs text-gray-400 text-center py-4">No hay ventas en este período.</p>`
                : agentEntries.map(([name, data]) => `
                    <div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <span class="text-xs font-bold text-gray-700">👤 ${name}</span>
                        <span class="text-xs text-gray-500">${data.count} factura(s) • <span class="font-extrabold text-perfume-dark">RD$ ${data.total.toLocaleString('en-US')}</span></span>
                    </div>`).join('');

            const tbody = document.getElementById('report-top-products');
            const productEntries = Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 15);
            tbody.innerHTML = productEntries.length === 0
                ? `<tr><td colspan="4" class="text-center text-sm text-gray-400 py-6">No hay ventas en este período.</td></tr>`
                : productEntries.map(p => `
                    <tr class="border-b border-gray-50 hover:bg-gray-50">
                        <td class="py-2 pr-2 text-xs font-bold text-gray-700 truncate max-w-[200px]">${p.name}</td>
                        <td class="py-2 pr-2 text-center text-xs font-bold text-perfume-dark">${p.qty}</td>
                        <td class="py-2 pr-2 text-right text-xs text-gray-600">RD$ ${p.revenue.toLocaleString('en-US')}</td>
                        <td class="py-2 pr-2 text-right text-xs font-bold text-green-600">${p.profit > 0 ? 'RD$ ' + p.profit.toLocaleString('en-US') : '—'}</td>
                    </tr>`).join('');
        }

        // Filtro rápido de facturas por fecha + búsqueda
        window.setBillingInvoicesDateToday = function() {
            const dateInput = document.getElementById('billing-invoices-date');
            if (!dateInput) return;
            const now = new Date();
            const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            dateInput.value = localISO;
            window.renderBillingInvoicesQuickList();
        }

        window.renderBillingInvoicesQuickList = function() {
            const listDiv = document.getElementById('billing-invoices-quick-list');
            if (!listDiv) return;
            const term = (document.getElementById('billing-invoices-search')?.value || '').toLowerCase().trim();
            const dateFilter = document.getElementById('billing-invoices-date')?.value || '';

            let invoices = (window.adminOrders || []).filter(o => o.status === 'Completado');
            if (term) {
                invoices = invoices.filter(o => (o.customerName || '').toLowerCase().includes(term) || (o.orderId || '').toLowerCase().includes(term));
            }
            if (dateFilter) {
                invoices = invoices.filter(o => {
                    const d = new Date(o.date);
                    const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                    return localISO === dateFilter;
                });
            }
            invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
            invoices = invoices.slice(0, 30);

            if (invoices.length === 0) {
                listDiv.innerHTML = `<p class="text-xs text-gray-400 text-center py-6">${dateFilter ? 'No hay facturas ese día.' : 'No hay facturas.'}</p>`;
                return;
            }

            listDiv.innerHTML = invoices.map(order => {
                const dateStr = new Date(order.date).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                const itemCount = (order.items || []).reduce((s, i) => s + i.qty, 0);
                const isCredito = order.paymentMethod === 'Crédito';
                return `
                <div class="flex justify-between items-center px-2.5 py-2 rounded-lg border ${isCredito ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'} hover:border-blue-300 transition">
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] font-extrabold text-perfume-dark bg-gray-100 px-1.5 py-0.5 rounded">${order.orderId || '#PED-XXX'}</span>
                            ${isCredito ? '<span class="text-[9px] font-extrabold text-amber-700">💳 Crédito</span>' : ''}
                            <span class="text-[9px] text-gray-400">${dateStr}</span>
                        </div>
                        <p class="text-xs font-bold text-gray-700 truncate">${order.customerName || 'Cliente'} · ${itemCount} art.</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 ml-2">
                        <span class="text-xs font-extrabold text-perfume-dark">RD$ ${(order.total || 0).toLocaleString('en-US')}</span>
                        <button onclick="window.generateInvoicePDF('${order.id}')" title="Reimprimir" class="bg-gray-800 hover:bg-black text-white text-[10px] font-bold px-2 py-1.5 rounded-lg transition">🖨️</button>
                    </div>
                </div>`;
            }).join('');
        }

        // WhatsApp
        window.shareThermalReceiptWhatsapp = async function(orderId) {
            const order = (window.adminOrders || []).find(o => o.id === orderId);
            if (!order) return window.showToast("❌ Factura no encontrada.");
            if (!order.customerPhone) return window.showToast("⚠️ El cliente no tiene teléfono.");

            let phone = order.customerPhone.replace(/\D/g, '');
            if (phone.length === 10) phone = '1' + phone;
            const cfg = window.siteConfig || {};
            const storeName = cfg.invBusinessName?.trim() || "Tienda";
            const firstName = (order.customerName || '').split(' ')[0] || '';
            const text = `*${storeName}*\nHola ${firstName}, tu factura (${order.orderId}).\nTotal: RD$ ${(order.total || 0).toLocaleString('en-US')}\n¡Gracias! 🙏`;

            window.showToast("Generando ticket... ⏳");
            try {
                const ticketFile = await window.printThermalReceipt(order, true);
                if (navigator.canShare && navigator.canShare({ files: [ticketFile] })) {
                    await navigator.share({ files: [ticketFile], title: `Ticket ${order.orderId}`, text });
                } else {
                    const url = URL.createObjectURL(ticketFile);
                    const a = document.createElement('a');
                    a.href = url; a.download = ticketFile.name;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                    setTimeout(() => window.showToast("📎 ¡Adjúntalo en WhatsApp!"), 1500);
                }
            } catch (e) { window.showToast("❌ Error generando ticket."); }
        };

        window.sendLastInvoiceWhatsapp = async function() {
            let targetId = window.lastInvoiceOrderId;
            if (!targetId) {
                if (!window.adminOrders || window.adminOrders.length === 0) await window.loadAdminOrders();
                const completed = (window.adminOrders || []).filter(o => o.status === 'Completado');
                completed.sort((a, b) => new Date(b.date) - new Date(a.date));
                if (completed.length === 0) return window.showToast("⚠️ Sin facturas.");
                targetId = completed[0].id;
            }
            window.shareThermalReceiptWhatsapp(targetId);
        };