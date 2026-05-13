import { APP_FONT_OPTIONS, EDIT_FONT_OPTIONS } from "../../../domain/editorPreferences";
import { invokeTauriCommand } from "../../../infra/tauriCommand";
import { isTauri } from "../../../runtime/runtime";

type LocalFontMetadata = {
  readonly family: string;
  readonly fullName?: string;
  readonly postscriptName?: string;
  readonly style?: string;
};

type LocalFontWindow = Window & {
  readonly queryLocalFonts?: () => Promise<readonly LocalFontMetadata[]>;
};

const FALLBACK_FONT_FAMILIES: readonly string[] = [
  "Aptos",
  "Segoe UI",
  "Yu Gothic",
  "Yu Gothic UI",
  "Meiryo",
  "MS Gothic",
  "MS PGothic",
  "BIZ UDPGothic",
  "BIZ UDMincho",
  "Noto Sans JP",
  "Noto Serif JP",
  "Arial",
  "Calibri",
  "Cambria",
  "Consolas",
  "Cascadia Code",
  "Times New Roman",
];

let cachedFontFamilies: readonly string[] | null = null;
let pendingFontFamilies: Promise<readonly string[]> | null = null;

export async function loadLocalFontFamilies(): Promise<readonly string[]> {
  if (cachedFontFamilies !== null) {
    return cachedFontFamilies;
  }

  if (pendingFontFamilies !== null) {
    return pendingFontFamilies;
  }

  pendingFontFamilies = queryInstalledFontFamilies()
    .then((installedFontFamilies) => {
      cachedFontFamilies = normalizeFontFamilies([
        ...installedFontFamilies,
        ...fallbackFontFamilies(),
      ]);
      return cachedFontFamilies;
    })
    .catch(() => {
      cachedFontFamilies = fallbackFontFamilies();
      return cachedFontFamilies;
    })
    .finally(() => {
      pendingFontFamilies = null;
    });

  return pendingFontFamilies;
}

async function queryInstalledFontFamilies(): Promise<readonly string[]> {
  if (isTauri()) {
    return invokeTauriCommand<readonly string[]>(
      "list_system_font_families",
      {},
      "PC内フォント一覧の取得に失敗しました。",
    );
  }

  const queryLocalFonts = (window as LocalFontWindow).queryLocalFonts;

  if (typeof queryLocalFonts !== "function") {
    return [];
  }

  const localFonts = await queryLocalFonts.call(window);

  return localFonts.map((font) => font.family);
}

function fallbackFontFamilies(): readonly string[] {
  return normalizeFontFamilies([
    ...FALLBACK_FONT_FAMILIES,
    ...APP_FONT_OPTIONS.map((fontOption) => fontOption.value),
    ...EDIT_FONT_OPTIONS.map((fontOption) => fontOption.value),
  ]);
}

function normalizeFontFamilies(fontFamilies: readonly string[]): readonly string[] {
  return Array.from(
    new Map(
      fontFamilies
        .flatMap(splitFontFamilyList)
        .map((fontFamily) => fontFamily.trim())
        .filter(isUsableFontFamily)
        .map((fontFamily) => [fontFamily.toLocaleLowerCase("ja-JP"), fontFamily] as const),
    ).values(),
  ).sort((left, right) => left.localeCompare(right, "ja-JP"));
}

function splitFontFamilyList(fontFamily: string): readonly string[] {
  return fontFamily
    .split(",")
    .map((value) => value.trim().replace(/^["']|["']$/gu, ""));
}

function isUsableFontFamily(fontFamily: string): boolean {
  return fontFamily.length > 0
    && !/[\\;{}<>]/u.test(fontFamily)
    && !/[\u0000-\u001f\u007f]/u.test(fontFamily);
}
