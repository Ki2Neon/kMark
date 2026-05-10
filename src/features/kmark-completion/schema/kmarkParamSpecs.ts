import { type KmarkParamSpec } from "../core/types";
import kmarkParamSchemaJson from "./kmark-param-schema.json";

export type KmarkParamSchema = {
  readonly schemaVersion: number;
  readonly params: readonly KmarkParamSpec[];
};

export const KMARK_PARAM_SCHEMA = kmarkParamSchemaJson as KmarkParamSchema;
export const KMARK_PARAM_SPECS = KMARK_PARAM_SCHEMA.params;
