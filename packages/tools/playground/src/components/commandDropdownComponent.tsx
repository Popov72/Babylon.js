import { Engine } from "@dev/core";
import * as React from "react";
import type { GlobalState } from "../globalState";
import { Utilities } from "../tools/utilities";

interface ICommandDropdownComponentProps {
    globalState: GlobalState;
    icon?: string;
    tooltip: string;
    storeKey?: string;
    useSessionStorage?: boolean;
    defaultValue?: string;
    hamburgerMode?: boolean;
    items: {
        label: string;
        tooltip?: string;
        onClick?: () => void;
        onCheck?: (value: boolean) => void;
        onInsert?: (value: string) => void;
        storeKey?: string;
        isActive?: boolean;
        defaultValue?: boolean | string;
        storeKeys?: string[];
        defaultValues?: boolean[];
        subItems?: string[];
        subItemsBools?: string[];
        validate?: () => boolean;
        keepExpanded?: boolean;
    }[];
    toRight?: boolean;
}

export class CommandDropdownComponent extends React.Component<ICommandDropdownComponentProps, { isExpanded: boolean }> {
    public constructor(props: ICommandDropdownComponentProps) {
        super(props);

        this.state = {
            isExpanded: false,
        };

        this.props.globalState.onNewDropdownButtonClicked.add((source) => {
            if (source === this) {
                return;
            }

            this.setState({ isExpanded: false });
        });
    }

    public override render() {
        const engineVersion = Engine.Version.split("-")[0];
        const activeState = Utilities.ReadStringFromStore(this.props.storeKey || this.props.tooltip, this.props.defaultValue!, this.props.useSessionStorage);

        return (
            <>
                {this.state.isExpanded && (
                    <div
                        className="command-dropdown-blocker"
                        onClick={() => {
                            this.setState({ isExpanded: false });
                        }}
                    ></div>
                )}
                <div className="command-dropdown-root">
                    <div
                        className={"command-dropdown" + (this.state.isExpanded ? " activated" : "")}
                        title={this.props.tooltip}
                        onClick={() => {
                            this.props.globalState.onNewDropdownButtonClicked.notifyObservers(this);
                            const newState = !this.state.isExpanded;
                            const pgHost = document.getElementById("embed-host");

                            if (pgHost) {
                                pgHost.style.zIndex = newState ? "0" : "10";
                            }

                            this.setState({ isExpanded: newState });
                        }}
                    >
                        {this.props.icon && (
                            <div className="command-dropdown-icon">
                                <img src={"imgs/" + this.props.icon + ".svg"} />
                            </div>
                        )}
                        {(!this.props.icon || this.props.hamburgerMode) && <div className="command-dropdown-active">{activeState === "Latest" ? engineVersion : activeState}</div>}
                    </div>
                    {this.state.isExpanded && (
                        <div className={"command-dropdown-content sub1" + (this.props.toRight ? " toRight" : "")}>
                            {this.props.items.map((m) => {
                                return (
                                    <div
                                        className={"command-dropdown-label" + (m.isActive ? " active" : "")}
                                        key={m.label}
                                        onClick={() => {
                                            if (m.validate && !m.validate()) {
                                                return;
                                            }
                                            if (!m.onClick) {
                                                const newValue = !Utilities.ReadBoolFromStore(m.storeKey!, (m.defaultValue as boolean) || false);
                                                Utilities.StoreBoolToStore(m.storeKey!, newValue);
                                                this.forceUpdate();
                                                m.onCheck!(newValue);
                                                return;
                                            }
                                            if (!m.subItems) {
                                                m.onClick();
                                                Utilities.StoreStringToStore(this.props.storeKey || this.props.tooltip, m.label);
                                                this.setState({ isExpanded: false });
                                            }
                                        }}
                                        title={m.tooltip || m.label}
                                    >
                                        <div className="command-dropdown-label-text">{(m.isActive && !this.props.hamburgerMode ? "> " : "") + m.label}</div>
                                        {m.onCheck && !m.storeKeys && (
                                            <input
                                                type="checkBox"
                                                className="command-dropdown-label-check"
                                                onChange={(evt) => {
                                                    Utilities.StoreBoolToStore(m.storeKey!, evt.target.checked);
                                                    this.forceUpdate();
                                                    m.onCheck!(evt.target.checked);
                                                }}
                                                checked={Utilities.ReadBoolFromStore(m.storeKey!, (m.defaultValue as boolean) || false)}
                                            />
                                        )}
                                        {m.subItems && <div className="command-dropdown-arrow">{">"}</div>}
                                        {m.subItems && (
                                            <div className={"sub-items " + (this.props.globalState.language === "JS" ? "background-js" : "background-ts")}>
                                                {m.subItems.map((s, index) => {
                                                    return (
                                                        <div
                                                            key={s}
                                                            className={
                                                                "sub-item" +
                                                                (Utilities.ReadStringFromStore(m.storeKey!, m.defaultValue as string, this.props.useSessionStorage) === s
                                                                    ? " checked"
                                                                    : "")
                                                            }
                                                            onClick={() => {
                                                                if (m.validate && !m.validate()) {
                                                                    return;
                                                                }
                                                                if (m.defaultValues) {
                                                                    const newValue = !Utilities.ReadBoolFromStore(m.storeKeys![index], m.defaultValues[index] || false);
                                                                    Utilities.StoreBoolToStore(m.storeKeys![index], newValue);
                                                                    //this.forceUpdate();
                                                                    m.onCheck!(newValue);
                                                                    this.setState({ isExpanded: m.keepExpanded || false });
                                                                    return;
                                                                }
                                                                if (m.storeKey) {
                                                                    Utilities.StoreStringToStore(m.storeKey, s, this.props.useSessionStorage);
                                                                }
                                                                if (m.onInsert) {
                                                                    m.onInsert(s);
                                                                }
                                                                m.onClick!();
                                                                this.setState({ isExpanded: m.keepExpanded || false });
                                                            }}
                                                        >
                                                            <div className="sub-item-label">{s}</div>
                                                            {m.defaultValues && (
                                                                <input
                                                                    type="checkBox"
                                                                    className="command-subitem-label-check"
                                                                    onChange={(evt) => {
                                                                        Utilities.StoreBoolToStore(m.storeKeys![index], evt.target.checked);
                                                                        this.forceUpdate();
                                                                        m.onCheck!(evt.target.checked);
                                                                    }}
                                                                    checked={Utilities.ReadBoolFromStore(m.storeKeys![index], m.defaultValues[index] || false)}
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </>
        );
    }
}
