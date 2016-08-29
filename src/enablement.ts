'use strict';

import * as vscode from 'vscode';

let _isEnabled = false;
let _onDidChange = new vscode.EventEmitter<void>();

function set(enabled:boolean): void {
	if (_isEnabled === enabled) {
		return;
	}
	_isEnabled = enabled;
	_onDidChange.fire();
}

export namespace Enablement {
	export const onDidChange = _onDidChange.event;

	export function value(): boolean {
		return _isEnabled;
	}
	export function disable(): void {
		set(false);
	}
	export function enable(): void {
		set(true);
	}
}
