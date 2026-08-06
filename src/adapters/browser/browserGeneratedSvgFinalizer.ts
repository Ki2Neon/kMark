import {
  type FinalizeGeneratedSvgRequestPayload,
  type FinalizeGeneratedSvgResultPayload,
} from "../../contracts/generated";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { isTauri } from "../../runtime/runtime";
import { finalizeGeneratedSvgWithWasm } from "../../wasm/kmarkWeb";

const FINALIZE_GENERATED_SVG_COMMAND = "finalize_generated_svg";

export async function finalizeGeneratedSvg(
  request: FinalizeGeneratedSvgRequestPayload,
): Promise<FinalizeGeneratedSvgResultPayload> {
  if (!isTauri()) {
    return finalizeGeneratedSvgWithWasm(request);
  }
  return invokeTauriCommand<FinalizeGeneratedSvgResultPayload>(
    FINALIZE_GENERATED_SVG_COMMAND,
    { request },
    "SVGの安全化に失敗しました。",
  );
}
