'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as vm from 'vm';
import * as cp from 'child_process';

import {Configuration} from './configuration';
import {LOG} from './logger';

const log = LOG('SourceFileWatcher');

export class SourceFileWatcher {

	private _pattern:string;
	private _command:string;
	private _watcher: vscode.FileSystemWatcher;

	constructor(pattern:string, command:string) {
		this._pattern = pattern;
		this._command = command;
		this._watcher = null;
	}

	public dispose(): void {
		if (this._watcher) {
			log.info('Stopping from watching ' + this._pattern);
			this._watcher.dispose();
			this._watcher = null;
		}
	}

	public enable(): void {
		if (this._watcher) {
			return;
		}
		log.info('Starting to watch ' + this._pattern);
		this._watcher = vscode.workspace.createFileSystemWatcher(this._pattern, true, false, true);
		this._watcher.onDidChange((uri) => this._run(uri));
	}

	public disable(): void {
		if (!this._watcher) {
			return;
		}
		log.info('Stopping from watching ' + this._pattern);
		this._watcher.dispose();
		this._watcher = null;
	}

	private _run(uri:vscode.Uri): void {
		let workspaceRoot = vscode.workspace.rootPath;
		let file = vscode.workspace.asRelativePath(uri);
		let hadError = false;

		let command = this._command.replace(/\${([^}]+)}/g, (_, expr) => {
			let sourceCode = `(function(workspaceRoot, file, path) { return ${expr}; })`;
			try {
				let func = <any>vm.runInThisContext(sourceCode);
				return func.call(null, workspaceRoot, file, path);
			} catch(err) {
				log.error(err);
				hadError = true;
				return '';
			}
		});

		if (hadError) {
			return;
		}

		log.info('executing ' + command);

		cp.exec(command, {
			cwd: workspaceRoot
		}, (err, stdout, stderr) => {
			log.info('process finished.');
			if (err) {
				log.error(String(err));
				return;
			}
		});
	}
}
