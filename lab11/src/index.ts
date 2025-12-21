import { ExportWrapper, compileModule } from "../../lab09";
import { parseFunnier } from "../../lab10";
import { verifyModule } from "./verifier";

export async function parseVerifyAndCompile(filename: string, source: string): Promise<Record<string, Function>> {
    const ast = parseFunnier(source, filename);
    await verifyModule(ast);
    const mod = await compileModule(ast);
    return new ExportWrapper(mod);
}
