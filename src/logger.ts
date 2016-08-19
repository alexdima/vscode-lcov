
import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel = null;

export function initLog(context:vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel('lcov');
	context.subscriptions.push(outputChannel);
}

function write(what:string): void {
	outputChannel.appendLine(what);
}

export const log = {

	error: (what:string) => {
		write('[ERROR]: ' + what);
	},

	warn: (what:string) => {
		write('[WARN]: ' + what);
	},

	info: (what:string) => {
		write('[INFO]: ' + what);
	}
}
