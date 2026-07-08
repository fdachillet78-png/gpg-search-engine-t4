import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
 
// ═══ DETECCIÓN DE TERMINAL POR URL ════════════════════════════════════════════
// callao.vercel.app  → Callao
// t4.vercel.app      → T4
// localhost/callao   → Callao (desarrollo)
function detectTerminal() {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (host.includes("t4") || path.startsWith("/t4")) return "t4";
  return "callao";
}
 
const TERMINAL   = detectTerminal();
const TERM_LABEL = TERMINAL === "t4" ? "T4" : "Callao";
// ═══ TRADUCCIONES ═════════════════════════════════════════════════════════════
const T = {
  es: {
    welcome: "Hola! Soy el GPG Search Engine de APM Terminals. Puedo ayudarte a identificar el código GPG correcto para tu solicitud de compra en IFS10. ¿Sobre qué tipo de trabajo o equipo necesitas información?",
    loading: (t) => `Cargando datos de ${t}…`,
    dataLoaded: (n) => `Datos cargados${n?` (${n} líneas)`:""}`,
    noData: "Sin datos",
    loadBtn: "📤 Cargar datos",
    newChat: "+ Nueva consulta",
    filesFor: "Archivos para",
    select: "Seleccionar",
    loadingBtn: "⏳ Cargando...",
    upload: "Cargar",
    notLoaded: "no cargado",
    updated: "Actualizado:",
    placeholder: "Escribe tu consulta... (Enter para enviar, Shift+Enter nueva línea)",
    hintNoData: (t) => `Carga los archivos Excel de ${t} para obtener recomendaciones precisas.`,
    hintData: (t) => `Pregunta sobre qué GPG usar para cualquier trabajo o servicio en ${t}.`,
    restricted: "Acceso restringido",
    adminOnly: "Solo administradores pueden cargar datos",
    pwPlaceholder: "Ingresa la contraseña",
    pwWrong: "Contraseña incorrecta.",
    connError: "Error de conexión.",
    cancel: "Cancelar",
    verifying: "Verificando...",
    enter: "Ingresar",
    historyTitle: "🕐 Último servicio similar contratado",
    seeLess: "Ver menos",
    more: (n) => `+${n} más`,
    thCols: ["Servicio","Proveedor","PO","Importe","Moneda"],
    errorMsg: "Lo siento, ocurrió un error. Por favor intenta de nuevo.",
    langLine: "IDIOMA: responde siempre en español.",
  },
  en: {
    welcome: "Hi! I'm the APM Terminals GPG Search Engine. I can help you identify the correct GPG code for your purchase request in IFS10. What type of work or equipment do you need information about?",
    loading: (t) => `Loading ${t} data…`,
    dataLoaded: (n) => `Data loaded${n?` (${n} lines)`:""}`,
    noData: "No data",
    loadBtn: "📤 Upload data",
    newChat: "+ New query",
    filesFor: "Files for",
    select: "Select",
    loadingBtn: "⏳ Uploading...",
    upload: "Upload",
    notLoaded: "not loaded",
    updated: "Updated:",
    placeholder: "Type your query... (Enter to send, Shift+Enter new line)",
    hintNoData: (t) => `Upload the ${t} Excel files to get accurate recommendations.`,
    hintData: (t) => `Ask which GPG to use for any work or service at ${t}.`,
    restricted: "Restricted access",
    adminOnly: "Only administrators can upload data",
    pwPlaceholder: "Enter password",
    pwWrong: "Incorrect password.",
    connError: "Connection error.",
    cancel: "Cancel",
    verifying: "Verifying...",
    enter: "Enter",
    historyTitle: "🕐 Most recent similar service",
    seeLess: "See less",
    more: (n) => `+${n} more`,
    thCols: ["Service","Supplier","PO","Unit price","Currency"],
    errorMsg: "Sorry, an error occurred. Please try again.",
    langLine: "LANGUAGE: always respond in English. When referring to categories, use: AM (Asset Management), OT-Maintenance (OT work by Maintenance team), OT-TECH (OT work by Technology/OT&A team), IT (Information Technology).",
  },
};
 
// ═══ EXCEL ════════════════════════════════════════════════════════════════════
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
 
function slim(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k,v] of Object.entries(row))
      if (v !== "" && v !== null && v !== undefined) out[k] = v;
    return out;
  });
}
 
// ═══ BÚSQUEDA ═════════════════════════════════════════════════════════════════
function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}
function stem(word) {
  if (word.length < 5) return word;
  if (word.endsWith("es") && word.length > 5) word = word.slice(0,-2);
  else if (word.endsWith("s") && word.length > 4) word = word.slice(0,-1);
  for (const suf of ["acion","amiento","imiento","iendo","ando","cion","miento","ura"])
    if (word.endsWith(suf) && word.length > suf.length+3) return word.slice(0,-suf.length);
  // Infinitivos verbales: pintar→pint, limpiar→limpi, reparar→repar
  for (const suf of ["ar","er","ir"])
    if (word.endsWith(suf) && word.length > suf.length+3) return word.slice(0,-suf.length);
  if (word.length > 7) return word.slice(0,-2);
  return word;
}
const STOP = new Set(["de","del","la","el","los","las","un","una","en","para","y","a","con","por","que","se","al","es","su","sus","lo","le","les","nos","mas","sin","entre","sobre","hasta","desde","como","si","no","o","e","u"]);
function tokenize(str) { return normalize(str).split(" ").filter(w => w.length>2 && !STOP.has(w)); }
 
