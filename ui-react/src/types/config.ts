// Frontend config and API response types aligned with current backend/runtime schema.

export type AuthType = "api_key" | "browser" | "oauth" | "none";

export type StepType =
    | "http"
    | "oauth"
    | "api_key"
    | "curl"
    | "extract"
    | "script"
    | "log"
    | "webview";

export interface StepConfig {
    id: string;
    run?: string;
    use: StepType;
    args?: Record<string, unknown>;
    outputs?: Record<string, string>;
    context?: Record<string, string>;
    secrets?: Record<string, string>;
}

export interface SourceConfig {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    enabled?: boolean;
    integration?: string;
    vars?: Record<string, unknown>;
    flow?: StepConfig[];
}

export type SourceStatus =
    | "active"
    | "error"
    | "suspended"
    | "disabled"
    | "config_changed"
    | "refreshing";

export type InteractionType =
    | "input_text"
    | "oauth_start"
    | "oauth_device_flow"
    | "captcha"
    | "confirm"
    | "webview_scrape"
    | "retry"
    | "cookies_refresh";

export interface InteractionField {
    key: string;
    label: string;
    type: string;
    description?: string;
    required: boolean;
    default?: unknown;
}

export interface InteractionRequest {
    type: InteractionType;
    step_id?: string;
    source_id?: string;
    title?: string;
    message?: string;
    warning_message?: string;
    fields: InteractionField[];
    data?: Record<string, any>;
}

export interface SourceSummary {
    id: string;
    name: string;
    integration_id?: string;
    description: string;
    icon?: string;
    enabled: boolean;
    auth_type: AuthType | string;
    has_data: boolean;
    updated_at?: number;
    error?: string;
    error_details?: string;
    status: SourceStatus;
    message?: string;
    interaction?: InteractionRequest;
}

export interface DataResponse {
    source_id: string;
    data: Record<string, unknown> | null;
    updated_at?: number;
    error?: string;
    message?: string;
}

export interface HistoryRecord {
    source_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

export interface AuthStatus {
    source_id: string;
    auth_type: string;
    status: "ok" | "error" | "missing" | "expired" | "pending";
    message?: string;
    device?: Record<string, unknown>;
}

export interface SourceState {
    source_id: string;
    status: SourceStatus;
    message?: string;
    last_updated: number;
    interaction?: InteractionRequest;
}

export type SduiWidgetType =
    | "Container"
    | "ColumnSet"
    | "Column"
    | "List"
    | "TextBlock"
    | "FactSet"
    | "Image"
    | "Badge"
    | "Progress"
    | "ActionSet"
    | "Action.OpenUrl"
    | "Action.Copy";

export interface SduiWidgetBase {
    type: SduiWidgetType;
    area?: string;
}

export interface SduiContainerWidget extends SduiWidgetBase {
    type: "Container";
    items: SduiWidget[];
    spacing?: "none" | "sm" | "md" | "lg";
    align_y?: "start" | "center" | "end";
}

export interface SduiColumnSetWidget extends SduiWidgetBase {
    type: "ColumnSet";
    columns: SduiColumnWidget[];
    spacing?: "none" | "sm" | "md" | "lg";
    align_x?: "start" | "center" | "end";
}

export interface SduiColumnWidget extends SduiWidgetBase {
    type: "Column";
    items: SduiWidget[];
    width?: "auto" | "stretch" | number;
    align_y?: "start" | "center" | "end";
    spacing?: "none" | "sm" | "md" | "lg";
}

export interface SduiListWidget extends SduiWidgetBase {
    type: "List";
    data_source: string;
    item_alias: string;
    render: SduiWidget[];
    layout?: "col" | "grid";
    columns?: number;
    spacing?: "none" | "sm" | "md" | "lg";
    filter?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    limit?: number;
    pagination?: boolean;
    page_size?: number;
}

export interface SduiTextBlockWidget extends SduiWidgetBase {
    type: "TextBlock";
    text: string | number | boolean;
    size?: "sm" | "md" | "lg" | "xl";
    weight?: "normal" | "medium" | "semibold" | "bold";
    tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
    align_x?: "start" | "center" | "end";
    wrap?: boolean;
    maxLines?: number;
    max_lines?: number;
}

export interface SduiFactSetWidget extends SduiWidgetBase {
    type: "FactSet";
    facts: Array<{
        label: string | number;
        value: string | number;
        tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
    }>;
    spacing?: "none" | "sm" | "md" | "lg";
}

export interface SduiImageWidget extends SduiWidgetBase {
    type: "Image";
    url: string;
    altText?: string;
    size?: "sm" | "md" | "lg" | "xl";
}

export interface SduiBadgeWidget extends SduiWidgetBase {
    type: "Badge";
    text: string | number;
    tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
    size?: "sm" | "md" | "lg" | "xl";
}

export interface SduiProgressWidget extends SduiWidgetBase {
    type: "Progress";
    value: number | string;
    label?: string | number;
    style?: "bar" | "ring";
    size?: "sm" | "md" | "lg" | "xl";
    tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
    showPercentage?: boolean;
    thresholds?: {
        warning?: number | string;
        danger?: number | string;
    };
}

export interface SduiActionOpenUrlWidget extends SduiWidgetBase {
    type: "Action.OpenUrl";
    title: string;
    url: string;
    size?: "sm" | "md" | "lg" | "xl";
    tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
}

export interface SduiActionCopyWidget extends SduiWidgetBase {
    type: "Action.Copy";
    title: string;
    text: string;
    size?: "sm" | "md" | "lg" | "xl";
    tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
}

export interface SduiActionSetWidget extends SduiWidgetBase {
    type: "ActionSet";
    actions: Array<SduiActionOpenUrlWidget | SduiActionCopyWidget>;
    align_x?: "start" | "center" | "end";
    spacing?: "none" | "sm" | "md" | "lg";
}

export type SduiWidget =
    | SduiContainerWidget
    | SduiColumnSetWidget
    | SduiColumnWidget
    | SduiListWidget
    | SduiTextBlockWidget
    | SduiFactSetWidget
    | SduiImageWidget
    | SduiBadgeWidget
    | SduiProgressWidget
    | SduiActionSetWidget
    | SduiActionOpenUrlWidget
    | SduiActionCopyWidget;

export type ViewComponentType = "source_card";

export interface ViewComponent {
    id: string;
    type: ViewComponentType;
    source_id?: string;
    field?: string;
    icon?: string;
    label?: string;
    format?: string;
    delta_field?: string;
    ui?: {
        title: string;
        icon?: string;
        status_field?: string;
    };
    widgets?: SduiWidget[];
    use_group?: string;
    group_vars?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ViewItem {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    source_id: string;
    template_id: string;
    props: Record<string, unknown>;
}

export interface StoredView {
    id: string;
    name: string;
    layout_columns: number;
    items: ViewItem[];
}
