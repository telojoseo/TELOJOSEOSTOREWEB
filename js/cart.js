// ============================================================
// cart.js — Carrito de compras y checkout por WhatsApp
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { addDoc, collection, doc, setDoc } from './firebase-config.js';

        window.updateQty = (id, delta) => { let v = parseInt(document.getElementById('qty-'+id).innerText)+delta; document.getElementById('qty-'+id).innerText = v<1?1:v; }
        
        // ── ANIMACIÓN VOLAR AL CARRITO ──────────────────────────────────────
        // originEl: el elemento desde donde empieza el vuelo (botón o imagen)
        window.flyToCart = function(imgSrc, originEl) {
            const cartBtn = document.getElementById('nav-cart-btn');
            if (!cartBtn || !imgSrc) return;

            const cartRect = cartBtn.getBoundingClientRect();
            const cartCX = cartRect.left + cartRect.width / 2;
            const cartCY = cartRect.top + cartRect.height / 2;

            // Origen: posición del elemento si está disponible, sino el centro de la pantalla
            let startX, startY;
            if (originEl) {
                const r = originEl.getBoundingClientRect();
                startX = r.left + r.width / 2;
                startY = r.top + r.height / 2;
            } else {
                startX = window.innerWidth / 2;
                startY = window.innerHeight * 0.4;
            }

            const flyEl = document.createElement('img');
            flyEl.src = imgSrc;
            flyEl.className = 'fly-item';
            flyEl.style.left = (startX - 24) + 'px';
            flyEl.style.top  = (startY - 24) + 'px';
            flyEl.style.setProperty('--fly-x', (cartCX - startX) + 'px');
            flyEl.style.setProperty('--fly-y', (cartCY - startY) + 'px');
            document.body.appendChild(flyEl);

            setTimeout(() => {
                flyEl.remove();
                // Bounce en el carrito
                cartBtn.classList.remove('cart-bounce');
                void cartBtn.offsetWidth; // reflow para reiniciar animación
                cartBtn.classList.add('cart-bounce', 'text-perfume-magenta', 'cart-glow');
                setTimeout(() => cartBtn.classList.remove('cart-bounce', 'text-perfume-magenta', 'cart-glow'), 650);
            }, 630);
        }

        window.addToCart = (id, name, price, img, variantId, barcode = '') => { 
            const prodData = window.catalogProducts.find(p => p.id === id); if (!prodData) return; const q = parseInt(document.getElementById('qty-'+id).innerText); const cartId = `${id}_${variantId}`; 
            const currentQtyInCart = window.cart.find(i=>i.cartId === cartId)?.qty || 0;
            if (prodData.stock !== null && prodData.stock !== undefined && (currentQtyInCart + q) > prodData.stock) { return window.showToast(`Solo quedan ${prodData.stock} unidades en stock.`); }

            const ex = window.cart.find(i=>i.cartId === cartId); 
            if(ex) ex.qty+=q; else window.cart.push({cartId, id, name, price, qty:q, img, variant: variantId, barcode: barcode}); 
            document.getElementById('qty-'+id).innerText=1; window.updateCartUI();

            // Busca el botón de la tarjeta de producto para usar como origen del vuelo
            const originBtn = document.querySelector(`.product-card-item [onclick*="addToCart('${id}'"]`) || null;
            window.flyToCart(img, originBtn);

            window.showToast("¡Agregado al carrito! 🛒");
        }
        
        window.removeFromCart = (i) => { window.cart.splice(i,1); window.updateCartUI(); }
        window.toggleCart = () => { document.getElementById('cart-modal').classList.add('cart-opened-by-user'); document.getElementById('cart-modal').classList.toggle('translate-x-full'); }
        
        window.updateCartItemQty = (idx, delta) => {
            if (!window.cart[idx]) return;
            const item = window.cart[idx];
            const newQty = item.qty + delta;
            
            // Si intenta bajar de 1, eliminamos el artículo del carrito
            if (newQty < 1) {
                window.removeFromCart(idx);
                return;
            }

            // Validar inventario antes de sumar
            const prodData = window.catalogProducts.find(p => p.id === item.id);
            if (delta > 0 && prodData && typeof prodData.stock === 'number') {
                const totalInCart = window.cart.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);
                if ((totalInCart + delta) > prodData.stock) {
                    return window.showToast(`Solo quedan ${prodData.stock} unidades en stock.`);
                }
            }

            item.qty = newQty;
            window.updateCartUI();
        };

        window.updateCartUI = () => {
            const sum = window.cart.reduce((s,i)=>s+i.qty,0); 
            document.getElementById('cart-badge').innerText=sum; 
            document.getElementById('cart-badge').classList.toggle('hidden', sum===0);
            
            let html='', total=0;
            window.cart.forEach((i,idx)=>{ 
                total+=i.price*i.qty; 
                const skuText = i.barcode ? `<span class="text-[9px] text-gray-400 font-mono block mt-0.5">SKU: ${i.barcode}</span>` : ''; 
                
                // NUEVO DISEÑO CON BOTONES DE + Y -
                html+=`
                <div class="flex gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm relative group transition hover:border-gray-300">
                    <img src="${i.img}" class="w-16 h-16 object-cover rounded-lg border border-gray-50 mix-blend-multiply bg-gray-50 shrink-0">
                    <div class="flex-1 flex flex-col justify-between">
                        <div class="pr-5">
                            <p class="text-sm font-bold text-perfume-dark leading-tight">${i.name}</p>
                            ${skuText}
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <div class="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200">
                                <button onclick="updateCartItemQty(${idx}, -1)" class="w-7 h-7 flex items-center justify-center font-bold text-gray-600 hover:bg-white hover:text-black rounded hover:shadow-sm transition">-</button>
                                <span class="w-6 text-center text-xs font-bold text-gray-800">${i.qty}</span>
                                <button onclick="updateCartItemQty(${idx}, 1)" class="w-7 h-7 flex items-center justify-center font-bold text-gray-600 hover:bg-white hover:text-black rounded hover:shadow-sm transition">+</button>
                            </div>
                            <p class="text-sm font-extrabold text-perfume-magenta">RD$ ${(i.price * i.qty).toLocaleString('en-US')}</p>
                        </div>
                    </div>
                    <button onclick="removeFromCart(${idx})" class="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center transition shadow-sm opacity-100 md:opacity-0 group-hover:opacity-100" title="Quitar">&times;</button>
                </div>`; 
            });
            
            document.getElementById('cart-items').innerHTML = html || '<div class="flex flex-col items-center justify-center h-full text-center py-10"><span class="text-4xl mb-3">🛒</span><p class="text-gray-500 font-bold">Tu carrito está vacío</p></div>'; 
            document.getElementById('cart-total').innerText = `RD$ ${total.toLocaleString('en-US')}`;
            window.saveCartToStorage();
        }
        
        window.loadCartFromStorage();
        window.updateCartUI();
        
        window.checkoutWhatsApp = async () => {
            if(!window.cart.length) return window.showToast("Tu carrito está vacío.");
            if(!window.isLoggedIn) { document.getElementById('cart-modal').classList.add('translate-x-full'); window.showToast("Inicia sesión para registrar tu pedido."); return window.openLoginModal(); }
            const customerPhone = document.getElementById('checkout-phone').value.trim(); if(!customerPhone) return window.showToast("Por favor ingresa tu número de WhatsApp para contactarte.");

            const btn = document.getElementById('btn-checkout-wa'); btn.innerHTML = "Procesando..."; btn.disabled = true; let total = 0; window.cart.forEach(item => total += (item.price * item.qty));
            const orderIdHex = Math.random().toString(36).substring(2, 7).toUpperCase(); const orderId = `#PED-${orderIdHex}`;

            try {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'pedidos'), { orderId: orderId, userId: window.userId, customerName: auth.currentUser.displayName || "Cliente", customerPhone: customerPhone, customerEmail: auth.currentUser.email || "", items: window.cart, total: total, date: new Date().toISOString(), status: "Recibido", stockDeducted: false });

                const firstName = auth.currentUser.displayName ? auth.currentUser.displayName.split(' ')[0] : "Cliente";
                let text = `*¡Hola FamlyFragrancerd!*\n\nSoy *${firstName}* y acabo de confirmar el pedido web: *${orderId}*\n\n*DETALLE DEL PEDIDO:*\n`;
                window.cart.forEach(item => { const sub = item.price * item.qty; const skuText = item.barcode ? ` [SKU: ${item.barcode}]` : ''; text += `- ${item.qty}x ${item.name}${skuText} (RD$ ${sub.toLocaleString('en-US')})\n`; });
                text += `\n*TOTAL A PAGAR:* RD$ ${total.toLocaleString('en-US')}\n\nMi número para seguimiento es: ${customerPhone}\nQuedo a la espera para proceder con el pago y envío. ¡Gracias!\n\n*Enlace de seguimiento:* ${window.location.origin}${window.location.pathname}#pedidos`;
                
                if (auth.currentUser && !auth.currentUser.isAnonymous) { await setDoc(doc(db, 'artifacts', appId, 'users', window.userId, 'profile', 'info'), { phone: customerPhone }, { merge: true }).catch(e=>{}); }

                window.cart=[]; window.updateCartUI(); window.toggleCart(); window.showToast("¡Pedido registrado exitosamente!");
                
                let adminPhone = "18495161973"; 
                if (window.siteConfig) {
                    if (window.siteConfig.sWa && window.siteConfig.sWa.length > 5) {
                        adminPhone = window.siteConfig.sWa.replace(/\D/g, ''); 
                    } else if (window.siteConfig.fPhone && window.siteConfig.fPhone.length > 5) {
                        adminPhone = window.siteConfig.fPhone.replace(/\D/g, ''); 
                    }
                }
                
                if (adminPhone.length === 10) adminPhone = '1' + adminPhone; 
                if (adminPhone.length < 10) adminPhone = "18495161973"; 

                window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(text)}`, '_blank');
                setTimeout(() => { btn.innerHTML = `Realizar Pedido por WhatsApp`; btn.disabled = false; }, 3000);
            } catch (error) { console.error(error); window.showToast("Error al procesar el pedido."); btn.innerHTML = `Realizar Pedido por WhatsApp`; btn.disabled = false; }
        }
