/**
 * Builder Agent (Агент 3)
 *
 * Читает derived-каталог компонентов из registry/index.json (генерится
 * автоматически из rules/components/*.rule.json — source of truth).
 * Получает промт дизайнера через --prompt, вызывает Claude API, который
 * выбирает компоненты ТОЛЬКО из каталога и формирует layout.json.
 *
 * После генерации показывает JSON дизайнеру на апрув.
 * Без APPROVE layout.json не записывается и Figma Implementer не запускается.
 *
 * Использование:
 *   npm run agent:build -- --prompt "собери экран оплаты"
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import readline from "readline";
import { Config, CatalogComponent, LayoutSpec } from "../../shared/types";

const ROOT = path.resolve(__dirname, "../../../");
const CONFIG_PATH = path.join(ROOT, "config.json");
const REGISTRY_INDEX_PATH = path.join(ROOT, "registry", "index.json");
const RULES_PATH = path.join(ROOT, "rules.md");
const SWAP_SLOTS_DIR = path.join(ROOT, "tokens", "swap-slots");
const PLANNER_RULES_PATH = path.join(ROOT, "config", "planner-rules.json");
const PROJECT_RULES_PATH = path.join(ROOT, "config", "project-rules.json");
const LAYOUT_OUTPUT = path.join(ROOT, "layout.json");

const MODEL = "claude-sonnet-4-6";

// Keywords that indicate which libraries are relevant for the prompt.
// base-components and system are always included.
const LIBRARY_KEYWORDS: Record<string, string[]> = {
  "buttons-tabs-chips": [
    "button", "кнопк", "tab", "таб", "chip", "чип", "scroll", "inline", "circle",
    "действи", "клик", "нажа",
  ],
  "cards-cells-views": [
    "card", "карточ", "cell", "ячейк", "list", "списк", "feed", "фид", "row", "строк",
    "item", "айтем", "элемент", "view",
  ],
  "inputs-search": [
    "input", "инпут", "search", "поиск", "поле", "field", "text", "area", "calendar",
    "форм", "ввод", "набор", "набира",
  ],
  "sheets-modules-wrappers": [
    "sheet", "шит", "bottom", "modal", "модал", "dropdown", "banner", "баннер",
    "wrapper", "module", "модул", "попап", "popup", "overlay",
  ],
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

function getPromptArg(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--prompt");
  if (idx === -1 || !args[idx + 1]) {
    throw new Error('Usage: npm run agent:build -- --prompt "describe the screen"');
  }
  return args[idx + 1];
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("config.json not found. Copy config.example.json and fill in your tokens.");
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Config;
}

function loadRules(): string {
  if (!fs.existsSync(RULES_PATH)) return "";
  return fs.readFileSync(RULES_PATH, "utf-8");
}

interface PlannerRules {
  preferApprovedOnly: boolean;
  excludeAssemblies: boolean;
}

interface ProjectRules {
  maxCTAsPerScreen: number;
  platforms: string[];
}

function loadPlannerRules(): PlannerRules {
  if (!fs.existsSync(PLANNER_RULES_PATH)) return { preferApprovedOnly: false, excludeAssemblies: false };
  return JSON.parse(fs.readFileSync(PLANNER_RULES_PATH, "utf-8")) as PlannerRules;
}

function loadProjectRules(): ProjectRules | null {
  if (!fs.existsSync(PROJECT_RULES_PATH)) return null;
  return JSON.parse(fs.readFileSync(PROJECT_RULES_PATH, "utf-8")) as ProjectRules;
}

// Loads swap-slots relevant to layout generation (skips raw icon lists).
// Returns a compact human-readable summary for the system prompt.
function loadSwapSlotsSummary(): string {
  if (!fs.existsSync(SWAP_SLOTS_DIR)) return "";

  const SKIP_IDS = new Set(["icons-12", "icons-16-20", "icons-24"]);
  const lines: string[] = ["PROP SLOTS (use these when setting component properties):"];

  for (const file of fs.readdirSync(SWAP_SLOTS_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(SWAP_SLOTS_DIR, file), "utf-8")) as Record<string, unknown>;
    const id = raw["id"] as string;
    if (SKIP_IDS.has(id)) continue;

    if (raw["type"] === "prop-template") {
      lines.push(`  ${id} → ${raw["propType"]} prop template`);
    } else if (id === "icon-glyph") {
      const variants = Object.keys(raw["variants"] as object).join(", ");
      const patterns = (raw["figmaPropNamePatterns"] as string[]).join(", ");
      lines.push(`  icon-glyph → INSTANCE_SWAP for icon props (${patterns}); sizes: ${variants}`);
    } else if (id === "system-component") {
      const names = ((raw["components"] as Array<{ name: string }>)).map((c) => c.name).join(", ");
      lines.push(`  system-component → INSTANCE_SWAP; options: ${names}`);
    }
  }

  return lines.join("\n");
}

/**
 * Reads registry/index.json — derived cache built from rules/components/*.rule.json.
 *
 * Schema:
 *   { components: { "<name>": [lib, key, type, tier, approved] },
 *     libraries:  { "<lib>": [fileKey, libName] } }
 *
 * (No `generatedAt` — derived caches don't carry build-time metadata.
 * For «last regenerated» use `git log -1 --format=%cI registry/index.json`.)
 *
 * Tuple position 3 (`tier`) ∈ {atom, composite, view} per schema. Mapping for
 * LLM-side `classificationDraft`: `view` → "assembly" (historical naming —
 * components combining other components: buttonsView, contentsView, etc),
 * others → "component". Position 4 (`approved`) controls
 * preferApprovedOnly filter.
 *
 * Rules with `deprecated: true` are excluded from index by genIndex — they
 * simply don't appear here.
 */
