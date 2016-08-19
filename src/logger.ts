
import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel = null;

export function initLog(context:vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel('lcov');
	context.subscriptions.push(outputChannel);
}

interface IWriteFunc {
	(what:string): void;
}

function bind(prefix:string): IWriteFunc {
	return (what:string) => outputChannel.appendLine(prefix + what);
}

export const log = {
	error: bind('[ERROR]: '),
	warn: bind('[WARN]: '),
	info: bind('[INFO]: '),
	debug: bind('[DEBUG]: '),
	bind: (prefix:string) => {
		return {
			error: bind('[ERROR][' + prefix + ']: '),
			warn: bind('[WARN][' + prefix + ']: '),
			info: bind('[INFO][' + prefix + ']: '),
			debug: bind('[DEBUG][' + prefix + ']: '),
		}
	}
}
