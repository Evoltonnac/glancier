import { describe, expect, it } from "vitest";
import { evaluateTemplate } from "./utils";

describe("evaluateTemplate escaping", () => {
    it("keeps escaped braces as literals", () => {
        const output = evaluateTemplate("\\{value\\}", { value: 42 });
        expect(output).toBe("{value}");
    });

    it("supports escaped braces mixed with template expressions", () => {
        const output = evaluateTemplate(
            "raw=\\{value\\}, resolved={value}",
            { value: 42 },
        );
        expect(output).toBe("raw={value}, resolved=42");
    });

    it("supports escaped backslash while still resolving expressions", () => {
        const output = evaluateTemplate("path=C:\\\\{user}", {
            user: "alice",
        });
        expect(output).toBe("path=C:\\alice");
    });

    it("keeps placeholder literal when escaped backslash appears before closing brace", () => {
        const output = evaluateTemplate("\\\\{data_path\\\\}", {
            data_path: "/tmp/data.json",
        });
        expect(output).toBe("\\{data_path\\}");
    });

    it("handles escaped literal braces from YAML (quoted/unquoted converge)", () => {
        const output = evaluateTemplate("\\{data_path\\}", {
            data_path: "/tmp/data.json",
        });
        expect(output).toBe("{data_path}");
    });

    it("handles escaped backslash plus expression", () => {
        const output = evaluateTemplate("\\\\{data_path}", {
            data_path: "/tmp/data.json",
        });
        expect(output).toBe("\\/tmp/data.json");
    });
});