interface RegistryIndex {
  components: Record<string, [string, string, "c" | "s", string | null, boolean]>;
  libraries: Record<string, [string, string]>;
}

function loadAllComponents(plannerRules: PlannerRules): CatalogComponent[] {
  if (!fs.existsSync(REGISTRY_INDEX_PATH)) {
    throw new Error(
      'registry/index.json not found. Run "node tests/scripts/parseProps-utils.js gen-index" to build it from rules/components/.'
    );
  }

  const index = JSON.parse(fs.readFileSync(REGISTRY_INDEX_PATH, "utf-8")) as RegistryIndex;
  const all: CatalogComponent[] = [];

  for (const [name, tuple] of Object.entries(index.components)) {
    const [lib, key, type, tier, approved] = tuple;
    if (key === "missing") continue;
    if (plannerRules.preferApprovedOnly && !approved) continue;
    // tier === "view" in rules schema ≡ old classificationDraft === "assembly"
    // (component combining other components — buttonsView, contentsView, etc).
    const isAssembly = tier === "view" || tier === "assembly";
    if (plannerRules.excludeAssemblies && isAssembly) continue;

    const classificationDraft = isAssembly ? "assembly" : "component";

    all.push({
      id: name,
      name,
      libraryId: lib,
      componentKey: key,
      assetType: type === "s" ? "component_set" : "component",
      category: null,
      platforms: null,
      variants: {},
      componentProps: {},
      classificationDraft,
      reviewStatus: approved ? "approved" : "needs_review",
    });
  }

  return all;
}

// ─── Catalog filtering ────────────────────────────────────────────────────────

function filterComponentsByPrompt(components: CatalogComponent[], prompt: string): CatalogComponent[] {
  const lower = prompt.toLowerCase();

  const matchedLibs = new Set<string>(["base-components", "system"]);
  for (const [libId, keywords] of Object.entries(LIBRARY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matchedLibs.add(libId);
    }
  }

  // If no optional library matched, include everything (safe fallback)
  const hasOptionalMatch = [...matchedLibs].some((id) => !["base-components", "system"].includes(id));
  if (!hasOptionalMatch) {
    return components;
  }

  return components.filter((c) => matchedLibs.has(c.libraryId));
}

// ─── Catalog → prompt text ────────────────────────────────────────────────────

