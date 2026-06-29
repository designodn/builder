// ─── Config ───────────────────────────────────────────────────────────────────

export interface Config {
  claudeApiKey: string;
  dsFiles: string[];                        // fileKeys дизайн-системы
  dsFileNames?: Record<string, string>;     // опционально: { fileKey → имя файла }
  figmaPlanKey: string;                     // для create_new_file MCP
}

// ─── Library Catalog ──────────────────────────────────────────────────────────

export interface LibraryPages {
  include: string[];  // страницы для парсинга
  skip: string[];     // страницы-исключения (Архив, Sandbox и т.п.)
}

export interface Library {
  id: string;              // стабильный libraryId, совпадает с registryFolder
  name: string;
  fileKey: string;         // главный идентификатор вместе с id
  libraryKey?: string;     // опционально: только если нужен Library Analytics API
  enabled: boolean;
  priority: number | null;
  registryFolder: string;
  pages?: LibraryPages;   // заполняется при первичной сборке через MCP
  lastModified?: string;  // ISO timestamp — для инкрементальных обновлений
}

// ─── Component Catalog ────────────────────────────────────────────────────────

export type ReviewStatus = "approved" | "needs_review";
export type ClassificationDraft = "component" | "assembly";

export interface VariantProps {
  [propName: string]: string[];  // e.g. { "style": ["primary", "secondary"] }
}

export interface InstanceSwapAllowedComponent {
  id: string;          // локальный id из registry
  componentKey: string;
}

export interface InstanceSwapProp {
  type: "INSTANCE_SWAP";
  figmaPropName: string;   // точное имя свойства в Figma
  /**
   * Ссылка на переиспользуемый слот из tokens/swap-slots/<slotId>.json.
   * Если задан — allowedComponents не нужен (берётся из слота).
   */
  swapSlotId?: string;
  /** Явный список, если слот не используется или нужно переопределить */
  allowedComponents?: InstanceSwapAllowedComponent[];
}

/**
 * Булевое свойство компонента.
 * Устанавливается через instance.setProperties({ figmaPropName: true/false }).
 */
export interface BooleanProp {
  type: "BOOLEAN";
  figmaPropName: string;
  defaultValue: boolean;
  /**
   * Ссылка на шаблон из tokens/swap-slots/<id>.json с type="prop-template".
   * Правила использования — в rules.md.
   */
  propTemplateId?: string;
  /**
   * Если этот boolean включает иконку/слот — ссылка на swap-слот,
   * компоненты которого используются внутри.
   */
  linkedSwapSlot?: string;
}

/**
 * Текстовое свойство компонента.
 * Устанавливается через instance.setProperties({ figmaPropName: "текст" }).
 */
export interface TextProp {
  type: "TEXT";
  figmaPropName: string;
  defaultValue: string;
  propTemplateId?: string;
}

export interface ComponentProps {
  [propName: string]: string | InstanceSwapProp | BooleanProp | TextProp;
}

// ─── Swap Slots ───────────────────────────────────────────────────────────────

/**
 * Переиспользуемое определение слота для INSTANCE_SWAP.
 * Хранится в tokens/swap-slots/<id>.json.
 */
export interface InstanceSwapSlot {
  id: string;
  type?: "swap-slot";  // default, можно не указывать
  description: string;
  /**
   * "naming-convention" — компоненты находятся в рантайме по имени
   *   (prefix + baseName + namingSuffix) в указанном Figma-файле.
   * "explicit" — список компонентов задан явно в поле components[].
   */
  resolveStrategy: "naming-convention" | "explicit";
  /** Для naming-convention: fileKey источника */
  sourceFileKey?: string;
  sourceNodeId?: string;
  /** Суффикс имени компонента: "_12", "_16_20", "_24" и т.п. */
  namingSuffix?: string;
  /** Вариант iconGlyph, с которым совместим слот */
  iconGlyphVariant?: string;
  /** Swap-проп внутри iconGlyph для этого слота */
  iconGlyphSwapProp?: string;
  /** Для explicit: явный список компонентов */
  components?: InstanceSwapAllowedComponent[];
}

/**
 * Шаблон поведения для BOOLEAN или TEXT пропа.
 * Хранится в tokens/swap-slots/<id>.json с type="prop-template".
 * Позволяет переиспользовать описание одного паттерна в разных компонентах
 * через BooleanProp.propTemplateId / TextProp.propTemplateId.
 */
export interface PropTemplate {
  id: string;
  type: "prop-template";
  propType: "BOOLEAN" | "TEXT";
  // Описание — в rules.md, секция "Шаблоны пропов"
}

