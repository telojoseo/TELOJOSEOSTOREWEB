// ============================================================
// admin-products.js — Panel admin: alta/edición/borrado de productos, decants, subida a GitHub
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';
import { addDoc, collection, deleteDoc, doc, getDoc, updateDoc } from './firebase-config.js';

        window.renderAdminDecants = function() {
            const container = document.getElementById('admin-decants-list');
            if(window.currentDecants.length === 0) { container.innerHTML = '<p class="text-[10px] text-gray-400 italic">No hay decants para este perfume.</p>'; return; }
            let html = '';
            window.currentDecants.forEach((dec, idx) => {
                html += `<div class="flex gap-2 items-center bg-gray-50 p-1.5 rounded border border-gray-200"><input type="text" placeholder="Tamaño (Ej: 5ml)" value="${dec.size}" onchange="updateDecantVal(${idx}, 'size', this.value)" class="w-1/2 border border-gray-300 px-2 py-1 rounded text-xs focus:outline-none"><input type="number" placeholder="Precio" value="${dec.price}" onchange="updateDecantVal(${idx}, 'price', this.value)" class="w-1/3 border border-gray-300 px-2 py-1 rounded text-xs focus:outline-none"><button type="button" onclick="removeDecantField(${idx})" class="text-red-400 font-bold px-2 hover:text-red-600 text-xs">&times;</button></div>`;
            });
            container.innerHTML = html;
        }

        window.addDecantField = function() { window.currentDecants.push({ size: '', price: '' }); window.renderAdminDecants(); }
        window.removeDecantField = function(idx) { window.currentDecants.splice(idx, 1); window.renderAdminDecants(); }
        window.updateDecantVal = function(idx, field, val) { if(field === 'price') window.currentDecants[idx][field] = parseFloat(val) || 0; else window.currentDecants[idx][field] = val; }

        window.switchAdminTab = function(tab) {
            const tabs = ['products', 'categories', 'clients', 'settings'];
            tabs.forEach(t => {
                const el = document.getElementById('admin-tab-'+t); const btn = document.getElementById('tab-btn-'+t);
                if(el) el.classList.add('hidden');
                if(btn) { btn.classList.replace('text-perfume-magenta', 'text-gray-500'); btn.classList.remove('border-b-2', 'border-perfume-magenta'); }
            });
            document.getElementById('admin-tab-'+tab).classList.remove('hidden'); document.getElementById('tab-btn-'+tab).classList.replace('text-gray-500', 'text-perfume-magenta'); document.getElementById('tab-btn-'+tab).classList.add('border-b-2', 'border-perfume-magenta');
            
            if(tab === 'clients') window.extractClientsFromOrders();
        }

        window.toggleInvInput = function() {
            const isChecked = document.getElementById('admin-prod-use-inv').checked; const input = document.getElementById('admin-prod-stock');
            if(isChecked) { input.classList.remove('hidden'); input.setAttribute('required', 'true'); } else { input.classList.add('hidden'); input.removeAttribute('required'); }
        }

        window.resetAdminForm = function() {
            document.getElementById('admin-add-form').reset(); document.getElementById('admin-prod-id').value = ''; document.getElementById('admin-prod-barcode').value = ''; document.getElementById('admin-prod-cost').value = '';
            document.getElementById('admin-form-title').innerText = "➕ Agregar Perfume"; document.getElementById('admin-submit-btn').innerText = "Guardar Producto"; document.getElementById('admin-cancel-edit').classList.add('hidden');
            window.currentDecants = []; window.renderAdminDecants();
            if(document.getElementById('admin-prod-use-inv')) { document.getElementById('admin-prod-use-inv').checked = false; window.toggleInvInput(); }
        }

        window.editProduct = function(id) {
            const prod = window.catalogProducts.find(p => p.id === id); if(!prod) return;
            document.getElementById('admin-prod-id').value = prod.id; document.getElementById('admin-prod-name').value = prod.name;
            const brandVal = prod.brand || '';
            if (brandVal && !window.siteBrands.includes(brandVal)) { window.siteBrands.push(brandVal); window.siteBrands.sort(); window.renderBrandsAdminUI(); window.saveBrandsToDB(); }
            document.getElementById('admin-prod-brand').value = brandVal; document.getElementById('admin-prod-barcode').value = prod.barcode || '';
            document.getElementById('admin-prod-cat').value = prod.category; 
            document.getElementById('admin-prod-price').value = prod.price; document.getElementById('admin-prod-cost').value = prod.cost || '';
            document.getElementById('admin-prod-wholesale').value = prod.wholesalePrice || ''; 
            document.getElementById('admin-prod-desc').value = prod.description || ''; document.getElementById('admin-prod-img').value = prod.img;
            
            const useInvCheckbox = document.getElementById('admin-prod-use-inv'); const stockInput = document.getElementById('admin-prod-stock');
            if (typeof prod.stock === 'number') { useInvCheckbox.checked = true; stockInput.value = prod.stock; } else { useInvCheckbox.checked = false; stockInput.value = ''; }
            window.toggleInvInput();
            document.getElementById('admin-prod-sale').checked = !!prod.onSale; document.getElementById('admin-prod-agotado').checked = !!prod.isAgotado;
            window.currentDecants = prod.decants ? [...prod.decants] : []; window.renderAdminDecants();

            document.getElementById('admin-form-title').innerText = "✏️ Editar Perfume"; document.getElementById('admin-submit-btn').innerText = "Actualizar Cambios";
            document.getElementById('admin-cancel-edit').classList.remove('hidden'); document.getElementById('admin-box').scrollTo({top: 0, behavior: 'smooth'}); document.getElementById('admin-tab-products').scrollTo({top: 0, behavior: 'smooth'});
        }

        window.uploadToGitHub = async function(e) {
            const file = e.target.files[0]; if(!file) return;
            const configRef = doc(db, 'artifacts', appId, 'public', 'config'); const snap = await getDoc(configRef); const data = snap.exists() ? snap.data() : {};
            const repo = data.ghRepo || 'famlyfragrancerd-byte/famlyfragrancerd-web'; const token = data.ghToken;
            if(!token) { window.showToast("⚠️ Falta el Token de GitHub. Búscalo en 'Configurar Tienda'."); e.target.value = ''; return; }

            const btnText = document.getElementById('upload-img-text'); btnText.innerText = "Subiendo... ⏳";
            try {
                const reader = new FileReader(); reader.readAsDataURL(file);
                reader.onload = async function() {
                    const base64Content = reader.result.split(',')[1]; const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_'); const fileName = `img_productos/${Date.now()}_${safeName}`;
                    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${fileName}`, { method: 'PUT', headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Subida de imagen: ${file.name}`, content: base64Content }) });
                    if(!response.ok) throw new Error("Error en GitHub");
                    const ownerRepo = repo.split('/'); const rawUrl = `https://raw.githubusercontent.com/${ownerRepo[0]}/${ownerRepo[1]}/main/${fileName}`;
                    document.getElementById('admin-prod-img').value = rawUrl; window.showToast("✅ Imagen subida a GitHub.");
                };
            } catch(err) { window.showToast("❌ Hubo un error al subir la imagen."); } finally { btnText.innerText = "Subir 📁"; e.target.value = ''; }
        }

        window.addDynamicProduct = async function(e) {
            e.preventDefault();
            const btn = document.getElementById('admin-submit-btn'); const originalText = btn.innerText; btn.innerHTML = "Guardando..."; btn.disabled = true;

            const editId = document.getElementById('admin-prod-id').value; const name = document.getElementById('admin-prod-name').value;
            const brand = document.getElementById('admin-prod-brand').value.trim(); const barcode = document.getElementById('admin-prod-barcode').value.trim();
            const category = document.getElementById('admin-prod-cat').value; 
            const price = parseFloat(document.getElementById('admin-prod-price').value);
            const cost = parseFloat(document.getElementById('admin-prod-cost').value) || null;
            const wholesalePrice = parseFloat(document.getElementById('admin-prod-wholesale').value) || null; 
            const description = document.getElementById('admin-prod-desc').value; const imgUrl = document.getElementById('admin-prod-img').value;
            const useInv = document.getElementById('admin-prod-use-inv').checked; const stock = useInv ? (parseInt(document.getElementById('admin-prod-stock').value) || 0) : null;
            const onSale = document.getElementById('admin-prod-sale').checked; const isAgotado = document.getElementById('admin-prod-agotado').checked;
            const validDecants = window.currentDecants.filter(d => d.size.trim() !== '' && d.price > 0);

            try {
                if(!imgUrl) throw new Error("Debes proporcionar una URL de imagen.");
                const dataObj = { name, brand, barcode, category, price, cost, wholesalePrice, stock, onSale, isAgotado, description, img: imgUrl, decants: validDecants };

                if(editId) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'productos', editId), dataObj); window.showToast("Producto actualizado exitosamente."); } 
                else { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'productos'), dataObj); window.showToast("Producto agregado correctamente."); }
                
                window.resetAdminForm(); await window.loadDynamicProducts(true);
            } catch (error) { window.showToast(error.message || "Error al guardar el producto."); } finally { btn.innerHTML = originalText; btn.disabled = false; }
        }

        window.deleteDynamicProduct = function(docId) {
            window.openCustomConfirm("Eliminar Perfume", "¿Seguro que deseas eliminar este perfume del catálogo permanentemente?", async () => {
                    try { 
                        const prod = window.catalogProducts.find(p => p.id === docId);
                        if(prod && prod.img && prod.img.includes('githubusercontent')) {
                            const configRef = doc(db, 'artifacts', appId, 'public', 'config'); const snap = await getDoc(configRef); const data = snap.exists() ? snap.data() : {};
                            if(data.ghToken && data.ghRepo) {
                                try {
                                    const pathParts = prod.img.split('/main/');
                                    if(pathParts.length === 2) {
                                        const filePath = pathParts[1];
                                        const res = await fetch(`https://api.github.com/repos/${data.ghRepo}/contents/${filePath}`, { headers: { 'Authorization': `token ${data.ghToken}` }});
                                        if(res.ok) {
                                            const fileData = await res.json();
                                            await fetch(`https://api.github.com/repos/${data.ghRepo}/contents/${filePath}`, { method: 'DELETE', headers: { 'Authorization': `token ${data.ghToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: "Eliminar imagen huérfana", sha: fileData.sha }) });
                                        }
                                    }
                                } catch(e) { console.log("No se pudo borrar imagen de GH", e); }
                            }
                        }
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'productos', docId)); window.showToast("✅ Producto eliminado."); await window.loadDynamicProducts(true); 
                    } catch(e) { window.showToast("❌ Error al eliminar el producto."); }
                }
            );
        }

        window.filterAdminProducts = function() { const term = document.getElementById('admin-search').value.toLowerCase(); window.renderAdminProductsList(term); }

        window.renderAdminProductsList = function(filterTerm = "") {
            const listDiv = document.getElementById('admin-products-list'); listDiv.innerHTML = '';
            let filtered = window.catalogProducts;
            if(filterTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(filterTerm) || p.category.toLowerCase().includes(filterTerm) || (p.barcode && p.barcode.toLowerCase().includes(filterTerm)));
            if(filtered.length === 0) return listDiv.innerHTML = '<p class="text-sm text-gray-500 py-2">No se encontraron productos.</p>';

            filtered.forEach(prod => {
                const brandLabel = prod.brand ? `${prod.brand} • ` : '';
                const decantBadge = prod.decants && prod.decants.length > 0 ? '<span class="bg-gray-200 text-gray-800 text-[9px] px-1.5 py-0.5 rounded font-bold ml-1">D</span>' : '';
                const wholesaleBadge = prod.wholesalePrice ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] px-1.5 py-0.5 rounded font-bold ml-1 border border-yellow-200">Mayor: $${prod.wholesalePrice.toLocaleString()}</span>` : '';
                
                let stockStatus = '';
                if (prod.isAgotado || (typeof prod.stock === 'number' && prod.stock <= 0)) { stockStatus = `<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-red-200 tracking-wider">AGOTADO</span>`; } else if (typeof prod.stock === 'number') { stockStatus = `<span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-green-200 tracking-wider">Stock: ${prod.stock}</span>`; } else { stockStatus = `<span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-blue-200 tracking-wider">Stock: Infinito</span>`; }
                const saleBadge = prod.onSale ? `<span class="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-yellow-200 ml-1 tracking-wider">OFERTA</span>` : '';

                listDiv.innerHTML += `
                <div class="flex items-center justify-between bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-perfume-magenta hover:shadow-md transition">
                    <div class="flex items-center gap-3"><img src="${prod.img}" class="w-10 h-10 object-cover rounded bg-gray-100 mix-blend-multiply"><div><p class="font-bold text-sm text-perfume-dark">${prod.name} ${decantBadge} ${wholesaleBadge}</p><p class="text-xs text-gray-500">${brandLabel}${prod.category} • RD$ ${prod.price.toLocaleString('en-US')}</p><div class="flex mt-1 items-center">${stockStatus} ${saleBadge}</div>${prod.barcode ? `<p class="text-[9px] text-gray-400 font-mono mt-0.5">ID: ${prod.barcode}</p>` : ''}</div></div>
                    <div class="flex gap-2"><button onclick="editProduct('${prod.id}')" class="text-gray-500 hover:text-perfume-magenta p-1 text-lg transition" title="Editar">⚙️</button><button onclick="deleteDynamicProduct('${prod.id}')" class="text-red-400 hover:text-red-600 p-1 text-lg transition" title="Eliminar">🗑️</button></div>
                </div>`;
            });
        }

