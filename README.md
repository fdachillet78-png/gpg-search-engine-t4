# GPG Search Engine — APM Terminals
Herramienta de búsqueda de GPG codes para IFS10.

## Despliegue en Vercel (paso a paso)

### 1. Crear cuenta en GitHub
- Ve a https://github.com y crea una cuenta gratuita

### 2. Subir este proyecto a GitHub
- En GitHub: New repository → nombre "gpg-search-engine" → Create
- Sube todos los archivos de esta carpeta

### 3. Crear cuenta en Vercel
- Ve a https://vercel.com y entra con tu cuenta de GitHub

### 4. Importar el proyecto
- New Project → Import → selecciona "gpg-search-engine"
- Framework Preset: Vite
- Deploy

### 5. Activar Vercel Blob Storage
- En el dashboard de tu proyecto: Storage → Create Database → Blob
- Esto genera automáticamente BLOB_READ_WRITE_TOKEN y BLOB_BASE_URL

### 6. Configurar variables de entorno
En Vercel → Settings → Environment Variables, agrega:
- ANTHROPIC_API_KEY = tu API key de Anthropic
- ADMIN_PASSWORD = la contraseña que quieras para cargar datos
- BLOB_READ_WRITE_TOKEN = (se llena automáticamente con Blob Storage)
- BLOB_BASE_URL = (se llena automáticamente con Blob Storage)

### 7. Redeploy
- Vercel → Deployments → Redeploy

### URLs finales
- Callao: https://gpg-search-engine.vercel.app
- T4: Crear un segundo proyecto con el mismo código, o configurar dominio gpg-t4.vercel.app

## Estructura de archivos
```
gpg-vercel/
├── api/
│   ├── chat.js      ← Proxy a Claude API (oculta la API key)
│   ├── data.js      ← Lee datos del Blob Storage
│   └── upload.js    ← Sube Excel al Blob Storage
├── src/
│   ├── App.jsx      ← Interfaz React
│   └── main.jsx     ← Punto de entrada
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```
