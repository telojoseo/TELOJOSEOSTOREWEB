// ============================================================
// site-config.js — Categorías, marcas y configuración/apariencia del sitio (admin)
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { doc, getDoc, setDoc } from './firebase-config.js';
import { CONFIG_FIELDS } from './core.js';

        window.renderCategoriesUI = function() {
            // Chips del catálogo (frente)
            const catChips = document.getElementById('cat-chips');
            if (catChips) {
                const current = window.currentCategoryFilter || 'Todos';
                let html = `<button class="filter-chip ${current === 'Todos' ? 'active' : ''}" onclick="window.setCategoryFilter('Todos')">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                    Todas
                </button>`;
                window.siteCategories.forEach(c => {
                    html += `<button class="filter-chip ${current === c ? 'active' : ''}" onclick="window.setCategoryFilter('${window.safeStr(c)}')">${c}</button>`;
                });
                catChips.innerHTML = html;
            }
            // Select del panel admin (no cambia)
            const catSelectAdmin = document.getElementById('admin-prod-cat');
            if (catSelectAdmin) {
                let htmlAdmin = `<option value="" disabled selected>Selecciona Categoría</option>`;
                window.siteCategories.forEach(c => htmlAdmin += `<option value="${c}">${c}</option>`);
                const currentVal = catSelectAdmin.value;
                catSelectAdmin.innerHTML = htmlAdmin;
                if (window.siteCategories.includes(currentVal)) catSelectAdmin.value = currentVal;
            }
            const adminList = document.getElementById('admin-categories-list');
            if (adminList) {
                let listHtml = '';
                window.siteCategories.forEach((cat, idx) => {
                    listHtml += `<li class="flex justify-between items-center py-2 px-3"><span class="text-sm font-bold text-gray-700">${cat}</span><button onclick="removeSiteCategory(${idx})" class="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1 bg-red-50 hover:bg-red-100 rounded">Eliminar</button></li>`;
                });
                adminList.innerHTML = listHtml;
            }
        }

        window.addSiteCategory = async function() {
            const input = document.getElementById('new-category-input'); const val = input.value.trim();
            if(!val) return; if(window.siteCategories.includes(val)) return window.showToast("La categoría ya existe.");
            window.siteCategories.push(val); input.value = ''; window.renderCategoriesUI(); await window.saveCategoriesToDB();
        }

        window.removeSiteCategory = async function(idx) {
            if(!confirm("¿Seguro que deseas eliminar esta categoría?")) return;
            window.siteCategories.splice(idx, 1); window.renderCategoriesUI(); await window.saveCategoriesToDB();
        }

        window.saveCategoriesToDB = async function() { 
            try { 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), { categoriesList: window.siteCategories }, { merge: true }); 
                window.showToast("Categorías actualizadas."); 
            } catch(e) { } 
        }

        window.renderBrandsAdminUI = function() {
            const brandSelectAdmin = document.getElementById('admin-prod-brand');
            if(brandSelectAdmin) {
                let htmlAdmin = `<option value="" disabled selected>Selecciona Marca</option>`;
                window.siteBrands.forEach(b => htmlAdmin += `<option value="${b}">${b}</option>`);
                const currentVal = brandSelectAdmin.value; brandSelectAdmin.innerHTML = htmlAdmin; if(window.siteBrands.includes(currentVal)) brandSelectAdmin.value = currentVal;
            }
            const adminList = document.getElementById('admin-brands-list');
            if(adminList) {
                let listHtml = '';
                window.siteBrands.forEach((brand, idx) => { listHtml += `<li class="flex justify-between items-center py-2 px-3"><span class="text-sm font-bold text-gray-700">${brand}</span><button onclick="removeSiteBrand(${idx})" class="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1 bg-red-50 hover:bg-red-100 rounded">Eliminar</button></li>`; });
                adminList.innerHTML = listHtml;
            }
        }

        window.addSiteBrand = async function() {
            const input = document.getElementById('new-brand-input'); const val = input.value.trim();
            if(!val) return; if(window.siteBrands.includes(val)) return window.showToast("La marca ya existe.");
            window.siteBrands.push(val); window.siteBrands.sort(); input.value = ''; window.renderBrandsAdminUI(); await window.saveBrandsToDB();
        }

        window.removeSiteBrand = async function(idx) {
            if(!confirm("¿Seguro que deseas eliminar esta marca?")) return;
            window.siteBrands.splice(idx, 1); window.renderBrandsAdminUI(); await window.saveBrandsToDB();
        }

        window.saveBrandsToDB = async function() { 
            try { 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), { brandsList: window.siteBrands }, { merge: true }); 
                window.showToast("Marcas actualizadas."); 
            } catch(e) { } 
        }

        window.saveSiteConfig = async function(e) {
            e.preventDefault(); 
            const btn = document.getElementById('btn-save-cfg');
            const originalText = btn.innerHTML;
            btn.innerHTML = "Guardando..."; btn.disabled = true;

            try {
                const dataObj = {};
                CONFIG_FIELDS.forEach(field => {
                    const el = document.getElementById(field.id);
                    if(el) {
                        dataObj[field.key] = field.type === 'checkbox' ? el.checked : el.value;
                    }
                });
                
                dataObj.categoriesList = window.siteCategories;
                dataObj.brandsList = window.siteBrands;

                await setDoc(doc(db, 'artifacts', appId, 'public', 'config'), dataObj, { merge: true });
                window.showToast("✅ Diseño de tienda guardado.");
                await window.loadSiteConfig(); 
            } catch(error) {
                console.error("Error guardando config:", error); window.showToast("❌ Error al guardar.");
            } finally {
                btn.innerHTML = originalText; btn.disabled = false;
            }
        }

        window.loadSiteConfig = async function() {
            try {
                const configRef = doc(db, 'artifacts', appId, 'public', 'config');
                const snap = await getDoc(configRef);
                const data = snap.exists() ? snap.data() : {};
                window.siteConfig = data;

                // IMPORTANTE: esto va PRIMERO, antes de cualquier otra operación visual
                // que pudiera fallar. Así el formulario de admin SIEMPRE queda relleno
                // con los datos reales guardados, sin importar si algo más abajo truena,
                // y nunca corres el riesgo de guardar campos en blanco por accidente.
                try {
                    CONFIG_FIELDS.forEach(field => {
                        const el = document.getElementById(field.id);
                        if(el) {
                            if(field.type === 'checkbox') {
                                el.checked = data[field.key] !== false;
                            } else {
                                if(data[field.key] !== undefined) {
                                    el.value = data[field.key];
                                }
                            }
                        }
                    });
                } catch(fieldsErr) { console.error("Error rellenando formulario de config:", fieldsErr); }

                if(auth.currentUser) {
                    const wholesaleList = (data.wholesaleEmails || "").split(',').map(e=>e.trim().toLowerCase());
                    window.isWholesaler = wholesaleList.includes(auth.currentUser.email.toLowerCase());
                }

                if(data.categoriesList && Array.isArray(data.categoriesList)) window.siteCategories = data.categoriesList;
                window.renderCategoriesUI();
                if(data.brandsList && Array.isArray(data.brandsList)) window.siteBrands = data.brandsList;
                window.renderBrandsAdminUI();

                if(data.statusDisplayNames) window.statusDisplayNames = { ...window.statusDisplayNames, ...data.statusDisplayNames };
                if(data.statusMessages) window.statusMessages = { ...window.statusMessages, ...data.statusMessages };

                window.siteAppearance = {
                    gridCols: data.gridCols || 'lg:grid-cols-4',
                    cardBorder: data.cardBorder || 'border border-gray-100',
                    cardRadius: data.cardRadius || 'rounded-2xl',
                    cardShadow: data.cardShadow || 'shadow-sm',
                    imgFit: data.imgFit || 'object-contain',
                    priceSize: data.priceSize || 'text-base md:text-lg'
                };

                const defaultLogo = "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png";
                const logoUrl = data.logoUrl || defaultLogo;

                // Función para aplicar logo con fallback al logo por defecto si la URL falla
                const applyLogo = (el, url) => {
                    if (!el) return;
                    el.src = url;
                    el.onerror = () => { el.src = defaultLogo; el.onerror = null; };
                };
                applyLogo(document.getElementById('main-logo'), logoUrl);
                applyLogo(document.getElementById('splash-logo'), logoUrl);
                applyLogo(document.querySelector('.footer-logo'), logoUrl);
                document.getElementById('favicon-link').href = logoUrl;

                const root = document.documentElement;
                root.style.setProperty('--primary', data.colorPrimary || '#000000');
                root.style.setProperty('--secondary', data.colorSecondary || '#000000');
                root.style.setProperty('--bg-light', data.colorBg || '#ffffff');
                root.style.setProperty('--header-bg', data.headerBg || '#ffffff');
                root.style.setProperty('--footer-bg', data.footerBg || '#ffffff');

                const bodyEl = document.getElementById('main-body');
                bodyEl.classList.remove('font-sans', 'font-serif', 'font-mono'); bodyEl.classList.add(data.fontFamily || 'font-sans');

                document.getElementById('display-hero-title1').innerText = data.heroT1 || "Tu esencia,";
                document.getElementById('display-hero-title2').innerText = data.heroT2 || "tu identidad.";
                document.getElementById('display-hero-subtitle').innerText = data.heroSub || "Fragancias originales seleccionadas para destacar tu personalidad en cada momento especial.";
                // Solo actualiza el texto del span visible, sin borrar el ícono SVG ni la flecha
                const heroBtnEl = document.getElementById('display-hero-btn');
                if (heroBtnEl) {
                    const textSpan = heroBtnEl.querySelector('span.relative.leading-none');
                    if (textSpan) textSpan.innerText = data.heroBtn || "Explorar Colección";
                }
                
                const heroSection = document.getElementById('inicio');
                heroSection.classList.remove('min-h-[50vh]', 'min-h-[70vh]', 'min-h-screen'); heroSection.classList.add(data.heroHeight || 'min-h-[70vh]');
                
                const heroTextContainer = document.getElementById('hero-text-container');
                heroTextContainer.classList.remove('md:text-left', 'text-center', 'md:text-right');
                if(data.heroAlign === 'text-center') {
                    heroTextContainer.classList.add('text-center'); document.getElementById('display-hero-subtitle').classList.remove('md:mx-0'); document.getElementById('display-hero-subtitle').classList.add('mx-auto');
                } else if(data.heroAlign === 'text-right') {
                    heroTextContainer.classList.add('text-center', 'md:text-right'); document.getElementById('display-hero-subtitle').classList.remove('md:mx-0'); document.getElementById('display-hero-subtitle').classList.add('ml-auto');
                } else {
                    heroTextContainer.classList.add('text-center', 'md:text-left'); document.getElementById('display-hero-subtitle').classList.add('md:mx-0');
                }

                const mediaUrl = data.heroImg || "https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80";
                const mediaContainer = document.getElementById('hero-media-container');
                const mediaClasses = "rounded-3xl shadow-xl max-w-full h-auto object-cover max-h-[300px] md:max-h-[500px] hover:scale-105 transition duration-500";
                const fallbackImg = "https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80";

                if (data.mediaType === "video") {
                    mediaContainer.innerHTML = `<video src="${mediaUrl}" poster="${fallbackImg}" autoplay loop muted playsinline webkit-playsinline preload="auto" class="${mediaClasses} w-full"></video>`;
                    const videoEl = mediaContainer.querySelector('video');
                    if (videoEl) {
                        // Forzamos el estado "muted" por JS (no solo el atributo) para que el autoplay
                        // funcione de forma confiable en navegadores móviles.
                        videoEl.muted = true;
                        const playPromise = videoEl.play();
                        if (playPromise && playPromise.catch) {
                            playPromise.catch(err => console.warn('No se pudo reproducir el video automáticamente:', err));
                        }
                        // Si el link no es un video reproducible (ej: una página y no un archivo .mp4/.webm directo),
                        // mostramos una imagen en vez de dejar el espacio en blanco.
                        videoEl.onerror = () => {
                            console.warn('El enlace de video no se pudo cargar, mostrando imagen de respaldo. Verifica que sea un enlace DIRECTO a un archivo .mp4 o .webm.');
                            mediaContainer.innerHTML = `<img src="${mediaUrl}" alt="Perfume" class="${mediaClasses}" onerror="this.src='${fallbackImg}'">`;
                        };
                    }
                } else {
                    mediaContainer.innerHTML = `<img src="${mediaUrl}" alt="Perfume" class="${mediaClasses}" onerror="this.src='${fallbackImg}'">`;
                }

                document.getElementById('display-catalog-title').innerText = data.catalogTitle || "Colección Exclusiva";
                document.getElementById('products-grid').className = `grid grid-cols-2 sm:grid-cols-2 ${window.siteAppearance.gridCols} gap-4 md:gap-8 transition-all duration-500`;

                document.getElementById('display-footer-email').innerText = data.fEmail || "info@famlyfragrancerd.com";
                document.getElementById('display-footer-phone').innerText = data.fPhone || "+1 (849) 516-1973";
                document.getElementById('display-footer-address').innerText = data.fAddress || "Santiago, RD";
                
                const ig = document.getElementById('display-social-ig'); const fb = document.getElementById('display-social-fb');
                const tt = document.getElementById('display-social-tt'); const wa = document.getElementById('display-social-wa');
                if(data.sIg) { ig.href = data.sIg; ig.classList.remove('hidden'); } else { ig.classList.add('hidden'); }
                if(data.sFb) { fb.href = data.sFb; fb.classList.remove('hidden'); } else { fb.classList.add('hidden'); }
                if(data.sTt) { tt.href = data.sTt; tt.classList.remove('hidden'); } else { tt.classList.add('hidden'); }
                if(data.sWa) { wa.href = data.sWa; wa.classList.remove('hidden'); } else { wa.classList.add('hidden'); }

                const waContainer = document.getElementById('whatsapp-container');
                const waTooltip = document.getElementById('whatsapp-tooltip');
                if (data.showWaBtn !== false) {
                    waContainer.classList.remove('hidden'); document.getElementById('whatsapp-float').href = data.sWa || `https://wa.me/18495161973`;
                    waContainer.classList.remove('right-6', 'left-6'); waTooltip.classList.remove('right-full', 'mr-3', 'left-full', 'ml-3');
                    if(data.waBtnPos === 'left-6') { waContainer.classList.add('left-6'); waTooltip.classList.add('left-full', 'ml-3'); } 
                    else { waContainer.classList.add('right-6'); waTooltip.classList.add('right-full', 'mr-3'); }
                } else { waContainer.classList.add('hidden'); }

                window.triggerPromoModal = function() {
                    const promoImg = data.promoImg;
                    const promoLink = data.promoLink;
                    const promoActive = data.promoActive === true || data.promoActive === 'true';
                    
                    if (!promoActive || !promoImg) return;
                    
                    const modal = document.getElementById('promo-modal');
                    const imgEl = document.getElementById('promo-img');
                    const linkEl = document.getElementById('promo-link');
                    
                    if (!modal || !imgEl) return;
                    
                    imgEl.src = promoImg;
                    if (promoLink) linkEl.href = promoLink;
                    
                    setTimeout(() => {
                        modal.classList.remove('hidden');
                        modal.classList.add('flex');
                    }, 2000);
                }
                
                window.triggerPromoModal();

                if(window.catalogProducts && window.catalogProducts.length > 0) {
                    window.filterCatalog();
                }

            } catch(e) { console.log("Cargando config. por defecto", e); }
        }

