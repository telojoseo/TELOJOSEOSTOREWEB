# 🏪 Mi Tienda Multi-Cliente - Sistema de Facturación

Una plataforma completa de facturación y gestión de tienda **sin código**, configurable para diferentes clientes usando Firebase.

---

## 🚀 Inicio Rápido

### **Para ti (Primera vez):**

1. **Descarga el proyecto** desde GitHub
2. Abre `setup.html` en tu navegador
3. Ingresa tus claves de Firebase y datos de tu tienda
4. ¡Listo! La app funciona automáticamente

### **Para compartir con otro cliente:**

Simplemente envíale el link de tu sitio en Netlify. La primera vez que entre:
- Se abrirá `setup.html` automáticamente
- Ingresará SUS datos de Firebase y SU tienda
- Cada uno trabajará con su propia configuración (guardada localmente en su navegador)

---

## 📋 ¿Qué necesitas?

### **Para cada cliente (tienda):**

1. **Proyecto de Firebase** (gratis en [firebase.google.com](https://firebase.google.com))
   - API Key
   - Auth Domain
   - Project ID
   - Storage Bucket
   - Messaging Sender ID
   - App ID

2. **Datos de tu tienda:**
   - Nombre
   - Descripción (opcional)
   - Logo URL (opcional)
   - Color principal (opcional)

---

## 🔐 Obtener tus Claves de Firebase

### **Paso 1: Crear Proyecto en Firebase**

1. Ve a [firebase.google.com](https://firebase.google.com)
2. Haz clic en "Comenzar"
3. Crea un nuevo proyecto (nombre de tu tienda)
4. Habilita Firestore Database (modo de prueba)
5. Habilita Authentication (Email/Password)

### **Paso 2: Obtener las Claves**

1. En Firebase Console, ve a **Configuración del Proyecto** ⚙️
2. Ve a la pestaña **"Tu aplicación"** 
3. Haz clic en **"Web"** 🌐
4. Copia el objeto `firebaseConfig` que aparece
5. Tendrás estos datos:
   ```
   apiKey: "AIzaSyD..."
   authDomain: "tu-proyecto.firebaseapp.com"
   projectId: "tu-proyecto"
   storageBucket: "tu-proyecto.appspot.com"
   messagingSenderId: "123456789"
   appId: "1:123456789:web:abc123..."
   ```

---

## 🌐 Desplegar en Netlify

### **Opción A: Arrastra y Suelta (MÁS FÁCIL)**

1. Ve a [netlify.com](https://netlify.com) (crea cuenta gratis)
2. En el panel, arrastra tu carpeta del proyecto
3. Netlify automáticamente:
   - Sube los archivos
   - Te da un dominio (ej: `mi-tienda-123.netlify.app`)
   - ¡Listo!

### **Opción B: Desde GitHub (RECOMENDADO)**

#### **1. Subir a GitHub:**

```bash
# En la terminal, dentro de tu proyecto
git init
git add .
git commit -m "Versión inicial de mi tienda"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/nombre-tienda.git
git push -u origin main
```

#### **2. Conectar a Netlify:**

1. Ve a [netlify.com](https://netlify.com)
2. Haz clic en **"New site from Git"**
3. Selecciona **GitHub**
4. Autoriza y selecciona tu repositorio
5. Configuración:
   - **Build command**: (déjalo vacío)
   - **Publish directory**: `.` (punto, la raíz)
6. Haz clic en **"Deploy"**

#### **3. Tu sitio está VIVO:**

Netlify te da un dominio como `mi-tienda-123.netlify.app` y redeploy automático cada vez que subes a GitHub.

---

## 💾 Cómo funciona la Configuración

### **Flujo para nuevos usuarios:**

```
Usuario entra a mi-tienda.netlify.app
           ↓
¿Hay datos guardados en localStorage? 
           ↓ NO
        setup.html
  (Ingresa claves de Firebase y datos)
           ↓
Se guardan en localStorage del navegador
           ↓
index.html (App principal)
```

### **Flujo para usuarios ya configurados:**

```
Usuario entra a mi-tienda.netlify.app
           ↓
¿Hay datos guardados en localStorage? 
           ↓ SÍ
index.html (App funciona directamente)
```

---

## 🔄 Cambiar la Configuración Después

Si quieres cambiar tus claves o datos de tienda:

1. Abre el panel de **Configuración** → **Restablecer**
2. Haz clic en **"Borrar configuración"**
3. Se abrirá `setup.html` automáticamente
4. Ingresa la nueva configuración

---

## 🛡️ Seguridad - Lo Que NUNCA Se Sube a GitHub

Estos archivos NO están en GitHub (gracias a `.gitignore`):

- `config.js` (si lo tuvieras)
- `.env` (si lo usaras)
- Claves de Firebase
- Datos personales

**Solo tus datos de Firebase en TU navegador** - nadie más los ve.

---

## 📱 Características Incluidas

✅ **Gestión de Productos & Inventario**
✅ **Facturación** (Recibos térmicos + PDF)
✅ **Historial de Pedidos**
✅ **Clientes a Crédito**
✅ **WhatsApp Automático**
✅ **Reportes y Análisis**
✅ **Múltiples Métodos de Pago**
✅ **Admin Dashboard**

---

## ❓ FAQ

### **P: ¿Puedo usar la misma app para varios clientes?**
**R:** Sí. Cada uno accede con su propio dominio (o el mismo dominio pero configuran sus datos la primera vez).

### **P: ¿Dónde se guardan los datos?**
**R:** En **Firebase Firestore** (base de datos de cada cliente). Los datos de configuración (claves) en localStorage del navegador.

### **P: ¿Qué pasa si alguien entra a mi sitio y ve `setup.html`?**
**R:** Tendría que ingresar SUS propias claves de Firebase para funcionar. Tus datos están protegidos en tu propio Firestore.

### **P: ¿Puedo tener el sitio en un dominio personalizado?**
**R:** Sí. Netlify permite conectar dominios propios (ej: `mitienda.com`). Ve a Configuración → Dominios en Netlify.

### **P: ¿Qué pasa si pierdo mis claves de Firebase?**
**R:** Ve a [Firebase Console](https://console.firebase.google.com), encuentra tu proyecto y vuelve a copiar las claves. No se pierden.

---

## 🚨 Troubleshooting

### **"Aparece `setup.html` pero la página no responde"**
- Asegúrate que ingresaste el `Project ID` correctamente
- Verifica que Firebase Firestore está habilitado

### **"Los datos no se guardan"**
- Abre DevTools (F12) → Console
- Busca errores rojos
- Verifica que las claves de Firebase son correctas

### **"El logo no aparece en la factura"**
- Asegúrate que la URL del logo es directa (termina en .png o .jpg)
- GitHub y Imgur funcionan bien

---

## 📞 Soporte

Si hay problemas:
1. Verifica las claves de Firebase
2. Revisa que Firestore esté activo
3. Limpia el cache del navegador
4. Intenta en modo incógnito

---

## 📄 Licencia

Libre para usar y modificar. Úsalo con tus clientes sin restricciones.

---

**¡Hecho con ❤️ para potenciar negocios pequeños!**

Versión: 1.0.0 | Última actualización: Julio 2026
