// ============================================================
// core.js — Estado global, PWA, splash screen, header, utilidades, notificaciones push, escáner QR
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { collection, doc, getToken, onMessage, onSnapshot, setDoc } from './firebase-config.js';


        window.swRegistration = null;

        window.addEventListener('load', function() {
            // Actualizar título dinámico con el nombre de la tienda
            try {
                const storeConfig = localStorage.getItem('STORE_CONFIG');
                if (storeConfig) {
                    const config = JSON.parse(storeConfig);
                    if (config.storeName) {
                        document.getElementById('page-title').innerText = config.storeName + ' | ';
                    }
                }
            } catch(e) { console.log("No se pudo actualizar el título"); }

            setTimeout(function() {
                const splashScreen = document.getElementById('splash-screen');
                splashScreen.classList.add('fade-out');
                setTimeout(() => { splashScreen.style.display = 'none'; }, 800);
            }, 1000); 
            
            // ── PWA: captura el evento de instalación para mostrarlo cuando queramos ──
            window._deferredInstallPrompt = null;
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                window._deferredInstallPrompt = e;
                // Solo lo mostramos si el usuario no lo ha descartado antes
                if (!localStorage.getItem('pwa-banner-dismissed')) {
                    setTimeout(() => {
                        const banner = document.getElementById('pwa-install-banner');
                        if (banner) { banner.classList.remove('hidden'); }
                    }, 4000); // Aparece 4 segundos después de entrar
                }
            });
            window.triggerInstall = async function() {
                const banner = document.getElementById('pwa-install-banner');
                if (banner) banner.classList.add('hidden');
                if (window._deferredInstallPrompt) {
                    window._deferredInstallPrompt.prompt();
                    const { outcome } = await window._deferredInstallPrompt.userChoice;
                    if (outcome === 'accepted') localStorage.setItem('pwa-banner-dismissed', '1');
                    window._deferredInstallPrompt = null;
                }
            };
            window.dismissInstallBanner = function() {
                const banner = document.getElementById('pwa-install-banner');
                if (banner) banner.classList.add('hidden');
                localStorage.setItem('pwa-banner-dismissed', '1');
            };
            window.addEventListener('appinstalled', () => {
                const banner = document.getElementById('pwa-install-banner');
                if (banner) banner.classList.add('hidden');
                window._deferredInstallPrompt = null;
            });

            try {
                const manifest = {
                    "name": "famlyfragrancerd", "short_name": "Famly", "start_url": "/", "display": "standalone",
                    "background_color": "#ffffff", "theme_color": "#000000",
                    "icons": [ { "src": "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png", "sizes": "192x192", "type": "image/png" } ]
                };
                const manifestBlob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
                const link = document.createElement('link'); link.rel = 'manifest'; link.href = URL.createObjectURL(manifestBlob);
                document.head.appendChild(link);

                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('./firebase-messaging-sw.js')
                        .then(reg => { window.swRegistration = reg; })
                        .catch(function(err) { console.log('Error registrando SW:', err); });
                }
            } catch (e) { console.error("Error iniciando PWA"); }
        });

        window.addEventListener('scroll', function() {
            const header = document.getElementById('main-header');
            const logo = document.getElementById('main-logo');
            if (window.scrollY > 50) {
                header.classList.add('header-scrolled');
                logo.classList.remove('h-24', 'md:h-32'); logo.classList.add('logo-scrolled');
            } else {
                header.classList.remove('header-scrolled');
                logo.classList.add('h-24', 'md:h-32'); logo.classList.remove('logo-scrolled');
            }
        });

        window.isLoggedIn = false; window.userId = null; window.cart = [];
        window.catalogProducts = [];
        window.filteredCatalogProducts = [];
        window.currentPage = 1;
        window.itemsPerPage = 20;
        window.adminOrders = []; 
        window.adminClients = [];
        window.siteCategories = ['Damas', 'Caballeros', 'Unisex'];
        window.siteBrands = []; 
        window.siteAppearance = {}; 
        window.currentDecants = []; 
        window.isWholesaler = false; 

        window.loadCartFromStorage = function() {
            try {
                const stored = localStorage.getItem('famly_cart');
                window.cart = stored ? JSON.parse(stored) : [];
                if (!Array.isArray(window.cart)) window.cart = [];
            } catch (e) {
                console.warn('Error cargando carrito desde localStorage:', e);
                window.cart = [];
            }
        }

        window.saveCartToStorage = function() {
            try {
                localStorage.setItem('famly_cart', JSON.stringify(window.cart));
            } catch (e) {
                console.warn('Error guardando carrito en localStorage:', e);
            }
        }

        export const SUPER_ADMIN_EMAILS = [];  // Cada cliente configura en Firebase
        export const STAFF_EMAILS = [];  // Cada cliente configura en Firebase

        window.statusDisplayNames = { 'Recibido': 'Recibido', 'Procesando': 'Procesando', 'Enviado': 'Enviado', 'Completado': 'Completado', 'Cancelado': 'Cancelado', 'Eliminado': 'Eliminado' };
        window.statusMessages = { 'Recibido': 'Lo hemos recibido y estamos confirmando disponibilidad.', 'Procesando': 'Lo estamos preparando con mucho cuidado.', 'Enviado': '¡Tu paquete ya va en camino a tus manos!', 'Completado': 'Entregado. ¡Gracias por preferirnos!', 'Cancelado': 'El pedido fue cancelado.', 'Eliminado': 'El pedido fue eliminado de nuestro sistema.' };

        // Función para convertir el UID de Firebase en un código numérico de 6 dígitos (Ej: 024485)
        window.generateNumericId = function(uid) {
            if (!uid || uid === 'Sin ID' || uid === 'N/A') return 'N/A';
            let hash = 0;
            for (let i = 0; i < uid.length; i++) {
                hash = (hash << 5) - hash + uid.charCodeAt(i);
                hash |= 0; 
            }
            return (Math.abs(hash) % 1000000).toString().padStart(6, '0');
        };

        export const CONFIG_FIELDS = [
            { key: 'wholesaleEmails', id: 'cfg-wholesale-emails', type: 'textarea' }, 
            { key: 'logoUrl', id: 'cfg-logo-url', type: 'url' },
            { key: 'colorPrimary', id: 'cfg-color-primary', type: 'color' },
            { key: 'colorSecondary', id: 'cfg-color-secondary', type: 'color' },
            { key: 'colorBg', id: 'cfg-color-bg', type: 'color' },
            { key: 'fontFamily', id: 'cfg-font-family', type: 'select' },
            { key: 'heroT1', id: 'cfg-hero-t1', type: 'text' },
            { key: 'heroT2', id: 'cfg-hero-t2', type: 'text' },
            { key: 'heroSub', id: 'cfg-hero-sub', type: 'textarea' },
            { key: 'heroBtn', id: 'cfg-hero-btn', type: 'text' },
            { key: 'heroAlign', id: 'cfg-hero-align', type: 'select' },
            { key: 'heroHeight', id: 'cfg-hero-height', type: 'select' },
            { key: 'mediaType', id: 'cfg-media-type', type: 'select' },
            { key: 'heroImg', id: 'cfg-hero-img', type: 'url' },
            { key: 'catalogTitle', id: 'cfg-catalog-title', type: 'text' },
            { key: 'gridCols', id: 'cfg-grid-cols', type: 'select' },
            { key: 'cardBorder', id: 'cfg-card-border', type: 'select' },
            { key: 'cardRadius', id: 'cfg-card-radius', type: 'select' },
            { key: 'cardShadow', id: 'cfg-card-shadow', type: 'select' },
            { key: 'imgFit', id: 'cfg-img-fit', type: 'select' },
            { key: 'priceSize', id: 'cfg-price-size', type: 'select' },
            { key: 'headerBg', id: 'cfg-header-bg', type: 'color' },
            { key: 'footerBg', id: 'cfg-footer-bg', type: 'color' },
            { key: 'fEmail', id: 'cfg-footer-email', type: 'email' },
            { key: 'fPhone', id: 'cfg-footer-phone', type: 'text' },
            { key: 'fAddress', id: 'cfg-footer-address', type: 'text' },
            { key: 'sIg', id: 'cfg-social-ig', type: 'url' },
            { key: 'sFb', id: 'cfg-social-fb', type: 'url' },
            { key: 'sTt', id: 'cfg-social-tt', type: 'url' },
            { key: 'sWa', id: 'cfg-social-wa', type: 'url' },
            { key: 'showWaBtn', id: 'cfg-show-wa-btn', type: 'checkbox' },
            { key: 'waBtnPos', id: 'cfg-wa-btn-pos', type: 'select' },
            { key: 'ghRepo', id: 'cfg-gh-repo', type: 'text' },
            { key: 'ghToken', id: 'cfg-gh-token', type: 'password' },
            { key: 'promoImg', id: 'cfg-promo-img', type: 'url' },
            { key: 'promoLink', id: 'cfg-promo-link', type: 'url' },
            { key: 'promoActive', id: 'cfg-promo-active', type: 'select' }
        ];

        // FUNCIÓN SEGURA PARA ESCAPAR TEXTOS EN HTML ATTRIBUTES
        window.safeStr = function(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
        };

        // FUNCIONES GLOBALES DE LIMPIEZA Y FORMATO PARA EL PDF Y UI
        window.cleanText = function(text) { return text ? String(text).replace(/[^\x20-\x7E\xC0-\xFF]/g, '').trim() : ''; };
        window.formatMoney = function(amount) { return `RD$ ${parseFloat(amount).toLocaleString('en-US')}`; };
        window.cachedPdfLogo = null;

        window.requestPushNotifications = async function() {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    window.showToast("Generando token seguro...");
                    
                    let swReg = window.swRegistration;
                    if (!swReg) {
                        swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(e => console.log(e));
                    }

                    const token = await getToken(messaging, { 
                        vapidKey: 'BNKJWEd2wN3PKXwR2guYOa8WCaoRFUGA4YV09WBRWZLoWlcEUnV-AekH6v9Ko7qup_brN8d64VC1Z9FdFVL6lbo',
                        serviceWorkerRegistration: swReg
                    });
                    
                    if (token) {
                        if (window.userId && (SUPER_ADMIN_EMAILS.includes(auth.currentUser.email) || STAFF_EMAILS.includes(auth.currentUser.email))) {
                            const deviceId = window.userId + '_' + navigator.userAgent.substring(0,20).replace(/[^a-zA-Z0-9]/g, '');
                            await setDoc(doc(db, 'artifacts', appId, 'admin_tokens', deviceId), { 
                                token: token, device: navigator.userAgent, updated_at: new Date().toISOString()
                            }, { merge: true });
                        }
                        window.showToast("✅ Notificaciones Push Activadas.");
                        const btn = document.getElementById('btn-push-notifications');
                        if (btn) {
                            btn.classList.replace('bg-blue-600', 'bg-green-600');
                            btn.innerText = "✅ Notificaciones Activadas";
                        }
                    } else { window.showToast("⚠️ No se generó el token."); }
                } else { window.showToast("❌ Permiso denegado por el navegador."); }
            } catch (error) { window.showToast("Error. Revisa los permisos o la consola."); }
        }

        window.isListeningOrders = false;
        window.listenForNewOrders = function() {
            if (window.isListeningOrders) return;
            window.isListeningOrders = true;
            
            const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'pedidos');
            const initTime = Date.now(); 
            
            onSnapshot(ordersRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const order = change.doc.data();
                        const orderTime = new Date(order.date).getTime();

                        // Las ventas hechas desde el propio POS (Facturación) no deben
                        // notificarse como "nuevo pedido" — eso es solo para pedidos
                        // que llegan de clientes desde la tienda en línea.
                        if (order.source === 'mostrador') return;

                        if (orderTime > initTime) {
                            // 1. Alerta visual EN PANTALLA (siempre, con o sin notificaciones push)
                            const alertBanner = document.getElementById('order-alert-banner');
                            const alertText = document.getElementById('order-alert-text');
                            if (alertBanner && alertText) {
                                alertText.innerText = `${order.customerName} — RD$ ${order.total.toLocaleString('en-US')}`;
                                alertBanner.classList.remove('hidden');
                                clearTimeout(window._orderAlertTimeout);
                                window._orderAlertTimeout = setTimeout(() => alertBanner.classList.add('hidden'), 12000);
                            }

                            // 2. Notificación Push del sistema (si el permiso está concedido y la PWA está instalada)
                            if (Notification.permission === 'granted' && window.swRegistration) {
                                window.swRegistration.showNotification('¡Nuevo Pedido Recibido!', {
                                    body: `${order.customerName} — RD$ ${order.total.toLocaleString('en-US')}`,
                                    icon: 'https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png',
                                    badge: 'https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png',
                                    vibrate: [200, 100, 200, 100, 200],
                                    tag: 'new-order',
                                    requireInteraction: true,
                                    renotify: true
                                });
                            }
                            
                            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=>{}); } catch(e) {}
                            
                            const ordersModal = document.getElementById('orders-dashboard-modal');
                            if (ordersModal && !ordersModal.classList.contains('hidden')) {
                                window.loadAdminOrders();
                            }
                        }
                    }
                });
            }, (error) => {
                console.error("Error escuchando pedidos en vivo:", error);
            });
        }

        onMessage(messaging, (payload) => {
            window.showToast(`🔔 ${payload.notification?.title || 'Notificación'}: ${payload.notification?.body || ''}`);
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=>{}); } catch(e) {}
        });

        let html5QrCodeScanner = null;
        window.openScannerModal = function(target = 'product') {
            document.getElementById('barcode-scanner-modal').classList.remove('hidden');
            document.getElementById('barcode-scanner-modal').classList.add('flex');
            html5QrCodeScanner = new Html5Qrcode("scanner-reader");
            html5QrCodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 150 } }, (decodedText) => {
                if (target === 'billing') {
                    window.closeScannerModal();
                    window.addBillingItemByBarcode(decodedText);
                } else {
                    document.getElementById('admin-prod-barcode').value = decodedText; window.showToast("✅ Código escaneado: " + decodedText); window.closeScannerModal();
                }
            }).catch(err => { window.showToast("⚠️ La cámara no está disponible. Escribe el código manualmente."); window.closeScannerModal(); });
        }
        window.closeScannerModal = function() {
            if(html5QrCodeScanner) { html5QrCodeScanner.stop().then(() => { html5QrCodeScanner.clear(); }).catch(e=>console.log(e)); html5QrCodeScanner = null; }
            document.getElementById('barcode-scanner-modal').classList.remove('flex'); document.getElementById('barcode-scanner-modal').classList.add('hidden');
        }

