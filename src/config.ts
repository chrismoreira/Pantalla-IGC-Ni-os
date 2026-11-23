export type ActiveScreen = 'antes' | 'vivo' | 'despues';
export type ModeSetting = 'auto' | ActiveScreen;

export interface AnnouncementItem {
  dia: string;
  mes: string;
  titulo: string;
  detalle: string;
}

export interface SignageContent {
  recordatorios: string[];
  temaHoy: {
    titulo: string;
    detalle: string;
  };
  avisoEquipo: {
    titulo: string;
    detalle: string;
  };
  eventosProximos: AnnouncementItem[];
  anunciosDespues: AnnouncementItem[];
  versiculoDespues: {
    texto: string;
    cita: string;
  };
}

export interface SignageConfig {
  churchName: string;
  ministryName: string;
  city: string;
  timezone: string;
  schedule: {
    serviceDay: number; // 0 = Domingo
    serviceHour: number; // 9 = 9:00 a. m.
    serviceMinute: number;
    durationMinutes: number; // 150 min (2h 30min)
    preWindowMinutes: number; // 90 min antes
    /** Max minutes to keep `despues` after the live stream actually ended. */
    postDespuesMinutes: number;
  };
  youtube: {
    channelId: string;
    channelHandle: string;
    streamsUrl: string;
    apiKey: string;
    pollIntervalMs: number;
    endDelaySeconds: number;
  };
  sheets: {
    googleSheetCsvUrl: string;
    pollIntervalMs: number;
  };
  momentos: string[];
  recordatorioEntrega: string;
  forcedMode: ModeSetting;
  kioskPin: string;
  features: {
    showTemasYAnuncios: boolean;
    showMomentosSidebar: boolean;
  };
  defaults: SignageContent;
}

export const CONFIG: SignageConfig = {
  churchName: 'Iglesia Gran Comisión',
  ministryName: 'Cuidado de niños',
  city: 'San Salvador',
  timezone: 'America/El_Salvador',
  schedule: {
    serviceDay: 0,
    serviceHour: 9,
    serviceMinute: 0,
    durationMinutes: 150,
    preWindowMinutes: 90,
    postDespuesMinutes: 60,
  },
  youtube: {
    channelId: 'UC78ofRM0f1O4Sg8TWOc6FHg',
    channelHandle: '@iglesiagrancomisionsansalv5614',
    streamsUrl: 'https://www.youtube.com/@iglesiagrancomisionsansalv5614/streams',
    apiKey: '',
    pollIntervalMs: 90_000,
    endDelaySeconds: 60,
  },
  sheets: {
    googleSheetCsvUrl: '',
    pollIntervalMs: 300_000,
  },
  momentos: [
    'Bienvenida',
    'Alabanza',
    'Anuncios y ofrenda',
    'Prédica',
    'Oración final',
    'Despedida',
  ],
  recordatorioEntrega:
    'Recuerda entregar a cada niño únicamente a la persona que lo registró, verificando el brazalete correspondiente.',
  forcedMode: 'auto',
  kioskPin: '1914',
  features: {
    showTemasYAnuncios: false,
    showMomentosSidebar: false,
  },
  defaults: {
    recordatorios: [
      'Confirmar registro de cada niño y colocar brazalete de identificación al ingresar.',
      'Mantener botellas de agua y loncheras debidamente rotuladas en el área asignada.',
      'Desinfectar mesas, colchonetas y juguetes antes y después del servicio.',
      'Notificar de inmediato a coordinación si un niño requiere atención de sus padres.',
    ],
    temaHoy: {
      titulo: 'Jesús, el Buen Pastor que cuida de nosotros',
      detalle: 'Juan 10:11 · Historia bíblica, manualidad y tiempo de oración por grupos de edad.',
    },
    avisoEquipo: {
      titulo: 'Aviso al equipo',
      detalle:
        'Mantener las puertas de los salones aseguradas durante la prédica y verificar brazaletes en la entrega.',
    },
    eventosProximos: [
      {
        dia: '01',
        mes: 'DIC',
        titulo: 'Capacitación de voluntarios',
        detalle: 'Salón de niños · 8:00 a. m. — Repaso de protocolos y primeros auxilios.',
      },
      {
        dia: '08',
        mes: 'DIC',
        titulo: 'Domingo familiar IGC',
        detalle: 'Actividades especiales y bienvenida para nuevas familias.',
      },
      {
        dia: '15',
        mes: 'DIC',
        titulo: 'Presentación navideña de niños',
        detalle: 'Ensayo general al finalizar el servicio en el auditorio principal.',
      },
      {
        dia: '22',
        mes: 'DIC',
        titulo: 'Servicio especial de Navidad',
        detalle: 'Horario regular 9:00 a. m. · Cuidado de niños habilitado desde las 8:30 a. m.',
      },
    ],
    anunciosDespues: [
      {
        dia: '01',
        mes: 'DIC',
        titulo: 'Reunión mensual del equipo',
        detalle: 'Breve encuentro de oración y organización al finalizar el servicio en Salón 2.',
      },
      {
        dia: '08',
        mes: 'DIC',
        titulo: 'Domingo de bienvenida familiar',
        detalle: 'Refuerzo en mesa de registro de 8:15 a. m. a 9:15 a. m. para familias nuevas.',
      },
      {
        dia: '15',
        mes: 'DIC',
        titulo: 'Inventario y orden de salones',
        detalle: 'Revisión de materiales de manualidades y reposición de insumos de higiene.',
      },
    ],
    versiculoDespues: {
      texto:
        '«Dejen que los niños vengan a mí, y no se lo impidan, porque el reino de los cielos es de quienes son como ellos.»',
      cita: 'Mateo 19:14',
    },
  },
};

export interface RuntimeOverrides {
  schedule?: SignageConfig['schedule'];
  youtube?: {
    channelId: string;
    channelHandle: string;
    streamsUrl: string;
    apiKey: string;
  };
  sheets?: {
    googleSheetCsvUrl: string;
  };
  recordatorioEntrega?: string;
  forcedMode?: ModeSetting;
  kioskPin?: string;
  updatedAt?: number;
  features?: {
    showTemasYAnuncios?: boolean;
    showMomentosSidebar?: boolean;
  };
  content?: SignageContent;
}

export function sanitizeKioskPin(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, 8);
  return /^\d{4,8}$/.test(digits) ? digits : CONFIG.kioskPin;
}

export function mergeWithRuntimeConfig(
  overrides: RuntimeOverrides | null | undefined,
): SignageConfig {
  if (!overrides) return CONFIG;
  return {
    ...CONFIG,
    schedule: {
      ...CONFIG.schedule,
      ...(overrides.schedule ?? {}),
    },
    youtube: {
      ...CONFIG.youtube,
      ...(overrides.youtube ?? {}),
    },
    sheets: {
      ...CONFIG.sheets,
      ...(overrides.sheets ?? {}),
    },
    recordatorioEntrega:
      overrides.recordatorioEntrega ?? CONFIG.recordatorioEntrega,
    forcedMode: overrides.forcedMode ?? CONFIG.forcedMode,
    kioskPin: overrides.kioskPin
      ? sanitizeKioskPin(overrides.kioskPin)
      : CONFIG.kioskPin,
    features: {
      ...CONFIG.features,
      ...(overrides.features ?? {}),
    },
    defaults: overrides.content ?? CONFIG.defaults,
  };
}

declare global {
  interface Window {
    IGCKiosk?: {
      isNativeKiosk?: () => boolean;
      setExitPin?: (pin: string) => void;
      requestExitWithPin?: () => void;
    };
  }
}

