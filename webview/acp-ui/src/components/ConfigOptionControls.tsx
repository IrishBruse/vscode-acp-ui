import type { ReactElement } from "react";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import "./ConfigOptionControls.css";

export type ConfigOptionControlsProps = {
    options: AcpUiSessionConfigOption[];
    disabled: boolean;
    onPick: (configId: string, value: string | boolean) => void;
};

function booleanSelectValue(currentValue: boolean): string {
    return currentValue ? "true" : "false";
}

function configFieldId(configId: string): string {
    return `acp-ui-config-${configId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Inline ACP session config dropdowns in agent order (Zed-style toolbar).
 */
export function ConfigOptionControls({
    options,
    disabled,
    onPick,
}: ConfigOptionControlsProps): ReactElement | null {
    if (options.length === 0) {
        return null;
    }

    return (
        <>
            {options.map((option) => {
                const fieldId = configFieldId(option.configId);
                if (option.type === "boolean") {
                    return (
                        <div
                            key={option.configId}
                            className="composer-config-field"
                        >
                            <label
                                className="composer-config-label"
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
                    <div
                        key={option.configId}
                        className="composer-config-field"
                    >
                        <label
                            className="composer-config-label"
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
