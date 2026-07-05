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
                if (option.type === "boolean") {
                    return (
                        <select
                            key={option.configId}
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
                    );
                }
                return (
                    <select
                        key={option.configId}
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
                );
            })}
        </>
    );
}
