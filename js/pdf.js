// ============================================================
// pdf.js — Generación de PDFs: facturas y catálogo
// ============================================================
import { auth, db, appId, messaging } from './firebase-config.js';

        window.generateInvoicePDF = async function(orderId) {
            // Buscamos el pedido en la lista de Admin o en la lista del Cliente
            let order = window.adminOrders.find(o => o.id === orderId);
            if (!order && window.userOrdersList) {
                order = window.userOrdersList.find(o => o.id === orderId);
            }
            if(!order) return window.showToast("❌ Pedido no encontrado.");

            window.showToast("Generando PDF... ⏳");

            const { jsPDF } = window.jspdf;
            // ACTIVAR COMPRESIÓN DEL DOCUMENTO PDF
            const doc = new jsPDF({ compress: true });

            const storeName = window.siteConfig?.invBusinessName?.trim() || "FamlyFragrancerd";
            const storeTaxId = window.siteConfig?.invTaxId?.trim() || "";
            const storeAddress = window.siteConfig?.invAddress?.trim() || "";
            const showLogo = window.siteConfig?.invShowLogo !== false;
            
            let rawPhone = window.siteConfig?.fPhone || "";
            let storePhone = rawPhone.replace(/[^\x20-\x7E\xC0-\xFF]/g, '').trim();
            if (storePhone.length < 5) storePhone = "+1 (849) 516-1973";

            let rawEmail = window.siteConfig?.fEmail || "";
            let storeEmail = rawEmail;
            
            if (rawEmail.includes('ꜰᴀᴍʟʏ') || rawEmail.includes('ʜᴏᴛᴍᴀɪʟ') || rawEmail.includes('ᴄᴏᴍ')) {
                storeEmail = "famlyfragrancerd@hotmail.com";
            } else {
                storeEmail = rawEmail.replace(/[^\x20-\x7E\xC0-\xFF]/g, '').trim();
            }

            if (storeEmail.length < 5 || storeEmail === '@') storeEmail = "famlyfragrancerd@hotmail.com";

            const primaryColorHex = window.siteConfig?.colorPrimary || '#000000';
            
            doc.setFillColor(primaryColorHex);
            doc.rect(0, 0, 210, 8, 'F'); 

            try {
                if (showLogo) {
                    if (!window.cachedPdfLogo) {
                        window.cachedPdfLogo = await window.getLogoBase64();
                    }
                    if (window.cachedPdfLogo) {
                        doc.addImage(window.cachedPdfLogo, 'PNG', 14, 12, 28, 28, 'logoTienda', 'FAST');
                    }
                }
            } catch(e) { console.log("Logo PDF no cargado"); }

            doc.setFontSize(20);
            doc.setTextColor(primaryColorHex);
            doc.setFont("helvetica", "bold");
            doc.text(storeName, 46, 22);
            
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            doc.setFont("helvetica", "normal");
            doc.text(`Tel. Tienda: ${storePhone}`, 46, 29);
            doc.text(`Email Tienda: ${storeEmail}`, 46, 34);
            let extraLineY = 39;
            if (storeAddress) { doc.text(storeAddress, 46, extraLineY); extraLineY += 5; }
            if (storeTaxId) { doc.text(`RNC/Cédula: ${storeTaxId}`, 46, extraLineY); }

            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text("RECIBO DE VENTA", 196, 22, { align: "right" });
            
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.setFont("helvetica", "normal");
            const dateStr = new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
            doc.text(`Orden: ${order.orderId}`, 196, 30, { align: "right" });
            doc.text(`Fecha: ${dateStr}`, 196, 35, { align: "right" });
            
            doc.setFont("helvetica", "bold");
            let statusColor = [100, 100, 100];
            if(order.status === 'Completado') statusColor = [0, 150, 0];
            if(order.status === 'Cancelado' || order.status === 'Eliminado') statusColor = [200, 0, 0];
            if(order.status === 'Procesando') statusColor = [0, 100, 200];
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
            const displayStatus = window.statusDisplayNames[order.status] || order.status;
            doc.text(`Estado: ${displayStatus.toUpperCase()}`, 196, 40, { align: "right" });

            doc.setDrawColor(220, 220, 220);
            doc.line(14, 46, 196, 46);

            doc.setFillColor(250, 250, 250);
            doc.rect(14, 50, 182, 22, 'F');
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text("Facturado a (Cliente):", 18, 56);
            
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.setFont("helvetica", "normal");
            
            // USO DE FUNCIONES LIMPIAS GLOBALES
            const cleanName = window.cleanText(order.customerName) || 'Cliente'; 
            let cleanPhone = window.cleanText(order.customerPhone);
            if(cleanPhone.length < 3) cleanPhone = 'N/A';
            let cleanEmail = window.cleanText(order.customerEmail);
            if(cleanEmail.length < 4 || cleanEmail === '@') cleanEmail = 'Sin correo registrado';

            doc.text(`Nombre: ${cleanName}`, 18, 62);
            doc.text(`WhatsApp: ${cleanPhone}`, 18, 67);
            doc.text(`Email: ${cleanEmail}`, 100, 62);
            if (order.paymentMethod) {
                const payLabel = order.paymentMethod === 'Transferencia' && order.paymentEntity ? `Transferencia (${window.cleanText(order.paymentEntity)})` : order.paymentMethod;
                doc.text(`Pago: ${payLabel}`, 100, 67);
            }

            const tableColumn = ["Cant", "Descripción", "SKU", "P. Unitario", "Subtotal"];
            const tableRows = [];
            let subtotalCalc = 0;

            order.items.forEach(item => {
                const itemSub = item.price * item.qty;
                subtotalCalc += itemSub;
                const cleanItemName = window.cleanText(item.name);
                tableRows.push([
                    item.qty,
                    cleanItemName,
                    item.barcode || '-',
                    window.formatMoney(item.price),
                    window.formatMoney(itemSub)
                ]);
            });

            doc.autoTable({
                startY: 78,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: primaryColorHex, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
                styles: { fontSize: 9, cellPadding: 5, textColor: [40, 40, 40] },
                alternateRowStyles: { fillColor: [250, 250, 250] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 15 },
                    2: { cellWidth: 30, halign: 'center' },
                    3: { halign: 'right', cellWidth: 30 },
                    4: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
                }
            });

            const finalY = doc.lastAutoTable.finalY + 10;
            
            let shippingFee = order.shippingFee !== undefined ? order.shippingFee : (order.total > subtotalCalc ? order.total - subtotalCalc : 0);
            let discount = order.discount !== undefined ? order.discount : (order.total < subtotalCalc ? subtotalCalc - order.total : 0);
            let calculatedTotal = subtotalCalc + shippingFee - discount;

            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            doc.setFont("helvetica", "normal");
            doc.text(`Subtotal:`, 140, finalY);
            doc.text(`RD$ ${subtotalCalc.toLocaleString('en-US')}`, 196, finalY, { align: "right" });
            
            let nextY = finalY + 6;
            if (discount > 0) {
                doc.setTextColor(0, 150, 0); 
                doc.text(`Descuento:`, 140, nextY);
                doc.text(`-RD$ ${discount.toLocaleString('en-US')}`, 196, nextY, { align: "right" });
                nextY += 6;
            }
            if (shippingFee > 0) {
                doc.setTextColor(0, 0, 255); 
                doc.text(`Cargo / Envío:`, 140, nextY);
                doc.text(`+RD$ ${shippingFee.toLocaleString('en-US')}`, 196, nextY, { align: "right" });
                nextY += 6;
            }

            doc.setDrawColor(200, 200, 200);
            doc.line(140, nextY - 2, 196, nextY - 2);

            doc.setFontSize(14);
            doc.setTextColor(primaryColorHex);
            doc.setFont("helvetica", "bold");
            doc.text(`TOTAL:`, 140, nextY + 5);
            doc.text(`RD$ ${calculatedTotal.toLocaleString('en-US')}`, 196, nextY + 5, { align: "right" });

            const pageHeight = doc.internal.pageSize.height;
            doc.setFillColor(primaryColorHex);
            doc.rect(0, pageHeight - 15, 210, 15, 'F');
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(255, 255, 255);
            doc.text("¡Gracias por su compra en FamlyFragrancerd!", 105, pageHeight - 6, { align: "center" });

            const fileName = `Recibo_Famly_${order.orderId.replace('#', '')}.pdf`;
            
            // Lógica para devolver el archivo como objeto si se solicita (Opción A)
            if (arguments.length > 1 && arguments[1] === true) {
                const pdfBlob = doc.output('blob');
                return new File([pdfBlob], fileName, { type: 'application/pdf' });
            }

            doc.save(fileName);
            window.showToast("✅ PDF generado y descargado.");
        }

        // ── IMPRESIÓN TÉRMICA (80mm) — MÉTODO POR DEFECTO, SIN INSTALAR NADA ──
        // Genera un PDF angosto (80mm de ancho) y lo abre en una pestaña nueva
        // con autoPrint(), lo que dispara el diálogo de impresión del navegador
        // automáticamente. El usuario solo tiene que elegir la impresora térmica
        // y confirmar. No requiere instalar ningún programa ni driver especial.
        //
        // (Existe también printThermalReceiptDirect en printer.js, que imprime
        // SIN diálogo usando QZ Tray — pero eso es 100% opcional/avanzado. Si no
        // se configuró una impresora ahí, automáticamente se usa este método).
        //
        // IMPORTANTE: esta función SOLO debe llamarse después de confirmar que
        // la venta/pago se registró con éxito (ver generateManualInvoice en
        // billing.js — la llamada va dentro del try, después de los await que
        // pueden fallar, nunca en el catch).
        // Carga el logo de forma robusta, evitando problemas de CORS
        // Intenta en cascada: invLogoUrl → logoUrl → logo por defecto
        window.getLogoBase64 = async function() {
            if (window.cachedPdfLogo) return window.cachedPdfLogo;
            const cfg = window.siteConfig || {};
            const candidates = [
                cfg.invLogoUrl,
                cfg.logoUrl,
                "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png"
            ].filter(Boolean);

            for (const rawUrl of candidates) {
                try {
                    const url = encodeURI(rawUrl.trim());
                    const response = await fetch(url, { mode: 'cors' });
                    if (!response.ok) continue;
                    const blob = await response.blob();
                    
                    return await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            window.cachedPdfLogo = reader.result;
                            resolve(reader.result);
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.log("Logo no cargado desde:", rawUrl);
                }
            }
            return null;
        };

        // Carga el logo de forma robusta, evitando problemas de CORS
        // Intenta en cascada: invLogoUrl → logoUrl → logo por defecto
        window.getLogoBase64 = async function() {
            if (window.cachedPdfLogo) return window.cachedPdfLogo;
            const cfg = window.siteConfig || {};
            const candidates = [
                cfg.invLogoUrl,
                cfg.logoUrl,
                "https://raw.githubusercontent.com/famlyfragrancerd-byte/famlyfragrancerd-web/54362eb6b882b258af2a8d6f066984c090a95436/logo%20png%20famly.png"
            ].filter(Boolean);

            for (const rawUrl of candidates) {
                try {
                    const url = encodeURI(rawUrl.trim());
                    const response = await fetch(url, { mode: 'cors' });
                    if (!response.ok) continue;
                    const blob = await response.blob();
                    
                    return await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            window.cachedPdfLogo = reader.result;
                            resolve(reader.result);
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.log("Logo no cargado desde:", rawUrl);
                }
            }
            return null;
        };

        window.printThermalReceipt = async function(order) {
            const { jsPDF } = window.jspdf;
            const cfg = window.siteConfig || {};

            const RECEIPT_WIDTH_MM = 80;   // Cambia a 58 si tu impresora es de 58mm
            const MARGIN_MM = 4;
            const LINE_H = 4.2;

            const storeName = cfg.invBusinessName?.trim() || "FamlyFragrancerd";
            const tagline = cfg.invTagline?.trim() || "";
            const storeTaxId = cfg.invTaxId?.trim() || "";
            const storeAddress = cfg.invAddress?.trim() || "";
            const whatsapp = cfg.invWhatsapp?.trim() || "";
            const instagram = cfg.invInstagram?.trim() || "";
            const tiktok = cfg.invTiktok?.trim() || "";
            const footerMsg = cfg.invFooterMsg?.trim() || "¡Gracias por su compra!";
            const footerExtraLines = (cfg.invFooterExtra || "").split('\n').map(l => l.trim()).filter(Boolean);
            const showLogo = cfg.invShowLogo !== false;
            const showUnitPrice = cfg.invShowUnitPrice === true;
            const printClientName = cfg.invPrintClientName !== false;
            const printClientPhone = cfg.invPrintClientPhone === true;
            const printClientTaxId = cfg.invPrintClientTaxId === true;
            const printClientAddress = cfg.invPrintClientAddress === true;
            const fontFam = cfg.invFontFamily || 'helvetica';
            const bodyWeight = 'bold';  // SIEMPRE negrita
            const blockGap = { compact: 0, normal: 2, wide: 5 }[cfg.invLineSpacing || 'normal']; // mm extra entre bloques
            
            // Multiplicador de tamaño de fuente: 16 es el tamaño base "normal"
            const fontSizeBase = cfg.invFontSize || 16;
            const fontSizeMultiplier = fontSizeBase / 16;
            const setSize = (size) => Math.round(size * fontSizeMultiplier * 10) / 10; // redondear a 1 decimal

            // Intentamos tener el logo listo ANTES de dibujar
            if (showLogo) {
                try {
                    window.cachedPdfLogo = await window.getLogoBase64();
                } catch (e) { console.log("Error cargando logo para recibo"); }
            }
            const hasLogo = showLogo && !!window.cachedPdfLogo;

            // Alto dinámico según logo, líneas extra y cantidad de productos
            const headerExtraLines = [tagline, storeAddress, storeTaxId, whatsapp, instagram, tiktok].filter(Boolean).length;
            const clientExtraLines = [printClientTaxId && order.customerTaxId, printClientPhone && order.customerPhone, printClientAddress && order.customerAddress].filter(Boolean).length;
            const unitPriceLines = showUnitPrice ? order.items.length : 0;
            const estimatedHeight = (hasLogo ? 22 : 0) + 40 + (headerExtraLines * 4) + (clientExtraLines * 4) + ((order.items.length + unitPriceLines) * LINE_H) + (footerExtraLines.length * 4) + 30 + (blockGap * 4);

            const doc = new jsPDF({
                unit: 'mm',
                format: [RECEIPT_WIDTH_MM, estimatedHeight]
            });

            const centerX = RECEIPT_WIDTH_MM / 2;
            let y = 8;

            if (hasLogo) {
                const logoW = 22;
                try { doc.addImage(window.cachedPdfLogo, 'PNG', centerX - (logoW / 2), y, logoW, logoW, 'logoRecibo', 'FAST'); } catch (e) {}
                y += logoW + 3;
            }

            doc.setFont(fontFam, 'bold'); doc.setFontSize(setSize(14));
            doc.text(storeName, centerX, y, { align: "center" }); y += 5;

            doc.setFont(fontFam, 'italic'); doc.setFontSize(setSize(10));
            if (tagline) { doc.text(tagline, centerX, y, { align: "center" }); y += 4; }

            doc.setFont(fontFam, bodyWeight); doc.setFontSize(setSize(11));
            if (storeAddress) { doc.text(storeAddress, centerX, y, { align: "center" }); y += 4; }
            if (storeTaxId) { doc.text(`RNC/Cédula: ${storeTaxId}`, centerX, y, { align: "center" }); y += 4; }
            if (whatsapp) { doc.text(`WhatsApp: ${whatsapp}`, centerX, y, { align: "center" }); y += 4; }
            if (instagram) { doc.text(`Instagram: ${instagram}`, centerX, y, { align: "center" }); y += 4; }
            if (tiktok) { doc.text(`Tiktok: ${tiktok}`, centerX, y, { align: "center" }); y += 4; }
            y += blockGap;

            doc.setFontSize(setSize(11));
            doc.text(new Date(order.date || Date.now()).toLocaleString('es-DO'), centerX, y, { align: "center" }); y += 4;
            doc.text(`Ticket: ${order.orderId || order.id || ''}`, centerX, y, { align: "center" }); y += 4;
            if (printClientName) { doc.text(`Cliente: ${order.customerName || 'Mostrador'}`, MARGIN_MM, y); y += 5; }
            doc.setFontSize(setSize(10));
            if (printClientTaxId && order.customerTaxId) { doc.text(`RNC/Cédula cliente: ${order.customerTaxId}`, MARGIN_MM, y); y += 4; }
            if (printClientPhone && order.customerPhone) { doc.text(`Tel. cliente: ${order.customerPhone}`, MARGIN_MM, y); y += 4; }
            if (printClientAddress && order.customerAddress) { doc.text(`Dirección cliente: ${order.customerAddress}`, MARGIN_MM, y); y += 4; }
            doc.setFontSize(setSize(11));

            doc.setLineWidth(0.2);
            y += blockGap;
            doc.line(MARGIN_MM, y, RECEIPT_WIDTH_MM - MARGIN_MM, y); y += 4 + blockGap;

            doc.setFontSize(setSize(11));
            order.items.forEach(item => {
                const lineTotal = (item.price * item.qty).toLocaleString('en-US');
                doc.text(`${item.qty}x ${item.name}`, MARGIN_MM, y);
                doc.text(`RD$ ${lineTotal}`, RECEIPT_WIDTH_MM - MARGIN_MM, y, { align: "right" });
                y += LINE_H;
                if (showUnitPrice) {
                    doc.setFontSize(setSize(9)); doc.setTextColor(120);
                    doc.text(`P. unit: RD$ ${item.price.toLocaleString('en-US')}`, MARGIN_MM + 3, y);
                    doc.setFontSize(setSize(11)); doc.setTextColor(0);
                    y += LINE_H;
                }
            });

            y += blockGap;
            doc.line(MARGIN_MM, y, RECEIPT_WIDTH_MM - MARGIN_MM, y); y += 5;

            doc.setFont(fontFam, 'bold'); doc.setFontSize(setSize(10));
            doc.text("TOTAL:", MARGIN_MM, y);
            doc.text(`RD$ ${(order.total || 0).toLocaleString('en-US')}`, RECEIPT_WIDTH_MM - MARGIN_MM, y, { align: "right" });
            y += 6 + blockGap;

            doc.setFont(fontFam, bodyWeight); doc.setFontSize(setSize(11));
            doc.text(`Pago: ${(order.paymentMethod === 'Credito' ? 'Crédito' : order.paymentMethod) || 'Efectivo'}`, MARGIN_MM, y); y += 6;
            doc.text(footerMsg, centerX, y, { align: "center" }); y += 4;
            footerExtraLines.forEach(line => { doc.text(line, centerX, y, { align: "center" }); y += 4; });

            // Dispara el diálogo de impresión automáticamente al abrir el PDF
            doc.autoPrint();
            const blobUrl = doc.output('bloburl');
            window.open(blobUrl, '_blank');
        };

        window.getImageBase64FromUrl = async function(url) {
            if (!url) return null;
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (!response.ok) throw new Error('No image');
                const blob = await response.blob();

                const imageUrl = URL.createObjectURL(blob);
                const image = new Image();
                image.src = imageUrl;

                return await new Promise((resolve) => {
                    image.onload = () => {
                        try {
                            const maxWidth = 300;
                            const scale = Math.min(1, maxWidth / image.width);
                            const canvas = document.createElement('canvas');
                            canvas.width = Math.max(1, Math.round(image.width * scale));
                            canvas.height = Math.max(1, Math.round(image.height * scale));

                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.fillStyle = '#ffffff';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                            }

                            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                            URL.revokeObjectURL(imageUrl);
                            resolve(compressedBase64);
                        } catch (innerError) {
                            URL.revokeObjectURL(imageUrl);
                            resolve(null);
                        }
                    };

                    image.onerror = () => {
                        URL.revokeObjectURL(imageUrl);
                        resolve(null);
                    };
                });
            } catch (error) {
                return null;
            }
        };

        window.exportCatalogPDF = async function(priceType) {
            if (!window.catalogProducts || !Array.isArray(window.catalogProducts) || window.catalogProducts.length === 0) {
                return window.showToast("No hay productos para exportar.");
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ compress: true });
            const pageWidth = doc.internal.pageSize.getWidth();
            const titleText = priceType === 'wholesale' ? 'Catálogo Mayorista' : 'Catálogo Minorista';
            const fileName = `Catalogo_Famly_${priceType === 'wholesale' ? 'Mayorista' : 'Retail'}.pdf`;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(setSize(18));
            doc.text('FamlyFragrancerd', pageWidth / 2, 18, { align: 'center' });
            doc.setFontSize(setSize(12));
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text(titleText, pageWidth / 2, 26, { align: 'center' });
            doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, pageWidth / 2, 32, { align: 'center' });

            const sortedProducts = [...window.catalogProducts].sort((a, b) => {
                const brandA = (a.brand || 'Z_Sin Marca').toLowerCase().trim();
                const brandB = (b.brand || 'Z_Sin Marca').toLowerCase().trim();

                if (brandA < brandB) return -1;
                if (brandA > brandB) return 1;

                const nameA = (a.name || '').toLowerCase().trim();
                const nameB = (b.name || '').toLowerCase().trim();
                return nameA.localeCompare(nameB);
            });

            const rows = sortedProducts.map((prod, index) => {
                const price = priceType === 'wholesale' && prod.wholesalePrice && prod.wholesalePrice > 0 ? prod.wholesalePrice : prod.price;
                return {
                    photoKey: prod.id || `row_${index}`,
                    name: prod.name || '',
                    brand: prod.brand || '',
                    sku: prod.barcode || '-',
                    price: window.formatMoney(price)
                };
            });

            let imageCache = {};
            await Promise.all(sortedProducts.map(async (prod, index) => {
                const key = prod.id || `row_${index}`;
                if (!prod.img) {
                    imageCache[key] = null;
                    return;
                }
                imageCache[key] = await window.getImageBase64FromUrl(prod.img);
            }));

            const tableBody = rows.map(row => [row.photoKey, row.name, row.brand, row.sku, row.price]);

            doc.autoTable({
                startY: 45,
                head: [['Foto', 'Nombre', 'Marca', 'SKU', 'Precio']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontSize: 10, halign: 'center' },
                styles: { fontSize: 9, cellPadding: 4, textColor: [40, 40, 40], valign: 'middle' },
                rowPageBreak: 'avoid',
                columnStyles: {
                    0: { cellWidth: 22, halign: 'center', valign: 'middle' },
                    1: { cellWidth: 60 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 30, halign: 'right' }
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 0) {
                        data.cell.text = [''];
                    }
                },
                didDrawCell: function(data) {
                    if (data.section === 'body' && data.column.index === 0) {
                        const key = data.row.raw[0];
                        const base64 = imageCache[key];
                        if (base64) {
                            const maxWidth = Math.min(18, data.cell.width - 4);
                            const maxHeight = Math.min(18, data.cell.height - 4);
                            const x = data.cell.x + (data.cell.width - maxWidth) / 2;
                            const y = data.cell.y + (data.cell.height - maxHeight) / 2;
                            try {
                                doc.addImage(base64, 'JPEG', x, y, maxWidth, maxHeight);
                            } catch (err) {
                                doc.setFontSize(setSize(10));
                                doc.setTextColor(120, 120, 120);
                                doc.text('No photo', data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center', baseline: 'middle' });
                            }
                        } else {
                            doc.setFontSize(setSize(10));
                            doc.setTextColor(120, 120, 120);
                            doc.text('No photo', data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center', baseline: 'middle' });
                        }
                    }
                },
                didDrawPage: function() {
                    const pageNumber = doc.internal.getNumberOfPages();
                    doc.setFontSize(setSize(11));
                    doc.setTextColor(150, 150, 150);
                    doc.text(`Página ${pageNumber}`, pageWidth - 14, doc.internal.pageSize.height - 10, { align: 'right' });
                }
            });

            doc.save(fileName);
            window.showToast(`✅ Catálogo PDF (${priceType === 'wholesale' ? 'Mayorista' : 'Retail'}) listo.`);

            // Clear large image base64 data after PDF generation for memory cleanup
            if (imageCache) {
                Object.keys(imageCache).forEach(key => { imageCache[key] = null; });
                imageCache = null;
            }
        };

        window.copyCatalogTXT = async function(priceType) {
            if (!window.catalogProducts || !Array.isArray(window.catalogProducts) || window.catalogProducts.length === 0) {
                return window.showToast("No hay productos para copiar.");
            }

            const sortedProducts = [...window.catalogProducts].sort((a, b) => {
                const brandA = (a.brand || 'Z_Sin Marca').toLowerCase().trim();
                const brandB = (b.brand || 'Z_Sin Marca').toLowerCase().trim();

                if (brandA < brandB) return -1;
                if (brandA > brandB) return 1;

                const nameA = (a.name || '').toLowerCase().trim();
                const nameB = (b.name || '').toLowerCase().trim();
                return nameA.localeCompare(nameB);
            });

            const header = `CATÁLOGO ${priceType === 'wholesale' ? 'MAYORISTA' : 'RETAIL'}\n====================\n\n`;
            const lines = [header];
            let currentBrand = '';

            sortedProducts.forEach(prod => {
                const brand = (prod.brand || '').trim() || 'Sin Marca';
                const name = (prod.name || '').trim() || 'Sin Nombre';
                const price = priceType === 'wholesale' && prod.wholesalePrice && prod.wholesalePrice > 0 ? prod.wholesalePrice : prod.price || 0;
                const formattedPrice = window.formatMoney(price);

                if (brand !== currentBrand) {
                    if (currentBrand) lines.push('');
                    currentBrand = brand;
                    lines.push(brand);
                    lines.push('--------------------');
                }

                lines.push(`${brand} - ${name}: ${formattedPrice}`);
            });

            const textToCopy = lines.join('\n');

            try {
                await navigator.clipboard.writeText(textToCopy);
                window.showToast("Catálogo copiado al portapapeles");
            } catch (err) {
                console.error(err);
                window.showToast("No se pudo copiar el catálogo.");
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            const copyRetailBtn = document.getElementById('btn-copy-txt-retail');
            const copyWholesaleBtn = document.getElementById('btn-copy-txt-wholesale');

            if (copyRetailBtn) {
                copyRetailBtn.addEventListener('click', () => window.copyCatalogTXT('retail'));
            }
            if (copyWholesaleBtn) {
                copyWholesaleBtn.addEventListener('click', () => window.copyCatalogTXT('wholesale'));
            }
        });

