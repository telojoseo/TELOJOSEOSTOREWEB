// ============================================================
// printer.js — Conexión directa a impresora térmica USB (sin diálogo de impresión)
// ============================================================
//
// Usa QZ Tray (https://qz.io), una aplicación gratuita que se instala UNA VEZ
// en la computadora donde está conectada la impresora térmica por USB. QZ Tray
// corre en segundo plano y expone un puente local (WebSocket) que esta página
// usa para enviar comandos de impresión directo a la impresora, sin mostrar
// ningún diálogo del navegador.
//
// PASO PREVIO (una sola vez, en la PC de facturación):
//   1. Descargar e instalar QZ Tray desde https://qz.io/download/
//   2. Dejarlo corriendo en segundo plano (aparece un ícono en la bandeja del sistema)
//   3. Conectar la impresora térmica por USB e instalar su driver normal de Windows
//   4. En esta página, ir a Facturación → botón "🔌 Conectar impresora" y elegirla
//      de la lista (esto se guarda en este navegador, no hay que repetirlo cada vez)

window.qzConnected = false;
window._qzFoundPrinters = [];

function setPrinterStatus(dotColor, text) {
    const dot = document.getElementById('printer-status-dot');
    const label = document.getElementById('printer-status-text');
    if (dot) dot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`;
    if (label) label.textContent = text;
}

window.initQzTray = async function() {
    if (typeof qz === 'undefined') {
        return { ok: false, reason: 'no-lib' };
    }
    if (qz.websocket.isActive()) { window.qzConnected = true; return { ok: true }; }
    try {
        await qz.websocket.connect();
        window.qzConnected = true;
        return { ok: true };
    } catch (e) {
        console.error("QZ Tray connect error:", e);
        window.qzConnected = false;
        return { ok: false, reason: 'no-connect', error: e };
    }
};

// Revisa el estado real paso a paso y actualiza el panel visible con un
// mensaje claro y específico de qué está pasando (no un toast que desaparece).
window.checkQzStatus = async function(userInitiated = false) {
    const savedPrinter = window.getConnectedPrinterName();

    if (typeof qz === 'undefined') {
        setPrinterStatus('bg-red-500', '🔴 No se cargó la librería QZ Tray (revisa tu conexión a internet y recarga la página).');
        return;
    }

    setPrinterStatus('bg-yellow-400 animate-pulse', '🟡 Conectando con QZ Tray...');
    const result = await window.initQzTray();

    if (!result.ok) {
        setPrinterStatus('bg-red-500', '🔴 QZ Tray no está abierto en esta computadora. Instálalo/ábrelo y presiona "Conectar / Verificar".');
        if (userInitiated) window.showToast("❌ No se detectó QZ Tray abierto en esta PC.");
        return;
    }

    // Conectado al puente. Ahora buscamos impresoras disponibles.
    let printers = [];
    try {
        printers = await qz.printers.find();
    } catch (e) {
        console.error(e);
        setPrinterStatus('bg-red-500', '🔴 Conectado a QZ Tray, pero no se pudieron listar las impresoras.');
        return;
    }
    window._qzFoundPrinters = printers || [];

    const dropdown = document.getElementById('printer-select-dropdown');
    const saveBtn = document.getElementById('btn-save-printer-selection');

    if (printers.length === 0) {
        setPrinterStatus('bg-yellow-500', '🟡 QZ Tray conectado, pero no se detectó ninguna impresora. Revisa que esté encendida, con cable USB y su driver instalado en Windows.');
        if (dropdown) dropdown.classList.add('hidden');
        if (saveBtn) saveBtn.classList.add('hidden');
        return;
    }

    // Mostramos el desplegador con las impresoras encontradas
    if (dropdown) {
        dropdown.innerHTML = printers.map(p => `<option value="${p}" ${p === savedPrinter ? 'selected' : ''}>${p}</option>`).join('');
        dropdown.classList.remove('hidden');
    }
    if (saveBtn) saveBtn.classList.remove('hidden');

    if (savedPrinter && printers.includes(savedPrinter)) {
        setPrinterStatus('bg-green-500', `🟢 Conectada: ${savedPrinter}`);
    } else {
        setPrinterStatus('bg-blue-500', `🔵 QZ Tray conectado. Elige tu impresora de la lista y presiona "Guardar".`);
    }
};

window.confirmPrinterSelection = function() {
    const dropdown = document.getElementById('printer-select-dropdown');
    if (!dropdown || !dropdown.value) return;
    localStorage.setItem('ffr_thermal_printer_name', dropdown.value);
    setPrinterStatus('bg-green-500', `🟢 Conectada: ${dropdown.value}`);
    window.showToast(`✅ Impresora guardada: ${dropdown.value}`);
};

window.getConnectedPrinterName = function() {
    return localStorage.getItem('ffr_thermal_printer_name') || null;
};

window.disconnectPrinter = function() {
    localStorage.removeItem('ffr_thermal_printer_name');
    window.showToast("Impresora desconectada de este navegador.");
    window.checkQzStatus();
};

// Imprime el recibo directo en la impresora térmica (con logo), sin diálogo.
// Si QZ Tray no está disponible o no hay impresora configurada, cae de vuelta
// al método de PDF + diálogo de impresión (window.printThermalReceipt en pdf.js)
// para que la venta NUNCA se quede sin poder imprimirse.
window.printThermalReceiptDirect = async function(order) {
    const printerName = window.getConnectedPrinterName();
    if (!printerName) {
        window.showToast("⚠️ No hay impresora conectada, se abrirá el PDF para imprimir manualmente.");
        return window.printThermalReceipt(order);
    }
    const qzResult = await window.initQzTray();
    if (!qzResult.ok) {
        window.showToast("⚠️ QZ Tray no está conectado, se abrirá el PDF para imprimir manualmente.");
        return window.printThermalReceipt(order);
    }

    try {
        const config = qz.configs.create(printerName);
        const ESC = '\x1B', GS = '\x1D';
        const data = [];

        const cfg = window.siteConfig || {};
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
        // Nota: las impresoras térmicas ESC/POS no soportan cambiar tipo de letra (Helvetica/Times/etc.),
        // solo tamaño y grosor. El "Tipo de letra" del panel solo afecta el PDF con diálogo; aquí solo
        // aplicamos el grosor (Normal/Negrita).
        const boldBody = cfg.invFontWeight === 'bold';
        const extraBlankLines = { compact: '', normal: '\n', wide: '\n\n' }[cfg.invLineSpacing || 'normal'];
        const printClientName = cfg.invPrintClientName !== false;
        const printClientPhone = cfg.invPrintClientPhone === true;
        const printClientTaxId = cfg.invPrintClientTaxId === true;
        const printClientAddress = cfg.invPrintClientAddress === true;

        // Logo de la tienda (opcional). Si no carga, seguimos sin él.
        if (showLogo) {
        try {
            const logoBase64 = await window.getLogoBase64();
            if (logoBase64) {
                data.push({
                    type: 'raw', format: 'image', data: logoBase64,
                    options: { language: 'ESCPOS', dotDensity: 'double' }
                });
            }
        } catch (e) { /* sin logo, no es crítico */ }
        }

        data.push(
            ESC + 'a' + '\x01', // centrar texto
            ESC + 'E' + '\x01' + `${storeName}\n` + ESC + 'E' + '\x00'
        );
        if (tagline) data.push(`${tagline}\n`);
        if (storeAddress) data.push(`${storeAddress}\n`);
        if (storeTaxId) data.push(`RNC/Cédula: ${storeTaxId}\n`);
        if (whatsapp) data.push(`WhatsApp: ${whatsapp}\n`);
        if (instagram) data.push(`Instagram: ${instagram}\n`);
        if (tiktok) data.push(`Tiktok: ${tiktok}\n`);
        if (extraBlankLines) data.push(extraBlankLines);
        data.push(
            new Date(order.date || Date.now()).toLocaleString('es-DO') + "\n",
            `Ticket: ${order.orderId || ''}\n`
        );
        if (printClientName) data.push(`Cliente: ${order.customerName || 'Mostrador'}\n`);
        if (printClientTaxId && order.customerTaxId) data.push(`RNC/Cédula cliente: ${order.customerTaxId}\n`);
        if (printClientPhone && order.customerPhone) data.push(`Tel. cliente: ${order.customerPhone}\n`);
        if (printClientAddress && order.customerAddress) data.push(`Dirección cliente: ${order.customerAddress}\n`);
        if (extraBlankLines) data.push(extraBlankLines);
        data.push(
            '--------------------------------\n',
            ESC + 'a' + '\x00' // alinear a la izquierda
        );
        if (extraBlankLines) data.push(extraBlankLines);
        if (boldBody) data.push(ESC + 'E' + '\x01'); // activar negrita para el cuerpo del ticket

        (order.items || []).forEach(item => {
            const left = `${item.qty}x ${item.name}`;
            const right = `RD$ ${(item.price * item.qty).toLocaleString('en-US')}`;
            data.push(left.padEnd(24, ' ').slice(0, 24) + right.padStart(8, ' ') + "\n");
            if (showUnitPrice) data.push(`   P. unit: RD$ ${item.price.toLocaleString('en-US')}\n`);
        });

        if (boldBody) data.push(ESC + 'E' + '\x00'); // desactivar negrita
        if (extraBlankLines) data.push(extraBlankLines);

        data.push(
            '--------------------------------\n',
            ESC + 'E' + '\x01' + `TOTAL: RD$ ${(order.total || 0).toLocaleString('en-US')}\n` + ESC + 'E' + '\x00',
            `Pago: ${(order.paymentMethod === 'Credito' ? 'Crédito' : order.paymentMethod) || 'Efectivo'}\n`,
            ESC + 'a' + '\x01' + `${footerMsg}\n`
        );
        footerExtraLines.forEach(line => data.push(`${line}\n`));
        data.push(
            '\n\n',
            GS + 'V' + '\x00' // cortar papel
        );

        await qz.print(config, data);
        window.showToast("✅ Recibo enviado a la impresora.");
    } catch (e) {
        console.error(e);
        window.showToast("❌ Error al imprimir directo, se abrirá el PDF como respaldo.");
        window.printThermalReceipt(order);
    }
};
