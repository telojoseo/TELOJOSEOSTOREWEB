// ============================================================
// auth.js — Autenticación, sesión, perfil de usuario, modales de login
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { GoogleAuthProvider, collection, createUserWithEmailAndPassword, doc, getDoc, getDocs, onAuthStateChanged, query, sendEmailVerification, setDoc, signInWithEmailAndPassword, signInWithPopup, signOut, updatePassword, updateProfile, where } from './firebase-config.js';
import { SUPER_ADMIN_EMAILS, STAFF_EMAILS } from './core.js';

        window.updateUserPhone = async function() {
            if (!auth.currentUser) return; const phone = document.getElementById('profile-phone-input').value.trim(); if(!phone) return window.showToast("Ingresa un número válido.");
            try { 
                await setDoc(doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'profile', 'info'), { phone: phone }, { merge: true }); 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientes', auth.currentUser.uid), { phone: phone }, { merge: true });
                if(document.getElementById('checkout-phone')) document.getElementById('checkout-phone').value = phone; 
                window.showToast("✅ Teléfono actualizado correctamente."); 
            } catch(e) { window.showToast("❌ Error al actualizar el teléfono."); }
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                window.isLoggedIn = true; window.userId = user.uid;
                const fullName = user.displayName || "Cliente"; 
                
                let badgeHTML = '';
                if (window.siteConfig && window.siteConfig.wholesaleEmails) {
                    const wholesaleList = window.siteConfig.wholesaleEmails.split(',').map(e=>e.trim().toLowerCase());
                    window.isWholesaler = wholesaleList.includes(user.email.toLowerCase());
                    badgeHTML = window.isWholesaler ? '<span class="bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 uppercase tracking-wide shadow-sm border border-yellow-500">VIP Mayorista</span>' : '';
                } else {
                    window.isWholesaler = false;
                }

                document.getElementById('nav-login-text').innerText = fullName.split(' ')[0]; 
                document.getElementById('profile-name').innerHTML = fullName + badgeHTML; 
                document.getElementById('profile-email').innerText = user.email || ""; 
                const profileIdEl = document.getElementById('profile-id');
                if (profileIdEl) profileIdEl.innerText = window.generateNumericId(user.uid);
                document.getElementById('profile-initial').innerText = fullName.charAt(0).toUpperCase();

                // --- NUEVO: Actualizar carrito a precio mayorista al iniciar sesión ---
                if (window.isWholesaler && window.cart && window.cart.length > 0) {
                    let cartUpdated = false;
                    window.cart.forEach(item => {
                        if (item.variant === 'full') {
                            const prod = window.catalogProducts.find(p => p.id === item.id);
                            if (prod && prod.wholesalePrice && prod.wholesalePrice < prod.price) {
                                if (item.price !== prod.wholesalePrice) {
                                    item.price = prod.wholesalePrice;
                                    cartUpdated = true;
                                }
                            }
                        }
                    });
                    if (cartUpdated) {
                        window.updateCartUI();
                        window.showToast("✨ Precios de mayorista aplicados a tu carrito.");
                    }
                }
                // -------------------------------------------------------------

                if(window.catalogProducts.length > 0) { 
                    window.filterCatalog(); 
                }

                try { 
                    const infoSnap = await getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info')); 
                    let userPhone = "";
                    if (infoSnap.exists() && infoSnap.data().phone) { 
                        userPhone = infoSnap.data().phone; 
                        document.getElementById('profile-phone-input').value = userPhone; 
                        if(document.getElementById('checkout-phone')) document.getElementById('checkout-phone').value = userPhone; 
                    } 
                    if (infoSnap.exists() && infoSnap.data().address) {
                        const addrInput = document.getElementById('profile-address-input');
                        if (addrInput) addrInput.value = infoSnap.data().address;
                    }
                    
                    // Sincronizar usuario con la base global de clientes (CRM)
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clientes', user.uid), {
                        uid: user.uid,
                        name: fullName,
                        email: user.email || "",
                        phone: userPhone,
                        lastLogin: new Date().toISOString()
                    }, { merge: true });
                } catch(e) { console.error("Error sincronizando CRM", e); }

                const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email); const isStaff = STAFF_EMAILS.includes(user.email);
                if (isSuperAdmin || isStaff) {
                    document.getElementById('btn-orders-dashboard').classList.remove('hidden'); document.getElementById('btn-billing-panel').classList.remove('hidden'); const pushBtn = document.getElementById('btn-push-notifications'); pushBtn.classList.remove('hidden'); 
                    if (Notification.permission === 'granted') { pushBtn.classList.replace('bg-blue-600', 'bg-green-600'); pushBtn.innerText = "✅ Notificaciones Activadas"; }
                    if (isSuperAdmin) { document.getElementById('btn-admin-panel').classList.remove('hidden'); } else { document.getElementById('btn-admin-panel').classList.add('hidden'); }
                    if(window.location.hash === '#admin' || window.location.hash === '#pedidos') { 
                        setTimeout(() => { openOrdersDashboard(); }, 800); 
                        try { history.replaceState(null, null, ' '); } catch(e) {} 
                    }
                    
                    window.listenForNewOrders();
                }
            } else {
                window.isLoggedIn = false; window.userId = null; window.isWholesaler = false;
                
                if(window.catalogProducts.length > 0) { window.filterCatalog(); }

                document.getElementById('nav-login-text').innerText = "Ingresar"; document.getElementById('btn-admin-panel').classList.add('hidden'); document.getElementById('btn-orders-dashboard').classList.add('hidden'); document.getElementById('btn-billing-panel').classList.add('hidden'); document.getElementById('btn-push-notifications').classList.add('hidden'); document.getElementById('profile-name').innerText = "Cargando..."; document.getElementById('profile-email').innerText = "..."; document.getElementById('profile-initial').innerText = "?";
            }
        });

        window.changeUserPassword = async function() {
            const newPassInput = document.getElementById('new-password'); const newPass = newPassInput.value; if(newPass.length < 6) return window.showToast("La contraseña debe tener mínimo 6 caracteres.");
            try { await updatePassword(auth.currentUser, newPass); window.showToast("✅ Contraseña actualizada exitosamente."); newPassInput.value = ''; } catch (error) { if(error.code === 'auth/requires-recent-login') window.showToast("⚠️ Cierra sesión, vuelve a entrar e intenta de nuevo."); else window.showToast("❌ Error al actualizar la contraseña."); }
        }

        window.openAdminModal = () => { window.closeProfileModal(); const m = document.getElementById('admin-modal'); m.style.display = 'flex'; m.style.flexDirection = 'column'; setTimeout(()=>m.classList.remove('opacity-0'), 10); window.renderAdminDecants(); window.renderShippingAgencies(); history.replaceState({}, '', '/admin'); }
        window.closeAdminModal = () => { const m = document.getElementById('admin-modal'); m.classList.add('opacity-0'); setTimeout(()=> { m.style.display = 'none'; }, 300); }
        window.handleProfileClick = () => { 
            if(window.isLoggedIn) { 
                document.getElementById('profile-modal').classList.remove('translate-x-full'); 
                document.body.classList.add('overflow-hidden');
                window.switchProfileTab('orders');
            } else { 
                window.openLoginModal(); 
            } 
        }
        window.closeProfileModal = () => { 
            document.getElementById('profile-modal').classList.add('translate-x-full');
            document.body.classList.remove('overflow-hidden');
        };

        // ── TABS DEL PERFIL ──
        window.switchProfileTab = function(tab) {
            ['orders','info','security'].forEach(t => {
                const el = document.getElementById('profile-tab-' + t);
                const btn = document.getElementById('profile-tab-btn-' + t);
                if (el) el.classList.add('hidden');
                if (btn) {
                    btn.classList.remove('text-perfume-magenta','border-b-2','border-perfume-magenta');
                    btn.classList.add('text-gray-400');
                }
            });
            const activeEl = document.getElementById('profile-tab-' + tab);
            const activeBtn = document.getElementById('profile-tab-btn-' + tab);
            if (activeEl) activeEl.classList.remove('hidden');
            if (activeBtn) {
                activeBtn.classList.remove('text-gray-400');
                activeBtn.classList.add('text-perfume-magenta','border-b-2','border-perfume-magenta');
            }
            if (tab === 'orders') window.fetchUserOrders();
        }

        // ── GUARDAR DIRECCIÓN ──
        window.updateUserAddress = async function() {
            if (!auth.currentUser) return window.showToast("Debes iniciar sesión.");
            const addr = document.getElementById('profile-address-input')?.value.trim();
            if (!addr) return window.showToast("Escribe una dirección válida.");
            try {
                await setDoc(doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'profile', 'info'),
                    { address: addr }, { merge: true });
                window.showToast("✅ Dirección guardada.");
            } catch(e) { window.showToast("❌ Error al guardar la dirección."); console.error(e); }
        }
        window.openLoginModal = () => { document.getElementById('login-modal').classList.remove('hidden'); setTimeout(()=>document.getElementById('login-modal').classList.remove('opacity-0'), 10); }
        window.closeLoginModal = () => { document.getElementById('login-modal').classList.add('opacity-0'); setTimeout(()=>document.getElementById('login-modal').classList.add('hidden'), 300); }
        window.toggleAuthMode = () => { window.isRegisterMode = !window.isRegisterMode; document.getElementById('name-field').classList.toggle('hidden'); document.getElementById('phone-field').classList.toggle('hidden'); document.getElementById('auth-title').innerText = window.isRegisterMode ? "Crear Cuenta" : "Iniciar Sesión"; document.getElementById('auth-submit-btn').innerText = window.isRegisterMode ? "Registrarse" : "Ingresar"; document.getElementById('auth-toggle-text').innerText = window.isRegisterMode ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"; document.getElementById('auth-toggle-btn').innerText = window.isRegisterMode ? "Iniciar sesión" : "Crear cuenta"; }
        window.showToast = (msg) => { const t = document.getElementById('toast'); t.innerText = msg; t.classList.remove('translate-y-full', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-full', 'opacity-0'), 3000); }

        // En escritorio el scroll horizontal no funciona con la rueda del mouse por defecto.
        // Este helper redirige el wheel al eje X en cualquier contenedor con la clase .h-scroll-on-wheel.
        window.enableHorizontalScroll = function(el) {
            if (!el) return;
            // Scroll con la rueda del mouse
            el.addEventListener('wheel', (e) => {
                if (e.deltaY === 0) return;
                e.preventDefault();
                el.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
            }, { passive: false });
            // Arrastre con click sostenido (drag-to-scroll)
            let isDown = false, startX, scrollLeft;
            el.addEventListener('mousedown', (e) => { isDown = true; el.style.userSelect = 'none'; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
            el.addEventListener('mouseleave', () => { isDown = false; el.style.userSelect = ''; });
            el.addEventListener('mouseup', () => { isDown = false; el.style.userSelect = ''; });
            el.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; el.scrollLeft = scrollLeft - (x - startX); });
        }
        // Se aplica cuando los chips ya están en el DOM (después de loadSiteConfig)
        document.addEventListener('DOMContentLoaded', () => {
            window.enableHorizontalScroll(document.getElementById('cat-chips'));
            window.enableHorizontalScroll(document.getElementById('brand-chips'));

            // Routing por URL: abre el panel correcto según la ruta
            const path = window.location.pathname.replace(/\/$/, '').toLowerCase();
            if (path === '/monitor-pedidos') {
                // Espera a que el usuario esté autenticado antes de abrir
                const unwatch = onAuthStateChanged(auth, (user) => {
                    if (user) { unwatch(); setTimeout(() => window.openOrdersDashboard(), 1200); }
                });
            } else if (path === '/facturacion') {
                const unwatch = onAuthStateChanged(auth, (user) => {
                    if (user) { unwatch(); setTimeout(() => window.openBillingModal(), 1200); }
                });
            } else if (path === '/admin') {
                const unwatch = onAuthStateChanged(auth, (user) => {
                    if (user) { unwatch(); setTimeout(() => window.openAdminModal(), 1200); }
                });
            }
        });
        
        window.openCustomConfirm = function(title, desc, onConfirmCallback) {
            document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-desc').innerText = desc; const btn = document.getElementById('btn-confirm-action'); btn.onclick = () => { window.closeCustomConfirm(); onConfirmCallback(); }; const modal = document.getElementById('custom-confirm-modal'); const box = document.getElementById('custom-confirm-box'); modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); }, 10);
        }

        window.closeCustomConfirm = function() { const modal = document.getElementById('custom-confirm-modal'); const box = document.getElementById('custom-confirm-box'); modal.classList.add('opacity-0'); box.classList.add('scale-95'); setTimeout(() => { modal.classList.add('hidden'); }, 300); }

        window.handleAuth = async (e) => {
            e.preventDefault(); const btn = document.getElementById('auth-submit-btn'); const originalText = btn.innerText; btn.innerText = "Procesando..."; btn.disabled = true;
            try {
                if(window.isRegisterMode){
                    const userCred = await createUserWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value);
                    await updateProfile(userCred.user, { displayName: document.getElementById('auth-name').value });
                    const phoneInput = document.getElementById('auth-phone');
                    if(phoneInput && phoneInput.value.trim()) { const newPhone = phoneInput.value.trim(); await setDoc(doc(db, 'artifacts', appId, 'users', userCred.user.uid, 'profile', 'info'), { phone: newPhone }, { merge: true }); if(document.getElementById('checkout-phone')) document.getElementById('checkout-phone').value = newPhone; if(document.getElementById('profile-phone-input')) document.getElementById('profile-phone-input').value = newPhone; }
                    try { await sendEmailVerification(userCred.user); window.showToast("¡Cuenta creada! Hemos enviado un correo de bienvenida."); } catch(err) { window.showToast("¡Cuenta creada exitosamente!"); }
                } else { await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value); window.showToast("¡Acceso correcto!"); }
                window.closeLoginModal(); 
            } catch(e) { window.showToast("Error de acceso o datos inválidos."); } finally { btn.innerText = originalText; btn.disabled = false; }
        }
        
        window.loginWithGoogle = async () => {
            const provider = new GoogleAuthProvider();
            try {
                const result = await signInWithPopup(auth, provider);
                window.showToast("✅ ¡Acceso correcto con Google!");
                window.closeLoginModal();
            } catch (error) {
                console.error("Error de autenticación con Google:", error);
                if (error.code === 'auth/account-exists-with-different-credential') {
                    window.showToast("⚠️ Ve a Firebase -> Authentication -> Configuración -> Vinculación de Cuentas, y activa 'Vincular cuentas que usan el mismo correo'.");
                } else {
                    window.showToast("❌ Error al iniciar sesión con Google.");
                }
            }
        };

        window.logout = async () => { await signOut(auth); window.closeProfileModal(); window.showToast("Sesión cerrada."); }

        // --- INICIO LÓGICA DE BARRAS DE PROGRESO DE PEDIDOS ---
        window.generateStepperHTML = function(status) {
            if(status === 'Cancelado' || status === 'Eliminado') {
                return `<div class="bg-red-50 text-red-600 p-3 rounded-lg text-center font-bold text-sm border border-red-100">🚫 Pedido ${status}</div>`;
            }
            
            const steps = ['Recibido', 'Procesando', 'Enviado', 'Completado'];
            let currentStepIdx = steps.indexOf(status);
            if(currentStepIdx === -1) currentStepIdx = 0; 

            let html = `<div class="flex items-center justify-between w-full my-6 relative">`;
            html += `<div class="absolute left-[10%] right-[10%] top-1/2 transform -translate-y-1/2 h-1 bg-gray-200 z-0 rounded-full"></div>`;
            
            const progressWidth = currentStepIdx === 0 ? 0 : (currentStepIdx / (steps.length - 1)) * 100;
            html += `<div class="absolute left-[10%] top-1/2 transform -translate-y-1/2 h-1 bg-perfume-magenta z-0 rounded-full transition-all duration-700 ease-out" style="width: ${progressWidth === 0 ? 0 : progressWidth - 10}%;"></div>`;

            steps.forEach((step, idx) => {
                const isCompleted = idx <= currentStepIdx;
                const isActive = idx === currentStepIdx;
                const bgColor = isCompleted ? 'bg-perfume-magenta text-white' : 'bg-gray-200 text-gray-400';
                const ringColor = isActive ? 'ring-4 ring-perfume-magenta/20 shadow-lg scale-110' : '';
                const checkMark = isCompleted ? '✓' : (idx + 1);
                
                html += `
                <div class="flex flex-col items-center relative z-10 w-1/4">
                    <div class="w-6 h-6 md:w-8 md:h-8 rounded-full ${bgColor} ${ringColor} flex items-center justify-center text-[10px] md:text-xs font-bold transition-all duration-500 border-2 border-white">
                        ${checkMark}
                    </div>
                    <span class="text-[9px] md:text-[10px] mt-1.5 font-bold ${isCompleted ? 'text-perfume-dark' : 'text-gray-400'} uppercase tracking-wide text-center">${step}</span>
                </div>`;
            });
            html += `</div>`;
            
            const statusMsg = window.statusMessages[status] || '';
            if(statusMsg) {
                html += `<div class="bg-perfume-light p-3 rounded-lg text-xs text-gray-600 text-center italic border border-gray-100 shadow-sm animate-pulse">"${statusMsg}"</div>`;
            }
            return html;
        }

        window.openTrackingModal = () => { 
            if(window.isLoggedIn) {
                window.handleProfileClick(); 
            } else {
                const m = document.getElementById('tracking-modal'); const b = document.getElementById('tracking-box');
                document.getElementById('tracking-result-container').innerHTML = ''; document.getElementById('tracking-result-container').classList.add('hidden');
                document.getElementById('track-order-id').value = '';
                m.classList.remove('hidden'); setTimeout(() => { m.classList.remove('opacity-0'); b.classList.remove('scale-95'); }, 10);
            }
        }
        
        window.closeTrackingModal = () => { 
            const m = document.getElementById('tracking-modal'); const b = document.getElementById('tracking-box');
            m.classList.add('opacity-0'); b.classList.add('scale-95'); setTimeout(() => m.classList.add('hidden'), 300); 
        }

        window.searchGuestOrder = async () => {
            const trackIdInput = document.getElementById('track-order-id');
            let trackId = trackIdInput.value.trim().toUpperCase();
            if(!trackId) return window.showToast("Ingresa el ID de tu pedido.");
            if(!trackId.startsWith('#PED-')) trackId = '#PED-' + trackId.replace('#PED-', '');

            const btn = document.getElementById('btn-track-order');
            const originalText = btn.innerHTML;
            btn.innerHTML = `<span class="animate-spin inline-block mr-2">⏳</span> Rastrando...`;
            btn.disabled = true;

            try {
                const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'pedidos'), where("orderId", "==", trackId));
                const querySnapshot = await getDocs(q);
                const resultContainer = document.getElementById('tracking-result-container');
                
                if (querySnapshot.empty) {
                    resultContainer.innerHTML = `<div class="text-center p-4 bg-red-50 rounded-xl border border-red-100"><p class="text-red-500 font-bold">❌ Pedido no encontrado</p><p class="text-xs text-gray-500 mt-1">Verifica tu código de orden.</p></div>`;
                    resultContainer.classList.remove('hidden');
                } else {
                    const orderData = querySnapshot.docs[0].data();
                    const dateStr = new Date(orderData.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                    
                    let resultHtml = `
                        <div class="bg-gray-50 rounded-2xl p-4 md:p-6 border border-gray-200 shadow-inner">
                            <div class="flex justify-between items-center mb-2">
                                <span class="font-mono font-bold text-perfume-dark bg-white px-2.5 py-1 rounded shadow-sm border border-gray-100">${orderData.orderId}</span>
                                <span class="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded shadow-sm">📅 ${dateStr}</span>
                            </div>
                            
                            ${window.generateStepperHTML(orderData.status)}

                            <div class="mt-6 border-t border-gray-200 pt-5">
                                <h4 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Tus Productos:</h4>
                                <ul class="space-y-2 mb-4">`;
                    
                    orderData.items.forEach(item => {
                        resultHtml += `<li class="text-sm text-gray-700 flex justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm"><span>${item.qty}x <span class="font-bold">${item.name}</span></span> <span class="font-medium text-perfume-dark">RD$ ${(item.price * item.qty).toLocaleString()}</span></li>`;
                    });

                    resultHtml += `</ul>
                                <div class="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                    <span class="font-black text-gray-800 text-sm uppercase tracking-widest">Total a Pagar</span>
                                    <span class="font-extrabold text-perfume-magenta text-xl">RD$ ${orderData.total.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>`;
                    
                    resultContainer.innerHTML = resultHtml;
                    resultContainer.classList.remove('hidden');
                }
            } catch (error) {
                window.showToast("Error al conectar con la base de datos.");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
        // --- FIN LÓGICA DE BARRAS DE PROGRESO ---

        // --- INICIO LÓGICA HISTORIAL DE PEDIDOS DEL CLIENTE ---
