// ============================================================
// catalog.js — Catálogo de productos: filtros, render, paginación, modal de detalle de producto
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { collection, getDocs } from './firebase-config.js';

        window.currentCategoryFilter = 'Todos'; window.currentBrandFilter = 'Todas'; 
        window.setCategoryFilter = function(cat) { window.currentCategoryFilter = cat; window.renderCategoriesUI(); window.filterCatalog(); }
        window.setBrandFilter = function(brand) { window.currentBrandFilter = brand; window.renderBrandsUI(); window.filterCatalog(); }

        window.renderBrandsUI = function() {
            const brandChips = document.getElementById('brand-chips');
            if (!brandChips) return;
            const brands = [...new Set(window.catalogProducts.map(p => p.brand).filter(b => b && b.trim() !== ''))].sort();
            if (window.currentBrandFilter !== 'Todas' && !brands.includes(window.currentBrandFilter)) window.currentBrandFilter = 'Todas';
            const current = window.currentBrandFilter || 'Todas';
            let html = `<button class="filter-chip ${current === 'Todas' ? 'active' : ''}" onclick="window.setBrandFilter('Todas')">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"/></svg>
                Todas
            </button>`;
            brands.forEach(b => {
                html += `<button class="filter-chip ${current === b ? 'active' : ''}" onclick="window.setBrandFilter('${window.safeStr(b)}')">${b}</button>`;
            });
            brandChips.innerHTML = html;
        }

        window.renderCatalog = function(productsList) {
            const grid = document.getElementById('products-grid');
            grid.innerHTML = '';
            const emptyMsg = document.getElementById('catalog-empty-msg');

            if (!Array.isArray(productsList) || productsList.length === 0) {
                if (emptyMsg) emptyMsg.classList.remove('hidden');
                window.renderPagination(0);
                return;
            }

            const startIndex = (window.currentPage - 1) * window.itemsPerPage;
            const paginatedProducts = productsList.slice(startIndex, startIndex + window.itemsPerPage);
            if (paginatedProducts.length === 0 && window.currentPage > 1) {
                window.currentPage = 1;
                return window.renderCatalog(productsList);
            }

            if (emptyMsg) emptyMsg.classList.add('hidden');

            const vConfig = window.siteAppearance || {};
            const cardRadius = vConfig.cardRadius || 'rounded-2xl';
            const cardBorder = vConfig.cardBorder || 'border border-gray-100';
            const cardShadow = vConfig.cardShadow || 'shadow-sm';
            const imgFit = vConfig.imgFit || 'object-contain';
            const priceSize = vConfig.priceSize || 'text-base md:text-lg';

            let htmlFull = '';
            paginatedProducts.forEach((prod) => {
                let activePrice = prod.price;
                let isWholesaleActive = window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price;
                if (isWholesaleActive) activePrice = prod.wholesalePrice;

                let priceFormatted = `RD$ ${activePrice.toLocaleString('en-US')}`;
                if (isWholesaleActive) {
                    priceFormatted = `<div class="flex flex-col items-center"><span class="line-through text-gray-400 text-xs md:text-sm leading-none mb-1">RD$ ${prod.price.toLocaleString('en-US')}</span><span class="text-green-600 font-extrabold text-lg md:text-xl leading-none">RD$ ${activePrice.toLocaleString('en-US')}</span></div>`;
                }

                const brandLabel = prod.brand ? `${prod.brand} • ` : '';
                const skuLabel = prod.barcode ? `<span class="bg-gray-100 text-gray-600 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-sm border border-gray-200">SKU: ${prod.barcode}</span>` : '';
                const isOutOfStock = !!prod.isAgotado || (typeof prod.stock === 'number' && prod.stock <= 0);
                const agotadoOverlay = isOutOfStock ? `<div class="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-xl"><span class="bg-red-600 text-white font-black text-xl px-4 py-2 rounded-xl transform -rotate-12 shadow-lg tracking-widest">AGOTADO</span></div>` : '';
                const offerBadge = (prod.onSale && !isOutOfStock) ? `<div class="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full z-10 shadow-md animate-pulse tracking-wide">OFERTA</div>` : '';
                const showStockBadge = !isOutOfStock && (typeof prod.stock === 'number' && prod.stock > 0);

                const btnHtml = isOutOfStock 
                    ? `<button disabled class="w-full bg-gray-200 text-gray-400 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-bold cursor-not-allowed uppercase tracking-wider">Agotado</button>`
                    : `<button onclick="addToCart('${window.safeStr(prod.id)}', '${window.safeStr(prod.name)}', ${activePrice}, '${window.safeStr(prod.img)}', 'full', '${window.safeStr(prod.barcode || '')}')" class="w-full bg-white border border-perfume-magenta text-perfume-magenta py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-bold hover:bg-perfume-magenta hover:text-white transition">Agregar al Carrito</button>`;

                const searchString = `${prod.name || ''} ${prod.category || ''} ${prod.brand || ''} ${prod.description || ''} ${prod.barcode || ''}`.toLowerCase();

                htmlFull += `
                <div class="product-card-item flex flex-col h-full bg-white p-3 md:p-5 ${cardRadius} ${cardBorder} ${cardShadow} hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 group relative overflow-hidden animate-fade-in" 
                     data-category="${prod.category || ''}" data-brand="${prod.brand || ''}" data-search="${searchString}">
                    ${offerBadge}
                    ${isWholesaleActive ? `<div class="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-black px-2 py-1 rounded-full z-10 shadow-md tracking-wider">MAYORISTA</div>` : (prod.decants && prod.decants.length > 0 ? '<div class="absolute top-2 right-2 bg-gray-200 text-gray-800 text-[9px] font-bold px-2 py-1 rounded-full z-10">Con Decants</div>' : '')}
                    <div class="relative overflow-hidden rounded-xl mb-4 bg-gray-50 flex items-center justify-center aspect-[4/5] cursor-pointer" onclick="openProductModal('${prod.id}')">
                        ${agotadoOverlay}
                        <img src="${prod.img}" loading="lazy" class="w-full h-full ${imgFit} p-2 md:p-4 transition duration-500 mix-blend-multiply group-hover:scale-105">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">
                            <span class="bg-white/95 text-perfume-magenta px-4 py-1.5 rounded-full text-[10px] md:text-xs font-bold shadow-lg tracking-wide">Ver detalles</span>
                        </div>
                    </div>
                    <div class="flex-1 cursor-pointer" onclick="openProductModal('${prod.id}')">
                        <div class="flex flex-wrap items-center gap-1 mb-1">
                            <span class="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider">${brandLabel}${prod.category}</span>
                            ${skuLabel}
                        </div>
                        <h4 class="text-sm md:text-lg font-bold text-perfume-dark mt-1 group-hover:text-perfume-magenta transition leading-tight">${prod.name}</h4>
                        <div class="flex justify-between items-center mt-2">
                            <div class="text-perfume-magenta font-bold ${priceSize} flex-shrink-0">${priceFormatted}</div>
                            ${showStockBadge ? `<span class="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-100 whitespace-nowrap">${prod.stock} disp.</span>` : ''}
                        </div>
                    </div>
                    <div class="mt-4 md:mt-5 border-t border-gray-100 pt-3 md:pt-4">
                        ${!isOutOfStock ? `
                        <div class="flex items-center justify-between bg-gray-50 rounded-lg p-1 mb-2 md:mb-3">
                            <button onclick="updateQty('${prod.id}', -1)" class="w-6 h-6 md:w-8 md:h-8 text-gray-500 hover:text-black font-bold text-lg md:text-xl rounded-md hover:bg-white">-</button>
                            <span id="qty-${prod.id}" class="font-bold text-gray-800 text-sm md:text-base">1</span>
                            <button onclick="updateQty('${prod.id}', 1)" class="w-6 h-6 md:w-8 md:h-8 text-gray-500 hover:text-black font-bold text-lg md:text-xl rounded-md hover:bg-white">+</button>
                        </div>` : ''}
                        ${btnHtml}
                    </div>
                </div>`;
            });
            grid.innerHTML = htmlFull;
            window.renderPagination(productsList.length);
        }

        // Genera una lista de páginas a mostrar, abreviando con "…" cuando hay demasiadas
        // (siempre muestra primera, última, la actual y un vecino a cada lado)
        window.getPaginationRange = function(current, total, delta = 1) {
            const range = [];
            for (let i = 1; i <= total; i++) {
                if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                    range.push(i);
                } else if (range[range.length - 1] !== '...') {
                    range.push('...');
                }
            }
            return range;
        }

        window.renderPagination = function(totalItems) {
            const container = document.getElementById('catalog-pagination');
            if (!container) return;

            const totalPages = Math.ceil(totalItems / window.itemsPerPage);
            if (totalItems === 0 || totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            let html = '';
            html += `<button onclick="window.setCatalogPage(${window.currentPage - 1})" class="shrink-0 flex items-center gap-1 px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-bold text-sm transition hover:border-perfume-magenta hover:text-perfume-magenta disabled:opacity-40 disabled:cursor-not-allowed" ${window.currentPage === 1 ? 'disabled' : ''}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
                Ant.
            </button>`;

            const pages = window.getPaginationRange(window.currentPage, totalPages);
            pages.forEach(page => {
                if (page === '...') {
                    html += `<span class="shrink-0 px-1 text-gray-300 select-none font-bold">···</span>`;
                } else {
                    html += `<button onclick="window.setCatalogPage(${page})" class="shrink-0 w-9 h-9 rounded-xl border-2 font-bold text-sm transition ${page === window.currentPage ? 'bg-perfume-magenta text-white border-perfume-magenta shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-perfume-magenta hover:text-perfume-magenta'}">${page}</button>`;
                }
            });

            html += `<button onclick="window.setCatalogPage(${window.currentPage + 1})" class="shrink-0 flex items-center gap-1 px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-bold text-sm transition hover:border-perfume-magenta hover:text-perfume-magenta disabled:opacity-40 disabled:cursor-not-allowed" ${window.currentPage === totalPages ? 'disabled' : ''}>
                Sig.
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>`;
            container.innerHTML = html;
        }

        window.setCatalogPage = function(page) {
            const totalItems = window.filteredCatalogProducts.length || window.catalogProducts.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / window.itemsPerPage));
            const newPage = Math.min(Math.max(1, page), totalPages);
            if (newPage === window.currentPage) return;
            window.currentPage = newPage;
            window.renderCatalog(window.filteredCatalogProducts.length ? window.filteredCatalogProducts : window.catalogProducts);
            const catalogSection = document.getElementById('catalogo');
            if (catalogSection) {
                window.scrollTo({ top: catalogSection.offsetTop - 120, behavior: 'smooth' });
            }
        }

        window.filterCatalog = function() {
            const searchTerm = (document.getElementById('catalog-search').value || '').toLowerCase();
            const category = window.currentCategoryFilter;
            const brand = window.currentBrandFilter;

            window.currentPage = 1;
            window.filteredCatalogProducts = window.catalogProducts.filter(p => {
                const matchCat = category === 'Todos' || p.category === category;
                const matchBrand = brand === 'Todas' || p.brand === brand;
                const searchString = `${p.name || ''} ${p.category || ''} ${p.brand || ''} ${p.description || ''} ${p.barcode || ''}`.toLowerCase();
                const matchSearch = !searchTerm || searchString.includes(searchTerm);
                return matchCat && matchBrand && matchSearch;
            });

            window.renderCatalog(window.filteredCatalogProducts);

            const emptyMsg = document.getElementById('catalog-empty-msg');
            if (emptyMsg) {
                if (window.filteredCatalogProducts.length === 0) emptyMsg.classList.remove('hidden');
                else emptyMsg.classList.add('hidden');
            }

            const suggestionsBox = document.getElementById('search-suggestions');
            if (searchTerm.length > 1) {
                const matches = window.catalogProducts.filter(p => 
                    p.name.toLowerCase().includes(searchTerm) || 
                    (p.brand && p.brand.toLowerCase().includes(searchTerm)) ||
                    (p.category && p.category.toLowerCase().includes(searchTerm)) ||
                    (p.barcode && p.barcode.toLowerCase().includes(searchTerm))
                ).slice(0, 5);

                if (matches.length > 0) {
                    let suggestionsHTML = '<div class="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 rounded-t-xl">Resultados rápidos</div>';
                    matches.forEach(m => {
                        suggestionsHTML += `
                            <div onclick="openProductModal('${m.id}'); document.getElementById('search-suggestions').classList.add('hidden');" class="flex items-center gap-4 p-3 hover:bg-gray-50 cursor-pointer transition">
                                <img src="${m.img}" class="w-10 h-10 object-contain rounded bg-white border border-gray-100 mix-blend-multiply shadow-sm">
                                <div class="flex-1">
                                    <p class="text-sm font-bold text-perfume-dark leading-tight">${m.name}</p>
                                    <p class="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">${m.brand ? m.brand + ' • ' : ''}${m.category}</p>
                                </div>
                                <div class="text-perfume-magenta font-bold text-sm whitespace-nowrap">RD$ ${m.price.toLocaleString('en-US')}</div>
                            </div>
                        `;
                    });
                    suggestionsBox.innerHTML = suggestionsHTML;
                    suggestionsBox.classList.remove('hidden');
                } else {
                    suggestionsBox.classList.add('hidden');
                }
            } else {
                suggestionsBox.classList.add('hidden');
            }
        }

        document.addEventListener('click', function(event) {
            const searchBox = document.getElementById('catalog-search');
            const suggestionsBox = document.getElementById('search-suggestions');
            if (searchBox && suggestionsBox && !searchBox.contains(event.target) && !suggestionsBox.contains(event.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });

        const catalogSearchInput = document.getElementById('catalog-search');
        const catalogClearBtn = document.getElementById('catalog-search-clear-btn');
        if (catalogSearchInput && catalogClearBtn) {
            catalogSearchInput.addEventListener('input', function() {
                if (this.value.length > 0) {
                    catalogClearBtn.classList.remove('hidden');
                } else {
                    catalogClearBtn.classList.add('hidden');
                }
            });

            catalogClearBtn.addEventListener('click', function() {
                catalogSearchInput.value = '';
                catalogClearBtn.classList.add('hidden');
                catalogSearchInput.focus();
                window.filterCatalog();
            });
        }

        // Caché del catálogo en localStorage para no releer TODOS los productos
        // de Firestore en cada carga de página. Se refresca sola cada CATALOG_CACHE_TTL_MS,
        // y cualquier cambio hecho desde el admin (agregar/editar/borrar/facturar/
        // movimiento de inventario) pide los datos frescos con forceRefresh=true.
        const CATALOG_CACHE_KEY = 'ffr_catalog_cache_v1';
        const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

        window.getCatalogCacheInfo = function() {
            try {
                const raw = localStorage.getItem(CATALOG_CACHE_KEY);
                if (!raw) return null;
                const cached = JSON.parse(raw);
                return { count: cached.products.length, ageMs: Date.now() - cached.timestamp };
            } catch (e) { return null; }
        };

        window.loadDynamicProducts = async function(forceRefresh = false) {
            const grid = document.getElementById('products-grid');
            try {
                let usedCache = false;

                if (!forceRefresh) {
                    try {
                        const raw = localStorage.getItem(CATALOG_CACHE_KEY);
                        if (raw) {
                            const cached = JSON.parse(raw);
                            if (cached && Array.isArray(cached.products) && (Date.now() - cached.timestamp) < CATALOG_CACHE_TTL_MS) {
                                window.catalogProducts = cached.products;
                                usedCache = true;
                            }
                        }
                    } catch (e) { /* caché corrupta o bloqueada, ignoramos y recargamos de Firestore */ }
                }

                if (!usedCache) {
                    const prodRef = collection(db, 'artifacts', appId, 'public', 'data', 'productos');
                    const snapshot = await getDocs(prodRef);
                    window.catalogProducts = [];
                    snapshot.forEach(doc => { window.catalogProducts.push({ id: doc.id, ...doc.data() }); });

                    try {
                        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ products: window.catalogProducts, timestamp: Date.now() }));
                    } catch (e) { /* localStorage lleno o bloqueado (modo incógnito), seguimos sin caché */ }
                }

                if(window.siteBrands.length === 0 && window.catalogProducts.length > 0) {
                    window.siteBrands = [...new Set(window.catalogProducts.map(p => p.brand).filter(b => b && b.trim() !== ''))].sort();
                    window.saveBrandsToDB(); window.renderBrandsAdminUI();
                }

                window.renderBrandsUI(); 
                window.filterCatalog();
                window.renderAdminProductsList();

                const urlParams = new URLSearchParams(window.location.search);
                const sharedId = urlParams.get('p');
                if(sharedId && !window.hasOpenedShared) {
                    window.hasOpenedShared = true;
                    setTimeout(() => window.openProductModal(sharedId), 500); 
                }

            } catch (error) { grid.innerHTML = '<p class="text-red-500 col-span-full text-center py-10">Error al cargar el catálogo.</p>'; }
        }

        window.loadSiteConfig();
        window.loadDynamicProducts();

        window.getDetailBaseName = function(name, brand, index = 0) {
            if (!name) return '';
            const words = name.trim().split(/\s+/);
            if (index < 0 || index >= words.length) return '';
            if (brand) {
                const brandWords = brand.trim().split(/\s+/);
                const namePrefix = words.slice(0, brandWords.length).map(w => w.toLowerCase()).join(' ');
                const brandPrefix = brandWords.map(w => w.toLowerCase()).join(' ');
                if (namePrefix === brandPrefix && words.length > brandWords.length) {
                    const fallbackIndex = brandWords.length + index;
                    return words[fallbackIndex] || '';
                }
            }
            return words[index] || '';
        };

        window.renderProductDetailSwatches = function(prod) {
            const swatchesContainer = document.getElementById('detail-swatches-container');
            const swatchesTitle = document.getElementById('detail-swatches-title');
            const swatchesList = document.getElementById('detail-swatches-list');
            const productBrand = (prod.brand || '').trim();
            const productName = (prod.name || '').trim();

            if (!productBrand || !productName) {
                swatchesTitle.classList.add('hidden');
                swatchesContainer.classList.add('hidden');
                swatchesList.innerHTML = '';
                return;
            }

            const sameBrandProducts = window.catalogProducts.filter(p => p.brand === productBrand);
            const words = productName.split(/\s+/).filter(Boolean);
            let familyWord = words[0] ? words[0].toLowerCase() : '';
            const brandLower = productBrand.toLowerCase();

            if (familyWord && brandLower.includes(familyWord) && words.length > 1) {
                familyWord = words[1].toLowerCase();
            }

            let related = familyWord
                ? sameBrandProducts.filter(p => p.name && p.name.toLowerCase().includes(familyWord))
                : [];

            let titleText = '';
            if (related.length <= 1) {
                related = sameBrandProducts;
                titleText = `Otros modelos de ${productBrand}`;
            } else {
                titleText = `Otras versiones de ${familyWord.charAt(0).toUpperCase() + familyWord.slice(1)}`;
            }

            if (related.length > 1) {
                swatchesTitle.innerText = titleText;
                swatchesTitle.classList.remove('hidden');
                swatchesContainer.classList.remove('hidden');
                swatchesList.innerHTML = related.map(r => {
                    const isActive = r.id === prod.id;
                    const activeClasses = isActive ? 'ring-2 ring-black ring-offset-1 border-transparent' : 'border border-gray-300 opacity-80';
                    return `<div class="w-9 h-9 sm:w-11 sm:h-11 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full border border-gray-300 shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer transform active:scale-90 transition-all duration-200 ${activeClasses}" title="${r.name}" onclick="openProductModal('${r.id}')"><img src="${r.img}" alt="${r.name}" class="w-full h-full object-cover"></div>`;
                }).join('');
                return;
            }

            swatchesTitle.classList.add('hidden');
            swatchesContainer.classList.add('hidden');
            swatchesList.innerHTML = '';
        };

        window.openProductModal = function(id) {
            const prod = window.catalogProducts.find(p => p.id === id);
            if(!prod) return;
            const brandLabel = prod.brand ? `${prod.brand} • ` : '';
            
            document.getElementById('detail-id').value = prod.id;
            document.getElementById('detail-img').src = prod.img;
            document.getElementById('detail-cat').innerText = brandLabel + prod.category;
            document.getElementById('detail-name').innerText = prod.name;
            document.getElementById('detail-desc').innerText = prod.description || "Una fragancia excepcional perfecta para cualquier ocasión.";
            
            const qtyDetailEl = document.getElementById('qty-detail');
            if (qtyDetailEl) qtyDetailEl.innerText = "1";

            const barcodeBadge = document.getElementById('detail-barcode-badge');
            if(prod.barcode) {
                document.getElementById('detail-barcode-text').innerText = "SKU: " + prod.barcode; barcodeBadge.classList.remove('hidden');
            } else { barcodeBadge.classList.add('hidden'); }

            window.renderProductDetailSwatches(prod);

            let activePrice = prod.price;
            let isWholesaleActive = window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price;
            if (isWholesaleActive) activePrice = prod.wholesalePrice;

            const selectVariant = document.getElementById('detail-variant');
            let variantHtml = `<option value="full" data-price="${activePrice}">Botella Completa - RD$ ${activePrice.toLocaleString('en-US')}</option>`;
            if(prod.decants && prod.decants.length > 0) { prod.decants.forEach((decant, idx) => { variantHtml += `<option value="decant_${idx}" data-price="${decant.price}">Decant ${decant.size} - RD$ ${decant.price.toLocaleString('en-US')}</option>`; }); }
            selectVariant.innerHTML = variantHtml; selectVariant.value = 'full'; window.updateDetailPrice(); 

            const actionsContainer = document.getElementById('detail-actions-container');
            const isOutOfStock = !!prod.isAgotado || (typeof prod.stock === 'number' && prod.stock <= 0);
            
            if(isOutOfStock) { actionsContainer.innerHTML = `<button disabled class="w-full bg-gray-300 text-gray-500 py-3 rounded-lg font-bold cursor-not-allowed uppercase tracking-widest shadow-inner">Agotado temporalmente</button>`; } 
            else {
                actionsContainer.innerHTML = `
                    <div class="flex items-center justify-between bg-gray-100 rounded-lg p-1 w-32"><button onclick="updateQty('detail', -1)" class="w-8 h-8 text-gray-600 hover:text-black font-bold text-xl rounded-md hover:bg-white transition">-</button><span id="qty-detail" class="font-bold text-gray-800">1</span><button onclick="updateQty('detail', 1)" class="w-8 h-8 text-gray-600 hover:text-black font-bold text-xl rounded-md hover:bg-white transition">+</button></div>
                    <button id="detail-add-to-cart-btn" class="flex-1 bg-perfume-magenta text-white py-3 rounded-lg font-bold hover:bg-perfume-dark transition-all duration-200 shadow-md">Agregar al Carrito</button>`;
                const detailAddToCartBtn = document.getElementById('detail-add-to-cart-btn');
                if (detailAddToCartBtn) {
                    detailAddToCartBtn.addEventListener('click', window.addDetailToCart);
                }
            }

            const modal = document.getElementById('product-details-modal'); const box = document.getElementById('product-details-box');
            document.body.classList.add('overflow-hidden');
            modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); box.classList.add('scale-100'); }, 10);
        }

        window.updateDetailPrice = function() {
            const select = document.getElementById('detail-variant');
            if(select && select.selectedIndex >= 0) {
                const isFullBottle = select.value === 'full';
                const basePrice = parseFloat(select.options[select.selectedIndex].getAttribute('data-price'));
                
                const id = document.getElementById('detail-id').value;
                const prod = window.catalogProducts.find(p => p.id === id);
                
                let isWholesaleActive = isFullBottle && window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price;

                const priceDisplay = document.getElementById('detail-price-display');
                if (isWholesaleActive) {
                    priceDisplay.innerHTML = `<div class="flex flex-col items-start"><span class="line-through text-gray-400 text-lg leading-none mb-1">RD$ ${prod.price.toLocaleString('en-US')}</span><div class="flex items-center"><span class="text-2xl font-extrabold text-green-600 leading-none">RD$ ${basePrice.toLocaleString('en-US')}</span> <span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold uppercase ml-2">VIP Mayorista</span></div></div>`;
                } else {
                    priceDisplay.innerHTML = `<span class="text-2xl font-bold text-perfume-magenta">RD$ ${basePrice.toLocaleString('en-US')}</span>`;
                }
            }
        }

        window.closeProductModal = function() {
            const modal = document.getElementById('product-details-modal'); const box = document.getElementById('product-details-box');
            modal.classList.add('opacity-0'); box.classList.remove('scale-100'); box.classList.add('scale-95'); setTimeout(() => { modal.classList.add('hidden'); }, 300);
            window.resetZoom(); 
            document.body.classList.remove('overflow-hidden');
            if(window.location.search.includes('?p=')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }

        window.shareCurrentProduct = async function() {
            const id = document.getElementById('detail-id').value;
            const prod = window.catalogProducts.find(p => p.id === id);
            if(!prod) return;

            const baseUrl = window.location.href.split('?')[0].split('#')[0];
            const shareUrl = baseUrl + '?p=' + prod.id;
            const shareTitle = `¡Mira este perfume en FamlyFragrancerd!`;
            
            let activePrice = prod.price;
            if (window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price) { activePrice = prod.wholesalePrice; }
            const shareText = `Descubre ${prod.name} por solo RD$ ${activePrice.toLocaleString('en-US')}. ✨\n\n`;

            if (navigator.share) {
                try {
                    await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
                } catch (error) { console.log('El usuario canceló el menú de compartir', error); }
            } else {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    window.showToast("📋 Enlace copiado. ¡Pégalo en WhatsApp!");
                } catch {
                    const t = document.createElement("textarea");
                    t.value = shareUrl; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
                    window.showToast("📋 Enlace copiado. ¡Pégalo en WhatsApp o donde quieras!");
                }
            }
        }

        window.handleZoom = function(e) {
            const container = document.getElementById('detail-img-container');
            const img = document.getElementById('detail-img');
            const rect = container.getBoundingClientRect();
            
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            
            img.style.transformOrigin = `${x}% ${y}%`;
            img.style.transform = 'scale(2.2)'; 
            img.classList.remove('p-4', 'md:p-8'); 
        }

        window.handleTouchZoom = function(e) {
            const container = document.getElementById('detail-img-container');
            const img = document.getElementById('detail-img');
            const rect = container.getBoundingClientRect();
            
            const touch = e.touches[0];
            const x = ((touch.clientX - rect.left) / rect.width) * 100;
            const y = ((touch.clientY - rect.top) / rect.height) * 100;
            
            const boundedX = Math.max(0, Math.min(100, x));
            const boundedY = Math.max(0, Math.min(100, y));

            img.style.transformOrigin = `${boundedX}% ${boundedY}%`;
            img.style.transform = 'scale(2.2)';
            img.classList.remove('p-4', 'md:p-8');
        }

        window.resetZoom = function() {
            const img = document.getElementById('detail-img');
            if(img) {
                img.style.transformOrigin = 'center center';
                img.style.transform = 'scale(1)';
                img.classList.add('p-4', 'md:p-8'); 
            }
        }

        window.addDetailToCart = function(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            const button = event?.currentTarget || document.getElementById('detail-add-to-cart-btn');
            const originalText = button ? button.innerText : 'Agregar al Carrito';

            const id = document.getElementById('detail-id').value; const prod = window.catalogProducts.find(p => p.id === id);
            const qtyStr = document.getElementById('qty-detail'); if(!qtyStr) return; const qty = parseInt(qtyStr.innerText);
            
            const select = document.getElementById('detail-variant'); const val = select.value;
            let price = prod.price; let name = prod.name; let variantId = 'full'; const barcode = prod.barcode || '';

            if(val === 'full' && window.isWholesaler && prod.wholesalePrice && prod.wholesalePrice < prod.price) {
                price = prod.wholesalePrice;
            }

            if(val.startsWith('decant_')) {
                const idx = parseInt(val.split('_')[1]); const decant = prod.decants[idx];
                price = decant.price; name = `${prod.name} (Decant ${decant.size})`; variantId = `decant_${decant.size}`;
            }

            const cartId = `${id}_${variantId}`; 
            const currentQtyInCart = window.cart.find(i=> i.cartId === cartId)?.qty || 0;
            if (typeof prod.stock === 'number' && (currentQtyInCart + qty) > prod.stock) { return window.showToast(`Solo quedan ${prod.stock} unidades en el inventario.`); }

            const ex = window.cart.find(i=> i.cartId === cartId); 
            if(ex) ex.qty += qty; else window.cart.push({ cartId: cartId, id: prod.id, name: name, price: price, qty: qty, img: prod.img, variant: variantId, barcode: barcode }); 
            
            const catQty = document.getElementById('qty-'+id); if(catQty) catQty.innerText = 1;

            if (button) {
                button.classList.add('scale-95', 'bg-green-600');
                button.innerText = '¡Agregado! ✓';
            }

            window.updateCartUI(); window.showToast("¡Agregado al carrito! 🛒");

            // Animación de vuelo desde la imagen del producto al carrito
            window.flyToCart(prod.img, button || document.getElementById('detail-img'));

            setTimeout(() => {
                if (button) {
                    button.classList.remove('scale-95', 'bg-green-600');
                    button.classList.add('bg-perfume-magenta');
                    button.innerText = originalText;
                }
            }, 800);
        }

