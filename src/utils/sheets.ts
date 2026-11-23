import { AnnouncementItem, CONFIG, SignageContent } from '../config';

function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const clean = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function mapCsvToSignageContent(
  csvText: string,
  fallback: SignageContent = CONFIG.defaults,
): SignageContent {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return fallback;
  }

  const headers = matrix[0].map(normalizeKey);
  const idxTipo = headers.indexOf('tipo');
  const idxTitulo = headers.indexOf('titulo');
  const idxDetalle = headers.indexOf('detalle');
  const idxDia = headers.indexOf('dia');
  const idxMes = headers.indexOf('mes');

  if (idxTipo === -1 || idxTitulo === -1) {
    return fallback;
  }

  const recordatorios: string[] = [];
  const eventosProximos: AnnouncementItem[] = [];
  const anunciosDespues: AnnouncementItem[] = [];
  let temaHoy = fallback.temaHoy;
  let avisoEquipo = fallback.avisoEquipo;
  let versiculoDespues = fallback.versiculoDespues;

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const tipo = normalizeKey(cols[idxTipo] ?? '');
    const titulo = (cols[idxTitulo] ?? '').trim();
    const detalle = idxDetalle >= 0 ? (cols[idxDetalle] ?? '').trim() : '';
    const dia = idxDia >= 0 ? (cols[idxDia] ?? '').trim() : '';
    const mes = idxMes >= 0 ? (cols[idxMes] ?? '').trim().toUpperCase() : '';

    if (!tipo || !titulo) continue;

    if (tipo === 'recordatorio' || tipo === 'recordatorios') {
      recordatorios.push(detalle ? `${titulo}: ${detalle}` : titulo);
    } else if (tipo === 'tema') {
      temaHoy = { titulo, detalle: detalle || fallback.temaHoy.detalle };
    } else if (tipo === 'aviso') {
      avisoEquipo = {
        titulo: titulo || fallback.avisoEquipo.titulo,
        detalle: detalle || fallback.avisoEquipo.detalle,
      };
    } else if (tipo === 'evento' || tipo === 'proximamente') {
      eventosProximos.push({
        dia: dia || '--',
        mes: mes || 'IGC',
        titulo,
        detalle,
      });
    } else if (tipo === 'anuncio' || tipo === 'anuncios') {
      anunciosDespues.push({
        dia: dia || '--',
        mes: mes || 'IGC',
        titulo,
        detalle,
      });
    } else if (tipo === 'versiculo') {
      versiculoDespues = {
        texto: detalle || titulo,
        cita: detalle ? titulo : fallback.versiculoDespues.cita,
      };
    }
  }

  return {
    recordatorios:
      recordatorios.length > 0 ? recordatorios : fallback.recordatorios,
    temaHoy,
    avisoEquipo,
    eventosProximos:
      eventosProximos.length > 0 ? eventosProximos : fallback.eventosProximos,
    anunciosDespues:
      anunciosDespues.length > 0
        ? anunciosDespues.slice(0, 3)
        : fallback.anunciosDespues,
    versiculoDespues,
  };
}

export async function fetchSignageFromGoogleSheet(
  csvUrl: string,
  fallback: SignageContent = CONFIG.defaults,
): Promise<SignageContent> {
  if (!csvUrl.trim()) {
    return fallback;
  }

  try {
    const separator = csvUrl.includes('?') ? '&' : '?';
    const url = `${csvUrl}${separator}_t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return fallback;
    }
    const text = await response.text();
    return mapCsvToSignageContent(text, fallback);
  } catch {
    return fallback;
  }
}