/** Объединение всех типов файлов в tokens/swap-slots/ */
export type SwapSlot = InstanceSwapSlot | PropTemplate;

// ─── Icon Catalog ─────────────────────────────────────────────────────────────

/**
 * Правила маппинга суффикса имени иконки → размеры iconGlyph:
 *   _12      → [12]
 *   _16_20   → [16, 20]
 *   _24      → [24, 32, 48]
 */
export interface IconEntry {
  /** Базовое имя без префикса и суффикса: "feed", "search", "arrow_right" */
  name: string;
  /** Оригинальное имя компонента в Figma: "glyph_feed_24" */
  figmaName: string;
  /** componentKey для figma.importComponentByKeyAsync() */
  componentKey: string;
  /** Размеры iconGlyph, с которыми совместима эта иконка */
  sizes: number[];
}

export interface IconRegistry {
  updatedAt: string;
  sourceFileKey: string;
  icons: IconEntry[];
}

// ─── Composition ──────────────────────────────────────────────────────────────

/** Ссылка на вложенный компонент из каталога */
export interface CompositionRef {
  role: string;              // роль внутри родителя: "icon", "badge", "label" и т.п.
  componentId: string;       // id из каталога (libraryId--slug)
  componentKey: string;      // componentKey для importComponentByKeyAsync
  note?: string;             // необязательный комментарий
}

export interface CatalogComponent {
  id: string;
  name: string;
  libraryId: string;
  /**
   * Импортируемый ключ компонента. Импорт **всегда** через
   *   figma.importComponentByKeyAsync(componentKey)
   * — независимо от assetType.
   *
   * Для assetType === "component_set" это ключ ПЕРВОГО ВАРИАНТА сета,
   * НЕ ключ самого сета. Это сделано, чтобы импорт был унифицированным.
   */
  componentKey: string | "missing";
  /**
   * Метаданные: что это было в Figma исходно.
   *   "component"     — обычный компонент.
   *   "component_set" — был сетом; ключ хранит variant-key default'а,
   *                     остальные варианты переключаются через
   *                     instance.setProperties({ <axis>: '<value>' }).
   * На путь импорта НЕ влияет — он всегда importComponentByKeyAsync.
   */
  assetType?: "component" | "component_set";
  category: string | null;
  platforms: string[] | null;
  variants: VariantProps;
  componentProps: ComponentProps;
  classificationDraft: ClassificationDraft;
  reviewStatus: ReviewStatus;
  /** Вложенные компоненты из каталога, используемые внутри */
  composition?: CompositionRef[];
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface AutolayoutSpec {
  direction: "HORIZONTAL" | "VERTICAL";
  spacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /** Выравнивание по основной оси */
  primaryAlign: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  /** Выравнивание по поперечной оси */
  counterAlign: "MIN" | "MAX" | "CENTER";
  /** Размер фрейма по основной оси: FIXED = задан, AUTO = hug contents */
  primarySizing: "FIXED" | "AUTO";
  /** Размер фрейма по поперечной оси */
  counterSizing: "FIXED" | "AUTO";
}

export interface SizingSpec {
  horizontal: "FIXED" | "HUG" | "FILL";
  vertical: "FIXED" | "HUG" | "FILL";
  /** Обязателен если horizontal === "FIXED" */
  width?: number;
  /** Обязателен если vertical === "FIXED" */
  height?: number;
}

export interface ConstraintsSpec {
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "STRETCH" | "SCALE";
  vertical: "TOP" | "BOTTOM" | "CENTER" | "STRETCH" | "SCALE";
}

/** Слой-инстанс компонента */
export interface ComponentLayer {
  type: "component";
  componentKey: string;
  name: string;
  /** Variant / component properties */
  properties?: Record<string, string | boolean>;
  /** Sizing внутри autolayout-родителя */
  sizing?: SizingSpec;
  /** Позиция при абсолютном размещении (когда родитель без autolayout) */
  x?: number;
  y?: number;
  constraints?: ConstraintsSpec;
}

/** Слой-фрейм (обёртка, секция, строка и т.п.) */
export interface FrameLayer {
  type: "frame";
  name: string;
  autolayout?: AutolayoutSpec;
  sizing?: SizingSpec;
  x?: number;
  y?: number;
  constraints?: ConstraintsSpec;
  layers: LayoutLayer[];
}

export type LayoutLayer = ComponentLayer | FrameLayer;

export interface LayoutFrame {
  width: number;
  height: number;
  autolayout?: AutolayoutSpec;
}

export interface LayoutSpec {
  name: string;
  frame: LayoutFrame;
  layers: LayoutLayer[];
}