// Palabras genéricas de negocio que no aportan especificidad a la búsqueda
const BUSINESS_STOP = new Set([
  "servicio","servicios","gpg","uso","usar","usar","necesito","necesita","necesitamos",
  "contratar","contrato","contratacion","comprar","compra","adquirir","adquisicion",
  "solicitar","solicitud","requerimiento","requiero","requiere","pedido","orden",
  "trabajo","trabajos","labores","actividad","actividades","tarea","tareas",
  "proveedor","empresa","contratista","externo","externa","externos",
  "cual","cuales","que","como","donde","cuando","quien","quiero","quiere",
  "nuevo","nueva","existente","actual","general","especifico","tipo","tipos",
  "pagar","pago","costo","costo","precio","monto","importe","factura",
  "hacer","realizar","ejecutar","efectuar","llevar","cabo","fin","objetivo",
]);
 
// extractTerms: solo términos específicos del trabajo/servicio solicitado.
// Filtra palabras genéricas de negocio y stopwords gramaticales.
function extractTerms(msg) {
  const tokens = tokenize(msg).filter(t => !BUSINESS_STOP.has(t));
  const exp = new Set(tokens);
  for (const t of tokens) {
    if (t.length > 6) {
      const st = stem(t);
      if (st !== t && st.length > 4) exp.add(st);
    }
  }
  return [...exp];
}
// Raíces de acciones de servicio. Si la consulta contiene una acción,
// los resultados DEBEN matchear esa acción (no solo el lugar/equipo).
const ACTION_STEMS = ["pint","limpi","lav","repar","manten","fabric","instal","cambi","reemplaz","sustitu","suministr","montaj","mont","soldad","sold","calibr","inspecc","certific","alquil","fumig","desinfecc","recubr","sandblast","overhaul","rebobin","engras","lubric","impresion","confeccion"];
 
function isActionTerm(term) {
  const st = stem(normalize(term));
  const nm = normalize(term);
  return ACTION_STEMS.some(a => st.startsWith(a) || nm.startsWith(a));
}
 
function findSimilar(poLines, terms, limit=5) {
  if (!poLines?.length || !terms?.length) return [];
  const qn = terms.map(t=>({ raw:normalize(t), stem:stem(normalize(t)), isAction:isActionTerm(t) }));
  const queryHasAction = qn.some(q=>q.isAction);
 
  const scored = poLines.map(line => {
    const raw = normalize(line.Part_Description||line.Part_Descripcion||line.part_description||line.part_descripcion||"");
    const words = tokenize(raw); const stems = words.map(w=>stem(w));
    let score=0, actionMatched=false;
    for (const qt of qn) {
      let matched = false;
      if (raw.includes(qt.raw)) { score += qt.raw.length>5?5:3; matched=true; }
      else if (stems.includes(qt.stem) && qt.stem.length>3) { score+=3; matched=true; }
      else {
        for (const dw of words) {
          const ml=Math.min(dw.length,qt.raw.length);
          if (ml>=4) { let k=0; while(k<ml&&dw[k]===qt.raw[k])k++; if(k>=4){score+=2;matched=true;break;} }
        }
      }
      if (matched && qt.isAction) actionMatched = true;
    }
    return { line, score, actionMatched };
  }).filter(x=>x.score>=2); // exigir al menos 2 puntos para evitar falsos positivos por términos genéricos
 
  // Si la consulta tiene una acción de servicio, exigirla en los resultados
  const qualified = queryHasAction ? scored.filter(x=>x.actionMatched) : scored;
 
  qualified.sort((a,b)=>b.score-a.score);
  return qualified.slice(0,limit).map(x=>x.line);
}
 
// ═══ GPG / CoA ════════════════════════════════════════════════════════════════
function buildMaps(gpgList, coaData) {
  const coaMap = new Map();
  for (const c of (coaData||[])) { const k=c.Os_Acc||c.os_acc||""; if(k) coaMap.set(k,c.Account_Definition||c.account_definition||""); }
  const IT_OS_ACC = new Set(["AT_11310_55","AT_11310_54","AT_11310_53","AT_11310_66","AT_11529_06","AT_11529_07"]);
 
  const gpgMap = new Map();
  for (const g of (gpgList||[])) {
    const pn=g.Part_No||g.part_no||""; if(!pn) continue;
    const osAccDesc = (g.Os_Acc_Desc||g.os_acc_desc||"").trim();
    if (osAccDesc.toLowerCase().endsWith("internal")) continue;
    if (gpgMap.has(pn)) continue;
    const osAcc=g.Os_Acc||g.os_acc||"";
    const accGroupDesc = g.Acc_Group_Desc||g.acc_group_desc||"";
    const isCapex = accGroupDesc.toUpperCase().includes("CWIP");
    const isIT    = IT_OS_ACC.has(osAcc);
    gpgMap.set(pn,{ osAcc, osAccDesc, accountDef:osAcc?(coaMap.get(osAcc)||""):"", desc:g.Part_Description||g.Part_Descripcion||g.part_description||g.part_descripcion||"", accGroup:`${g.Acc_Group||""} - ${accGroupDesc}`, isCapex, isIT });
  }
  return { coaMap, gpgMap };
}
 
