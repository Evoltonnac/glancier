import { describe, expect, it } from "vitest";

import {
    isUnknownParameterDiagnostic,
    resolveDiagnosticSeverity,
} from "./integrationDiagnostics";

describe("integration diagnostics severity", () => {
    it("classifies unknown/additional parameter diagnostics as warning", () => {
        expect(
            isUnknownParameterDiagnostic({
                code: "additionalProperties",
                message: "Property extra_flag is not allowed",
            }),
        ).toBe(true);

        expect(
            resolveDiagnosticSeverity({
                code: "extra_forbidden",
                message: "Extra inputs are not permitted",
            }),
        ).toBe("warning");
    });

    it("keeps non-unknown validation diagnostics as error", () => {
        expect(
            isUnknownParameterDiagnostic({
                code: "string_type",
                message: "Input should be a valid string",
            }),
        ).toBe(false);

        expect(
            resolveDiagnosticSeverity({
                code: "string_type",
                message: "Input should be a valid string",
                markerSeverity: 8,
            }),
        ).toBe("error");
    });
});