function buildCatalogText(components: CatalogComponent[]): string {
  const lines = components.map(
    (c) =>
      `[${c.libraryId}] ${c.name} | ${c.classificationDraft} | key:${c.componentKey}`
  );
  return lines.join("\n");
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SCHEMA_DOC = `
LAYOUT.JSON SCHEMA:
{
  "name": string,
  "frame": {
    "width": number,
    "height": number,
    "autolayout": {
      "direction": "HORIZONTAL" | "VERTICAL",
      "spacing": number,
      "padding": { "top": n, "right": n, "bottom": n, "left": n },
      "primaryAlign": "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN",
      "counterAlign": "MIN" | "MAX" | "CENTER",
      "primarySizing": "FIXED" | "AUTO",
      "counterSizing": "FIXED" | "AUTO"
    }
  },
  "layers": [
    {
      "type": "component",
      "componentKey": string,
      "name": string,
      "properties": { "Style": "Primary", "Size": "Large" },
      "sizing": { "horizontal": "FIXED"|"HUG"|"FILL", "vertical": "FIXED"|"HUG"|"FILL", "width": n, "height": n },
      "x": number, "y": number,
      "constraints": { "horizontal": "LEFT"|"RIGHT"|"CENTER"|"STRETCH"|"SCALE", "vertical": "TOP"|"BOTTOM"|"CENTER"|"STRETCH"|"SCALE" }
    },
    {
      "type": "frame",
      "name": string,
      "autolayout": { ... },
      "sizing": { ... },
      "layers": [ ... ]
    }
  ]
}

RULES:
1. componentKey taken ONLY from catalog — never invent keys.
2. Use autolayout everywhere possible — avoid absolute x/y.
3. Assembly components (classificationDraft: assembly) — use for containers and wrappers.
4. Reply with ONLY valid JSON, no markdown blocks, no explanations.
`;

// ─── Claude API call ──────────────────────────────────────────────────────────

async function generateLayout(
  prompt: string,
  config: Config,
  components: CatalogComponent[],
  rules: string,
  swapSlots: string,
  projectRules: ProjectRules | null
): Promise<LayoutSpec> {
  const client = new Anthropic({ apiKey: config.claudeApiKey });

  const filtered = filterComponentsByPrompt(components, prompt);
  const catalogText = buildCatalogText(filtered);

  const constraintsSection = projectRules
    ? `PROJECT CONSTRAINTS:\n- Max CTAs per screen: ${projectRules.maxCTAsPerScreen}\n- Platforms: ${projectRules.platforms.join(", ")}\n\n`
    : "";

  const rulesSection = rules ? `DESIGN SYSTEM RULES:\n${rules}\n\n` : "";
  const slotsSection = swapSlots ? `${swapSlots}\n\n` : "";

  const baseText =
    "You are a Figma layout assembler. Generate a layout.json using ONLY components from the catalog.\n\n" +
    constraintsSection +
    rulesSection +
    slotsSection +
    SCHEMA_DOC;

  process.stdout.write(`Calling ${MODEL} (${filtered.length}/${components.length} components)... `);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: baseText,
      },
      {
        type: "text",
        text: "COMPONENT CATALOG:\n" + catalogText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  console.log("done.");

  const usage = message.usage as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
    console.log(
      `  Tokens — input: ${usage.input_tokens}, output: ${usage.output_tokens}, ` +
      `cache_write: ${usage.cache_creation_input_tokens ?? 0}, cache_read: ${usage.cache_read_input_tokens ?? 0}`
    );
  }

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: LayoutSpec;
  try {
    parsed = JSON.parse(cleaned) as LayoutSpec;
  } catch {
    console.error("\nRaw response from Claude:\n", raw);
    throw new Error("Claude returned invalid JSON. See raw response above.");
  }

  if (!parsed.name || !parsed.frame || !Array.isArray(parsed.layers)) {
    throw new Error('Generated JSON is missing required fields: "name", "frame", "layers".');
  }

  return parsed;
}

// ─── Validate componentKeys ───────────────────────────────────────────────────

function validateKeys(layout: LayoutSpec, components: CatalogComponent[]): string[] {
  const knownKeys = new Set(components.map((c) => c.componentKey));
  const errors: string[] = [];

  function checkLayer(layer: { type: string; componentKey?: string; layers?: unknown[] }, path: string): void {
    if (layer.type === "component") {
      if (!layer.componentKey || !knownKeys.has(layer.componentKey)) {
        errors.push(`Unknown componentKey at ${path}: "${layer.componentKey}"`);
      }
    }
    if (Array.isArray(layer.layers)) {
      layer.layers.forEach((child, i) =>
        checkLayer(child as { type: string; componentKey?: string; layers?: unknown[] }, `${path}.layers[${i}]`)
      );
    }
  }

  layout.layers.forEach((layer, i) => checkLayer(layer, `layers[${i}]`));
  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Builder Agent ===\n");

  const prompt = getPromptArg();
  const config = loadConfig();
  const plannerRules = loadPlannerRules();
  const projectRules = loadProjectRules();
  const components = loadAllComponents(plannerRules);
  const rules = loadRules();
  const swapSlots = loadSwapSlotsSummary();

  console.log(`Catalog: ${components.length} components` +
    (plannerRules.preferApprovedOnly ? " (approved only)" : ""));
  if (rules) console.log(`Rules:   rules.md loaded (${rules.length} chars)`);
  if (projectRules) console.log(`Project: platforms=${projectRules.platforms.join(",")}, maxCTAs=${projectRules.maxCTAsPerScreen}`);
  console.log(`Prompt:  "${prompt}"\n`);

  const layout = await generateLayout(prompt, config, components, rules, swapSlots, projectRules);

  // Validate against full catalog (not filtered) to catch any key issues
  const keyErrors = validateKeys(layout, components);
  if (keyErrors.length > 0) {
    console.warn("\n⚠ Unknown componentKeys detected:");
    keyErrors.forEach((e) => console.warn(`  ${e}`));
    console.warn("These keys are not in the catalog and will fail in Figma.\n");
  }

  const formatted = JSON.stringify(layout, null, 2);

  console.log("\n📐 Generated layout:\n");
  console.log(formatted);

  // ─── APPROVE gate ──────────────────────────────────────────────────────────

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question("\nAPPROVE layout? [APPROVE / cancel]: ", resolve)
  );
  rl.close();

  if (answer.trim().toUpperCase() === "APPROVE") {
    fs.writeFileSync(LAYOUT_OUTPUT, formatted, "utf-8");
    console.log(`\n✓ layout.json written.`);
    console.log(`Next: run  npm run agent:implement\n`);
  } else {
    console.log("\n✗ Cancelled. Adjust your prompt and try again.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n✗ Builder Agent failed:");
  console.error(err.message);
  process.exit(1);
});
