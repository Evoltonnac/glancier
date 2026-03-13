import { z } from "zod";
import { SizeSchema, sizeImageClassMap } from "../shared/commonProps";

/**
 * Image Schema
 */
export const ImageSchema = z.object({
    type: z.literal("Image"),
    url: z.string(),
    altText: z.string().default(""),
    size: SizeSchema.default("md"),
});

export type ImageProps = z.infer<typeof ImageSchema>;

export function Image({ url, altText = "", size = "md" }: ImageProps) {
    return (
        <img
            src={url}
            alt={altText}
            className={`${sizeImageClassMap[size]} rounded-md object-cover`}
            onError={(e) => {
                e.currentTarget.src =
                    "data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"%3E%3Crect width=\"24\" height=\"24\" fill=\"%23e5e7eb\"/%3E%3C/svg%3E";
            }}
        />
    );
}
