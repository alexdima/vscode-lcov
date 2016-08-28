'use strict';

import * as vscode from 'vscode';

enum LogLevel {
	Debug = 1,
	Info = 2,
	Warn = 4,
	Error = 8
}
module LogLevel {
	export function asString(logLevel: LogLevel): string {
		switch (logLevel) {
			case LogLevel.Debug:
				return '[DEBUG]';
			case LogLevel.Info:
				return '[INFO ]';
			case LogLevel.Warn:
				return '[WARN ]';
			case LogLevel.Error:
				return '[ERROR]';
		}
	}
}

const LOG_FILTER = LogLevel.Error | LogLevel.Warn | LogLevel.Info;// | LogLevel.Debug;

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

function bind(logLevel: LogLevel, prefix:string): IWriteFunc {
	return (what:string) => {
		if (logLevel & LOG_FILTER) {
			outputChannel.appendLine(time() + LogLevel.asString(logLevel) + prefix + what);
		}
	}
}

function rpad(str:string, n:number): string {
	while (str.length < n) {
		str = str + ' ';
	}
	return str;
}

export function LOG(prefix:string) {
	prefix = rpad(prefix, 20);
	return {
		error: bind(LogLevel.Error, '[' + prefix + ']: '),
		warn: bind(LogLevel.Warn, '[' + prefix + ']: '),
		info: bind(LogLevel.Info, '[' + prefix + ']: '),
		debug: bind(LogLevel.Debug, '[' + prefix + ']: '),
	}
}