function buildSystem(gpgList, coaData, lang="es") {
  const { gpgMap } = buildMaps(gpgList, coaData);
  let p = `Eres un asistente de GPG codes para APM Terminals (grupo Maersk), terminal ${TERM_LABEL}.
Ayudas a identificar el GPG correcto para órdenes de compra en IFS10, asegurando que el gasto vaya a la cuenta contable correcta.
 
═══════════════════════════════════════════════════════
MARCO DE CLASIFICACIÓN AM / OT / IT (regla global APMT)
═══════════════════════════════════════════════════════
 
PASO 1 — DETERMINAR EL TIPO DE GASTO:
Antes de recomendar un GPG, identifica a qué categoría pertenece el trabajo:
 
A) GASTO AM (Asset Management):
   - Mantenimiento y reparación de equipos físicos del terminal que NO son OT ni IT.
   - Ejemplos: grúas STS/RTG/SC, vehículos, infraestructura civil, edificios, tuberías, pintura, estructuras metálicas.
   - GPG: usar catálogo AM estándar (cuentas PE00xx).
 
B) GASTO OT — ejecutado por MANTENIMIENTO (Maintenance Operations):
   - El trabajo involucra sistemas OT (tecnología que monitorea/controla procesos físicos) PERO lo ejecuta o contrata el área de Mantenimiento.
   - Sistemas OT incluyen: PLCs, SCADA, actuadores, sensores, HMIs, access control, CCTV, edge management, automation systems, handheld/radio equipment, electronic displays, end point devices, firmware, gate operating system, crane/gate OCR, industrial control systems, IPCs, NRA, automation integration layer, terminal gate system, wireless connectivity, VMT, terminal operating system (TOS).
   - GPG EXCLUSIVO para este caso: G-301148 (OT cost — Maintenance scope).
 
C) GASTO OT — ejecutado por TECH (área de Tecnología/OT&A):
   - El trabajo OT lo gestiona o contrata el área de TECH/OT&A.
   - Usar el GPG OT-TECH según el tipo de gasto:
     • G-301293 — Telecom related (costos externos de telecomunicaciones OT)
     • G-301294 — Software related (software OT externo)
     • G-301295 — Hardware related (hardware OT externo)
     • G-301296 — Consultancy fee (consultoría OT externa)
     • G-301297 — Cost allocated FROM other entities (costos OT recibidos de otras entidades)
     • G-301298 — Cost allocated TO other entities (costos OT asignados a otras entidades)
 
D) GASTO IT (Information Technology):
   - Sistemas y suministros IT: desktop/laptops, cloud services, IFS, Atlas, Navis, business intelligence tools, cyber security tools, printers/scanners, workforce management system, accesorios de cómputo (mouse, teclado, cables, consumibles IT, etc.).
   - Los GPGs de categoría IT están marcados con [IT] en el catálogo — recomiéndalos igual que cualquier otro GPG.
   - Os_Acc de cuentas IT: AT_11310_55, AT_11310_54, AT_11310_53, AT_11310_66, AT_11529_06, AT_11529_07.
   - Ejemplos: G-015313 (consumables IT), G-011709 (IT accessories and cables).
   - La diferencia con OT: IT es infraestructura informática general; OT son sistemas que monitoran/controlan procesos físicos del terminal.
 
PASO 2 — PREGUNTAS DE DESCARTE (si hay ambigüedad):
Si no está claro si es OT-Mantenimiento u OT-TECH, haz UNA sola pregunta:
- "¿Quién emite el requerimiento de compra — el área de Mantenimiento o el área de TECH/OT?"
 
REGLA CLAVE — el gasto cae a quien lo ejecuta:
- El GPG define a qué cuenta va el gasto, y el gasto le cae al área que emite el requerimiento.
- Si Mantenimiento emite la PO → G-301148 (el gasto queda en presupuesto de Mantenimiento).
- Si TECH/OT emite la PO → G-301293 al G-301298 (el gasto queda en presupuesto de TECH).
- Si el área de Mantenimiento no quiere asumir un gasto (ej. porque internamente se acordó que las implementaciones nuevas las gestiona TECH), entonces el requerimiento debe partir de TECH con el GPG correspondiente, y viceversa.
- En caso de duda sobre quién debe asumir el gasto, recomienda al usuario alinearse internamente antes de emitir la PO.
 
PASO 3 — FORMATO DE RESPUESTA:
• Categoría: [AM / OT-Mantenimiento / OT-TECH / IT]
• GPG principal recomendado: [código] — [descripción completa del GPG]
• Cuenta contable: [Acc_Group]
• Estándar CoA: [Account_Definition] — por qué aplica a este trabajo
• Si hay GPGs alternativos válidos, lístalos con su descripción completa y explica en qué situación específica usar cada uno:
  - G-XXXXXX — [descripción]: usar cuando [condición específica]
  - G-XXXXXX — [descripción]: usar cuando [condición específica]
• Usa la descripción del GPG (Part_Description) como criterio clave para discriminar entre alternativas — una descripción más específica siempre tiene preferencia sobre una genérica.
• ⚠️ Si el historial adjunto muestra un GPG distinto al correcto, señálalo.
 
REGLA FACILITY vs CIVIL WORKS (distinción ambigua en el CoA):
Cuando el trabajo involucre instalaciones físicas del terminal, distinguir entre:
 
▸ ERM – Facility, external (AT_11310_25):
  Trabajos DENTRO o SOBRE edificios e instalaciones cubiertas:
  - Paredes, techos, pisos, ventanas, puertas
  - Pintura de edificios e interiores
  - Remodelación y ampliación de espacios internos
  - Sistemas eléctricos, HVAC, plomería de edificios
  - Mantenimiento de oficinas, almacenes, talleres, salas
 
▸ Civil Works Repair & Maintenance, external:
  Trabajos de infraestructura civil EXTERIOR del terminal:
  - Pavimentos, pistas de circulación, vías internas
  - Muelles, explanadas, áreas de operación de grúas
  - Cercos perimetrales, muros de contención, drenajes
  - Obras de concreto en áreas operativas al aire libre
  - Canales, cunetas, sistemas de drenaje pluvial
 
⚠️ ADVERTENCIA: Esta distinción es ambigua en el CoA global de APMT y genera dudas frecuentes incluso en el área de finanzas. Si el caso no es claro, indica al usuario que consulte con el área de Finanzas antes de emitir la PO.
 
REGLA DE USO DE DESCRIPCIÓN DEL GPG (Part_Description):
- La descripción del GPG es el criterio más importante para discriminar entre alternativas.
- Siempre prefiere el GPG cuya descripción sea más específica para el trabajo solicitado.
- NUNCA recomiendes un GPG de "CONSUMABLES" o "SUPPLIES" para un servicio — son para compra de materiales/insumos.
- NUNCA recomiendes un GPG de "HVAC" para trabajos que no sean de climatización/ventilación.
- NUNCA recomiendes un GPG de "ELECTRICAL" para trabajos que no sean eléctricos.
- Si la descripción dice "SERVICES" o "MAINTENANCE AND REPAIR SERVICES", ese GPG es para contratar servicios externos.
- Si la descripción dice "EQUIPMENT", ese GPG es para adquirir equipos, no contratar servicios.
 
REGLA CAPEX/CWIP (crítica):
- Los GPGs marcados [CAPEX-CWIP] son EXCLUSIVAMENTE para proyectos de inversión de capital.
- NUNCA los sugieras para trabajos ordinarios de mantenimiento, reparación o servicios.
- Solo si el usuario indica explícitamente que es un proyecto de inversión/Capex.
 
HISTORIAL (si se adjunta):
- Puede contener usos INCORRECTOS. Valida siempre contra las reglas anteriores.
- NO repitas los datos del historial en texto — el sistema los muestra en tabla aparte.
 
${T[lang].langLine}\n`;
 
  if (gpgList?.length) {
    p += `\n=== CATÁLOGO DE GPGs ===\n`;
    let n=0;
    for (const [pn,g] of gpgMap.entries()) {
      if (n++>500) break;
      const gpgTag = g.isCapex?"[CAPEX-CWIP]":g.isIT?"[IT]":""; p += `GPG: ${pn}${gpgTag?" "+gpgTag:""} | Desc: ${g.desc} | Cuenta: ${g.accGroup} | Os_Acc: ${g.osAcc||"N/D"} | Estándar Global: ${g.accountDef||"N/D"}\n`;
    }
  }
  if (coaData?.length) {
    p += `\n=== CHART OF ACCOUNTS (OneStream) ===\n`;
    const { gpgMap: gm } = buildMaps(gpgList, coaData);
    const usedOsAcc = new Set([...gm.values()].map(g=>g.osAcc).filter(Boolean));
    const filtered = coaData.filter(c=>usedOsAcc.has(c.Os_Acc||c.os_acc||""));
    const list = filtered.length>0 ? filtered : coaData.slice(0,150);
    for (const c of list)
      p += `Os_Acc: ${c.Os_Acc||c.os_acc||""} | ${c.Os_Acc_Desc||c.os_acc_desc||""} | Def: ${c.Account_Definition||c.account_definition||""}\n`;
  }
  if (!gpgList?.length && !coaData?.length)
    p += `\nNOTA: No hay datos cargados. Indica al usuario que cargue los archivos Excel.`;
  return p;
}
 
