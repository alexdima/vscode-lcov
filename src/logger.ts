'use strict';

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel = null;

export function initLog(context:vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel('lcov');
	context.subscriptions.push(outputChannel);
}

interface IWriteFunc {
	(what:string): void;
}

function twoDigits(n:number): string {
	if (n < 10) {
		return '0' + n;
	}
	return String(n);
}
function threeDigits(n:number): string {
	if (n < 10) {
		return '00' + n;
	}
	if (n < 100) {
		return '0' + n;
	}
	return String(n);
}

function time(): string {
	let now = new Date();
	let h = now.getHours();
	let m = now.getMinutes();
	let s = now.getSeconds();
	let ms = now.getMilliseconds();
	return `[${twoDigits(h)}:${twoDigits(m)}:${twoDigits(s)}.${threeDigits(ms)}]`
}

function bind(prefix:string): IWriteFunc {
	return (what:string) => outputChannel.appendLine(time() + prefix + what);
}

function rpad(str:string, n:number): string {
	while (str.length < n) {
		str = str + ' ';
	}
	return str;
}

export const log = {
	error: bind('[ERROR]: '),
	warn: bind('[WARN ]: '),
	info: bind('[INFO ]: '),
	debug: bind('[DEBUG]: '),
	bind: (prefix:string) => {
		prefix = rpad(prefix, 15);
		return {
			error: bind('[ERROR][' + prefix + ']: '),
			warn: bind('[WARN ][' + prefix + ']: '),
			info: bind('[INFO ][' + prefix + ']: '),
			debug: bind('[DEBUG][' + prefix + ']: '),
		}
	}
}
