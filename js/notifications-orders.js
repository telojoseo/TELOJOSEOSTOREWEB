// ============================================================
// notifications-orders.js — Notificación de pedidos por WhatsApp y configuración de estados
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { doc, setDoc } from './firebase-config.js';

        window.notifyCustomerWhatsApp = function(docId) {
            const order = window.adminOrders.find(o => o.id === docId); if(!order || !order.customerPhone) return window.showToast("Número de cliente no disponible.");
            let phone = order.customerPhone.replace(/\D/g,''); if(phone.length === 10) phone = '1' + phone; 
            
            const displayStatus = window.statusDisplayNames[order.status] || order.status;
            const customMsg = window.statusMessages[order.status] || '';
            
            let text = `*FamlyFragrancerd* \nHola ${order.customerName.split(' ')[0]}, el estado de tu pedido *${order.orderId}* es: *${displayStatus.toUpperCase()}*\n\n`;
            text += `${customMsg}\n`;
            text += `\n*Total:* RD$ ${order.total.toLocaleString('en-US')}\n`;

            // Si el pedido ya tiene una agencia de envío configurada, se envía SOLO el link de esa
            // agencia (no el del sitio). El número de guía se muestra como texto aparte, para copiar.
            const agencyMatch = window.getShippingAgencies().find(a => a.name === order.shippingAgency);
            if (agencyMatch && agencyMatch.url) {
                text += `*Rastrear con ${order.shippingAgency}:* ${agencyMatch.url}\n`;
                if (order.trackingNumber) text += `*Número de guía:* ${order.trackingNumber}\n`;
            } else {
                text += `*Ver seguimiento:* ${window.location.origin}${window.location.pathname}#pedidos\n`;
            }

            text += `\n¿Dudas? ¡Solo responde este mensaje!`;
            
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        }

        window.generateAndSendPDF = async function(orderId) {
            const order = window.adminOrders.find(o => o.id === orderId);
            if(!order || !order.customerPhone) return window.showToast("Número de cliente no disponible para WhatsApp.");
            let phone = order.customerPhone.replace(/\D/g,''); if(phone.length === 10) phone = '1' + phone;
            let text = `*FamlyFragrancerd*\nHola ${order.customerName.split(' ')[0]}, te enviamos adjunto a este mensaje el *Recibo PDF Oficial* de tu pedido *${order.orderId}*.\n\n¡Gracias por preferirnos!`;
            
            // Creamos el archivo PDF en la memoria del celular sin descargarlo
            const pdfFile = await window.generateInvoicePDF(orderId, true);
            if (!pdfFile) return;

            // OPCIÓN A: Usar la API nativa de Compartir en Móviles
            if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: `Recibo ${order.orderId}`,
                        text: text
                    });
                    window.showToast("✅ Menú abierto. Elige WhatsApp y envía el recibo.");
                } catch (err) {
                    console.log("El usuario canceló el menú de compartir", err);
                }
            } else {
                // FALLBACK PARA PC (Si lo haces desde la computadora, usa la descarga tradicional)
                const url = URL.createObjectURL(pdfFile);
                const a = document.createElement('a');
                a.href = url;
                a.download = pdfFile.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
                setTimeout(() => window.showToast("📎 PDF descargado en tu PC. ¡Adjúntalo en el chat!"), 1500);
            }
        }

        window.openStatusSettings = function() {
            const statuses = ['recibido', 'procesando', 'enviado', 'completado', 'cancelado'];
            statuses.forEach(s => {
                const key = s.charAt(0).toUpperCase() + s.slice(1);
                document.getElementById('status-name-' + s).value = window.statusDisplayNames[key] || '';
                document.getElementById('status-msg-' + s).value = window.statusMessages[key] || '';
            });

            const modal = document.getElementById('status-settings-modal'); const box = document.getElementById('status-settings-box');
            modal.classList.remove('hidden'); modal.classList.add('flex'); setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); }, 10);
        }

        window.closeStatusSettings = function() {
            const modal = document.getElementById('status-settings-modal'); const box = document.getElementById('status-settings-box');
            modal.classList.add('opacity-0'); box.classList.add('scale-95'); setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
        }

        window.saveStatusSettings = async function() {
            const newNames = { 'Eliminado': 'Eliminado' };
            const newMsgs = { 'Eliminado': window.statusMessages['Eliminado'] || 'Eliminado' };
            
            const statuses = ['recibido', 'procesando', 'enviado', 'completado', 'cancelado'];
            statuses.forEach(s => {
                const key = s.charAt(0).toUpperCase() + s.slice(1);
                newNames[key] = document.getElementById('status-name-' + s).value.trim() || key;
                newMsgs[key] = document.getElementById('status-msg-' + s).value.trim() || window.statusMessages[key];
            });

            try { 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), { statusDisplayNames: newNames, statusMessages: newMsgs }, { merge: true }); 
                window.statusDisplayNames = newNames; 
                window.statusMessages = newMsgs;
                window.showToast("✅ Nombres y mensajes guardados exitosamente."); 
                window.closeStatusSettings(); 
                window.loadAdminOrders(); 
                if(window.userId) window.fetchUserOrders(); 
            } catch(e) { window.showToast("❌ Error al guardar."); }
        }

