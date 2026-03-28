export type IntegrationDiagnosticSeverity = "error" | "warning";

export interface IntegrationDiagnostic {
    source: "backend" | "editor";
    message: string;
    code?: string;
    line?: number;
    column?: number;
    fieldPath?: string;
    severity: IntegrationDiagnosticSeverity;
}

const UNKNOWN_PARAMETER_CODE_PATTERNS = [
    "additionalproperties",
    "extra_forbidden",
    "unrecognized_keys",
    "unevaluatedproperties",
];

const UNKNOWN_PARAMETER_MESSAGE_PATTERNS = [
    /additional propert(?:y|ies)/i,
    /extra inputs are not permitted/i,
    /extra fields? not permitted/i,
    /unknown (?:field|property|key)/i,
    /unrecognized (?:field|property|key)/i,
    /property .+ is not allowed/i,
    /unexpected (?:field|property|key)/i,
];

export function isUnknownParameterDiagnostic(params: {
    code?: string;
    message?: string;
}): boolean {
    const normalizedCode = String(params.code ?? "")
        .trim()
        .toLowerCase();
    if (
        normalizedCode &&
        UNKNOWN_PARAMETER_CODE_PATTERNS.some((pattern) =>
            normalizedCode.includes(pattern),
        )
    ) {
        return true;
    }

    const message = String(params.message ?? "").trim();
    if (!message) {
        return false;
    }
    return UNKNOWN_PARAMETER_MESSAGE_PATTERNS.some((pattern) =>
        pattern.test(message),
    );
}

export function resolveDiagnosticSeverity(params: {
    code?: string;
    message?: string;
    markerSeverity?: number;
}): IntegrationDiagnosticSeverity {
    if (isUnknownParameterDiagnostic(params)) {
        return "warning";
    }

    // Monaco marker severity enum: Hint=1, Info=2, Warning=4, Error=8.
    if (typeof params.markerSeverity === "number" && params.markerSeverity < 8) {
        return "warning";
    }

    return "error";
}
