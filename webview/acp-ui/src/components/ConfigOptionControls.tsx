import type { ReactElement } from "react";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import "./ConfigOptionControls.css";

export type ConfigOptionControlsProps = {
    options: AcpUiSessionConfigOption[];
    disabled: boolean;
    onPick: (configId: string, value: string | boolean) => void;
    /** Stacked labels match Zed-style toolbars; inline matches the composer model row. */
    layout?: "stacked" | "inline";
};

export type ComposerConfigLoadingProps = {
    label?: string;
    layout?: "stacked" | "inline";
};

function booleanSelectValue(currentValue: boolean): string {
    return currentValue ? "true" : "false";
}

function configFieldId(configId: string): string {
    return `acp-ui-config-${configId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Placeholder while session model/config options are still loading from the agent.
 */
export function ComposerConfigLoading({
    label = "Model",
    layout = "stacked",
}: ComposerConfigLoadingProps): ReactElement {
    const fieldId = "acp-ui-config-loading";
    return (
        <div
            className={
                layout === "inline"
                    ? "composer-config-field composer-config-field--inline"
                    : "composer-config-field"
            }
        >
            <label
                className={
                    layout === "inline"
                        ? "composer-inline-label"
                        : "composer-config-label"
                }
                htmlFor={fieldId}
            >
                {label}
            </label>
            <select
                id={fieldId}
                className="composer-config-select composer-config-select--model"
                aria-label={`${label}: Loading model configuration`}
                aria-busy="true"
                value="loading"
                disabled
            >
                <option value="loading">Loading models...</option>
            </select>
        </div>
    );
}

/**
 * Inline ACP session config dropdowns in agent order (Zed-style toolbar).
 */
export function ConfigOptionControls({
    options,
    disabled,
    onPick,
    layout = "stacked",
}: ConfigOptionControlsProps): ReactElement | null {
    if (options.length === 0) {
        return null;
    }

    const fieldClassName =
        layout === "inline"
            ? "composer-config-field composer-config-field--inline"
            : "composer-config-field";
    const labelClassName =
        layout === "inline"
            ? "composer-inline-label"
            : "composer-config-label";

    return (
        <>
            {options.map((option) => {
                const fieldId = configFieldId(option.configId);
                if (option.type === "boolean") {
                    return (
                        <div key={option.configId} className={fieldClassName}>
                            <label
                                className={labelClassName}
                                htmlFor={fieldId}
                                title={option.description ?? option.name}
                            >
                                {option.name}
                            </label>
                            <select
                                id={fieldId}
                                className="composer-config-select"
                                aria-label={option.name}
                                title={option.description ?? option.name}
                                value={booleanSelectValue(option.currentValue)}
                                disabled={disabled}
                                onChange={(event) => {
                                    onPick(
                                        option.configId,
                                        event.target.value === "true",
                                    );
                                }}
                            >
                                <option value="false">Off</option>
                                <option value="true">On</option>
                            </select>
                        </div>
                    );
                }
                return (
                    <div key={option.configId} className={fieldClassName}>
                        <label
                            className={labelClassName}
                            htmlFor={fieldId}
                            title={option.description ?? option.name}
                        >
                            {option.name}
                        </label>
                        <select
                            id={fieldId}
                            className={
                                option.category === "model"
                                    ? "composer-config-select composer-config-select--model"
                                    : "composer-config-select"
                            }
                            aria-label={option.name}
                            title={option.description ?? option.name}
                            value={option.currentValue}
                            disabled={disabled}
                            onChange={(event) => {
                                onPick(option.configId, event.target.value);
                            }}
                        >
                            {option.options.map((choice) => (
                                <option
                                    key={`${option.configId}:${choice.value}`}
                                    value={choice.value}
                                    title={choice.description}
                                >
                                    {choice.name}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            })}
        </>
    );
}
