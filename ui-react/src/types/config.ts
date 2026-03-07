// TypeScript 类型定义，镜像 Python Pydantic 模型

export type AuthType = "api_key" | "browser" | "oauth" | "none";
export type ParserType = "jsonpath" | "css" | "regex" | "script";
export type HttpMethod = "GET" | "POST";

// Extended component types for high information density
export type ViewComponentType =
    | "metric"
    | "line_chart"
    | "bar_chart"
    | "table"
    | "json"
    | "progress_bar"
    | "stat_grid"
    | "badge"
    | "mini_chart"
    | "source_card";
export type ViewLayoutType = "columns" | "tabs";

export interface FieldMapping {
    name: string;
    expr: string;
    type: string;
}
export interface WidgetConfigBase {
    type: string;
    area?: string;
    /**
     * Proportional row-height weight used to distribute vertical space among sibling
     * widgets inside a card.  Rendered as flex: <row_span> on the wrapper element.
     * Default fallback by type: hero_metric=2, progress_bar=1, key_value_grid=2, list=2.
     */
    row_span?: number;
}

export interface HeroMetricWidget extends WidgetConfigBase {
    type: "hero_metric";
    amount: string;
    currency?: string;
    prefix?: string;
    delta?: string;
}

export interface KeyValueGridWidget extends WidgetConfigBase {
    type: "key_value_grid";
    items: Record<string, string>;
}

export interface ProgressBarWidget extends WidgetConfigBase {
    type: "progress_bar";
    title?: string;
    usage: string;
    limit: string;
    color_thresholds?: {
        warning_percent?: number;
        critical_percent?: number;
    };
}

export interface ListWidgetConfig extends WidgetConfigBase {
    type: "list";
    data_source: string;
    item_alias?: string;
    layout?: "col" | "row" | "grid";
    columns?: number; // 用于 list 本身的自定义 grid 列数
    layout_config?: {
        grid_template_areas?: string[];
        grid_template_columns?: string;
    };
    filter?: string;
    limit?: number;
    pagination?: boolean;
    page_size?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    render: WidgetConfig | WidgetConfig[];
}

export type WidgetConfig =
    | HeroMetricWidget
    | KeyValueGridWidget
    | ProgressBarWidget
    | ListWidgetConfig;

export interface ParserConfig {
    type: ParserType;
    fields: FieldMapping[];
    script?: string;
}

export interface RequestConfig {
    url: string;
    method: HttpMethod;
    headers: Record<string, string>;
    params: Record<string, string>;
    body?: Record<string, any>;
    timeout: number;
}

export interface AuthConfig {
    type: AuthType;
    api_key?: string;
    header_name: string;
    header_prefix: string;
    browser: string;
    domain?: string;
    client_id?: string;
    client_secret?: string;
    auth_url?: string;
    token_url?: string;
    scopes: string[];
    redirect_uri: string;
}

export interface ScheduleConfig {
    cron?: string;
    interval_minutes: number;
}

export interface SourceConfig {
    id: string;
    name: string;
    description: string;
    icon?: string;
    enabled: boolean;
    auth: AuthConfig;
    request: RequestConfig;
    parser: ParserConfig;
    schedule: ScheduleConfig;
    flow?: StepConfig[];
}

export type StepType = "http" | "oauth" | "extract" | "script" | "log";

export interface StepConfig {
    id: string;
    run?: string;
    use: StepType;
    args: Record<string, any>;
    outputs: Record<string, string>;
    context?: Record<string, string>;
    secrets?: Record<string, string>;
}

// Extended ViewComponent with more properties
export interface ViewComponent {
    type: ViewComponentType;
    source_id?: string;
    field?: string;
    icon?: string;
    label: string;
    format?: string;
    delta_field?: string;
    // For source_card type
    ui?: {
        title: string;
        icon?: string;
        status_field?: string;
    };
    widgets?: WidgetConfig[];
    // For component groups
    use_group?: string;
    group_vars?: Record<string, string>;
    // For progress_bar type
    value_field?: string;
    max_field?: string;
    // For stat_grid type
    items?: StatGridItem[];
    columns?: number;
    // For color customization
    color?: string;
    // For badge type
    true_label?: string;
    false_label?: string;
}

export interface StatGridItem {
    field: string;
    label: string;
    format?: string;
    icon?: string;
    color?: string;
}

export interface ViewItem {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    source_id: string;
    template_id: string;
    props: Record<string, any>;
}

export interface StoredView {
    id: string;
    name: string;
    layout_columns: number;
    items: ViewItem[];
}

// API 响应类型

export interface SourceSummary {
    id: string;
    name: string;
    integration_id?: string;
    description: string;
    icon?: string;
    enabled: boolean;
    auth_type: string;
    has_data: boolean;
    updated_at?: number;
    error?: string;
    error_details?: string;
    // Runtime State
    status: SourceStatus;
    message?: string;
    interaction?: InteractionRequest;
}

export type SourceStatus = "active" | "error" | "suspended" | "disabled" | "refreshing";
export type InteractionType =
    | "input_text"
    | "oauth_start"
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
    default?: any;
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

export interface SourceState {
    source_id: string;
    status: SourceStatus;
    message?: string;
    last_updated: number;
    suspended_step_id?: string;
    interaction?: InteractionRequest;
}

export interface DataResponse {
    source_id: string;
    data: Record<string, any> | null;
    updated_at?: number;
    error?: string;
}

export interface HistoryRecord {
    source_id: string;
    data: Record<string, any>;
    timestamp: number;
}

export interface AuthStatus {
    source_id: string;
    auth_type: string;
    status: "ok" | "error" | "missing" | "expired";
    message?: string;
}