function buildPoContext(similarPo, gpgMap) {
  if (!similarPo?.length) return "";
  let block = `\n=== POs SIMILARES (referencia histórica — pueden tener GPG incorrecto) ===\n`;
  for (const l of similarPo) {
    const pn=l.Part_No||l.part_no||"";
    const coaDef=gpgMap.get(pn)?.accountDef||"GPG no en catálogo";
    const price=l["Price/Curr"]||l.Price_Curr||"";
    const curr=l.Currency||l.currency||"";
    const svcDesc = l.Part_Description||l.Part_Descripcion||l.part_description||l.part_descripcion||"";
    block += `GPG usado: ${pn} | Servicio: ${svcDesc} | Proveedor: ${l.Supplier_Name||l.Supplier||""} | PO: ${l.Order_No||""} | Precio: ${price} ${curr} | CoA: "${coaDef}"\n`;
  }
  return block;
}
 
// ═══ UI COMPONENTS ════════════════════════════════════════════════════════════
function MarkdownText({ text }) {
  const html = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>")
    .replace(/`([^`]+)`/g,'<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>')
    .replace(/\n/g,"<br/>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
 
function PoCard({ rows, t }) {
  const [exp, setExp] = useState(false);
  if (!rows?.length) return null;
  const vis = exp ? rows : rows.slice(0,1);
  return (
    <div style={{ marginTop:8, border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden", fontSize:12 }}>
      <div style={{ background:"#f8f9fa", padding:"6px 12px", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontWeight:600, color:"#475569", fontSize:11 }}>{t.historyTitle}</span>
        {rows.length>1 && <button onClick={()=>setExp(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"#E8481D", fontWeight:500, padding:0 }}>{exp?t.seeLess:t.more(rows.length-1)}</button>}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead><tr style={{ background:"#f1f5f9" }}>
            {t.thCols.map(h=>(
              <th key={h} style={{ padding:"5px 10px", textAlign:"left", fontWeight:600, color:"#64748b", whiteSpace:"nowrap", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{vis.map((r,i)=>{
            const desc=r.Part_Description||r.Part_Descripcion||r.part_description||r.part_descripcion||"—";
            const supp=r.Supplier_Name||r.Supplier||"—";
            const po=r.Order_No||"—";
            const rp=r["Price/Curr"]||r.Price_Curr||"";
            const curr=r.Currency||r.currency||"";
            const fmt=rp&&!isNaN(Number(rp))?Number(rp).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2}):(rp||"—");
            return (
              <tr key={i} style={{ borderBottom:i<vis.length-1?"1px solid #f1f5f9":"none", background:i===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"6px 10px", color:"#1a2332", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={desc}>{desc}</td>
                <td style={{ padding:"6px 10px", color:"#475569", whiteSpace:"nowrap" }}>{supp}</td>
                <td style={{ padding:"6px 10px", color:"#475569", fontFamily:"monospace" }}>{po}</td>
                <td style={{ padding:"6px 10px", color:"#1a2332", fontWeight:500, textAlign:"right" }}>{fmt}</td>
                <td style={{ padding:"6px 10px", color:"#64748b" }}>{curr}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
 
function FileBtn({ label, file, onFile, id }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <span style={{ fontSize:11, color:"#64748b", fontWeight:500 }}>{label}</span>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <label htmlFor={id} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"1px solid #e2e8f0", background:"#fff", fontSize:12, cursor:"pointer", color:file?"#E8481D":"#475569", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          📎 {file?file.name:"Seleccionar"}
        </label>
        <input id={id} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={e=>{ onFile(e.target.files?.[0]||null); e.target.value=""; }} />
        {file && <button onClick={()=>onFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:16, padding:0 }}>×</button>}
      </div>
    </div>
  );
}
 
const BP = { background:"#E8481D", color:"#fff", border:"none", borderRadius:8, padding:"7px 16px", fontSize:13, fontWeight:600, cursor:"pointer" };
const BO = { background:"#fff", color:"#475569", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:500, cursor:"pointer" };
 
const LOGO_B64 = "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";
 
// ═══ APP ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [gpgList,   setGpgList]   = useState(null);
  const [poLines,   setPoLines]   = useState(null);
  const [coaData,   setCoaData]   = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [lang,      setLang]      = useState("es");
  const t = T[lang];
 
  const [messages,    setMessages]    = useState([{ role:"assistant", content:T.es.welcome, poRows:null }]);
  const [input,       setInput]       = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
 
  const [showUpload, setShowUpload] = useState(false);
  const [authed,     setAuthed]     = useState(false);
  const [showPw,     setShowPw]     = useState(false);
  const [pwInput,    setPwInput]    = useState("");
  const [pwError,    setPwError]    = useState(null);
  const [pwBusy,     setPwBusy]     = useState(false);
  const [gpgF,       setGpgF]       = useState(null);
  const [poF,        setPoF]        = useState(null);
  const [coaF,       setCoaF]       = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState(null);
 
  const endRef   = useRef(null);
  const abortRef = useRef(null);
  const gpgRef   = useRef(null);
  const poRef    = useRef(null);
  const coaRef   = useRef(null);
 
  useEffect(()=>{ gpgRef.current=gpgList; },[gpgList]);
  useEffect(()=>{ poRef.current=poLines;  },[poLines]);
  useEffect(()=>{ coaRef.current=coaData; },[coaData]);
 
  // Cargar datos: pedir URLs firmadas y descargar los blobs directamente
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try {
        const res  = await fetch(`/api/data?terminal=${TERMINAL}`, { cache: "no-store" });
        const data = await res.json();
        const urls = data.urls || {};
        const fetchJson = async (url) => {
          if (!url) return null;
          try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : null; }
          catch { return null; }
        };
        const [g, p, coa, meta] = await Promise.all([
          fetchJson(urls.gpglist),
          fetchJson(urls.polines),
          fetchJson(urls.coa),
          fetchJson(urls.meta),
        ]);
        if (g)   setGpgList(g);
        if (p)   setPoLines(p);
        if (coa) setCoaData(coa);
        if (meta?.updatedAt) setUpdatedAt(meta.updatedAt);
      } catch {}
      setLoading(false);
    })();
  },[]);
 
  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); },[messages]);
 
  const dataLoaded = !!(gpgList?.length || poLines?.length);
 
  // ── SEND ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const msg = input.trim(); setInput("");
    const terms   = extractTerms(msg);
    const currPo  = poRef.current;
    const currGpg = gpgRef.current;
    const currCoa = coaRef.current;
    const { gpgMap } = buildMaps(currGpg, currCoa);
    // Excluir POs que usaron GPGs Capex (CWIP) — no son referencia para trabajo ordinario
    const poSinCapex = (currPo||[]).filter(l => {
      const pn = l.Part_No||l.part_no||"";
      return !gpgMap.get(pn)?.isCapex;
    });
    const similar = findSimilar(poSinCapex, terms, 5);
 
    const newMsgs = [...messages, { role:"user", content:msg, poRows:null }];
    setMessages(newMsgs);
    setIsStreaming(true);
    setMessages(prev=>[...prev,{ role:"assistant", content:"", streaming:true, poRows:null }]);
 
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const system  = buildSystem(currGpg, currCoa, lang) + buildPoContext(similar, gpgMap);
      const apiMsgs = newMsgs.map(m=>({ role:m.role, content:m.content }));
 
      const res = await fetch("/api/chat", {
        method:"POST", signal:ctrl.signal,
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ system, messages:apiMsgs }),
      });
 
      if (!res.ok) throw new Error(`API ${res.status}`);
      const reader=res.body.getReader(); const dec=new TextDecoder();
      let buf="", full="";
      while(true){
        const {done,value}=await reader.read(); if(done)break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split("\n"); buf=lines.pop()??"";
        for(const line of lines){
          if(!line.startsWith("data: "))continue;
          const raw=line.slice(6).trim(); if(raw==="[DONE]")continue;
          try{
            const p=JSON.parse(raw);
            if(p.type==="content_block_delta"&&p.delta?.type==="text_delta"){
              full+=p.delta.text;
              setMessages(prev=>{ const u=[...prev]; u[u.length-1]={role:"assistant",content:full,streaming:true,poRows:null}; return u; });
            }
          }catch{}
        }
      }
      setMessages(prev=>{ const u=[...prev]; u[u.length-1]={ role:"assistant", content:full, streaming:false, poRows:similar.length>0?similar:null }; return u; });
    } catch(err){
      if(err?.name!=="AbortError")
        setMessages(prev=>{ const u=[...prev]; u[u.length-1]={role:"assistant",content:t.errorMsg,streaming:false,poRows:null}; return u; });
    } finally { setIsStreaming(false); abortRef.current=null; }
  };
 
  const handleKey=(e)=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();} };
  const handleNew=()=>{ if(isStreaming)abortRef.current?.abort(); setMessages([{role:"assistant",content:t.welcome,poRows:null}]); setInput(""); };
 
  // ── UPLOAD ────────────────────────────────────────────────────────────────
  const handleCargar=()=>{ if(authed){setShowUpload(v=>!v);setUploadMsg(null);}else{setPwInput("");setPwError(null);setShowPw(true);} };
  const adminPwRef = useRef("");
  const handlePw=async()=>{
    if(!pwInput.trim())return; setPwBusy(true);
    try {
      // Verificar contra el servidor (la contraseña real está en variables de entorno de Vercel)
      const res = await fetch("/api/auth", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ password: pwInput }),
      });
      if (res.ok) {
        adminPwRef.current = pwInput;
        setAuthed(true); setShowPw(false); setShowUpload(true); setPwError(null);
      } else {
        setPwError(t.pwWrong);
      }
    } catch {
      setPwError(t.connError);
    }
    setPwBusy(false);
  };
 
  const handleUpload=async()=>{
    if(!gpgF&&!poF&&!coaF)return; setUploading(true); setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("terminal", TERMINAL);
      if (gpgF) form.append("gpglist", gpgF);
      if (poF)  form.append("polines", poF);
      if (coaF) form.append("coa", coaF);
 
      const res  = await fetch("/api/upload", { method:"POST", headers:{ "x-admin-password": adminPwRef.current }, body:form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||`Error ${res.status}`);
 
      // Actualizar estado local
      if (gpgF) { const d=slim(await parseExcel(gpgF)); setGpgList(d); }
      if (poF)  { const d=slim(await parseExcel(poF));  setPoLines(d); }
      if (coaF) { const d=slim(await parseExcel(coaF)); setCoaData(d); }
      setUpdatedAt(data.updatedAt);
      setUploadMsg("✓ " + data.results.join(" | "));
      setGpgF(null); setPoF(null); setCoaF(null);
    } catch(err) { setUploadMsg("Error: "+err.message); }
    setUploading(false);
  };
 
  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"'Maersk Text Office','Nunito Sans','Segoe UI',sans-serif", background:"#f8f9fa", color:"#1a2332" }}>
 
      {loading && (
        <div style={{ position:"fixed", inset:0, background:"rgba(255,255,255,.9)", zIndex:200, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
          <div style={{ width:36, height:36, border:"3px solid #e2e8f0", borderTop:"3px solid #E8481D", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
          <p style={{ fontSize:13, color:"#64748b" }}>{t.loading(TERM_LABEL)}</p>
        </div>
      )}
 
      {/* HEADER */}
      <header style={{ height:70, background:"#fff", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", padding:"0 20px", gap:16, flexShrink:0, boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
        <img src={`data:image/webp;base64,${LOGO_B64}`} alt="APM Terminals" style={{ height:50, width:"auto", flexShrink:0, objectFit:"contain" }} />
        <span style={{ width:1, height:36, background:"#e2e8f0", flexShrink:0 }} />
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end", gap:3, flex:1, minWidth:0, paddingBottom:2 }}>
          <span style={{ fontWeight:700, fontSize:14, color:"#1a2332", lineHeight:1 }}>GPG Search Engine</span>
          <span style={{ padding:"1px 8px", borderRadius:20, fontSize:10, fontWeight:700, background:"#E8481D18", color:"#E8481D", border:"1px solid #E8481D40", alignSelf:"flex-start" }}>{TERM_LABEL}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, flexShrink:0, border:`1px solid ${dataLoaded?"#86efac":"#fcd34d"}`, background:dataLoaded?"#f0fdf4":"#fffbeb", color:dataLoaded?"#16a34a":"#92400e" }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:dataLoaded?"#22c55e":"#f59e0b", display:"inline-block" }} />
          {dataLoaded?t.dataLoaded(poLines?.length?poLines.length.toLocaleString():null) : t.noData}
        </div>
        <button onClick={handleCargar} style={{ ...BO, display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
          {t.loadBtn} <span style={{ fontSize:10 }}>{showUpload?"▲":"▼"}</span>
        </button>
        <button onClick={handleNew} style={{ ...BO, flexShrink:0 }}>{t.newChat}</button>
        {/* Selector de idioma */}
        <div style={{ display:"flex", gap:2, background:"#f1f5f9", borderRadius:8, padding:2, flexShrink:0 }}>
          {["es","en"].map(l=>(
            <button key={l} onClick={()=>setLang(l)} style={{
              padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:700, border:"none", cursor:"pointer",
              background: lang===l ? "#fff" : "transparent",
              color: lang===l ? "#E8481D" : "#64748b",
              boxShadow: lang===l ? "0 1px 3px rgba(0,0,0,.1)" : "none",
            }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
 
      {/* UPLOAD PANEL */}
      {showUpload && (
        <div style={{ background:"#f1f5f9", borderBottom:"1px solid #e2e8f0", padding:"12px 20px", flexShrink:0 }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:10, color:"#1a2332" }}>
            {t.filesFor} <strong style={{ color:"#E8481D" }}>{TERM_LABEL}</strong>:
          </p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-end" }}>
            <FileBtn label="POLines (.xlsx)" file={poF}  onFile={setPoF}  id="fi-po"  />
            <FileBtn label="GPGList (.xlsx)" file={gpgF} onFile={setGpgF} id="fi-gpg" />
            <FileBtn label="CoA (.xlsx)"     file={coaF} onFile={setCoaF} id="fi-coa" />
            <button onClick={handleUpload} disabled={uploading||(!gpgF&&!poF&&!coaF)}
              style={{ ...BP, padding:"6px 18px", fontSize:12, opacity:(uploading||(!gpgF&&!poF&&!coaF))?0.5:1 }}>
              {uploading?t.loadingBtn:t.upload}
            </button>
          </div>
          <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
            {[{l:"GPGList",v:gpgList},{l:"POLines",v:poLines},{l:"CoA",v:coaData}].map(({l,v})=>(
              <span key={l} style={{ fontSize:11, padding:"2px 10px", borderRadius:20, border:`1px solid ${v?.length?"#86efac":"#e2e8f0"}`, background:v?.length?"#f0fdf4":"#fff", color:v?.length?"#16a34a":"#94a3b8" }}>
                {l}: {v?.length?`${v.length.toLocaleString()} ✓`:t.notLoaded}
              </span>
            ))}
            {updatedAt && <span style={{ fontSize:11, color:"#94a3b8" }}>{t.updated} {new Date(updatedAt).toLocaleString(lang==="en"?"en-US":"es-ES")}</span>}
          </div>
          {uploadMsg && <p style={{ marginTop:8, fontSize:12, color:uploadMsg.startsWith("✓")?"#16a34a":"#dc2626" }}>{uploadMsg}</p>}
        </div>
      )}
 
      {/* MESSAGES */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 20px 8px" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>
          {messages.map((m,i)=>(
            <div key={i} style={{ display:"flex", gap:10, justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              {m.role==="assistant" && <div style={{ width:28, height:28, borderRadius:"50%", background:"#E8481D", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0, marginTop:2 }}>A</div>}
              <div style={{ maxWidth:"80%", display:"flex", flexDirection:"column" }}>
                <div style={{ borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"10px 14px", fontSize:14, lineHeight:1.65, background:m.role==="user"?"#E8481D":"#fff", color:m.role==="user"?"#fff":"#1a2332", boxShadow:m.role==="assistant"?"0 1px 4px rgba(0,0,0,.08)":"none", border:m.role==="assistant"?"1px solid #e2e8f0":"none" }}>
                  {m.role==="assistant"
                    ? <span><MarkdownText text={m.content}/>{m.streaming&&<span style={{ display:"inline-block",width:2,height:14,background:"#1a2332",marginLeft:2,verticalAlign:"middle",animation:"blink 1s infinite" }}/>}</span>
                    : m.content}
                </div>
                {m.role==="assistant" && !m.streaming && <PoCard rows={m.poRows} t={t} />}
              </div>
              {m.role==="user" && <div style={{ width:28, height:28, borderRadius:"50%", background:"#e2e8f0", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0, marginTop:2 }}>U</div>}
            </div>
          ))}
          <div ref={endRef}/>
        </div>
      </div>
 
      {/* INPUT */}
      <div style={{ padding:"12px 20px 16px", background:"#fff", borderTop:"1px solid #e2e8f0", flexShrink:0 }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", gap:8, alignItems:"flex-end" }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} disabled={isStreaming}
            placeholder={t.placeholder} rows={1}
            style={{ flex:1, padding:"10px 14px", borderRadius:10, border:"1px solid #e2e8f0", fontSize:14, resize:"none", minHeight:44, maxHeight:120, fontFamily:"inherit", outline:"none", lineHeight:1.5, color:"#1a2332" }}
            onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }} />
          <button onClick={handleSend} disabled={!input.trim()||isStreaming}
            style={{ ...BP, width:44, height:44, padding:0, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, opacity:(!input.trim()||isStreaming)?0.4:1 }}>
            {isStreaming?"⏳":"➤"}
          </button>
        </div>
        <p style={{ maxWidth:800, margin:"6px auto 0", fontSize:11, color:"#94a3b8", display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <span>{!dataLoaded?t.hintNoData(TERM_LABEL):t.hintData(TERM_LABEL)}</span>
          <span style={{ color:"#cbd5e1" }}>Elaborado por Franco D' Achille — APMT Callao</span>
        </p>
      </div>
 
      {/* PASSWORD MODAL */}
      {showPw && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:20 }} onClick={()=>setShowPw(false)}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, width:"100%", maxWidth:360, boxShadow:"0 8px 32px rgba(0,0,0,.2)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"#E8481D18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🔒</div>
              <div><p style={{ fontWeight:600, color:"#1a2332" }}>{t.restricted}</p><p style={{ fontSize:12, color:"#64748b" }}>{t.adminOnly}</p></div>
            </div>
            <input type="password" value={pwInput} autoFocus onChange={e=>{setPwInput(e.target.value);setPwError(null);}} onKeyDown={e=>e.key==="Enter"&&handlePw()}
              placeholder={t.pwPlaceholder}
              style={{ width:"100%", border:`1px solid ${pwError?"#ef4444":"#e2e8f0"}`, borderRadius:8, padding:"10px 12px", fontSize:14, outline:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" }} />
            {pwError && <p style={{ fontSize:12, color:"#ef4444", marginBottom:8 }}>⚠️ {pwError}</p>}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowPw(false)} style={{ ...BO, flex:1 }}>{t.cancel}</button>
              <button onClick={handlePw} disabled={pwBusy||!pwInput.trim()} style={{ ...BP, flex:1, opacity:(pwBusy||!pwInput.trim())?0.5:1 }}>{pwBusy?t.verifying:t.enter}</button>
            </div>
          </div>
        </div>
      )}
 
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
